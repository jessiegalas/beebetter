import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { IconButton } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Radii } from '@/constants/theme';

export function WellnessHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const c = useBeePalette();
  return <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 8 }}>
    <View style={{ alignSelf: 'flex-start' }}><IconButton icon="chevron-back" label="Go back" onPress={() => router.back()} /></View>
    <ThemedText type="title">{title}</ThemedText>
    <ThemedText type="small" style={{ color: c.muted }}>{subtitle}</ThemedText>
  </View>;
}

export type RatingOption = { value: number; label: string };

export function RatingScale({
  title,
  hint,
  value,
  options,
  onChange,
  allowClear = false }: {
  title: string;
  hint: string;
  value: number | null;
  options: RatingOption[];
  onChange: (value: number | null) => void;
  allowClear?: boolean;
}) {
  const styles = useBeeStyles(makeStyles);
  return (
    <View style={styles.scaleBlock}>
      <View>
        <ThemedText style={styles.scaleTitle}>{title}</ThemedText>
        <ThemedText style={styles.scaleHint}>{hint}</ThemedText>
      </View>
      <View style={styles.ratingRow}>
        {options.map(option => {
          const selected = value === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.ratingOption, selected && styles.ratingOptionSelected]}
              onPress={() => onChange(allowClear && selected ? null : option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${title}: ${option.value}, ${option.label}`}>
              <ThemedText style={[styles.ratingNumber, selected && styles.ratingNumberSelected]}>{option.value}</ThemedText>
              <ThemedText style={[styles.ratingLabel, selected && styles.ratingLabelSelected]} >{option.label}</ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function PrivacyNote({ children }: { children: string }) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  return (
    <View style={styles.privacyNote}>
      <Ionicons name="lock-closed-outline" size={18} color={COLORS.honeyDeep} />
      <ThemedText style={styles.privacyText}>{children}</ThemedText>
    </View>
  );
}

export function InlineMessage({ message, tone }: { message: string; tone: 'error' | 'success' }) {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  return (
    <View style={[styles.message, tone === 'success' ? styles.successMessage : styles.errorMessage]} accessibilityLiveRegion="polite">
      <Ionicons name={tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={tone === 'success' ? COLORS.success : COLORS.danger} />
      <ThemedText style={styles.messageText}>{message}</ThemedText>
    </View>
  );
}

const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  scaleBlock: { gap: 12 },
  scaleTitle: { color: COLORS.ink, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  scaleHint: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ratingOption: { flexGrow: 1, flexBasis: 80, minWidth: 80, minHeight: 70, paddingVertical: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.surfaceMuted, borderRadius: Radii.md, backgroundColor: COLORS.background },
  ratingOptionSelected: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honeyDark },
  ratingNumber: { color: COLORS.ink, fontSize: 18, lineHeight: 28, fontWeight: '700' },
  ratingNumberSelected: { color: COLORS.honeyDeep },
  ratingLabel: { color: COLORS.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 3 },
  ratingLabelSelected: { color: COLORS.ink, fontWeight: '700' },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: Radii.md, backgroundColor: COLORS.card },
  privacyText: { flex: 1, color: COLORS.ink, fontSize: 14, lineHeight: 20 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: Radii.md },
  successMessage: { backgroundColor: COLORS.mint },
  errorMessage: { backgroundColor: COLORS.peach },
  messageText: { flex: 1, color: COLORS.ink, fontSize: 14, lineHeight: 20 } });
