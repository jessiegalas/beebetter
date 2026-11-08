#!/usr/bin/env node
/*
 * Builds React Native density assets from the designer pack in
 * `assets/pixel-button-pack/` into `assets/pixel/button/`.
 *
 * Why this step exists:
 *   The pack stores 16x16 art and exports it at 1x/2x/3x (16/32/48 px). React Native
 *   picks a density file by device pixel ratio and draws it at the dp size we give it.
 *   A 48 px file drawn at 48 dp is a 3x bitmap upscale on a 3x screen.
 *
 *   Instead we re-export so that one source pixel maps to one device pixel:
 *     dp per art pixel = 3 (atlas `display_scale_default`)
 *     file scale       = 3 * device pixel ratio  (3x / 6x / 9x of the art)
 *   A 48 dp button then reads 48/96/144 px on 1x/2x/3x screens and stays crisp.
 *
 * The pack is not nine-patch aware, so each face is cut into three horizontal
 * pieces (left cap / stretchable middle / right cap). Height is fixed at the
 * full art height, so no vertical slicing is needed.
 *
 * Run: node scripts/build-pixel-assets.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const PACK = path.join(ROOT, 'assets', 'pixel-button-pack');
const OUT = path.join(ROOT, 'assets', 'pixel', 'button');
const atlas = JSON.parse(fs.readFileSync(path.join(PACK, 'pixel-button.atlas.json'), 'utf8'));

const DP_PER_ART_PX = atlas.grid.display_scale_default;
const DENSITIES = [1, 2, 3];

const readPng = relative => PNG.sync.read(fs.readFileSync(path.join(PACK, relative + '.png')));

function crop(image, x0, x1) {
  const width = x1 - x0;
  const out = new PNG({ width, height: image.height });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * image.width + x0 + x) * 4;
      const to = (y * width + x) * 4;
      out.data[to] = image.data[from];
      out.data[to + 1] = image.data[from + 1];
      out.data[to + 2] = image.data[from + 2];
      out.data[to + 3] = image.data[from + 3];
    }
  }
  return out;
}

function scale(image, factor) {
  const out = new PNG({ width: image.width * factor, height: image.height * factor });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const from = (Math.floor(y / factor) * image.width + Math.floor(x / factor)) * 4;
      const to = (y * out.width + x) * 4;
      out.data[to] = image.data[from];
      out.data[to + 1] = image.data[from + 1];
      out.data[to + 2] = image.data[from + 2];
      out.data[to + 3] = image.data[from + 3];
    }
  }
  return out;
}

function write(name, image, density) {
  const suffix = density === 1 ? '' : `@${density}x`;
  const target = path.join(OUT, `${name}${suffix}.png`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, PNG.sync.write(image));
  return 1;
}

/** Cuts a sprite into left/middle/right at the given inset and exports every density. */
function emitSlices(name, image, inset) {
  const parts = [
    ['left', 0, inset],
    ['middle', inset, image.width - inset],
    ['right', image.width - inset, image.width],
  ];
  for (const [part, x0, x1] of parts) {
    const piece = crop(image, x0, x1);
    for (const density of DENSITIES) write(`${name}-${part}`, scale(piece, DP_PER_ART_PX * density), density);
  }
}

const faceInset = atlas.slice_insets_art_px.left;
const ringInset = atlas.focus_ring.slice_insets_art_px.left;

const themes = {
  light: { variants: atlas.variants, disabled: atlas.disabled.file, ring: atlas.focus_ring.file },
  dark: { variants: atlas.dark.variants, disabled: atlas.dark.disabled.file, ring: atlas.dark.focus_ring.file },
};

let files = 0;
for (const [theme, config] of Object.entries(themes)) {
  for (const [variant, states] of Object.entries(config.variants)) {
    for (const state of ['normal', 'pressed']) {
      const source = states[state];
      if (!source) throw new Error(`Missing ${theme}/${variant}/${state} in atlas`);
      emitSlices(`${theme}/${variant}-${state}`, readPng(`button/${source}`), faceInset);
      files += 3 * DENSITIES.length;
    }
  }
  emitSlices(`${theme}/disabled`, readPng(`button/${config.disabled}`), faceInset);
  emitSlices(`${theme}/focus-ring`, readPng(`focus/${config.ring}`), ringInset);
  files += 6 * DENSITIES.length;
}

for (const tone of Object.keys(atlas.loading.spinner.files)) {
  const sheet = readPng(`spinner/${atlas.loading.spinner.files[tone]}`);
  for (const density of DENSITIES) files += write(`spinner/${tone}`, scale(sheet, DP_PER_ART_PX * density), density);
}

const faces = Object.keys(themes.light.variants).length * 2 + 1;
console.log(`pixel button assets: ${files} files`);
console.log(`themes: ${Object.keys(themes).join(', ')} | variants per theme: ${faces - 1} | face inset ${faceInset} art px | ring inset ${ringInset} art px`);
console.log(`display scale: ${DP_PER_ART_PX} dp per art px (48 dp faces, 66 dp ring)`);
console.log(`output: ${path.relative(ROOT, OUT)}`);
