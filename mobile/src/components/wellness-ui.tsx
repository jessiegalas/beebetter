import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';

export function WellnessHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={23} color={COLORS.ink} />
      </TouchableOpacity>
      <View style={styles.headerCopy}>
        <ThemedText style={styles.headerTitle}>{title}</ThemedText>
        <ThemedText style={styles.headerSubtitle}>{subtitle}</ThemedText>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export type RatingOption = { value: number; label: string };

export function RatingScale({
  title,
  hint,
  value,
  options,
  onChange,
}: {
  title: string;
  hint: string;
  value: number | null;
  options: RatingOption[];
  onChange: (value: number) => void;
}) {
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
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${title}: ${option.value}, ${option.label}`}>
              <ThemedText style={[styles.ratingNumber, selected && styles.ratingNumberSelected]}>{option.value}</ThemedText>
              <ThemedText style={[styles.ratingLabel, selected && styles.ratingLabelSelected]} numberOfLines={2}>{option.label}</ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function PrivacyNote({ children }: { children: string }) {
  return (
    <View style={styles.privacyNote}>
      <Ionicons name="lock-closed-outline" size={18} color={COLORS.honeyDeep} />
      <ThemedText style={styles.privacyText}>{children}</ThemedText>
    </View>
  );
}

export function InlineMessage({ message, tone }: { message: string; tone: 'error' | 'success' }) {
  return (
    <View style={[styles.message, tone === 'success' ? styles.successMessage : styles.errorMessage]} accessibilityLiveRegion="polite">
      <Ionicons name={tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={tone === 'success' ? COLORS.success : COLORS.danger} />
      <ThemedText style={styles.messageText}>{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: COLORS.ink, fontSize: 20, lineHeight: 27, fontWeight: '900' },
  headerSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 1 },
  backButton: { width: 42, height: 42, borderRadius: Radii.md, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', ...BeeBetterShadow },
  headerSpacer: { width: 42 },
  scaleBlock: { gap: 12 },
  scaleTitle: { color: COLORS.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  scaleHint: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 2 },
  ratingRow: { flexDirection: 'row', gap: 6 },
  ratingOption: { flex: 1, minHeight: 70, paddingVertical: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.surfaceMuted, borderRadius: Radii.md, backgroundColor: COLORS.background },
  ratingOptionSelected: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honeyDark },
  ratingNumber: { color: COLORS.ink, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  ratingNumberSelected: { color: COLORS.honeyDeep },
  ratingLabel: { color: COLORS.muted, fontSize: 8, lineHeight: 11, textAlign: 'center', marginTop: 3 },
  ratingLabelSelected: { color: COLORS.ink, fontWeight: '700' },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: Radii.md, backgroundColor: COLORS.honeySoft },
  privacyText: { flex: 1, color: COLORS.ink, fontSize: 11, lineHeight: 17 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: Radii.md },
  successMessage: { backgroundColor: COLORS.mint },
  errorMessage: { backgroundColor: '#FCE8E6' },
  messageText: { flex: 1, color: COLORS.ink, fontSize: 12, lineHeight: 18 },
});
