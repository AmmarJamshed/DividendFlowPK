const fs = require('fs');
const path = require('path');

const adsPath = path.join(__dirname, '..', 'build', 'ads.txt');
const publisherLine = 'google.com, pub-1059730350773655, DIRECT, f08c47fec0942fa0';

if (!fs.existsSync(adsPath)) {
  console.error('build/ads.txt missing — AdSense will not verify the domain.');
  process.exit(1);
}

const content = fs.readFileSync(adsPath, 'utf8');
if (content.charCodeAt(0) === 0xfeff) {
  console.error('build/ads.txt must be UTF-8 without BOM.');
  process.exit(1);
}

const lines = content
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

if (!lines.includes(publisherLine)) {
  console.error('build/ads.txt missing publisher line:', publisherLine);
  console.error('Found lines:', JSON.stringify(lines));
  process.exit(1);
}

console.log('ads.txt verified in build output.');
