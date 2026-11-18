import { useState } from 'react';
import { Platform, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, useBeePalette } from '@/constants/theme';
import { formatLocalDateTime } from '@/lib/quest-time';

export type QuestTimeInputProps = { label: string; value: string; onChange: (value: string) => void; timeOnly?: boolean };
export function QuestTimeInput({ label, value, onChange, timeOnly = false }: QuestTimeInputProps) {
  const C = useBeePalette();
  const [picker, setPicker] = useState<{ mode: 'date' | 'time'; value: Date; minimum: Date } | null>(null);
  const open = (mode: 'date' | 'time') => {
    const date = new Date();
    if (timeOnly && value) { const [h, m] = value.split(':').map(Number); date.setHours(h, m, 0, 0); }
    else if (value) { const [day, time] = value.split(' '); const [y, m, d] = day.split('-').map(Number); const [h, min] = time.split(':').map(Number); date.setFullYear(y, m - 1, d); date.setHours(h, min, 0, 0); }
    const minimum = new Date(); minimum.setHours(0, 0, 0, 0);
    if (!timeOnly && date < minimum) date.setTime(minimum.getTime());
    setPicker({ mode, value: date, minimum });
  };
  return <View style={{ gap: Spacing.sm }}>
    <ThemedText type="label">{label}</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
      {(!timeOnly ? ['date', 'time'] as const : ['time'] as const).map(mode => <Button key={mode}
        intent="secondary" accessibilityLabel={label + ' ' + mode} onPress={() => open(mode)}
        label={value ? (timeOnly ? value : value.split(' ')[mode === 'date' ? 0 : 1]) : 'Choose ' + mode} />)}
    </View>
    {picker && <>
      <DateTimePicker minimumDate={!timeOnly && picker.mode === 'date' ? picker.minimum : undefined} value={picker.value} mode={picker.mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} accentColor={C.honeyDark} onDismiss={() => setPicker(null)} onValueChange={(_, selected) => {
        const date = new Date(picker.value);
        if (picker.mode === 'date') date.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        else date.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        const local = formatLocalDateTime(date.toISOString());
        onChange(timeOnly ? local.split(' ')[1] : local);
        setPicker(Platform.OS === 'ios' ? { ...picker, value: date } : null);
      }} />
      {Platform.OS === 'ios' && <Button label="Done" onPress={() => { const local = formatLocalDateTime(picker.value.toISOString()); onChange(timeOnly ? local.split(' ')[1] : local); setPicker(null); }} />}
    </>}
  </View>;
}
