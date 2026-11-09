import Svg, { Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText, type SvgProps } from 'react-native-svg';
import { ArtPixelDp, Palettes, Pixel, PixelBorders, PixelSpacing, TypographyRoles, TypographySpec, artPixelsToDp, type ColorToken } from '@/constants/tokens';
import compiled from '../../../assets/skill-tree/world-tree-art.json';
import { TREE_SIZE, type DomainId } from './forest-model';

// Soil keeps its warm canonical palette. The tree uses a dedicated brown/green
// illustration ramp so other application screens retain their existing colors.
export const TREE_PALETTE = Palettes.light;
export const TREE_ART = compiled.paths.map(part => ({ ...part, color: part.color as ColorToken }));
const layers = ['wood', 'academics', 'social', 'habits', 'health'];
const crispEdges: SvgProps & { shapeRendering: 'crispEdges' } = { shapeRendering: 'crispEdges' };
const woodColors: Partial<Record<ColorToken, string>> = {
  background: Pixel.worldTree.barkLight, surfaceMuted: Pixel.worldTree.barkMid,
  muted: Pixel.worldTree.barkShade, primary: Pixel.worldTree.barkDeep,
  foreground: Pixel.worldTree.barkOutline, accent: Pixel.worldTree.barkHighlight,
};

export function treePartColor(layer: string, color: ColorToken, active: DomainId | null = null) {
  if (layer === 'wood') return woodColors[color] ?? Pixel.worldTree.barkShade;
  if (active) {
    const leaf = Pixel.worldTree;
    return layer === active
      ? color === 'successSurface' ? leaf.leafActiveHighlight : color === 'accent' ? leaf.leafActiveAccent : leaf.leafActiveBase
      : color === 'successSurface' ? leaf.leafDimHighlight : color === 'accent' ? leaf.leafDimAccent : leaf.leafDimBase;
  }
  return color === 'successSurface' ? Pixel.worldTree.leafHighlight : color === 'accent' ? Pixel.worldTree.leafAccent : Pixel.worldTree.leafBase;
}

export function WorldTreeArt({ active = null }: { active?: DomainId | null } = {}) {
  return <Svg {...crispEdges} width={TREE_SIZE.width} height={TREE_SIZE.height}
    viewBox={'0 0 ' + TREE_SIZE.width + ' ' + TREE_SIZE.height} pointerEvents="none" accessible={false} aria-hidden>
    <G scale={ArtPixelDp}>
      {layers.map(layer => <G key={layer}>
        {TREE_ART.filter(part => part.layer === layer).map(part => <Path key={part.color} d={part.d} fill={treePartColor(layer, part.color, active)} />)}
      </G>)}
    </G>
  </Svg>;
}

/** One glyph geometry for both fill and stroke; avoids offset Text copies. */
export function WorldTreeName({ name, width, fontScale, active }: { name: string; width: number; fontScale: number; active: boolean }) {
  const fontSize = Math.max(TypographySpec.minimumFontSize, TypographyRoles.label.fontSize * fontScale);
  const height = Math.ceil((fontSize + PixelSpacing.px5) / ArtPixelDp) * ArtPixelDp;
  const underline = height - PixelSpacing.px2;
  const text = { x: width / 2, y: fontSize + PixelSpacing.px1, fontFamily: TypographyRoles.label.fontFamily, fontSize, textAnchor: 'middle' as const };
  return <Svg width={width} height={height} viewBox={'0 0 ' + width + ' ' + height} pointerEvents="none" accessible={false} aria-hidden>
    <SvgText {...text} fill={Pixel.worldTree.skyBottom} stroke={Pixel.worldTree.skyBottom}
      strokeWidth={PixelBorders.default} strokeLinejoin="miter">{name}</SvgText>
    <SvgText {...text} fill={Pixel.worldTree.skyLabel}>{name}</SvgText>
    {active && <Path d={'M' + (width / 2 - PixelSpacing.px3) + ' ' + underline + 'h' + PixelSpacing.px6} stroke={Pixel.worldTree.skyLabel} strokeWidth={PixelBorders.default} />}
  </Svg>;
}

export function WorldTreeSky({ width, height }: { width: number; height: number }) {
  const sky = Pixel.worldTree;
  return <Svg width={width} height={height} pointerEvents="none" accessible={false} aria-hidden>
    <Defs><LinearGradient id="world-tree-sky" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={sky.skyTop} />
      <Stop offset={sky.skyFadeStart} stopColor={sky.skyMiddle} />
      <Stop offset="1" stopColor={sky.skyBottom} />
    </LinearGradient></Defs>
    <Rect width={width} height={height} fill="url(#world-tree-sky)" />
  </Svg>;
}

export function WorldTreeGround({ width }: { width: number }) {
  const w = Math.ceil(width / ArtPixelDp) * ArtPixelDp, h = artPixelsToDp(12);
  const x = (fraction: number) => Math.round(w * fraction / ArtPixelDp) * ArtPixelDp;
  const p = artPixelsToDp;
  const surface = 'M0 ' + p(6) + ' H' + x(0.1) + ' V' + p(4) + ' H' + x(0.22) + ' V' + p(5) + ' H' + x(0.36) + ' V' + p(2) + ' H' + x(0.45) + ' V0 H' + x(0.56) + ' V' + p(2) + ' H' + x(0.68) + ' V' + p(4) + ' H' + x(0.82) + ' V' + p(5) + ' H' + w + ' V' + h + ' H0 Z';
  const base = 'M0 ' + p(9) + ' H' + x(0.16) + ' V' + p(8) + ' H' + x(0.3) + ' V' + p(10) + ' H' + x(0.48) + ' V' + p(9) + ' H' + x(0.67) + ' V' + p(8) + ' H' + x(0.84) + ' V' + p(9) + ' H' + w + ' V' + h + ' H0 Z';
  return <Svg {...crispEdges} width={w} height={h} viewBox={'0 0 ' + w + ' ' + h} pointerEvents="none" accessible={false} aria-hidden>
    <Path d={surface} fill={TREE_PALETTE.muted} />
    <Path d={base} fill={TREE_PALETTE.foreground} />
  </Svg>;
}
