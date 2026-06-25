const fs = require('fs');
const path = require('path');

const publisherLine = 'google.com, pub-1059730350773655, DIRECT, f08c47fec0942fa0';
const buildDir = path.join(__dirname, '..', 'build');
const adsPath = path.join(buildDir, 'ads.txt');

if (!fs.existsSync(buildDir)) {
  console.error('build/ directory missing — run react-scripts build first.');
  process.exit(1);
}

fs.writeFileSync(adsPath, `${publisherLine}\n`, { encoding: 'utf8' });
