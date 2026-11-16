import { Field } from '@/components/mobile-ui';
import { cleanName, cleanStudentNumber, LIMITS, type StudentIdentity } from '@/lib/student-validation';
import { useState } from 'react';

export function StudentInformationFields({ value, onChange, errors, disabled, showErrors }: {
  value: StudentIdentity;
  onChange: (value: StudentIdentity) => void;
  errors: Partial<Record<keyof StudentIdentity, string>>;
  disabled?: boolean;
  showErrors?: boolean;
}) {
  const [touched, setTouched] = useState<Partial<Record<keyof StudentIdentity, boolean>>>({});
  const touch = (field: keyof StudentIdentity) => setTouched(previous => ({ ...previous, [field]: true }));
  return <>
    <Field
      label="Student ID"
      accessibilityLabel="Student ID, required"
      hint="Enter your 9-digit student ID"
      value={value.student_number}
      error={showErrors || touched.student_number ? errors.student_number : undefined}
      editable={!disabled}
      onChangeText={text => onChange({ ...value, student_number: cleanStudentNumber(text) })}
      onBlur={() => touch('student_number')}
      keyboardType="number-pad"
    />
    <Field
      label="Name or nickname (optional)"
      value={value.name}
      error={showErrors || touched.name ? errors.name : undefined}
      editable={!disabled}
      onChangeText={text => onChange({ ...value, name: cleanName(text) })}
      onBlur={() => touch('name')}
      autoCapitalize="words"
      autoComplete="name"
      autoCorrect={false}
      maxLength={LIMITS.name}
    />
  </>;
}
