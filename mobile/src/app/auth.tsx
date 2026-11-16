import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserData } from '@/hooks/use-user-data';
import { Field, IconButton } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { ThemedText } from '@/components/themed-text';
import { BeeMark } from '@/components/bee-visuals';
import { StudentInformationFields } from '@/components/student-information-fields';
import { useRegistrationForm } from '@/hooks/use-registration-form';
import { StudentOnboarding } from '@/components/student-onboarding';
import { Fonts, useBeePalette, useBeeStyles, type BeePalette, Borders, Controls, Radii, Typography } from '@/constants/theme';
import { studentLoginIdError, passwordError, LIMITS } from '@/lib/student-validation';

export default function AuthScreen() {
  const colors = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { access, accessMessage, isSigningOut, isRefreshing, isAuthBusy, refresh, signIn, signUp, updateRecoveryPassword, signOut } = useUserData();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [idTouched, setIdTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const submitting = useRef(false);
  const recovery = access === 'recovery_required';
  const signup = mode === 'sign-up' && !recovery;
  const newPassword = signup || recovery;
  const form = useRegistrationForm({ owner: recovery ? 'recovery' : 'credentials' });
  const busy = isAuthBusy || isSigningOut;
  const idError = studentLoginIdError(form.student.student_number);
  const invalidPassword = newPassword ? passwordError(password) : !password ? 'Enter your password.' : undefined;

  const submit = async () => {
    if (submitting.current || busy) return;
    setIdTouched(true);
    setPasswordTouched(true);
    const draft = signup ? form.validate() : null;
    if (invalidPassword || (signup ? !draft : !recovery && idError)) return;
    submitting.current = true;
    setFeedback(null);
    try {
      const result = recovery ? await updateRecoveryPassword(password)
        : draft ? await signUp(draft, password)
        : await signIn(form.student.student_number, password);
      if (result.status === 'error') setFeedback(result.message);
      else setPassword('');
    } finally {
      submitting.current = false;
    }
  };

  const changeMode = (next: 'sign-in' | 'sign-up') => {
    if (submitting.current || busy || next === mode) return;
    setMode(next);
    setFeedback(null);
    setPassword('');
    setPasswordTouched(false);
    setShowPassword(false);
  };

  if (access === 'onboarding_required') return <StudentOnboarding />;
  if (access === 'checking' || access === 'verification_error') return <SafeAreaView style={[styles.container, styles.center]}>
    {access === 'checking' ? <ActivityIndicator color={colors.honeyDark} accessibilityLabel="Checking account" /> : <>
      <ThemedText accessibilityRole="alert" style={styles.feedback}>{accessMessage}</ThemedText>
      <TouchableOpacity accessibilityRole="button" disabled={isRefreshing || busy} onPress={() => void refresh()} style={styles.modeButton}><ThemedText style={styles.modeText}>{isRefreshing ? 'Checking account...' : 'Retry'}</ThemedText></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.modeButton}><ThemedText style={styles.modeText}>Sign out</ThemedText></TouchableOpacity>
    </>}
  </SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}><BeeMark size={48} /></View>
        <ThemedText type="title" style={styles.title}>{recovery ? 'Choose a new password' : signup ? 'Create your account' : 'Welcome to BeeBetter'}</ThemedText>
        <ThemedText style={styles.subtitle}>{recovery ? 'Update your password to continue.' : signup ? 'Use your student ID and choose a password.' : 'Sign in with your student ID to continue.'}</ThemedText>
        {!recovery && <View style={styles.modeRow}>
          {(['sign-in', 'sign-up'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value, disabled: busy }} disabled={busy} style={[styles.modeButton, mode === value && styles.modeButtonActive]} onPress={() => changeMode(value)}>
            <ThemedText style={styles.modeText}>{value === 'sign-in' ? 'Sign in' : 'Create account'}</ThemedText>
          </TouchableOpacity>)}
        </View>}
        {!recovery && <View style={styles.studentFields}>
          {signup ? <StudentInformationFields value={form.student} onChange={next => { form.change(next); setFeedback(null); }}
            errors={form.errors} showErrors={form.submitted} disabled={busy} /> :
            <Field
              label="Student ID"
              accessibilityLabel="Student ID, required"
              value={form.student.student_number}
              error={idTouched ? idError : undefined}
              editable={!busy}
              onChangeText={student_number => { form.change({ ...form.student, student_number }); setFeedback(null); }}
              onBlur={() => setIdTouched(true)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={LIMITS.login_student_id}
            />}
        </View>}
        <ThemedText style={styles.label}>{recovery ? 'New password' : 'Password'}</ThemedText>
        <View style={[styles.passwordRow, {
          backgroundColor: busy ? colors.disabled : colors.card,
          borderColor: (passwordTouched || !!password) && invalidPassword ? colors.danger : passwordFocused ? colors.focus : colors.input,
        }]}>
          <TextInput style={[styles.passwordInput, busy && { color: colors.disabledForeground }]} selectionColor={colors.primary}
            onFocus={() => setPasswordFocused(true)} editable={!busy} value={password} onChangeText={value => { setPassword(value); setFeedback(null); }}
            onBlur={() => { setPasswordFocused(false); setPasswordTouched(true); }} maxLength={newPassword ? LIMITS.password : undefined}
            autoComplete={newPassword ? 'new-password' : 'current-password'} textContentType={newPassword ? 'newPassword' : 'password'}
            autoCorrect={false} accessibilityLabel={recovery ? 'New password, required' : 'Password, required'}
            placeholder={newPassword ? 'At least 15 characters' : 'Your password'} placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword} autoCapitalize="none" />
          <IconButton disabled={busy} onPress={() => setShowPassword(value => !value)} label={showPassword ? 'Hide password' : 'Show password'} icon={showPassword ? 'eye-off-outline' : 'eye-outline'} />
        </View>
        {(passwordTouched || !!password) && invalidPassword && <ThemedText accessibilityRole="alert" style={styles.feedback}>{invalidPassword}</ThemedText>}
        {accessMessage && <ThemedText accessibilityRole="alert" style={styles.feedback}>{accessMessage}</ThemedText>}
        {feedback && <ThemedText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</ThemedText>}
        <PixelButton label={recovery ? 'Update password' : signup ? 'Create account' : 'Sign in'} loading={busy} onPress={() => void submit()} />
        {!recovery && !signup && <ThemedText style={styles.help}>Forgot your password? Contact your school administrator.</ThemedText>}
        {(recovery || access === 'blocked') && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.modeButton}><ThemedText style={styles.modeText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText></TouchableOpacity>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const makeStyles = (colors: BeePalette) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 40 },
  mark: { marginBottom: 24 },
  title: { ...Typography.page, color: colors.foreground },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 24 },
  studentFields: { gap: 12, marginBottom: 16 },
  modeRow: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: Radii.md, padding: 4, marginBottom: 20 },
  modeButton: { flex: 1, alignItems: 'center', borderRadius: Radii.sm, minHeight: 48, paddingVertical: 11 },
  modeButtonActive: { backgroundColor: colors.card },
  modeText: { color: colors.muted, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 7, lineHeight: 20 },
  feedback: { color: colors.danger, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  help: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 16, textAlign: 'center' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderRadius: Radii.md, marginBottom: 16, borderWidth: Borders.focus, borderColor: colors.input },
  passwordInput: { ...Typography.body, fontFamily: Fonts.sans, flex: 1, minWidth: 0, minHeight: Controls.minHeight, paddingHorizontal: 14, paddingVertical: 13, color: colors.foreground },
});
