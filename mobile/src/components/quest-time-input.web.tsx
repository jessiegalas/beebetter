import { useState } from 'react';
import { formatLocalDateTime } from '@/lib/quest-time';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Borders, Controls, Radii, Spacing, Typography, useAppColorScheme, useBeePalette } from '@/constants/theme';
import type { QuestTimeInputProps } from './quest-time-input';
export function QuestTimeInput({ label, value, onChange, timeOnly = false }: QuestTimeInputProps) {
  const C = useBeePalette();
  const scheme = useAppColorScheme();
  const [minimum, setMinimum] = useState(() => formatLocalDateTime(new Date().toISOString()).replace(' ', 'T'));
  return <View style={{ gap: Spacing.sm }}><ThemedText type="label">{label}</ThemedText>
    <input min={timeOnly ? undefined : minimum} onFocus={() => setMinimum(formatLocalDateTime(new Date().toISOString()).replace(' ', 'T'))} aria-label={label} type={timeOnly ? 'time' : 'datetime-local'} value={value.replace(' ', 'T')} onChange={event => onChange(event.target.value.replace('T', ' '))}
      style={{ minHeight: Controls.minHeight, paddingInline: Spacing.lg, border: Borders.focus + 'px solid ' + C.input, borderRadius: Radii.md,
        color: C.foreground, background: C.card, fontFamily: Typography.body.fontFamily, fontSize: Typography.body.fontSize,
        lineHeight: Typography.body.lineHeight + 'px', colorScheme: scheme, width: '100%', boxSizing: 'border-box' }} />
  </View>;
}
