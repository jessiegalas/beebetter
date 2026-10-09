import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { StudentInformationFields } from '@/components/student-information-fields';
import { useEnrollmentOptions } from '@/hooks/use-enrollment-options';
import { useUserData } from '@/hooks/use-user-data';
import { useRegistrationForm } from '@/hooks/use-registration-form';
import { useBeeStyles, type BeePalette } from '@/constants/theme';

export function StudentOnboarding() {
  const styles = useBeeStyles(makeStyles);
  const { registrationEmail, registrationDraft, registrationError, isAuthBusy, isSigningOut, completeRegistration, signOut } = useUserData();
  const enrollment = useEnrollmentOptions({ kind: 'registration', context: registrationEmail ?? 'registration' });
  const form = useRegistrationForm({ owner: registrationEmail ?? 'registration', draft: registrationDraft, enrollment });
  const [notice, setNotice] = useState<{ owner: string | null; message: string | null } | null>(null);
  const feedback = notice && notice.owner === registrationEmail ? notice.message : registrationError;
  const setFeedback = (message: string | null) => setNotice({ owner: registrationEmail, message });
  const pending = useRef(false);
  const busy = isAuthBusy || isSigningOut;
  const semester = enrollment.options[0];
  const submit = async () => {
    if (pending.current || busy) return;
    const draft = form.validate();
    if (!draft) { setFeedback('Check your student information and enrollment choices before continuing.'); return; }
    pending.current = true; setFeedback(null);
    try {
      const result = await completeRegistration(form.input(draft));
      if (result.status === 'error') {
        setFeedback(result.message);
        if (result.code === 'enrollment_changed') { form.invalidateSelection(); enrollment.retry(); }
      }
    } finally { pending.current = false; }
  };
  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ThemedText style={styles.title}>Complete your student information</ThemedText>
        <ThemedText style={styles.copy}>Email confirmed: {registrationEmail}. {registrationDraft ? 'Check your saved student information below.' : 'Enter your official student information to continue.'}</ThemedText>
        {semester && <ThemedText style={styles.semester}>Enrollment period: {semester.academic_year} / {semester.term}</ThemedText>}
        <StudentInformationFields value={form.student} onChange={(next, field) => { form.change(next, field); setFeedback(null); }} options={enrollment.options} errors={form.errors}
          touched={form.touched} onTouch={form.touch} showErrors={form.submitted} onRegisterInput={form.registerInput} loading={enrollment.loading} refreshing={enrollment.isRefreshing} loadError={enrollment.error} onRetry={enrollment.retry} catalogueOnly disabled={busy} catalogueDisabled={!form.ready} />
        {form.selectionChanged && <ThemedText accessibilityRole="alert" style={styles.error}>The enrollment choices changed. Select your section again to confirm the displayed period.</ThemedText>}
        {feedback && <ThemedText accessibilityRole="alert" style={styles.error}>{feedback}</ThemedText>}
        <Button label="Complete registration" loading={busy} disabled={!form.ready || form.selectionChanged} onPress={() => void submit()} />
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.secondary}><ThemedText style={styles.copy}>{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, gap: 20 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: '700' , lineHeight: 34},
  copy: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  semester: { color: COLORS.ink, fontSize: 14, fontWeight: '700' , lineHeight: 20},
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 20 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' } });