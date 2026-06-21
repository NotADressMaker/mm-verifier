const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

const entries = fs.readdirSync(srcDir);
for (const entry of entries) {
  const srcPath = path.join(srcDir, entry);
  const destPath = path.join(distDir, entry);
  fs.copyFileSync(srcPath, destPath);
}

console.log('MAMV Lens build complete');
