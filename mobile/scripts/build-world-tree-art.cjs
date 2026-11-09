// Compile the approved concept into token-indexed vector runs. The source PNG
// stays untouched; runtime renders a fixed art grid without bitmap resampling.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const tokens = require('../src/constants/design-tokens.json');

const sourcePath = path.resolve(__dirname, '../assets/skill-tree/concepts/world-tree-approved-concept.png');
const outputPath = path.resolve(__dirname, '../assets/skill-tree/world-tree-art.json');
const colorRoles = ['background', 'surfaceMuted', 'muted', 'primary', 'foreground', 'accent', 'success', 'successSurface'];
const palette = colorRoles.map(role => ({ role, rgb: tokens.light[role].slice(1).match(/../g).map(hex => parseInt(hex, 16)) }));

function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Invalid PNG');
  let width, height; const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[9] !== 6 || chunk[12] !== 0) throw Error('Expected non-interlaced 8-bit RGBA PNG');
    }
    if (type === 'IDAT') chunks.push(chunk);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw Error('Unexpected decoded PNG length');
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const up = y ? rgba[(y - 1) * stride + x] : 0;
      const corner = y && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      const estimate = left + up - corner;
      const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - corner)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : corner;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      rgba[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, rgba };
}

function nearestRole(r, g, b) {
  let match = 0, distance = Infinity;
  palette.forEach((color, index) => {
    const d = (r - color.rgb[0]) ** 2 + (g - color.rgb[1]) ** 2 + (b - color.rgb[2]) ** 2;
    if (d < distance) { distance = d; match = index; }
  });
  return match;
}

function compileTree(bytes) {
  const image = decodePng(bytes), width = 96, height = 128;
  const cells = new Int8Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const votes = Array(palette.length).fill(0); let opaque = 0;
    // Area samples avoid selecting isolated colored/partially transparent fringe
    // pixels. Transparent-majority cells stay transparent, with no soft alpha.
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const ix = Math.min(image.width - 1, Math.floor((x + (sx + 0.5) / 4) * image.width / width));
      const iy = Math.min(image.height - 1, Math.floor((y + (sy + 0.5) / 4) * image.height / height));
      const offset = (iy * image.width + ix) * 4;
      const [r, g, b, a] = image.rgba.subarray(offset, offset + 4);
      if (a < 224 || (r > 180 && g < 70 && b < 70)) continue;
      opaque++; votes[nearestRole(r, g, b)]++;
    }
    if (opaque >= 8) cells[y * width + x] = votes.indexOf(Math.max(...votes));
  }
  const layers = ['wood', 'academics', 'social', 'habits', 'health'];
  const layerAt = (x, y, role) => {
    const color = palette[role]?.role;
    if (color !== 'success' && color !== 'successSurface' && !(color === 'accent' && y < 80 && (x < 40 || x > 58))) return 'wood';
    return x < width / 2 ? y < 44 ? 'academics' : 'habits' : y < 40 ? 'social' : 'health';
  };
  const paths = layers.flatMap(layer => palette.map(color => ({ layer, color: color.role, d: '' })));
  for (let y = 0; y < height; y++) for (let x = 0; x < width;) {
    const role = cells[y * width + x], start = x, layer = layerAt(x, y, role);
    while (x < width && cells[y * width + x] === role && layerAt(x, y, role) === layer) x++;
    if (role >= 0) paths[layers.indexOf(layer) * palette.length + role].d += `M${start} ${y}h${x - start}v1h-${x - start}Z`;
  }
  return {
    version: 1, width, height,
    source: 'concepts/world-tree-approved-concept.png',
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    paletteSha256: crypto.createHash('sha256').update(JSON.stringify(palette)).digest('hex'),
    opaqueCells: [...cells].filter(cell => cell >= 0).length,
    paths: paths.filter(part => part.d),
  };
}

if (require.main === module) {
  const output = JSON.stringify(compileTree(fs.readFileSync(sourcePath)), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) throw Error('Compiled world-tree art is stale');
    console.log('PASS compiled art matches the approved PNG and canonical palette');
  } else {
    fs.writeFileSync(outputPath, output);
    console.log('Compiled approved tree: 96 × 128 art pixels, wood + 4 canopy groups, token-only paths and hard transparency');
  }
}
module.exports = { compileTree };
