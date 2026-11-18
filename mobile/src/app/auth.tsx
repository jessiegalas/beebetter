import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserData } from '@/hooks/use-user-data';
import { Field, IconButton, useReducedMotion } from '@/components/mobile-ui';
import { PixelButton } from '@/components/pixel/pixel-button';
import { ThemedText } from '@/components/themed-text';
import { BeeMark } from '@/components/bee-visuals';
import { StudentEnrollmentFields } from '@/components/student-enrollment-fields';
import { useEnrollmentOptions } from '@/hooks/use-enrollment-options';
import { useRegistrationForm } from '@/hooks/use-registration-form';
import { useBeePalette, useBeeStyles, type BeePalette, Borders, Controls, ContentColumn, Radii, Spacing, Typography } from '@/constants/theme';
import { cleanName, cleanStudentNumber, passwordError, requiredStudentNameError, studentGoalError, studentLoginIdError, LIMITS } from '@/lib/student-validation';

type Step = 'id' | 'password' | 'name' | 'enrollment' | 'goal';
const signInSteps: Step[] = ['id', 'password'];
const signupSteps: Step[] = ['id', 'password', 'name', 'enrollment', 'goal'];
const enrollmentSteps: Step[] = ['name', 'enrollment', 'goal'];
const recoverySteps: Step[] = ['password'];
const nameFields = [
  { key: 'first', label: 'First name', autoComplete: 'given-name', required: true },
  { key: 'middle', label: 'Middle name', autoComplete: 'additional-name', required: false },
  { key: 'last', label: 'Last name', autoComplete: 'family-name', required: true },
  { key: 'suffix', label: 'Suffix', autoComplete: 'name-suffix', required: false },
] as const;

export default function AuthScreen() {
  const colors = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const { access, accessMessage, registrationOwner, isSigningOut, isRefreshing, isAuthBusy, refresh, signOut } = useUserData();
  const busy = isAuthBusy || isSigningOut;
  if (access === 'checking' || access === 'verification_error') return <SafeAreaView style={[styles.container, styles.center]}>
    {access === 'checking' ? <ActivityIndicator color={colors.honeyDark} accessibilityLabel="Checking account" /> : <>
      <ThemedText accessibilityRole="alert" style={styles.feedback}>{accessMessage}</ThemedText>
      <TouchableOpacity accessibilityRole="button" disabled={isRefreshing || busy} onPress={() => void refresh()} style={styles.modeButton}><ThemedText style={styles.modeText}>{isRefreshing ? 'Checking account...' : 'Retry'}</ThemedText></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.modeButton}><ThemedText style={styles.modeText}>Sign out</ThemedText></TouchableOpacity>
    </>}
  </SafeAreaView>;

  const onboarding = access === 'onboarding_required';
  const recovery = access === 'recovery_required';
  return <StudentAuthWizard key={onboarding ? 'enrollment:' + registrationOwner : recovery ? 'recovery' : 'credentials'}
    onboarding={onboarding} recovery={recovery} />;
}

function StudentAuthWizard({ onboarding, recovery }: { onboarding: boolean; recovery: boolean }) {
  const colors = useBeePalette();
  const styles = useBeeStyles(makeStyles);
  const data = useUserData();
  const [signup, setSignup] = useState(false);
  const [index, setIndex] = useState(0);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [feedback, setFeedback] = useState<string | null>();
  const [attempted, setAttempted] = useState(false);
  const [offset] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const catalogue = useEnrollmentOptions({ enabled: signup || onboarding });
  const draft = onboarding ? data.registrationDraft : null;
  const form = useRegistrationForm(draft, catalogue.options);
  const needsStudentId = onboarding && !draft?.existingStudent;
  const busy = data.isAuthBusy || data.isSigningOut;
  const steps = onboarding ? enrollmentSteps : recovery ? recoverySteps : signup ? signupSteps : signInSteps;
  const step = steps[index];
  const newPassword = signup || recovery;
  const invalidId = signup || needsStudentId
    ? (/^[0-9]{9}$/.test(form.studentNumber) ? undefined : 'Enter your 9-digit student ID.')
    : studentLoginIdError(form.studentNumber);
  const invalidPassword = newPassword ? passwordError(password) : !password ? 'Enter your password.' : undefined;
  const nameFieldError = ({ key, label, required }: typeof nameFields[number]) => {
    const part = form.nameParts[key].trim();
    if (!part) return required ? `Enter your ${label.toLowerCase()}.` : undefined;
    return requiredStudentNameError(part);
  };
  const nameTooLong = form.name.length > LIMITS.name;
  const invalidName = nameTooLong || nameFields.some(nameFieldError);
  const invalidGoal = studentGoalError(form.goal);
  const message = feedback === undefined && onboarding ? data.registrationError : feedback;

  const goTo = useCallback((next: number) => {
    Keyboard.dismiss();
    offset.stopAnimation();
    offset.setValue(reducedMotion ? 0 : next > index ? 84 : -84);
    setIndex(next);
    setAttempted(false);
    setFeedback(null);
    setPasswordFocused(false);
    setShowPassword(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (!reducedMotion) {
      Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
    }
  }, [index, offset, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) { offset.stopAnimation(); offset.setValue(0); }
  }, [offset, reducedMotion]);

  useEffect(() => {
    if (!index) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!submitting.current && !busy) goTo(index - 1);
      return true;
    });
    return () => listener.remove();
  }, [busy, goTo, index]);

  const changeMode = (next: boolean) => {
    if (busy || submitting.current || next === signup) return;
    setSignup(next);
    if (next) form.setStudentNumber(cleanStudentNumber(form.studentNumber));
    setPassword('');
    goTo(0);
  };

  const submit = async () => {
    if (busy || submitting.current) return;
    setAttempted(true);
    if ((step === 'id' && invalidId) || (step === 'password' && invalidPassword)
      || (step === 'name' && (invalidName || (needsStudentId && invalidId))) || (step === 'goal' && invalidGoal)) return;
    if (step === 'enrollment' && !form.selection) {
      setFeedback('Choose your course, year level, campus, and section to continue.');
      return;
    }
    if (index < steps.length - 1) { goTo(index + 1); return; }

    const enrollment = (signup || onboarding) ? form.selection : null;
    if ((signup || onboarding) && (!enrollment || !catalogue.ready)) {
      goTo(steps.indexOf('enrollment'));
      setFeedback('Check your enrollment choices and select your section again.');
      return;
    }
    submitting.current = true;
    setFeedback(null);
    try {
      const registration = { student_number: form.studentNumber, name: form.name, goal: form.goal, enrollment };
      const result = enrollment
        ? onboarding ? await data.completeRegistration({ ...registration, enrollment }) : await data.signUp({ ...registration, enrollment }, password)
        : recovery ? await data.updateRecoveryPassword(password) : await data.signIn(form.studentNumber, password);
      if (result.status !== 'error') { setPassword(''); return; }
      if (result.code === 'enrollment_changed' && enrollment) {
        form.clearSelection();
        catalogue.retry();
        goTo(steps.indexOf('enrollment'));
      }
      if (signup && result.code === 'student_number_unavailable') goTo(0);
      if (signup && result.code === 'student_account_created') { setSignup(false); setPassword(''); goTo(1); }
      setFeedback(result.message);
    } finally { submitting.current = false; }
  };

  const title = recovery ? 'Choose a new password'
    : step === 'id' ? signup ? 'Create your account' : 'Welcome to BeeBetter'
    : step === 'password' ? signup ? 'Choose a password' : 'Enter your password'
    : step === 'name' ? 'Student information' : step === 'enrollment' ? 'Enrollment' : 'Set your goal';
  const idField = <Field label="Student ID" accessibilityLabel="Student ID, required" value={form.studentNumber}
    error={attempted ? invalidId : undefined} editable={!busy}
    hint={signup || needsStudentId ? 'Enter your 9-digit student ID' : undefined}
    onChangeText={value => { form.setStudentNumber(signup || needsStudentId ? cleanStudentNumber(value) : value); setFeedback(null); }}
    onSubmitEditing={() => void submit()} keyboardType={signup || needsStudentId ? 'number-pad' : 'default'}
    autoComplete="username" autoCapitalize="none" autoCorrect={false} maxLength={LIMITS.login_student_id} />;

  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {index > 0 && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => goTo(index - 1)} style={styles.back}>
          <ThemedText style={styles.modeText}>‹ Back</ThemedText>
        </TouchableOpacity>}
        {index === 0 && !onboarding && <View style={styles.mark}><BeeMark size={Controls.minHeight} /></View>}
        {!recovery && <ThemedText style={styles.progress}>Step {index + 1} of {steps.length}</ThemedText>}
        <Animated.View style={{ transform: [{ translateX: offset }] }}>
          <ThemedText type="title" accessibilityRole="header" style={styles.title}>{title}</ThemedText>
          <View style={styles.panel}>
            {!onboarding && !recovery && index === 0 && <View style={styles.modeRow}>
              {[false, true].map(value => <TouchableOpacity key={String(value)} accessibilityRole="button"
                accessibilityState={{ selected: signup === value, disabled: busy }} disabled={busy}
                style={[styles.modeButton, signup === value && styles.modeButtonActive]} onPress={() => changeMode(value)}>
                <ThemedText style={styles.modeText}>{value ? 'Create account' : 'Sign in'}</ThemedText>
              </TouchableOpacity>)}
            </View>}
            {step === 'id' && idField}
            {step === 'password' && <>
              <ThemedText style={styles.label}>{recovery ? 'New password' : 'Password'}</ThemedText>
              <View style={[styles.passwordRow, {
                backgroundColor: busy ? colors.disabled : colors.card,
                borderColor: (attempted || !!password) && invalidPassword ? colors.danger : passwordFocused ? colors.focus : colors.input,
              }]}>
                <TextInput style={[styles.passwordInput, busy && { color: colors.disabledForeground }]} selectionColor={colors.primary}
                  onFocus={() => setPasswordFocused(true)} editable={!busy} value={password}
                  onChangeText={value => { setPassword(value); setFeedback(null); }} onBlur={() => setPasswordFocused(false)}
                  onSubmitEditing={() => void submit()} maxLength={newPassword ? LIMITS.password : undefined}
                  autoComplete={newPassword ? 'new-password' : 'current-password'} textContentType={newPassword ? 'newPassword' : 'password'}
                  accessibilityLabel={recovery ? 'New password, required' : 'Password, required'}
                  placeholder={newPassword ? 'At least 15 characters' : 'Your password'} placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} />
                <IconButton disabled={busy} onPress={() => setShowPassword(value => !value)}
                  label={showPassword ? 'Hide password' : 'Show password'} icon={showPassword ? 'eye-off-outline' : 'eye-outline'} />
              </View>
              {(attempted || !!password) && invalidPassword && <ThemedText accessibilityRole="alert" style={styles.feedback}>{invalidPassword}</ThemedText>}
            </>}
            {step === 'name' && <>
              {needsStudentId && idField}
              {draft?.existingStudent && <ThemedText>Student ID {draft.student_number}</ThemedText>}
              {!!form.savedNameForReview && <ThemedText>Enter the parts of your saved name, {form.savedNameForReview}.</ThemedText>}
              {nameFields.map(field => <Field key={field.key}
                label={field.required ? field.label : field.label + ' (optional)'}
                accessibilityLabel={field.label + (field.required ? ', required' : ', optional')}
                value={form.nameParts[field.key]} editable={!busy}
                error={attempted ? nameFieldError(field) : undefined}
                onChangeText={value => { form.setNamePart(field.key, cleanName(value)); setFeedback(null); }}
                autoCapitalize="words" autoComplete={field.autoComplete} autoCorrect={false} maxLength={LIMITS.name} />)}
              {attempted && nameTooLong && <ThemedText accessibilityRole="alert" style={styles.feedback}>
                Keep the full name within {LIMITS.name} characters.
              </ThemedText>}
            </>}
            {step === 'enrollment' && <StudentEnrollmentFields form={form} catalogue={catalogue} busy={busy} />}
            {step === 'goal' && <Field label="Your goal" accessibilityLabel="Your goal, required" hint="What would you like to work on this semester?"
              editable={!busy} value={form.goal} error={attempted ? invalidGoal : undefined}
              onChangeText={value => { form.setGoal(value); setFeedback(null); }} maxLength={LIMITS.goal} multiline />}
          </View>
          {data.accessMessage && <ThemedText accessibilityRole="alert" style={styles.feedback}>{data.accessMessage}</ThemedText>}
          {message && <ThemedText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.feedback}>{message}</ThemedText>}
          <PixelButton label={index < steps.length - 1 ? 'Continue' : onboarding ? 'Complete enrollment' : recovery ? 'Update password' : signup ? 'Create account' : 'Sign in'}
            loading={busy} disabled={step === 'enrollment' && !catalogue.ready} onPress={() => void submit()} />
        </Animated.View>
        {!onboarding && !signup && !recovery && step === 'password' && <ThemedText style={styles.help}>Forgot your password? Contact your school administrator.</ThemedText>}
        {(onboarding || recovery || data.access === 'blocked') && <TouchableOpacity accessibilityRole="button" disabled={busy}
          onPress={() => void data.signOut()} style={styles.modeButton}><ThemedText style={styles.modeText}>{data.isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText></TouchableOpacity>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const makeStyles = (colors: BeePalette) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', padding: Spacing.xl },
  content: { ...ContentColumn, paddingTop: Spacing.section, paddingBottom: Spacing.page },
  mark: { marginBottom: Spacing.xl },
  title: { marginBottom: Spacing.gutter },
  panel: { gap: Spacing.lg, marginBottom: Spacing.lg },
  progress: { color: colors.muted, ...Typography.metadata, marginBottom: Spacing.sm },
  back: { alignSelf: 'flex-start', minHeight: Controls.minHeight, justifyContent: 'center', paddingRight: Spacing.lg, marginBottom: Spacing.sm },
  modeRow: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: Radii.md, padding: Spacing.xs },
  modeButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm, minHeight: Controls.minHeight, paddingHorizontal: Spacing.xs, paddingVertical: Spacing.md },
  modeButtonActive: { backgroundColor: colors.card },
  modeText: { color: colors.muted, ...Typography.label, textAlign: 'center' },
  label: { color: colors.ink, ...Typography.label },
  feedback: { color: colors.danger, ...Typography.metadata, marginBottom: Spacing.lg },
  help: { color: colors.muted, ...Typography.metadata, marginTop: Spacing.lg, textAlign: 'center' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderRadius: Radii.md, borderWidth: Borders.focus, borderColor: colors.input },
  passwordInput: { ...Typography.body, flex: 1, minWidth: 0, minHeight: Controls.minHeight, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, color: colors.foreground },
});
