import Svg, { Path, type SvgProps } from 'react-native-svg';
import { ArtPixelDp, useBeePalette, type BeePalette } from '@/constants/theme';

type Glyph = { cells: number; paths: readonly [keyof BeePalette, string][] };
const glyphs = {
  xp: { cells: 6, paths: [
    ['foreground', 'M2 0H4V1H5V2H6V4H5V5H4V6H2V5H1V4H0V2H1V1H2Z'],
    ['accent', 'M2 1H4V2H5V4H4V5H2V4H1V2H2Z'],
    ['accentForeground', 'M2 2H4V3H2Z'],
  ] },
  leaf: { cells: 8, paths: [
    ['foreground', 'M6 1H7V4H6V5H5V6H3V7H2V8H1V6H2V3H3V2H6Z'],
    ['success', 'M6 2V4H5V5H3V6H2V4H3V3H5V2Z'],
    ['accent', 'M5 2H6V3H5V4H4V5H3V4H4V3H5Z'],
  ] },
  bud: { cells: 8, paths: [
    ['foreground', 'M3 1H6V2H7V5H6V6H5V7H4V8H2V6H1V3H2V2H3Z'],
    ['success', 'M3 2H6V5H5V6H3V5H2V3H3Z'],
    ['accent', 'M3 3H4V4H3Z'],
  ] },
  leafFull: { cells: 16, paths: [
    ['foreground', 'M2 14H4V10H3V7H4V5H6V3H9V2H14V7H13V10H11V12H6V14H4V15H2Z'],
    ['success', 'M5 10V7H6V5H9V4H12V7H11V9H9V10H7V12H5Z'],
    ['accent', 'M6 11V9H8V7H10V5H11V8H10V9H9V10H7V11H6Z'],
  ] },
  book: { cells: 8, paths: [
    ['primary', 'M0 1H3V2H5V1H8V6H5V7H3V6H0Z'],
    ['surface', 'M1 2H3V3H4V6H3V5H1ZM5 3V2H7V5H5V6H4V3Z'],
  ] },
  repeat: { cells: 8, paths: [['primary', 'M4 0H5V1H6V2H7V3H6V4H5V5H4V3H2V5H1V2H4ZM6 4H7V7H4V8H3V7H2V6H1V5H2V4H3V6H6Z']] },
  people: { cells: 8, paths: [['primary', 'M1 1H3V4H1ZM5 1H7V4H5ZM1 5H3V6H4V7H0V6H1ZM5 5H7V6H8V7H4V6H5Z']] },
  heart: { cells: 8, paths: [['primary', 'M1 1H3V2H5V1H7V2H8V4H7V5H6V6H5V7H3V6H2V5H1V4H0V2H1Z']] },
  quest: { cells: 8, paths: [['primary', 'M1 1H7V5H5V4H2V8H1ZM2 2V3H5V4H6V2Z']] },
  lock: { cells: 8, paths: [['foreground', 'M2 1H6V2H7V4H8V8H0V4H1V2H2ZM3 2H2V4H6V2H5V2ZM3 5V7H5V5Z']] },
  proof: { cells: 8, paths: [['primary', 'M1 0H5V1H6V2H7V8H1ZM2 1V7H6V3H4V1ZM3 4H5V5H3ZM3 6H5V7H3Z']] },
  revision: { cells: 8, paths: [['danger', 'M2 1H7V2H8V6H7V7H1V6H0V3H1V2H2ZM3 2V4H5V2ZM3 5V6H5V5Z']] },
  flight: { cells: 8, paths: [['primary', 'M1 1H3V2H5V1H7V2H8V4H6V5H5V7H3V5H2V4H0V2H1Z']] },
  worker: { cells: 8, paths: [['primary', 'M2 1H6V2H8V4H7V5H5V6H6V8H2V6H3V5H1V4H0V2H2ZM1 3V4H2V3ZM6 3V4H7V3Z']] },
  rising: { cells: 8, paths: [['primary', 'M3 0H5V2H8V4H6V7H5V6H3V7H2V4H0V2H3Z']] },
  streak: { cells: 8, paths: [['primary', 'M4 0H5V2H6V3H7V6H6V7H5V8H2V7H1V6H0V4H1V3H2V5H3V3H4Z']] },
  pollinator: { cells: 8, paths: [['primary', 'M1 0H3V1H5V0H7V3H6V5H7V8H5V7H3V8H1V5H2V3H1ZM3 2V5H5V2Z']] },
} satisfies Record<string, Glyph>;

export type PixelGlyphName = keyof typeof glyphs;
const crispEdges: SvgProps & { shapeRendering: 'crispEdges' } = { shapeRendering: 'crispEdges' };

export function PixelGlyph({ name, scale = 1, muted = false }: { name: PixelGlyphName; scale?: 1 | 2; muted?: boolean }) {
  const colors = useBeePalette();
  const { cells, paths } = glyphs[name];
  const size = cells * ArtPixelDp * scale;
  return <Svg {...crispEdges} width={size} height={size} viewBox={`0 0 ${cells} ${cells}`} accessible={false} aria-hidden>
    {paths.map(([role, path]) => <Path key={path} d={path} fill={muted ? colors.muted : colors[role]} fillRule="evenodd" />)}
  </Svg>;
}
