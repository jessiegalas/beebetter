import Svg, { G, Path, Rect, type SvgProps } from 'react-native-svg';
import { ArtPixelDp, Pixel, PixelSpacing, artPixelsToDp } from '@/constants/tokens';

const crispEdges: SvgProps & { shapeRendering: 'crispEdges' } = { shapeRendering: 'crispEdges' };
const snap = (value: number) => Math.round(value / ArtPixelDp) * ArtPixelDp;
const p = artPixelsToDp;
const colors = Pixel.worldTree;

export function sceneryLayout(width: number, height: number) {
  return {
    sun: { x: snap(Math.max(PixelSpacing.px6, Math.min(width - p(24) - PixelSpacing.px6, width * 0.72))), y: snap(height * 0.09) },
    clouds: [
      { x: snap(width * 0.04), y: snap(height * 0.12), small: false },
      { x: snap(width * 0.38), y: snap(height * 0.25), small: true },
      { x: snap(width * 0.8), y: snap(height * 0.33), small: false },
    ],
  };
}

export function WorldTreeSun({ width, height }: { width: number; height: number }) {
  const position = sceneryLayout(width, height).sun;
  return <Svg {...crispEdges} width={width} height={height} pointerEvents="none" accessible={false} aria-hidden>
    <G translateX={position.x} translateY={position.y}>
      <G scale={ArtPixelDp}>
        {[[11, 0, 2, 3], [11, 21, 2, 3], [0, 11, 3, 2], [21, 11, 3, 2], [3, 3, 2, 2], [19, 3, 2, 2], [3, 19, 2, 2], [19, 19, 2, 2]].map(([x, y, w, h], index) =>
          <Rect key={index} x={x} y={y} width={w} height={h} fill={colors.sunBase} />)}
        <Path d="M9 5H15V6H18V9H19V15H18V18H15V19H9V18H6V15H5V9H6V6H9Z" fill={colors.sunShade} />
        <Path d="M9 6H15V7H17V9H18V15H17V17H15V18H9V17H7V15H6V9H7V7H9Z" fill={colors.sunBase} />
        <Path d="M9 7H14V8H10V9H8V13H7V9H8V8H9Z" fill={colors.sunHighlight} />
      </G>
    </G>
  </Svg>;
}

export function WorldTreeClouds({ width, height }: { width: number; height: number }) {
  return <Svg {...crispEdges} width={width} height={height} pointerEvents="none" accessible={false} aria-hidden>
    {sceneryLayout(width, height).clouds.map((cloud, index) => <G key={index} translateX={cloud.x} translateY={cloud.y}>
      <G scale={ArtPixelDp}>
        <Path d={cloud.small ? 'M0 6H3V3H7V1H14V3H19V5H23V9H0Z' : 'M0 8H3V5H7V2H15V0H21V2H25V5H29V8H32V12H0Z'} fill={colors.skyBottom} />
        <Path d={cloud.small ? 'M0 7H4V8H19V7H23V9H0Z' : 'M0 10H3V11H29V10H32V12H0Z'} fill={colors.cloudShade} />
      </G>
    </G>)}
  </Svg>;
}

/** Full-width cap, rounded UP to the grid so the viewport's right edge is covered. */
export function grassGeometry(availableWidth: number) {
  const width = Math.ceil(availableWidth / ArtPixelDp) * ArtPixelDp;
  const x = (fraction: number) => snap(width * fraction);
  const profile = [[0, 6], [0.1, 4], [0.22, 5], [0.36, 2], [0.45, 0], [0.56, 2], [0.68, 4], [0.82, 5], [1, 5]];
  const edge: number[][] = [[0, p(6)]];
  let previous = p(6);
  for (const [fraction, artY] of profile.slice(1)) {
    edge.push([x(fraction), previous], [x(fraction), p(artY)]);
    previous = p(artY);
  }
  const band = (offset: number, thickness: number) => {
    const points = [...edge.map(([cx, cy]) => [cx, cy + offset]), ...[...edge].reverse().map(([cx, cy]) => [cx, cy + offset + thickness])];
    return points.map(([cx, cy], index) => (index === 0 ? 'M' : 'L') + cx + ' ' + cy).join('') + 'Z';
  };
  const surfaceAt = (cx: number) => {
    let y = p(6);
    for (const [fraction, artY] of profile) if (cx >= x(fraction)) y = p(artY);
    return y;
  };
  let blades = '';
  for (let cx = 0, index = 0; cx <= width; cx += p(6), index++) {
    const y = surfaceAt(cx);
    const tall = index % 3 === 0 ? p(3) : p(2);
    blades += 'M' + cx + ' ' + y + 'v-' + tall + 'h' + p(1) + 'v' + p(1) + 'h' + p(1) + 'v' + (tall - p(1)) + 'Z';
  }
  return { width, height: p(16), surface: band(0, p(2)), shade: band(p(2), p(1)), blades };
}

export function WorldTreeGrass({ width }: { width: number }) {
  const geometry = grassGeometry(width), air = PixelSpacing.px3;
  return <Svg {...crispEdges} width={geometry.width} height={geometry.height}
    viewBox={'0 ' + -air + ' ' + geometry.width + ' ' + geometry.height} pointerEvents="none" accessible={false} aria-hidden>
    <Path d={geometry.shade} fill={colors.grassShade} />
    <Path d={geometry.surface} fill={colors.grassBase} />
    <Path d={geometry.blades} fill={colors.grassHighlight} />
  </Svg>;
}
