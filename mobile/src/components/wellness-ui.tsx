import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { IconButton, ScreenHeader } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { useBeePalette, useBeeStyles, type BeePalette, Radii, ContentColumn, Spacing, Typography } from '@/constants/theme';

export function WellnessHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <ScreenHeader title={title} subtitle={subtitle} style={headerStyle}
    leading={<IconButton icon="chevron-back" label="Go back" onPress={() => router.back()} />} />;
}

const headerStyle = { ...ContentColumn,
  paddingTop: Spacing.sm, paddingBottom: Spacing.xl } as const;

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
  scaleBlock: { gap: Spacing.md },
  scaleTitle: { ...Typography.section, color: COLORS.ink },
  scaleHint: { ...Typography.metadata, color: COLORS.muted, marginTop: Spacing.half },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  ratingOption: { flexGrow: 1, flexBasis: 80, minWidth: 80, minHeight: 70, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.surfaceMuted, borderRadius: Radii.md, backgroundColor: COLORS.background },
  ratingOptionSelected: { backgroundColor: COLORS.honeySoft, borderColor: COLORS.honeyDark },
  ratingNumber: { ...Typography.item, color: COLORS.ink },
  ratingNumberSelected: { color: COLORS.honeyDeep },
  ratingLabel: { ...Typography.metadata, color: COLORS.muted, textAlign: 'center', marginTop: Spacing.xs },
  ratingLabelSelected: { color: COLORS.ink },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radii.md, backgroundColor: COLORS.card },
  privacyText: { ...Typography.metadata, flex: 1, color: COLORS.ink },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radii.md },
  successMessage: { backgroundColor: COLORS.mint },
  errorMessage: { backgroundColor: COLORS.peach },
  messageText: { ...Typography.metadata, flex: 1, color: COLORS.ink } });
