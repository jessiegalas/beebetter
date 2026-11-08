import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useReducedMotion } from '@/components/mobile-ui';
import { useAppColorScheme, useBeePalette } from '@/constants/theme';
import { FACES, RINGS, SPINNERS, SPINNER_TONE, type PixelIntent } from './pixel-assets';

/**
 * Pixel-art button built from the generated pack in `assets/pixel/button`.
 *
 * Geometry comes from the pack atlas at the default 3 dp per art pixel:
 * a 16x16 face is 48 dp tall with 12 dp caps, the 22x22 focus ring is 66 dp
 * with a 9 dp overhang, and one spinner frame is 30 dp.
 *
 * The face is drawn as three horizontal slices so it can grow to any width
 * without stretching the pixel caps. Height is fixed; the pack's 42 dp
 * compact size is not supported yet because it needs vertical slicing.
 */
export type PixelButtonIntent = PixelIntent;

const FACE_HEIGHT = 48;
const CAP_WIDTH = 12;
const RING_HEIGHT = 66;
const RING_CAP_WIDTH = 21;
const RING_OVERHANG = 9;
const SPINNER_SIZE = 30;
const SPINNER_SHEET_WIDTH = 210;
const SPINNER_ANIMATED_FRAMES = 6;
const SPINNER_STATIC_FRAME = 6;
const SPINNER_FRAME_MS = 100;

const NORMAL_INSETS = { top: 6, bottom: 9 };
const PRESSED_INSETS = { top: 9, bottom: 3 };

function PixelSpinner({ tone }: { tone: keyof typeof SPINNERS }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % SPINNER_ANIMATED_FRAMES), SPINNER_FRAME_MS);
    return () => clearInterval(timer);
  }, [reduced]);

  // Frame 6 is the all-dots-lit fallback the pack provides for reduced motion.
  const index = reduced ? SPINNER_STATIC_FRAME : frame;

  return <View style={s.spinnerWindow} accessible={false}>
    <Image source={SPINNERS[tone]} style={[s.spinnerSheet, { transform: [{ translateX: -index * SPINNER_SIZE }] }]} />
  </View>;
}

export function PixelButton({ label, onPress, intent = 'primary', disabled = false, loading = false, style }: {
  label: string;
  onPress: () => void;
  intent?: PixelButtonIntent;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useBeePalette();
  const theme = useAppColorScheme() === 'dark' ? 'dark' : 'light';
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  const blocked = disabled || loading;
  const pressedFace = !disabled && (pressed || loading);
  const face = disabled ? FACES[theme].disabled : FACES[theme][intent][pressedFace ? 'pressed' : 'normal'];
  const insets = pressedFace ? PRESSED_INSETS : NORMAL_INSETS;
  const labelColor = disabled ? c.disabledForeground
    : intent === 'primary' ? c.primaryForeground
    : intent === 'accent' ? c.accentForeground
    : intent === 'destructive' ? c.dangerForeground
    : c.foreground;
  const ring = RINGS[theme];

  return <Pressable
    cssInterop={false}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: blocked, busy: loading }}
    disabled={blocked}
    onPress={onPress}
    onPressIn={() => setPressed(true)}
    onPressOut={() => setPressed(false)}
    onFocus={() => setFocused(true)}
    onBlur={() => setFocused(false)}
    style={[s.root, style]}>
    <View style={s.frame}>
      <Image source={face[0]} style={s.cap} />
      <Image source={face[1]} style={s.middle} resizeMode="stretch" />
      <Image source={face[2]} style={s.cap} />
    </View>
    {focused && !blocked && <View style={s.ring}>
      <Image source={ring[0]} style={s.ringCap} />
      <Image source={ring[1]} style={s.ringMiddle} resizeMode="stretch" />
      <Image source={ring[2]} style={s.ringCap} />
    </View>}
    <View style={[s.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {loading ? <PixelSpinner tone={SPINNER_TONE[theme][intent]} /> : <ThemedText
        type="label"
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[s.label, { color: labelColor }]}>{label}</ThemedText>}
    </View>
  </Pressable>;
}

const s = StyleSheet.create({
  root: { height: FACE_HEIGHT, minWidth: 48, justifyContent: 'center' },
  frame: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', pointerEvents: 'none' },
  cap: { width: CAP_WIDTH, height: FACE_HEIGHT },
  middle: { flex: 1, height: FACE_HEIGHT },
  ring: {
    position: 'absolute',
    left: -RING_OVERHANG,
    right: -RING_OVERHANG,
    top: -RING_OVERHANG,
    bottom: -RING_OVERHANG,
    flexDirection: 'row',
    pointerEvents: 'none',
  },
  ringCap: { width: RING_CAP_WIDTH, height: RING_HEIGHT },
  ringMiddle: { flex: 1, height: RING_HEIGHT },
  content: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, pointerEvents: 'none' },
  label: { textAlign: 'center' },
  spinnerWindow: { width: SPINNER_SIZE, height: SPINNER_SIZE, overflow: 'hidden' },
  spinnerSheet: { position: 'absolute', left: 0, top: 0, width: SPINNER_SHEET_WIDTH, height: SPINNER_SIZE },
});
