import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { StudentInformationFields } from '@/components/student-information-fields';
import { useUserData } from '@/hooks/use-user-data';
import { useRegistrationForm } from '@/hooks/use-registration-form';
import { useBeeStyles, type BeePalette } from '@/constants/theme';

export function StudentOnboarding() {
  const styles = useBeeStyles(makeStyles);
  const { registrationOwner, registrationDraft, registrationError, isAuthBusy, isSigningOut, completeRegistration, signOut } = useUserData();
  const form = useRegistrationForm({ owner: registrationOwner ?? 'registration', draft: registrationDraft });
  const [notice, setNotice] = useState<{ owner: string | null; message: string | null } | null>(null);
  const feedback = notice && notice.owner === registrationOwner ? notice.message : registrationError;
  const setFeedback = (message: string | null) => setNotice({ owner: registrationOwner, message });
  const pending = useRef(false);
  const busy = isAuthBusy || isSigningOut;
  const submit = async () => {
    if (pending.current || busy) return;
    const draft = form.validate();
    if (!draft) return;
    pending.current = true; setFeedback(null);
    try {
      const result = await completeRegistration({ ...registrationDraft, ...draft });
      if (result.status === 'error') setFeedback(result.message);
    } finally { pending.current = false; }
  };
  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ThemedText style={styles.title}>Finish setting up your account</ThemedText>
        <StudentInformationFields value={form.student} onChange={next => { form.change(next); setFeedback(null); }}
          errors={form.errors} showErrors={form.submitted} disabled={busy} />
        {feedback && <ThemedText accessibilityRole="alert" style={styles.error}>{feedback}</ThemedText>}
        <Button label="Complete registration" loading={busy} onPress={() => void submit()} />
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.secondary}><ThemedText style={styles.copy}>{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, gap: 20 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: '700' , lineHeight: 34},
  copy: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 20 },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
