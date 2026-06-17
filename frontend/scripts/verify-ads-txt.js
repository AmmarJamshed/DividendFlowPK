const fs = require('fs');
const path = require('path');

const adsPath = path.join(__dirname, '..', 'build', 'ads.txt');
const expected = 'google.com, pub-1059730350773655, DIRECT, f08c47fec0942fa0';

if (!fs.existsSync(adsPath)) {
  console.error('build/ads.txt missing — AdSense will not verify the domain.');
  process.exit(1);
}

const content = fs.readFileSync(adsPath, 'utf8').trim();
if (content !== expected) {
  console.error('build/ads.txt has unexpected content:', JSON.stringify(content));
  process.exit(1);
}

console.log('ads.txt verified in build output.');
