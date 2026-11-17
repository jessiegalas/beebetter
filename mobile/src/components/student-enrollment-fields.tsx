import { useState } from 'react';
import { View } from 'react-native';
import { Button, ChoiceChip, Sheet, StatusMessage } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { enrollmentFields, type EnrollmentField, type useRegistrationForm } from '@/hooks/use-registration-form';
import type { useEnrollmentOptions } from '@/hooks/use-enrollment-options';

const labels: Record<EnrollmentField, string> = {
  course: 'Course / program', year_level: 'Year level', campus: 'Campus', section: 'Section',
};

export function StudentEnrollmentFields({ form, catalogue, busy }: {
  form: ReturnType<typeof useRegistrationForm>;
  catalogue: ReturnType<typeof useEnrollmentOptions>;
  busy: boolean;
}) {
  const [open, setOpen] = useState<EnrollmentField | null>(null);
  const semester = catalogue.options[0];
  if (catalogue.loading) return <ThemedText accessibilityLiveRegion="polite">Loading enrollment choices…</ThemedText>;
  if (!catalogue.ready) return <View style={{ gap: 12 }}>
    <StatusMessage error={!!catalogue.error} message={catalogue.error ?? 'No sections are open for enrollment. Check with your school administrator.'} />
    <Button label="Refresh enrollment choices" intent="secondary" onPress={catalogue.retry} />
  </View>;

  return <View style={{ gap: 12 }}>
    <ThemedText type="label">{semester.academic_year} · {semester.term}</ThemedText>
    {enrollmentFields.map(field => {
      const value = form.labels[field];
      const choices = form.choicesFor(field);
      return <View key={field} style={{ gap: 4 }}>
        <ThemedText type="label">{labels[field]}</ThemedText>
        <Button label={value || 'Select'} accessibilityLabel={labels[field] + (value ? ': ' + value : ', select')}
          intent="secondary" icon="chevron-down" disabled={busy || !choices.length} onPress={() => setOpen(field)} />
      </View>;
    })}
    {form.selectionChanged && <ThemedText accessibilityRole="alert">Enrollment choices changed. Select your section again.</ThemedText>}
    {open && <Sheet title={labels[open]} visible onClose={() => setOpen(null)}>
      {form.choicesFor(open).map(value => <ChoiceChip key={value} label={value} selected={form.labels[open] === value}
        onPress={() => { form.change(open, value); setOpen(null); }} />)}
    </Sheet>}
  </View>;
}
