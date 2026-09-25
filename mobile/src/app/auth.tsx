import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as COLORS, BeeBetterShadow, Radii } from '@/constants/theme';
import { StudentInformationFields } from '@/components/student-information-fields';
import { useEnrollmentOptions } from '@/hooks/use-enrollment-options';
import { validateStudent, studentPayload, emailError, passwordError, LIMITS, type StudentFields } from '@/lib/student-validation';
import { supabase } from '@/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [student, setStudent] = useState<StudentFields>({ name: '', student_number: '', course: '', year_level: '', section: '', campus: '', goal: '' });
  const enrollment = useEnrollmentOptions();
  const studentErrors = validateStudent(student, enrollment.options);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'error' | 'success'>('error');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const emailValidation = emailError(email);
  const passwordValidation = mode === 'sign-up' ? passwordError(password) : !password ? 'Enter your password.' : undefined;
  const invalid = !!emailValidation || !!passwordValidation || (mode === 'sign-up' && (enrollment.loading || !!enrollment.error || Object.keys(studentErrors).length > 0));

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const setMessage = (message: string, tone: 'error' | 'success' = 'error') => {
    setFeedback(message);
    setFeedbackTone(tone);
  };

  const getAuthErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const normalized = message.toLowerCase();

    if (normalized.includes('rate limit') || normalized.includes('too many')) {
      return 'Too many email attempts. Wait a few minutes before trying again, then use Resend confirmation instead of creating another account.';
    }
    if (normalized.includes('already registered') || normalized.includes('already been registered')) {
      return 'That email already has an account. Switch to Sign in or use the confirmation email again.';
    }
    if (normalized.includes('database error saving new user')) return 'Could not save your student information. Check your student number and school selections; if they are correct, contact your administrator.';
    if (normalized.includes('email not confirmed')) {
      return 'Your email is not confirmed yet. Check your inbox or resend the confirmation email below.';
    }
    if (normalized.includes('invalid login credentials')) {
      return 'Email or password is incorrect. Check your details and try again.';
    }
    return message || 'Something went wrong. Please try again.';
  };

  const submit = async () => {
    if (isSubmitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (invalid) { setMessage('Check the highlighted fields before continuing.'); return; }
    const normalizedStudent = studentPayload(student);

    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              ...normalizedStudent,
              display_name: normalizedStudent.name,
            },
            emailRedirectTo: 'beebetter://auth',
          },
        });
        if (error) throw error;

        if (data.session) {
          router.replace('/(tabs)');
          return;
        }

        setMessage('Account created. Check your email to confirm it, then sign in.', 'success');
        setConfirmationPending(true);
        setMode('sign-in');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        if (data.session) {
          router.replace('/(tabs)');
        }
      }
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendConfirmation = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: 'beebetter://auth' },
      });
      if (error) throw error;
      setMessage('Confirmation email sent. Check your inbox and spam folder.', 'success');
      setResendCooldown(60);
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Logo Mark */}
          <View style={styles.mark}>
            <Ionicons name="sparkles" size={28} color={COLORS.ink} />
          </View>

          <ThemedText style={styles.title}>
            {mode === 'sign-in' ? 'Welcome to BeeBetter' : 'Start your journey'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {mode === 'sign-in'
              ? 'Sign in to access your quests, streak, and skill tree.'
              : 'Create an account to level up your habits and daily goals.'}
          </ThemedText>

          {/* Mode Switcher */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}
              onPress={() => {
                setMode('sign-in');
                setFeedback(null);
                setConfirmationPending(false);
              }}>
              <ThemedText style={[styles.modeText, mode === 'sign-in' && styles.modeTextActive]}>
                Sign in
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'sign-up' && styles.modeButtonActive]}
              onPress={() => {
                setMode('sign-up');
                setFeedback(null);
                setConfirmationPending(false);
              }}>
              <ThemedText style={[styles.modeText, mode === 'sign-up' && styles.modeTextActive]}>
                Create account
              </ThemedText>
            </TouchableOpacity>
          </View>

          {mode === 'sign-up' && <StudentInformationFields value={student} onChange={setStudent} options={enrollment.options} errors={studentErrors} loading={enrollment.loading} loadError={enrollment.error} onRetry={enrollment.retry} />}

          {/* Email Field */}
          <ThemedText style={styles.label}>Email address *</ThemedText>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={value => setEmail(value.replace(/\s/g, ''))}
            onBlur={() => setEmailTouched(true)}
            maxLength={LIMITS.email}
            accessibilityLabel="Email address, required"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {(emailTouched || !!email) && emailValidation && <ThemedText style={styles.feedback}>{emailValidation}</ThemedText>}

          {/* Password Field */}
          <ThemedText style={styles.label}>Password *</ThemedText>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              onBlur={() => setPasswordTouched(true)}
              maxLength={mode === 'sign-up' ? LIMITS.password : undefined}
              autoCorrect={false}
              accessibilityLabel="Password, required"
              placeholder="At least 6 characters"
              placeholderTextColor={COLORS.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((value) => !value)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          {(passwordTouched || !!password) && passwordValidation && <ThemedText style={styles.feedback}>{passwordValidation}</ThemedText>}
          {feedback && <ThemedText style={[styles.feedback, feedbackTone === 'success' && styles.successFeedback]}>{feedback}</ThemedText>}

          {confirmationPending && mode === 'sign-in' && (
            <View style={styles.confirmationCard}>
              <Ionicons name="mail-open-outline" size={20} color={COLORS.honeyDark} />
              <View style={styles.confirmationCopy}>
                <ThemedText style={styles.confirmationTitle}>Still waiting for the email?</ThemedText>
                <ThemedText style={styles.confirmationText}>Check spam, or request one more confirmation email.</ThemedText>
              </View>
              <TouchableOpacity onPress={resendConfirmation} disabled={isResending || resendCooldown > 0}>
                <ThemedText style={styles.resendText}>
                  {isResending ? 'Sending...' : resendCooldown > 0 ? `${resendCooldown}s` : 'Resend'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, (isSubmitting || invalid) && styles.submitButtonDisabled]}
            onPress={submit}
            disabled={isSubmitting || invalid}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting || invalid, busy: isSubmitting }}
            activeOpacity={0.8}>
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.submitText}>
                {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </ThemedText>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 30, paddingBottom: 40 },
  mark: {
    width: 60,
    height: 60,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.honey,
    marginBottom: 24,
    ...BeeBetterShadow,
  },
  title: { color: COLORS.ink, fontSize: 26, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 24 },
  modeRow: { flexDirection: 'row', backgroundColor: COLORS.surfaceMuted, borderRadius: Radii.md, padding: 4, marginBottom: 20 },
  modeButton: { flex: 1, alignItems: 'center', borderRadius: Radii.sm, paddingVertical: 11 },
  modeButtonActive: { backgroundColor: COLORS.card, ...BeeBetterShadow },
  modeText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: COLORS.ink },
  label: { color: COLORS.ink, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: COLORS.ink,
    marginBottom: 16,
    ...BeeBetterShadow,
  },
  inlineFields: { flexDirection: 'row', gap: 10 },
  inlineField: { flex: 1 },
  goalOptions: { gap: 8, marginBottom: 16 },
  goalOption: { backgroundColor: COLORS.card, borderRadius: Radii.md, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  goalOptionActive: { backgroundColor: COLORS.honey },
  goalOptionText: { color: COLORS.muted, fontSize: 13 },
  goalOptionTextActive: { color: COLORS.ink, fontWeight: '800' },
  feedback: { color: COLORS.danger, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  successFeedback: { color: COLORS.success },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: Radii.md, marginBottom: 16, borderWidth: 1, borderColor: '#F1E4CF', ...BeeBetterShadow },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: COLORS.ink },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 12 },
  confirmationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.honeySoft, borderRadius: 14, padding: 12, marginBottom: 14 },
  confirmationCopy: { flex: 1 },
  confirmationTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  confirmationText: { color: COLORS.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  resendText: { color: COLORS.honeyDark, fontSize: 11, fontWeight: '800' },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: COLORS.ink,
    borderRadius: Radii.md,
    marginTop: 8,
    ...BeeBetterShadow,
  },
  submitButtonDisabled: { opacity: 0.65 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
