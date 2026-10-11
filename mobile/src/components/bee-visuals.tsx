import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Radii, Spacing, Typography, Controls, States } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type VisualTileProps = {
  icon: IconName;
  label: string;
  color: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export function BeeMark({ size = 56 }: { size?: number }) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  return (
    <View style={[styles.beeMark, { width: size, height: size, borderRadius: size * 0.34 }]}>
      <Ionicons name="sunny" size={size * 0.48} color={COLORS.accentForeground} accessible={false} />
      <View style={[styles.beeStripe, { width: size * 0.42, top: size * 0.45 }]} />
    </View>
  );
}

export function VisualTile({ icon, label, color, onPress, style }: VisualTileProps) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const content = (
    <>
      <View style={[styles.tileIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={24} color={COLORS.foreground} />
      </View>
      <ThemedText style={styles.tileLabel} numberOfLines={2}>{label}</ThemedText>
    </>
  );

  return onPress ? (
    <TouchableOpacity style={[styles.visualTile, style]} onPress={onPress} activeOpacity={States.pressedOpacity}>{content}</TouchableOpacity>
  ) : (
    <View style={[styles.visualTile, style]}>{content}</View>
  );
}

export function PillButton({ label, icon, onPress, dark = false }: { label: string; icon?: IconName; onPress: () => void; dark?: boolean }) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  return (
    <TouchableOpacity style={[styles.pillButton, dark && styles.pillButtonDark]} onPress={onPress} activeOpacity={States.pressedOpacity}>
      {icon && <Ionicons name={icon} size={16} color={dark ? COLORS.primaryForeground : COLORS.accentForeground} />}
      <ThemedText style={[styles.pillButtonText, dark && styles.pillButtonTextDark]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const styles = useBeeStyles(makeStyles);
  return (
    <View style={styles.sectionTitleRow}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {action && onAction && <TouchableOpacity onPress={onAction}><ThemedText style={styles.sectionAction}>{action}</ThemedText></TouchableOpacity>}
    </View>
  );
}

const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  beeMark: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, overflow: 'hidden' },
  beeStripe: { position: 'absolute', height: 4, borderRadius: 4, backgroundColor: COLORS.accentForeground },
  visualTile: { width: 94, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: COLORS.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: COLORS.border },
  tileIcon: { width: 54, height: 54, borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: COLORS.foreground, ...Typography.label, textAlign: 'center' },
  pillButton: { minHeight: Controls.minHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radii.pill, backgroundColor: COLORS.accent },
  pillButtonDark: { backgroundColor: COLORS.primary },
  pillButtonText: { color: COLORS.accentForeground, ...Typography.label},
  pillButtonTextDark: { color: COLORS.primaryForeground },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, marginBottom: Spacing.half },
  sectionTitle: { color: COLORS.foreground, ...Typography.section},
  sectionAction: { color: COLORS.primary, ...Typography.label} });
