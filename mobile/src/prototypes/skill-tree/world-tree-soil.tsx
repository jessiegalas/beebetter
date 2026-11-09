import { memo, useMemo } from 'react';
import Svg, { Path, type SvgProps } from 'react-native-svg';
import { ArtPixelDp, Pixel, artPixelsToDp } from '@/constants/tokens';

const c = Pixel.worldTree;
const colors = {
  band: c.soilBand, fleck: c.soilFleck, pebble: c.soilPebble,
  b: c.rockBase, s: c.rockShade, h: c.rockHighlight,
  m: c.grassShade, g: c.grassBase, l: c.grassHighlight,
  r: c.barkShade, d: c.barkDeep,
};
type Ink = keyof typeof colors;
const crispEdges: SvgProps & { shapeRendering: 'crispEdges' } = { shapeRendering: 'crispEdges' };
const p = artPixelsToDp;
// Small original sprites, one character per art pixel. Spaces stay transparent.
const sprites = {
  boulder: ['    hhhhh', '  hhbbbbbhh', ' hbbbbbbbbbs', 'hbbbbbbbbbbss', ' bbbbbbbbbsss', '  ssssssssss'],
  mossyRock: ['   l  g', ' g lg g', ' ggggmgg', '  mmmmm', '  hhbbbh', ' hbbbbbbs', ' bbbbbsss', '  ssssss'],
  stone: ['  hh', ' hbbbh', ' bbbss', '  sss'],
  grass: ['  g   l', 'g gl  g', 'g ggg g', ' ggmgg', '  mmm'],
  gravel: [' hh    h', 'hbbs  hbs', ' sss   ss'],
};

const snap = (value: number) => Math.round(value / ArtPixelDp) * ArtPixelDp;

/** Deliberately composed, uneven landmarks. No tiles, seeded scatter or repeating rows. */
export function soilDetailGeometry(availableWidth: number, worldHeight: number) {
  const width = Math.ceil(availableWidth / ArtPixelDp) * ArtPixelDp;
  const paths: Partial<Record<Ink, string>> = {};
  const rect = (ink: Ink, x: number, y: number, w: number, h: number) => {
    paths[ink] = (paths[ink] ?? '') + 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h-' + w + 'Z';
  };
  const at = (fraction: number) => snap(worldHeight * fraction);
  const stamp = (sprite: string[], x: number, y: number, scale = 1, flip = false) => {
    const artWidth = Math.max(...sprite.map(line => line.length));
    for (let sy = 0; sy < sprite.length; sy++) {
      const line = sprite[sy];
      for (let sx = 0; sx < line.length;) {
        const ink = line[sx];
        let end = sx + 1;
        while (end < line.length && line[end] === ink) end++;
        if (ink !== ' ') rect(ink as Ink, x + p((flip ? artWidth - end : sx) * scale), y + p(sy * scale), p((end - sx) * scale), p(scale));
        sx = end;
      }
    }
  };
  // A few distinct clusters, with the center kept quiet for future content.
  stamp(sprites.stone, snap(width * 0.08), at(0.06));
  stamp(sprites.boulder, snap(width * 0.72), at(0.15), 2);
  stamp(sprites.grass, snap(width * 0.73), at(0.15) - p(4));
  stamp(sprites.gravel, snap(width * 0.57), at(0.19));
  stamp(sprites.mossyRock, snap(width * 0.87), at(0.37), 1, true);
  stamp(sprites.boulder, snap(width * 0.03), at(0.56), 2, true);
  stamp(sprites.grass, snap(width * 0.04), at(0.56) - p(3), 1, true);
  stamp(sprites.stone, snap(width * 0.3), at(0.61));
  stamp(sprites.gravel, snap(width * 0.65), at(0.78), 1, true);
  stamp(sprites.mossyRock, snap(width * 0.24), at(0.91), 2);

  // Broken roots enter from the earth walls instead of floating in a grid.
  const root = (y: number, segments: number[][], right = false) => {
    for (const [x, dy, w, h] of segments) {
      const left = right ? width - p(x + w) : p(x);
      rect('d', left, y + p(dy + 1), p(w), p(h));
      rect('r', left, y + p(dy), p(w), p(1));
    }
  };
  root(at(0.31), [[0, 0, 9, 2], [8, 1, 7, 2], [14, 2, 2, 5], [15, 6, 7, 2], [21, 7, 2, 6], [22, 12, 3, 1], [8, 3, 2, 6], [9, 8, 4, 1]]);
  root(at(0.67), [[0, 0, 12, 2], [11, 1, 3, 4], [13, 4, 9, 2], [21, 5, 2, 8], [22, 12, 5, 1], [13, 5, 2, 9], [14, 13, 4, 1]], true);

  // Unequal sediment pockets, some cropped by the screen edge.
  for (const [fx, fy, w, h] of [[0, 0.12, 14, 2], [0.05, 0.13, 20, 1], [0.61, 0.46, 30, 2], [0.76, 0.45, 20, 1], [0.02, 0.73, 18, 2], [0, 0.74, 26, 1], [0.48, 0.94, 29, 1]]) {
    rect('band', snap(width * fx), at(fy), p(w), p(h));
  }
  for (const [fx, fy, w] of [[0.13, 0.09, 2], [0.21, 0.11, 1], [0.63, 0.2, 3], [0.79, 0.24, 1], [0.08, 0.43, 2], [0.93, 0.49, 3], [0.33, 0.58, 1], [0.38, 0.62, 2], [0.53, 0.82, 1], [0.82, 0.86, 2], [0.17, 0.96, 2]]) {
    rect(w === 1 ? 'pebble' : 'fleck', snap(width * fx), at(fy), p(w), p(1));
  }
  return { width, paths: Object.entries(paths).map(([ink, d]) => ({ ink, d, fill: colors[ink as Ink] })) };
}

export const WorldTreeSoilDetails = memo(function WorldTreeSoilDetails({ width, height, worldHeight, offsetY = 0 }: {
  width: number; height: number; worldHeight: number; offsetY?: number;
}) {
  const geometry = useMemo(() => soilDetailGeometry(width, worldHeight), [width, worldHeight]);
  return <Svg {...crispEdges} width={geometry.width} height={height}
    viewBox={'0 ' + offsetY + ' ' + geometry.width + ' ' + height}
    pointerEvents="none" accessible={false} aria-hidden>
    {geometry.paths.map(part => <Path key={part.ink} d={part.d} fill={part.fill} />)}
  </Svg>;
});
