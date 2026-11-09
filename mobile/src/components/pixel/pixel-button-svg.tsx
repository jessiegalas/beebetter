import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Rect, type SvgProps } from 'react-native-svg';
import { Controls, PixelSpacing, TypographyRoles, useAppColorScheme, useBeePalette, type BeePalette } from '@/constants/theme';
import { useReducedMotion } from '@/components/mobile-ui';
import type { PixelButtonIntent } from './pixel-button';
import { PixelFrame } from './pixel-frame';
import tokens from '@/constants/design-tokens.json';

export type PixelButtonSvgProps = {
  label: string;
  /** Gallery state preview; activation still follows disabled/loading props. */
  previewState?: 'normal' | 'pressed' | 'focused';
  onPress: () => void;
  intent?: PixelButtonIntent;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityHint?: string;
  testID?: string;
};

const textRoles: Record<PixelButtonIntent, keyof BeePalette> = {
  primary: 'primaryForeground', secondary: 'foreground', quiet: 'foreground',
  destructive: 'dangerForeground', accent: 'accentForeground', 'accent-quiet': 'foreground',
};
const crispEdges: SvgProps & { shapeRendering: 'crispEdges' } = { shapeRendering: 'crispEdges' };

function LoadingDots({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % 3), 150);
    return () => clearInterval(timer);
  }, [reduced]);
  return <Svg {...crispEdges} width={30} height={12} viewBox="0 0 30 12" accessible={false} aria-hidden>
    {[0, 1, 2].map(index => <Rect key={index} x={index * 12} y={reduced || frame === index ? 0 : 6} width={6} height={6} fill={color} />)}
  </Svg>;
}

/** Experimental. Does not replace the PNG PixelButton or its asset pack. */
export const PixelButtonSvg = memo(function PixelButtonSvg({ previewState, label, onPress, intent = 'primary', disabled = false, loading = false, style, labelStyle, accessibilityHint, testID }: PixelButtonSvgProps) {
  const c = useBeePalette();
  const scheme = useAppColorScheme();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const blocked = disabled || loading;
  const down = !disabled && !loading && (previewState === 'pressed' || pressed);
  const ramps = tokens.pixel.button.ramps[scheme][intent];
  const ramp = disabled ? ramps.disabled : down ? ramps.pressed : ramps.normal;
  const color = c[disabled ? 'disabledForeground' : textRoles[intent]];
  return <Pressable
    cssInterop={false}
    accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled: blocked, busy: loading }}
    testID={testID} disabled={blocked} onPress={onPress}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={[styles.root, style]}>
    <PixelFrame ramp={ramp} pressed={down} focused={(previewState === 'focused' || focused) && !blocked}>
      <View style={[styles.content, down && styles.down]} pointerEvents="none">
        {/* Keep the wrapping label in layout during loading to avoid height jumps. */}
        <Text allowFontScaling style={[styles.label, labelStyle, { color }, loading && styles.hidden]}>{label}</Text>
        {loading && <View style={styles.loader}><LoadingDots color={color} /></View>}
      </View>
    </PixelFrame>
  </Pressable>;
});

const styles = StyleSheet.create({
  root: { minWidth: Controls.minHeight, minHeight: Controls.minHeight },
  content: { minHeight: Controls.minHeight, paddingHorizontal: PixelSpacing.px6, paddingTop: 12, paddingBottom: 15, justifyContent: 'center', alignItems: 'center' },
  // Equal total padding preserves measured size across press transitions.
  down: { paddingTop: 15, paddingBottom: 12 },
  label: { ...TypographyRoles.label, textAlign: 'center', alignSelf: 'stretch', flexShrink: 1 },
  hidden: { opacity: 0 },
  loader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
