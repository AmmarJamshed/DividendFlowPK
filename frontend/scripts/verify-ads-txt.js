const fs = require('fs');
const path = require('path');

const adsPath = path.join(__dirname, '..', 'build', 'ads.txt');
const publisherLine = 'google.com, pub-1059730350773655, DIRECT, f08c47fec0942fa0';

if (!fs.existsSync(adsPath)) {
  console.error('build/ads.txt missing — AdSense will not verify the domain.');
  process.exit(1);
}

const raw = fs.readFileSync(adsPath);
if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
  console.error('build/ads.txt must be UTF-8 without BOM.');
  process.exit(1);
}

const content = raw.toString('utf8');
const lines = content
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (lines.length !== 1 || lines[0] !== publisherLine) {
  console.error('build/ads.txt must contain exactly one line:');
  console.error(publisherLine);
  console.error('Found:', JSON.stringify(lines));
  process.exit(1);
}

if (!content.endsWith('\n')) {
  console.error('build/ads.txt must end with a newline.');
  process.exit(1);
}

console.log('ads.txt verified in build output.');
