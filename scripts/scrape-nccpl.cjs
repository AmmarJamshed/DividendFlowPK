#!/usr/bin/env node
/**
 * NCCPL Risk Indicators Scraper (Node.js)
 * Uses puppeteer-extra with stealth plugin to bypass Cloudflare
 * Fetches VaR, Haircut data from www.nccpl.com.pk/market-information
 * Output: data/risk/nccpl_risk_metrics.csv
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const URL = 'https://www.nccpl.com.pk/market-information';
const DATA_DIR = path.join(__dirname, '..', 'data', 'risk');
const OUTPUT_CSV = path.join(DATA_DIR, 'nccpl_risk_metrics.csv');

function cleanSymbol(symbol) {
  if (!symbol) return '';
  // Remove suffixes like -CAPRN1, -CMAYN1, etc.
  const parts = symbol.split('-');
  return parts[0] || symbol;
}

async function scrapeNCCPL() {
  console.log('[NCCPL] Launching browser with stealth...');
  
  const browser = await puppeteer.launch({
    headless: false,  // Run in headed mode to bypass Cloudflare
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Enable download behavior
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DATA_DIR
    });
    
    console.log('[NCCPL] Navigating to market-information page...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    
    // Wait for Cloudflare
    console.log('[NCCPL] Waiting for Cloudflare check...');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const title = await page.title();
      const content = await page.content();
      
      if (!title.includes('Cloudflare') && !title.includes('Just a moment') && title.includes('Market Information')) {
        console.log(`[NCCPL] Page loaded: ${title}`);
        break;
      }
      
      if (content.includes('Cloudflare') || content.includes('cf-browser-verification')) {
        console.log(`[NCCPL] Cloudflare detected, waiting... (${i+1}/10)`);
      }
    }
    
    // Wait for network idle
    await page.waitForNetworkIdle({ timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Click VAR Margins tab
    console.log('[NCCPL] Looking for VAR Margins tab...');
    await page.waitForSelector('a[role="tab"]', { timeout: 30000 });
    
    const varTab = await page.$('a[role="tab"]:has-text("VAR Margins")');
    if (!varTab) {
      // Try alternative selector
      const tabs = await page.$$('a[role="tab"]');
      for (const tab of tabs) {
        const text = await tab.evaluate(el => el.textContent);
        if (text && text.includes('VAR Margins')) {
          await tab.scrollIntoView();
          await new Promise(resolve => setTimeout(resolve, 500));
          await tab.click();
          console.log('[NCCPL] Clicked VAR Margins tab');
          break;
        }
      }
    } else {
      await varTab.scrollIntoView();
      await new Promise(resolve => setTimeout(resolve, 500));
      await varTab.click();
      console.log('[NCCPL] Clicked VAR Margins tab');
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Wait for table
    console.log('[NCCPL] Waiting for table...');
    await page.waitForSelector('table tbody tr', { timeout: 30000 });
    console.log('[NCCPL] Table loaded');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Click Export button
    console.log('[NCCPL] Clicking Export button...');
    const exportBtn = await page.$('button:has-text("Export")');
    if (!exportBtn) {
      // Try finding button by text content
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && text.includes('Export')) {
          await btn.scrollIntoView();
          await new Promise(resolve => setTimeout(resolve, 500));
          await btn.click();
          console.log('[NCCPL] Clicked Export button');
          break;
        }
      }
    } else {
      await exportBtn.scrollIntoView();
      await new Promise(resolve => setTimeout(resolve, 500));
      await exportBtn.click();
      console.log('[NCCPL] Clicked Export button');
    }
    
    // Wait for download
    console.log('[NCCPL] Waiting for download...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Find the downloaded file
    const files = fs.readdirSync(DATA_DIR);
    const csvFile = files.find(f => f.includes('var-margins') || f.endsWith('.csv'));
    
    if (!csvFile) {
      throw new Error('Downloaded CSV file not found');
    }
    
    const downloadPath = path.join(DATA_DIR, csvFile);
    console.log(`[NCCPL] Found downloaded file: ${csvFile}`);
    
    // Process the CSV
    const processedData = await processDownloadedCSV(downloadPath);
    
    // Rename/clean up
    if (csvFile !== 'var-margins-temp.csv') {
      const tempPath = path.join(DATA_DIR, 'var-margins-temp.csv');
      fs.renameSync(downloadPath, tempPath);
    }
    
    return processedData;
    
  } catch (error) {
    console.error(`[NCCPL] Error: ${error.message}`);
    
    // Take screenshot for debugging
    try {
      const page = (await browser.pages())[0];
      if (page) {
        const screenshotPath = path.join(DATA_DIR, 'nccpl-error-screenshot.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`[NCCPL] Saved error screenshot to ${screenshotPath}`);
      }
    } catch (e) {
      // Ignore screenshot errors
    }
    
    throw error;
  } finally {
    await browser.close();
  }
}

async function processDownloadedCSV(csvPath) {
  console.log('[NCCPL] Processing downloaded CSV...');
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  const symbolMap = {};
  let rowCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    
    values.forEach((val, idx) => {
      if (headers[idx]) {
        row[headers[idx]] = val.replace(/^"|"$/g, '').trim();
      }
    });
    
    const symbolFull = row['Symbol'] || '';
    const baseSymbol = cleanSymbol(symbolFull);
    
    if (!baseSymbol) continue;
    
    try {
      const varValue = parseFloat(row['Var Value'] || 0);
      const haircut = parseFloat(row['Hair Cut'] || 0);
      const week26Avg = parseFloat(row['26Week Avg'] || 0);
      const freeFloat = parseFloat((row['Free Float'] || '0').replace(/,/g, '').replace('-', '0'));
      const halfHourRate = parseFloat(row['Half Hour Avg Rate'] || 0);
      
      // Skip futures/options
      if (['KSE30', 'OGTI', 'BKTI'].includes(baseSymbol)) continue;
      
      // Skip derivatives with 0 haircut
      if (haircut === 0) continue;
      
      if (!symbolMap[baseSymbol]) {
        symbolMap[baseSymbol] = {
          symbol: baseSymbol,
          symbol_full: symbolFull,
          var_value: varValue,
          haircut: haircut,
          week_26_avg: week26Avg,
          free_float: freeFloat,
          half_hour_avg_rate: halfHourRate
        };
      } else {
        // Keep max VaR and Haircut
        if (varValue > symbolMap[baseSymbol].var_value) {
          symbolMap[baseSymbol].var_value = varValue;
        }
        if (haircut > symbolMap[baseSymbol].haircut) {
          symbolMap[baseSymbol].haircut = haircut;
        }
        if (week26Avg > symbolMap[baseSymbol].week_26_avg) {
          symbolMap[baseSymbol].week_26_avg = week26Avg;
        }
        if (freeFloat > symbolMap[baseSymbol].free_float) {
          symbolMap[baseSymbol].free_float = freeFloat;
        }
        if (halfHourRate > symbolMap[baseSymbol].half_hour_avg_rate) {
          symbolMap[baseSymbol].half_hour_avg_rate = halfHourRate;
        }
      }
      rowCount++;
    } catch (e) {
      console.error(`[NCCPL] Error processing row ${symbolFull}: ${e.message}`);
    }
  }
  
  // Convert to array and sort
  const aggregated = Object.values(symbolMap).sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  // Add timestamp
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  aggregated.forEach(item => {
    item.last_updated = now;
    item.trade_halt = 'N';
  });
  
  // Save to CSV
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const csvLines = [
    'symbol,symbol_full,var_value,haircut,week_26_avg,free_float,half_hour_avg_rate,trade_halt,last_updated'
  ];
  
  aggregated.forEach(item => {
    csvLines.push([
      item.symbol,
      item.symbol_full,
      item.var_value,
      item.haircut,
      item.week_26_avg,
      item.free_float,
      item.half_hour_avg_rate,
      item.trade_halt,
      item.last_updated
    ].join(','));
  });
  
  fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n'));
  
  console.log(`[NCCPL] Processed ${rowCount} rows into ${aggregated.length} unique symbols`);
  console.log(`[NCCPL] Saved to ${OUTPUT_CSV}`);
  
  // Clean up temp file
  try {
    fs.unlinkSync(csvPath);
    console.log('[NCCPL] Cleaned up temp file');
  } catch (e) {
    // Ignore
  }
  
  return aggregated;
}

// Main execution
if (require.main === module) {
  scrapeNCCPL()
    .then(result => {
      console.log(`[NCCPL] Success: ${result.length} symbols scraped`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`[NCCPL] Fatal error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { scrapeNCCPL };
