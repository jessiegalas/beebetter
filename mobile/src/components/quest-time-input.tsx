import { useState } from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as C } from '@/constants/theme';
import { formatLocalDateTime } from '@/lib/quest-time';

export type QuestTimeInputProps = { label: string; value: string; onChange: (value: string) => void; timeOnly?: boolean };
export function QuestTimeInput({ label, value, onChange, timeOnly = false }: QuestTimeInputProps) {
  const [picker, setPicker] = useState<{ mode: 'date' | 'time'; value: Date; minimum: Date } | null>(null);
  const open = (mode: 'date' | 'time') => {
    const date = new Date();
    if (timeOnly && value) { const [h, m] = value.split(':').map(Number); date.setHours(h, m, 0, 0); }
    else if (value) { const [day, time] = value.split(' '); const [y, m, d] = day.split('-').map(Number); const [h, min] = time.split(':').map(Number); date.setFullYear(y, m - 1, d); date.setHours(h, min, 0, 0); }
    const minimum = new Date(); minimum.setHours(0, 0, 0, 0);
    if (!timeOnly && date < minimum) date.setTime(minimum.getTime());
    setPicker({ mode, value: date, minimum });
  };
  return <View style={{ gap: 8 }}>
    <ThemedText style={{ fontSize: 13, color: C.ink }}>{label}</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {(!timeOnly ? ['date', 'time'] as const : ['time'] as const).map(mode => <TouchableOpacity key={mode} accessibilityRole="button" accessibilityLabel={label + ' ' + mode} onPress={() => open(mode)} style={{ padding: 12, minHeight: 44, backgroundColor: C.honeySoft, borderRadius: 12 }}><ThemedText style={{ color: C.ink, fontSize: 13 }}>{value ? (timeOnly ? value : value.split(' ')[mode === 'date' ? 0 : 1]) : 'Choose ' + mode}</ThemedText></TouchableOpacity>)}
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
      {Platform.OS === 'ios' && <TouchableOpacity accessibilityRole="button" onPress={() => { const local = formatLocalDateTime(picker.value.toISOString()); onChange(timeOnly ? local.split(' ')[1] : local); setPicker(null); }} style={{ minHeight: 44, justifyContent: 'center' }}><ThemedText>Done</ThemedText></TouchableOpacity>}
    </>}
  </View>;
}
