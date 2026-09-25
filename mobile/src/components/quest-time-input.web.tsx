import { useState } from 'react';
import { formatLocalDateTime } from '@/lib/quest-time';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as C } from '@/constants/theme';
import type { QuestTimeInputProps } from './quest-time-input';
export function QuestTimeInput({ label, value, onChange, timeOnly = false }: QuestTimeInputProps) {
  const [minimum, setMinimum] = useState(() => formatLocalDateTime(new Date().toISOString()).replace(' ', 'T'));
  return <View style={{ gap: 8 }}><ThemedText style={{ fontSize: 13, color: C.ink }}>{label}</ThemedText>
    <input min={timeOnly ? undefined : minimum} onFocus={() => setMinimum(formatLocalDateTime(new Date().toISOString()).replace(' ', 'T'))} aria-label={label} type={timeOnly ? 'time' : 'datetime-local'} value={value.replace(' ', 'T')} onChange={event => onChange(event.target.value.replace('T', ' '))} style={{ minHeight: 44, padding: '0 12px', border: '1px solid #EADBC6', borderRadius: 12, color: C.ink, background: C.card, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
  </View>;
}
