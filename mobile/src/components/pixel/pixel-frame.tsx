import { memo, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, type SvgProps } from 'react-native-svg';
import { useBeePalette, type BeePalette } from '@/constants/theme';

export type PixelFrameProps = {
  ramp?: { base: string | null; highlight: string | null; shadow: string; outline: string };
  children?: ReactNode;
  fill?: keyof BeePalette;
  border?: keyof BeePalette;
  depth?: keyof BeePalette;
  pressed?: boolean;
  focused?: boolean;
  /** Raised preserves the experimental button geometry; flat has no bottom depth. */
  appearance?: 'raised' | 'flat';
  borderWidth?: number;
  cornerStep?: number;
  innerHighlight?: keyof BeePalette;
  innerHighlightWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// Filled silhouettes overlap; no adjacent tiles or centered strokes.
function outline(width: number, height: number, inset: number, top: number, p = 3) {
  const l = inset, r = width - inset, t = inset + top, b = height - inset;
  return `M ${l + p * 2} ${t} H ${r - p * 2} V ${t + p} H ${r - p} V ${t + p * 2} H ${r} V ${b - p * 2} H ${r - p} V ${b - p} H ${r - p * 2} V ${b} H ${l + p * 2} V ${b - p} H ${l + p} V ${b - p * 2} H ${l} V ${t + p * 2} H ${l + p} V ${t + p} H ${l + p * 2} Z`;
}

// Web receives this hint; native react-native-svg may ignore it.
const crispEdges: SvgProps & { shapeRendering: 'crispEdges' } = { shapeRendering: 'crispEdges' };

export const PixelFrame = memo(function PixelFrame({ ramp, children, fill = 'card', border = 'foreground', depth = 'primaryPressed', pressed = false, focused = false, appearance = 'raised', borderWidth = 3, cornerStep = 3, innerHighlight, innerHighlightWidth = 1, style, testID }: PixelFrameProps) {
  const c = useBeePalette();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Normalize geometry once to whole logical pixels. Colors stay palette roles.
  const edge = Math.max(1, Math.round(borderWidth));
  const step = Math.max(1, Math.round(cornerStep));
  const line = innerHighlight ? Math.max(1, Math.round(innerHighlightWidth)) : 0;
  const minimum = appearance === 'flat' ? 2 * (edge + line) + 4 * step + 1 : 24;
  const { width, height } = size;
  const paths = useMemo(() => {
    if (width < minimum || height < minimum) return null;

    const outer = outline(width, height, 0, 0, step);
    const inset = outline(width, height, edge, 0, step);
    return appearance === 'flat'
      ? { outer, inset, face: line ? outline(width, height, edge + line, 0, step) : inset, depth: '', focus: `${outer} ${inset}` }
      : { outer, inset: '', face: outline(width, height - (pressed ? 3 : 6), 3, pressed ? 3 : 0), depth: outline(width, height, 3, pressed ? 3 : 0), focus: `${outer} ${outline(width, height, 3, 0)}` };
  }, [width, height, minimum, appearance, edge, step, line, pressed]);
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    // Matching integer SVG dimensions/viewBox avoid fractional viewBox scaling.
    // Ceil can overdraw by <1 dp; it does not guarantee physical-pixel alignment.
    const width = Math.ceil(layout.width), height = Math.ceil(layout.height);
    setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
  };
  return <View testID={testID} onLayout={onLayout} style={[styles.root, appearance === 'flat' && { minWidth: minimum, minHeight: minimum }, style]}>
    {paths && <Svg {...crispEdges} width={size.width} height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`} pointerEvents="none" accessible={false} aria-hidden style={styles.art}>
      <Path d={ramp?.base === null ? `${paths.outer} ${outline(width, height, edge, 0, step)}` : paths.outer} fill={ramp?.outline ?? c[border]} fillRule="evenodd" />
      {appearance === 'raised' && ramp?.base !== null && <Path d={paths.depth} fill={ramp?.shadow ?? c[depth]} />}
      {appearance === 'flat' && innerHighlight && <Path d={paths.inset} fill={c[innerHighlight]} />}
      <Path d={paths.face} fill={ramp ? ramp.base ?? 'none' : c[fill]} />
      {ramp?.highlight && <Path d={`M 9 ${pressed ? 9 : 6} H ${width - 9} V ${pressed ? 12 : 9} H 9 Z`} fill={ramp.highlight} />}
      {focused && <Path d={paths.focus} fill={c.focus} fillRule="evenodd" />}
    </Svg>}
    {children}
  </View>;
});

const styles = StyleSheet.create({
  root: { position: 'relative', minWidth: 48, minHeight: 48 },
  art: { position: 'absolute', top: 0, left: 0 },
});
