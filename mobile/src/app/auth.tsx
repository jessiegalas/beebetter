import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserData } from '@/hooks/use-user-data';
import { Button, Field } from '@/components/mobile-ui';
import { ThemedText } from '@/components/themed-text';
import { BeeMark } from '@/components/bee-visuals';
import { StudentOnboarding } from '@/components/student-onboarding';
import { Fonts, useBeePalette, useBeeStyles, type BeePalette, Radii } from '@/constants/theme';
import { emailError, passwordError, LIMITS } from '@/lib/student-validation';

export default function AuthScreen() {
  const COLORS = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { access, accessMessage, isSigningOut, isRefreshing, isAuthBusy, refresh, signIn, signUp,
    resendConfirmation, requestPasswordReset, updateRecoveryPassword, signOut } = useUserData();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [resendUntil, setResendUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const recovery = access === 'recovery_required';
  const busy = isSubmitting || isAuthBusy || isSigningOut;
  const emailValidation = emailError(email);
  const passwordValidation = recovery || mode === 'sign-up' ? passwordError(password) : !password ? 'Enter your password.' : undefined;
  const invalid = recovery ? !!passwordValidation : !!emailValidation || (mode !== 'forgot' && !!passwordValidation);

  useEffect(() => {
    if (!resendUntil) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendUntil]);

  const submit = async () => {
    if (submitting.current || busy || invalid) return;
    submitting.current = true; setIsSubmitting(true); setFeedback(null); setSuccess(false);
    const attemptedEmail = email.trim().toLowerCase();
    try {
      const result = recovery ? await updateRecoveryPassword(password)
        : mode === 'forgot' ? await requestPasswordReset(attemptedEmail)
        : mode === 'sign-up' ? await signUp(attemptedEmail, password)
        : await signIn(attemptedEmail, password);
      if (result.status === 'error') {
        setFeedback(result.message);
        if (result.code === 'email_not_confirmed') setConfirmationEmail(attemptedEmail);
      } else if (result.status === 'confirmation_required') {
        setConfirmationEmail(attemptedEmail); setMode('sign-in'); setPassword(''); setSuccess(true);
        setFeedback('If registration can proceed, check your email to confirm it, then sign in.');
      } else if (mode === 'forgot' && !recovery) {
        setSuccess(true); setFeedback('If an account matches this email, you will receive password reset instructions.');
      } else if (recovery) {
        setPassword(''); setSuccess(true); setFeedback('Password updated. Checking your student account...');
      }
    } finally { submitting.current = false; setIsSubmitting(false); }
  };

  const resend = async () => {
    if (!confirmationEmail || submitting.current || busy || Date.now() < resendUntil) return;
    submitting.current = true; setIsSubmitting(true); setFeedback(null); setSuccess(false);
    try {
      const result = await resendConfirmation(confirmationEmail);
      if (result.status === 'error') setFeedback(result.message);
      else { setSuccess(true); setFeedback('If confirmation is pending, check your inbox and spam folder for next steps.'); setResendUntil(Date.now() + 60_000); }
    } finally { submitting.current = false; setIsSubmitting(false); }
  };

  if (access === 'onboarding_required') return <StudentOnboarding />;
  if (access === 'checking' || access === 'verification_error') return <SafeAreaView style={[styles.container, { justifyContent: 'center', padding: 24 }]}>
    {access === 'checking' ? <ActivityIndicator color={COLORS.honeyDark} accessibilityLabel="Checking account" /> : <>
      <ThemedText accessibilityRole="alert" style={styles.feedback}>{accessMessage}</ThemedText>
      <TouchableOpacity accessibilityRole="button" disabled={isRefreshing || busy} onPress={() => void refresh()} style={styles.modeButton}><ThemedText style={styles.modeText}>{isRefreshing ? 'Checking account...' : 'Retry'}</ThemedText></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.modeButton}><ThemedText style={styles.modeText}>Sign out</ThemedText></TouchableOpacity>
    </>}
  </SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 24 }}><BeeMark size={48} /></View>
        <ThemedText style={styles.title}>{recovery ? 'Choose a new password' : mode === 'forgot' ? 'Reset your password' : mode === 'sign-up' ? 'Create your account' : 'Welcome to BeeBetter'}</ThemedText>
        <ThemedText style={styles.subtitle}>{recovery ? 'Update your password before continuing to your student account.' : mode === 'sign-up' ? 'Confirm your email first. You will enter your student information afterward.' : mode === 'forgot' ? 'Enter your account email to receive a reset link.' : 'Sign in to access your quests, streak, and skill tree.'}</ThemedText>
        {!recovery && <View style={styles.modeRow}>{(['sign-in', 'sign-up'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value, disabled: busy }} disabled={busy} style={[styles.modeButton, mode === value && styles.modeButtonActive]} onPress={() => { if (submitting.current || busy) return; setMode(value); setFeedback(null); setPassword(''); }}><ThemedText style={styles.modeText}>{value === 'sign-in' ? 'Sign in' : 'Create account'}</ThemedText></TouchableOpacity>)}</View>}
        {!recovery && <>
          <Field label="Email address *" style={styles.input} editable={!busy} value={email} onChangeText={value => setEmail(value.replace(/\s/g, ''))} onBlur={() => setEmailTouched(true)} maxLength={LIMITS.email} accessibilityLabel="Email address, required" autoComplete="email" placeholder="you@example.com" placeholderTextColor={COLORS.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          {emailTouched && emailValidation && <ThemedText accessibilityRole="alert" style={styles.feedback}>{emailValidation}</ThemedText>}
        </>}
        {(recovery || mode !== 'forgot') && <>
          <ThemedText style={styles.label}>{recovery ? 'New password *' : 'Password *'}</ThemedText>
          <View style={styles.passwordRow}>
            <TextInput style={styles.passwordInput} editable={!busy} value={password} onChangeText={setPassword} maxLength={recovery || mode === 'sign-up' ? LIMITS.password : undefined} autoComplete={recovery || mode === 'sign-up' ? 'new-password' : 'current-password'} textContentType={recovery || mode === 'sign-up' ? 'newPassword' : 'password'} autoCorrect={false} accessibilityLabel={recovery ? 'New password, required' : 'Password, required'} placeholder={recovery || mode === 'sign-up' ? 'At least 15 characters' : 'Your password'} placeholderTextColor={COLORS.muted} secureTextEntry={!showPassword} autoCapitalize="none" />
            <TouchableOpacity disabled={busy} style={[styles.passwordToggle, { minWidth: 48, minHeight: 48, justifyContent: 'center' }]} onPress={() => setShowPassword(value => !value)} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.muted} /></TouchableOpacity>
          </View>
          {!!password && passwordValidation && <ThemedText accessibilityRole="alert" style={styles.feedback}>{passwordValidation}</ThemedText>}
        </>}
        {accessMessage && <ThemedText accessibilityRole="alert" style={styles.feedback}>{accessMessage}</ThemedText>}
        {feedback && <ThemedText accessibilityLiveRegion="polite" style={[styles.feedback, success && styles.successFeedback]}>{feedback}</ThemedText>}
        {!recovery && mode === 'sign-in' && confirmationEmail && <View style={styles.confirmationCard}><View style={styles.confirmationCopy}><ThemedText style={styles.confirmationTitle}>Confirm {confirmationEmail}</ThemedText><ThemedText style={styles.confirmationText}>Check spam or request another email.</ThemedText></View><TouchableOpacity style={styles.modeButton} accessibilityRole="button" disabled={busy || remaining > 0} onPress={() => void resend()}><ThemedText style={styles.resendText}>{remaining > 0 ? remaining + 's' : 'Resend'}</ThemedText></TouchableOpacity></View>}
        <Button label={recovery ? 'Update password' : mode === 'forgot' ? 'Send reset instructions' : mode === 'sign-up' ? 'Create account' : 'Sign in'} loading={busy} disabled={invalid} onPress={() => void submit()} />
        {!recovery && <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.modeButton} onPress={() => { if (submitting.current || busy) return; setMode(mode === 'forgot' ? 'sign-in' : 'forgot'); setFeedback(null); setPassword(''); }}><ThemedText style={styles.modeText}>{mode === 'forgot' ? 'Back to sign in' : 'Forgot your password?'}</ThemedText></TouchableOpacity>}
        {(recovery || access === 'blocked') && <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.modeButton} onPress={() => void signOut()}><ThemedText style={styles.modeText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText></TouchableOpacity>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const makeStyles = (COLORS: BeePalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 40 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: '700' , lineHeight: 34},
  subtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 24 },
  modeRow: { flexDirection: 'row', backgroundColor: COLORS.surfaceMuted, borderRadius: Radii.md, padding: 4, marginBottom: 20 },
  modeButton: { flex: 1, alignItems: 'center', borderRadius: Radii.sm, minHeight: 48, paddingVertical: 11 },
  modeButtonActive: { backgroundColor: COLORS.card },
  modeText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' , lineHeight: 20},
  label: { color: COLORS.ink, fontSize: 14, fontWeight: '700', marginBottom: 7 , lineHeight: 20},
  input: { fontFamily: Fonts.sans,
    backgroundColor: COLORS.card,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: COLORS.ink,
    marginBottom: 16, lineHeight: 24},
  feedback: { color: COLORS.danger, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  successFeedback: { color: COLORS.success },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: Radii.md, marginBottom: 16, borderWidth: 1, borderColor: COLORS.surfaceMuted },
  passwordInput: { fontFamily: Fonts.sans, flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: COLORS.ink , lineHeight: 24},
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 12 },
  confirmationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.honeySoft, borderRadius: 24, padding: 20, marginBottom: 14 },
  confirmationCopy: { flex: 1 },
  confirmationTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '700' , lineHeight: 20},
  confirmationText: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  resendText: { color: COLORS.honeyDark, fontSize: 14, fontWeight: '700' , lineHeight: 20} });
