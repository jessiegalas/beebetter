import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Radii } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

type VisualTileProps = {
  icon: IconName;
  label: string;
  color: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export function BeeMark({ size = 56 }: { size?: number }) {
  const styles = useBeeStyles(makeStyles);
  return (
    <View style={[styles.beeMark, { width: size, height: size, borderRadius: size * 0.34 }]}>
      <Ionicons name="sunny" size={size * 0.48} color="#5B351A" />
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
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  return (
    <TouchableOpacity style={[styles.pillButton, dark && styles.pillButtonDark]} onPress={onPress} activeOpacity={0.8}>
      {icon && <Ionicons name={icon} size={16} color={dark ? '#FFFFFF' : COLORS.ink} />}
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
  beeMark: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.honey, overflow: 'hidden' },
  beeStripe: { position: 'absolute', height: 4, borderRadius: 4, backgroundColor: COLORS.honeyDeep },
  visualTile: { width: 94, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10, backgroundColor: COLORS.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  tileIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  pillButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 17, borderRadius: Radii.pill, backgroundColor: COLORS.honey },
  pillButtonDark: { backgroundColor: '#5B351A' },
  pillButtonText: { color: '#2D241D', fontSize: 14, fontWeight: '700' , lineHeight: 20},
  pillButtonTextDark: { color: '#FFFFFF' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 2 },
  sectionTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '700' , lineHeight: 28},
  sectionAction: { color: COLORS.honeyDark, fontSize: 14, fontWeight: '700' , lineHeight: 20} });
