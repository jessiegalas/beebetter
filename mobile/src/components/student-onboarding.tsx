import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { StudentInformationFields } from '@/components/student-information-fields';
import { useEnrollmentOptions } from '@/hooks/use-enrollment-options';
import { useUserData } from '@/hooks/use-user-data';
import { studentPayload, validateStudent, type StudentFields, type RegistrationEnrollmentOption } from '@/lib/student-validation';
import { emptyStudentFields } from '@/lib/auth-flow';
import { useBeeStyles, type BeePalette } from '@/constants/theme';

export function StudentOnboarding() {
  const styles = useBeeStyles(makeStyles);
  const { registrationEmail, registrationDraft, registrationError, isAuthBusy, isSigningOut, completeRegistration, signOut } = useUserData();
  const enrollment = useEnrollmentOptions<RegistrationEnrollmentOption>('registration', true);
  const [student, setStudent] = useState<StudentFields>(() => registrationDraft?.student ?? emptyStudentFields());
  const [selection, setSelection] = useState<{ option: string; semester: string } | null>(() => registrationDraft ? { option: registrationDraft.enrollmentOptionId, semester: registrationDraft.semesterId } : null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => { setFeedback(registrationError ?? null); }, [registrationError]);
  const selected = enrollment.options.find(option => option.id === selection?.option && option.semester_id === selection?.semester);
  const errors = validateStudent(student, enrollment.options);
  const busy = isAuthBusy || isSigningOut;
  const invalid = enrollment.loading || !!enrollment.error || !selected || Object.keys(errors).length > 0;
  const semester = enrollment.options[0];
  const change = (next: StudentFields, field?: keyof StudentFields) => {
    setStudent(next); setFeedback(null);
    if (field && ['course', 'year_level', 'campus', 'section'].includes(field)) {
      const option = enrollment.options.find(option => option.course === next.course && option.year_level === next.year_level && option.campus === next.campus && option.section === next.section);
      setSelection(option ? { option: option.id, semester: option.semester_id } : null);
    }
  };
  const submit = async () => {
    if (pending.current || busy || invalid || !selected) return;
    pending.current = true; setFeedback(null);
    try {
      const normalized = studentPayload(student);
      const result = await completeRegistration({ name: normalized.name, studentNumber: normalized.student_number,
        goal: normalized.goal, semesterId: selected.semester_id, enrollmentOptionId: selected.id });
      if (result.status === 'error') {
        setFeedback(result.message);
        if (result.code === 'enrollment_changed') { setSelection(null); enrollment.retry(); }
      }
    } finally { pending.current = false; }
  };
  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ThemedText style={styles.title}>Complete your student information</ThemedText>
        <ThemedText style={styles.copy}>Email confirmed: {registrationEmail}. {registrationDraft ? 'Check your saved student information below.' : 'Enter your official student information to continue.'}</ThemedText>
        {semester && <ThemedText style={styles.semester}>Enrollment period: {semester.academic_year} / {semester.term}</ThemedText>}
        <StudentInformationFields value={student} onChange={change} options={enrollment.options} errors={errors} loading={enrollment.loading} loadError={enrollment.error} onRetry={enrollment.retry} catalogueOnly disabled={busy || enrollment.loading} />
        {selection && !selected && !enrollment.loading && <ThemedText accessibilityRole="alert" style={styles.error}>The enrollment choices changed. Select your section again to confirm the displayed period.</ThemedText>}
        {feedback && <ThemedText accessibilityRole="alert" style={styles.error}>{feedback}</ThemedText>}
        <Button label="Complete registration" loading={busy} disabled={invalid} onPress={() => void submit()} />
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.secondary}><ThemedText style={styles.copy}>{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, gap: 32 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: '700' , lineHeight: 34},
  copy: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  semester: { color: COLORS.ink, fontSize: 14, fontWeight: '700' , lineHeight: 20},
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 20 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' } });