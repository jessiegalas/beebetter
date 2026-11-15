const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const art = require('../assets/pixel/companion/source.json');

const folder = path.resolve(__dirname, '../assets/pixel/companion');
const check = process.argv.includes('--check');
const cells = 24;

for (const [pose, rows] of Object.entries(art.poses)) {
  if (rows.length !== cells || rows.some(row => row.length !== cells)) throw Error(`Invalid ${pose} grid`);
  for (const density of [1, 2, 3]) {
    const scale = 3 * density;
    const size = cells * scale;
    const png = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = rows[Math.floor(y / scale)][Math.floor(x / scale)];
        if (cell === '.') continue;
        const color = art.palette[cell];
        if (!color) throw Error(`Unknown color ${cell} in ${pose}`);
        png.data.writeUInt32BE(Number.parseInt(`${color}ff`, 16), (y * size + x) * 4);
      }
    }
    const output = path.join(folder, `${pose}${density === 1 ? '' : '@' + density + 'x'}.png`);
    const rendered = PNG.sync.write(png);
    if (check) {
      const saved = PNG.sync.read(fs.readFileSync(output));
      if (saved.width !== size || saved.height !== size || !saved.data.equals(png.data)) throw Error(`Stale asset ${output}`);
    } else {
      fs.writeFileSync(output, rendered);
    }
  }
}
console.log(check ? 'Companion density assets match their source.' : 'Built both companion poses at 1x, 2x, and 3x.');
