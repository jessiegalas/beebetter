import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Controls, PixelSpacing, TypographyRoles, useBeePalette } from '@/constants/theme';
import { PixelFrame } from './pixel-frame';

export function PixelChoice({ label, accessibilityLabel = label, selected, disabled = false, role = 'button', equalWidth = false, leading, onPress }: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  disabled?: boolean;
  role?: 'button' | 'tab' | 'radio';
  equalWidth?: boolean;
  leading?: ReactNode;
  onPress: () => void;
}) {
  const c = useBeePalette();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const fill = disabled ? 'disabled' : pressed ? 'surfaceMuted' : selected ? 'surface' : 'card';
  const selection = role === 'radio' ? { checked: selected } : { selected };
  return <Pressable cssInterop={false} accessibilityRole={role} accessibilityLabel={accessibilityLabel}
    accessibilityState={{ ...selection, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    style={[styles.root, equalWidth && styles.equalWidth]}>
    <PixelFrame appearance="flat" fill={fill} border={selected ? 'primary' : 'input'} focused={focused && !disabled}>
      <View style={styles.content}>
        {leading}
        <Text style={[styles.label, { color: disabled ? c.disabledForeground : c.foreground }]}>{label}</Text>
        {selected && <View aria-hidden style={[styles.marker, { backgroundColor: disabled ? c.disabledForeground : c.primary }]} />}
      </View>
    </PixelFrame>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { maxWidth: '100%' },
  equalWidth: { flexGrow: 1, flexBasis: 0, minWidth: Controls.minHeight },
  content: { minWidth: Controls.minHeight, minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: PixelSpacing.px2, paddingHorizontal: PixelSpacing.px6, paddingVertical: PixelSpacing.px3 },
  label: { ...TypographyRoles.label, textAlign: 'center', flexShrink: 1 },
  marker: { position: 'absolute', bottom: PixelSpacing.px1, alignSelf: 'center', width: PixelSpacing.px6, height: PixelSpacing.px1 },
});
