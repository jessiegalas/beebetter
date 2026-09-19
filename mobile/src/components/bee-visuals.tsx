import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type VisualTileProps = {
  icon: IconName;
  label: string;
  color: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export function BeeMark({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.beeMark, { width: size, height: size, borderRadius: size * 0.34 }]}>
      <Ionicons name="sunny" size={size * 0.48} color={COLORS.honeyDeep} />
      <View style={[styles.beeStripe, { width: size * 0.42, top: size * 0.45 }]} />
    </View>
  );
}

export function VisualTile({ icon, label, color, onPress, style }: VisualTileProps) {
  const content = (
    <>
      <View style={[styles.tileIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={24} color={COLORS.ink} />
      </View>
      <ThemedText style={styles.tileLabel} numberOfLines={2}>{label}</ThemedText>
    </>
  );

  return onPress ? (
    <TouchableOpacity style={[styles.visualTile, style]} onPress={onPress} activeOpacity={0.82}>{content}</TouchableOpacity>
  ) : (
    <View style={[styles.visualTile, style]}>{content}</View>
  );
}

export function PillButton({ label, icon, onPress, dark = false }: { label: string; icon?: IconName; onPress: () => void; dark?: boolean }) {
  return (
    <TouchableOpacity style={[styles.pillButton, dark && styles.pillButtonDark]} onPress={onPress} activeOpacity={0.8}>
      {icon && <Ionicons name={icon} size={16} color={dark ? '#FFFFFF' : COLORS.ink} />}
      <ThemedText style={[styles.pillButtonText, dark && styles.pillButtonTextDark]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {action && onAction && <TouchableOpacity onPress={onAction}><ThemedText style={styles.sectionAction}>{action}</ThemedText></TouchableOpacity>}
    </View>
  );
}

const styles = StyleSheet.create({
  beeMark: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honey, overflow: 'hidden', ...BeeBetterShadow },
  beeStripe: { position: 'absolute', height: 4, borderRadius: 4, backgroundColor: COLORS.honeyDeep },
  visualTile: { width: 94, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10, backgroundColor: COLORS.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  tileIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: COLORS.ink, fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  pillButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 17, borderRadius: Radii.pill, backgroundColor: COLORS.honey },
  pillButtonDark: { backgroundColor: COLORS.honeyDeep },
  pillButtonText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  pillButtonTextDark: { color: '#FFFFFF' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  sectionAction: { color: COLORS.honeyDark, fontSize: 12, fontWeight: '800' },
});
