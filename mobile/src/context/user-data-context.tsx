import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { CompletionRecord } from '@/lib/quest-priority';
import { User } from '@supabase/supabase-js';
import { supabase, authRecoveryStorage } from '@/supabase';
import { authFailure, parseAuthCallback, readRegistrationDraft, registrationInput, type RegistrationDraft, type AuthenticationResult, type AuthOperationResult, type AuthFailure, type RegistrationInput } from '@/lib/auth-flow';
import { createStudentWorkspaceReader, type WorkspaceSlice, type WorkspaceErrors } from '@/lib/student-workspace';
import { createQuestCompletion, type ProofFile } from '@/lib/quest-completion';
import { createQuestCompletionAdapter } from '@/lib/quest-completion-adapter';
import { passwordError, studentPayload, validateStudent, type RegistrationEnrollmentOption } from '@/lib/student-validation';
import { SessionFence, studentAccessMessage, VERIFICATION_MESSAGE, type AccountAccess } from '@/lib/account-access';
import {
  startQuestNotificationLifetime,
  cancelQuestNotifications,
} from '@/lib/quest-notifications';

export type Category = string;
export type QuestStatus = 'active' | 'completed' | 'rejected' | 'pending';

export type QuestContextFields = {
  scheduled_at?: string | null;
  preferred_time?: string | null;
  deadline_at?: string | null;
  importance?: 'low' | 'normal' | 'high';
  prerequisite_quest_id?: string | null;
};

export type QuestDraft = QuestContextFields & {
  title: string; description?: string; category: Category; xp: number;
  location_id?: string | null; requires_proof?: boolean;
};

export type Quest = QuestContextFields & {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: Category;
  xp: number;
  status: QuestStatus;
  location_id: string | null;
  created_at: string;
  completed_at?: string | null;
  updated_at: string;
  requires_proof: boolean;
  proof_path: string | null;
  proof_mime_type: string | null;
  proof_submitted_at: string | null;
};

export type { ProofFile } from '@/lib/quest-completion';

export type UserProfile = {
  id: string;
  display_name: string | null;
  student_number: string;
  name: string;
  email: string;
  course: string;
  year_level: string;
  section: string;
  campus: string;
  goal: string;
  status: 'Active' | 'Inactive';
  level: number;
  total_xp: number;
  current_streak: number;
  created_at: string;
  updated_at: string;
};

export type LevelProgress = {
  level: number;
  currentLevelXp: number;
  xpForNextLevel: number;
  progressPercent: number;
};
export type { WorkspaceErrors, WorkspaceSlice } from '@/lib/student-workspace';
export type ProgressSummary = { totalCompleted: number; byCategory: Record<string, number> };

export function calculateLevel(totalXp: number): LevelProgress {
  const XP_PER_LEVEL = 100;
  const level = Math.max(1, Math.floor(totalXp / XP_PER_LEVEL) + 1);
  const currentLevelXp = Math.max(0, totalXp % XP_PER_LEVEL);
  const xpForNextLevel = XP_PER_LEVEL;
  const progressPercent = Math.min(100, Math.round((currentLevelXp / xpForNextLevel) * 100));
  return { level, currentLevelXp, xpForNextLevel, progressPercent };
}

interface UserDataContextType {
  user: User | null;
  access: AccountAccess;
  accessMessage: string | null;
  isSigningOut: boolean;
  signIn: (email: string, password: string) => Promise<AuthenticationResult>;
  signUp: (email: string, password: string, draft: RegistrationDraft) => Promise<AuthenticationResult>;
  resendConfirmation: (email: string) => Promise<AuthOperationResult>;
  requestPasswordReset: (email: string) => Promise<AuthOperationResult>;
  updateRecoveryPassword: (password: string) => Promise<AuthOperationResult>;
  completeRegistration: (input: RegistrationInput) => Promise<AuthOperationResult>;
  handleAuthCallback: (url: string) => Promise<AuthOperationResult>;
  isAuthBusy: boolean;
  registrationEmail: string | null;
  registrationDraft: RegistrationDraft | null;
  registrationError: string | null;
  profile: UserProfile | null;
  quests: Quest[];
  questsHasMore: boolean;
  completionHistory: CompletionRecord[];
  completionHistoryHasMore: boolean;
  progressSummary: ProgressSummary;
  activeQuests: Quest[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  workspaceErrors: WorkspaceErrors;
  levelProgress: LevelProgress;
  updateProfile: (updates: StudentProfileUpdates) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
  retryWorkspace: (slice: WorkspaceSlice) => Promise<void>;
  completeQuest: (questId: string, proof?: ProofFile) => Promise<{ success: boolean; error?: string }>;
  deleteQuest: (questId: string) => Promise<{ success: boolean; error?: string }>;
  addQuest: (quest: QuestDraft) => Promise<{ success: boolean; error?: string }>;
  updateQuest: (id: string, quest: QuestDraft) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<SignOutResult>;
}

export type { AuthenticationResult, AuthOperationResult } from '@/lib/auth-flow';

export type SignOutResult =
  | { status: 'signed_out' }
  | { status: 'retry_required'; message: string };

export type StudentProfileUpdates = Pick<
  UserProfile,
  'student_number' | 'name' | 'course' | 'year_level' | 'section' | 'campus' | 'goal'
>;

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const requestVersion = useRef(0);
  const [fence] = useState(() => new SessionFence());
  const sessionUser = useRef<User | null>(null);
  const cleanupFailed = useRef(false);
  const logoutTask = useRef<Promise<SignOutResult> | null>(null);
  const authenticationTask = useRef<Promise<unknown> | null>(null);
  const authenticationEpoch = useRef(0);
  const recoveryRequired = useRef(false);
  const startupReady = useRef(false);
  const lastCallback = useRef<string | null>(null);
  const loadTask = useRef<{ id: string | null; workspace: boolean | WorkspaceSlice; task: Promise<void> } | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const [workspaceReader] = useState(() => createStudentWorkspaceReader(supabase));
  const [questCompletion] = useState(() => createQuestCompletion(createQuestCompletionAdapter(supabase)));
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState<string | null>(null);
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const automaticRegistrationAttempt = useRef<string | null>(null);
  const [access, setAccess] = useState<AccountAccess>('checking');
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const completingQuests = useRef(new Set<string>());
  const [user, setUser] = useState<User | null>(null);
  const isAdmittedSession = useMemo(() => fence.capture(user?.id), [user, fence]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [questsHasMore, setQuestsHasMore] = useState(false);
  const [completionHistory, setCompletionHistory] = useState<CompletionRecord[]>([]);
  const [completionHistoryHasMore, setCompletionHistoryHasMore] = useState(false);
  const [progressSummary, setProgressSummary] = useState<ProgressSummary>({ totalCompleted: 0, byCategory: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workspaceFailure, setError] = useState<string | null>(null);
  const [workspaceErrors, setWorkspaceErrors] = useState<WorkspaceErrors>({});
  const failedSlice = (['profile', 'streak', 'progress', 'quests'] as WorkspaceSlice[]).findLast(slice => workspaceErrors[slice]);
  const error = failedSlice
    ? failedSlice[0].toUpperCase() + failedSlice.slice(1) + ' could not be refreshed. Retry to load current workspace data.'
    : workspaceFailure;

  const clearUserData = useCallback(() => {
    workspaceReader.cancel();
    setUser(null);
    setProfile(null);
    setQuests([]);
    setQuestsHasMore(false);
    setCompletionHistory([]);
    setCompletionHistoryHasMore(false);
    setProgressSummary({ totalCompleted: 0, byCategory: {} });
    setIsLoading(false);
    setIsRefreshing(false);
    setError(null);
    setWorkspaceErrors({});
    completingQuests.current.clear();
  }, [workspaceReader]);

  const endSession = useCallback((reason?: string): Promise<SignOutResult> => {
    if (logoutTask.current) return logoutTask.current;
    fence.close();
    loadTask.current = null;
    authenticationEpoch.current += 1;
    loadController.current?.abort(); workspaceReader.cancel();
    requestVersion.current += 1;
    sessionUser.current = null;
    setRegistrationEmail(null);
    setRegistrationDraft(null); setRegistrationError(null); automaticRegistrationAttempt.current = null;
    clearUserData();
    setAccess(reason ? 'blocked' : 'signed_out');
    setAccessMessage(reason ?? null);
    setIsSigningOut(true);
    // Defer out of onAuthStateChange; never await Auth calls inside its lock.
    const task = Promise.resolve().then(async () => {
      // An Auth response may persist credentials even after the app fence closes.
      // Settle it first, then remove the resulting session before reporting logout.
      await authenticationTask.current?.catch(() => {});
      // Revoke push registration before Auth removes the session.
      await cancelQuestNotifications().catch(error => console.warn('Push cleanup pending:', error));
      const results = await Promise.allSettled([
        supabase.auth.signOut({ scope: reason ? 'local' : 'global' }).then(({ error }) => { if (error) throw error; }),
      ]);
      let authFailure = results[0].status === 'rejected';
      if (!authFailure) {
        try { await authRecoveryStorage.clear(); recoveryRequired.current = false; }
        catch { authFailure = true; }
      }
      cleanupFailed.current = authFailure;
      if (authFailure) {
        const message = [reason, 'Sign-out could not finish. Your app access is locked. Retry sign-out before signing in again.'].filter(Boolean).join(' ');
        setAccessMessage(message);
        setAccess('blocked');
        return { status: 'retry_required', message } as const;
      }
      results.forEach(result => { if (result.status === 'rejected') console.warn('Session cleanup failed:', result.reason); });
      return { status: 'signed_out' } as const;
    }).catch(() => {
      cleanupFailed.current = true;
      setAccess('blocked');
      const message = 'Sign-out could not finish. Retry sign-out before signing in again.';
      setAccessMessage(message);
      return { status: 'retry_required', message } as const;
    }).finally(() => { logoutTask.current = null; setIsSigningOut(false); });
    logoutTask.current = task;
    return task;
  }, [clearUserData, fence, workspaceReader]);

  const beginAuthentication = useCallback(() => {
    if (logoutTask.current || cleanupFailed.current || authenticationTask.current) return false;
    fence.beginAuthentication();
    setRegistrationDraft(null); setRegistrationError(null); automaticRegistrationAttempt.current = null;
    loadController.current?.abort(); workspaceReader.cancel();
    loadTask.current = null;
    sessionUser.current = null;
    requestVersion.current += 1;
    clearUserData();
    setAccess('signed_out');
    setAccessMessage(null);
    return true;
  }, [clearUserData, fence, workspaceReader]);

  const authRedirect = useCallback((recovery = false) => Linking.createURL('auth', {
    ...(Platform.OS !== 'web' ? { scheme: 'beebetter' } : {}),
    ...(recovery ? { queryParams: { flow: 'recovery' } } : {}),
  }), []);

  const runAuthentication = useCallback(<T extends AuthenticationResult | AuthOperationResult,>(
    operation: () => Promise<T>, replaceSession = false,
  ): Promise<T | AuthFailure> => {
    if (logoutTask.current || cleanupFailed.current || authenticationTask.current) {
      return Promise.resolve(authFailure({ code: 'operation_busy', message: 'Wait for the current operation, or retry sign-out.' }));
    }
    if (replaceSession && !beginAuthentication()) return Promise.resolve(authFailure({ code: 'operation_cancelled' }));
    const epoch = authenticationEpoch.current;
    setIsAuthBusy(true);
    const task = Promise.resolve().then(operation).then(result => epoch === authenticationEpoch.current
      ? result : authFailure({ code: 'operation_cancelled' })).catch(authFailure).finally(() => {
      if (authenticationTask.current === task) authenticationTask.current = null;
      setIsAuthBusy(false);
    });
    authenticationTask.current = task;
    return task;
  }, [beginAuthentication]);

  const signIn = useCallback((email: string, password: string): Promise<AuthenticationResult> =>
    runAuthentication<AuthenticationResult>(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? authFailure(error) : { status: 'session_created' };
    }, true), [runAuthentication]);

  const signUp = useCallback((email: string, password: string, value: RegistrationDraft): Promise<AuthenticationResult> =>
    runAuthentication<AuthenticationResult>(async () => {
      const invalid = passwordError(password);
      if (invalid) return authFailure({ code: 'weak_password', message: invalid });
      // The v2 catalogue doubles as a read-only rollout check: do not send the
      // new intent to the legacy trigger before the additive migration exists.
      const ready = await supabase.rpc('registration_enrollment_options_v2');
      if (ready.error) return authFailure({ code: 'registration_unavailable' });
      const draft = readRegistrationDraft(value);
      if (!draft) return authFailure({ code: 'invalid_registration' });
      const options = (ready.data ?? []) as RegistrationEnrollmentOption[];
      const student = studentPayload(draft.student);
      const selected = options.find(option => option.id === draft.enrollmentOptionId && option.semester_id === draft.semesterId);
      if (!selected || selected.course !== student.course || selected.year_level !== student.year_level
        || selected.campus !== student.campus || selected.section !== student.section) return authFailure({ code: 'enrollment_changed' });
      if (Object.keys(validateStudent(student, options)).length) return authFailure({ code: 'invalid_registration' });
      const { data, error } = await supabase.auth.signUp({ email, password,
        options: { data: { signup_intent: 'student_registration', registration_draft: { ...draft, student } }, emailRedirectTo: authRedirect() } });
      if (error?.code === 'user_already_exists' || error?.code === 'email_exists') return { status: 'confirmation_required' };
      return error ? authFailure(error) : { status: data.session ? 'session_created' : 'confirmation_required' };
    }, true), [authRedirect, runAuthentication]);

  const resendConfirmation = useCallback((email: string): Promise<AuthOperationResult> =>
    runAuthentication<AuthOperationResult>(async () => {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirect() } });
      if (error?.code === 'user_not_found' || error?.code === 'user_already_exists') return { status: 'completed' };
      return error ? authFailure(error) : { status: 'completed' };
    }), [authRedirect, runAuthentication]);

  const requestPasswordReset = useCallback((email: string): Promise<AuthOperationResult> =>
    runAuthentication<AuthOperationResult>(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect(true) });
      return error ? authFailure(error) : { status: 'completed' };
    }), [authRedirect, runAuthentication]);

  const handleAuthCallback = useCallback(async (url: string): Promise<AuthOperationResult> => {
    const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
    const callback = parseAuthCallback(url, origin);
    if (!callback || lastCallback.current === url) return { status: 'completed' };
    if (callback.kind === 'error') {
      const failure = authFailure({ code: callback.code });
      setAccessMessage(failure.message);
      return failure;
    }
    const result = await runAuthentication<AuthOperationResult>(async () => {
      if (callback.recovery) {
          // Persist before exchanging: SIGNED_IN may arrive during the call.
          await authRecoveryStorage.set();
          recoveryRequired.current = true;
          clearUserData();
          setAccess('recovery_required');
        }
        const response = callback.kind === 'code'
          ? await supabase.auth.exchangeCodeForSession(callback.code)
          : await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
        if (response.error) return authFailure(response.error);
        lastCallback.current = url;
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', '/auth');
        return { status: 'completed' };
    }, true);
    if (result.status === 'error') setAccessMessage(result.message);
    return result;
  }, [clearUserData, runAuthentication]);

  const loadUserData = useCallback(async (currentUser: User | null, showLoading = false, workspace: boolean | WorkspaceSlice = true) => {
    if (!fence.accept(currentUser?.id ?? null)) return;
    const isSessionCurrent = fence.capture();
    loadController.current?.abort(); workspaceReader.cancel();
    const controller = new AbortController();
    loadController.current = controller;
    const version = ++requestVersion.current;
    const isCurrent = () => isSessionCurrent() && version === requestVersion.current;
    if (showLoading) setIsLoading(true);
    if (workspace) setError(null);

    if (!currentUser) {
      clearUserData();
      setAccess(current => current === 'blocked' ? current : 'signed_out');
      return;
    }

    let admitted = false;
    try {
      if (recoveryRequired.current) {
        clearUserData(); setAccess('recovery_required'); setRegistrationEmail(currentUser.email ?? null); return;
      }
      // Admission is authoritative student data, never Auth metadata or a default.
      const { data: studentData, error: studentErr } = await supabase
        .from('students').select('*').eq('id', currentUser.id).abortSignal(controller.signal).maybeSingle();
      if (!isCurrent()) return;
      if (studentErr) throw studentErr;
      {
        const registration = await supabase.rpc('student_get_registration_state').abortSignal(controller.signal);
        if (!isCurrent()) return;
        if (registration.error) throw registration.error;
        if (registration.data === 'onboarding_required') {
          clearUserData(); setRegistrationEmail(currentUser.email ?? null);
          setRegistrationDraft(readRegistrationDraft(currentUser.user_metadata?.registration_draft));
          setAccess('onboarding_required'); setAccessMessage(null); return;
        }
        if (registration.data !== 'active') {
          await endSession(studentAccessMessage(studentData) ?? 'Your student account is unavailable. Confirm your email or contact your administrator.');
          return;
        }
      }
      const denied = studentAccessMessage(studentData);
      if (denied) { await endSession(denied); return; }
      setUser(previous => previous?.id === currentUser.id ? previous : currentUser);
      setAccess('active');
      setAccessMessage(null);
      admitted = true;
      if (!workspace) return;

      const result = await workspaceReader.read({ user: currentUser, student: studentData, isCurrent }, workspace === true ? 'all' : workspace);
      if (!result || !isCurrent()) return;
      setWorkspaceErrors(previous => {
        const next = { ...previous };
        result.slices.forEach(slice => { delete next[slice]; });
        return { ...next, ...result.errors };
      });
      setProfile(result.updateProfile);
      if (result.history) {
        setCompletionHistory(result.history.rows);
        setCompletionHistoryHasMore(result.history.hasMore);
      }
      if (result.progressSummary) setProgressSummary(result.progressSummary);
      if (result.quests) { setQuests(result.quests); setQuestsHasMore(false); }

    } catch {
      if (isCurrent() && admitted) {
        setError('Workspace data could not be refreshed. Retry to load current data.');
      } else if (isCurrent()) {
        console.warn('Admission failure category:', 'verification_error');
        // Fail closed on verification/network errors, retaining the raw session for retry.
        fence.invalidate();
        fence.accept(null);
        clearUserData();
        setAccess('verification_error');
        setAccessMessage(VERIFICATION_MESSAGE);
      }
    } finally {
      if (isCurrent()) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [clearUserData, endSession, fence, workspaceReader]);

  const fetchUserData = useCallback(function fetchWorkspace(currentUser: User | null, showLoading = false, workspace: boolean | WorkspaceSlice = true, force = false): Promise<void> {
    if (!force && loadTask.current?.id === (currentUser?.id ?? null)) {
      if (workspace && loadTask.current.workspace !== true && loadTask.current.workspace !== workspace) {
        const isCurrent = fence.capture();
        return loadTask.current.task.then(() => { if (isCurrent()) return fetchWorkspace(currentUser, showLoading, workspace); });
      }
      return loadTask.current.task;
    }
    const task = loadUserData(currentUser, showLoading, workspace).finally(() => {
      if (loadTask.current?.task === task) loadTask.current = null;
    });
    loadTask.current = { id: currentUser?.id ?? null, workspace, task };
    return task;
  }, [loadUserData, fence]);

  const updateRecoveryPassword = useCallback((password: string): Promise<AuthOperationResult> =>
    runAuthentication<AuthOperationResult>(async () => {
      if (!recoveryRequired.current || !sessionUser.current) return authFailure({ code: 'recovery_session_missing', message: 'Request and open a new password reset email first.' });
      const invalid = passwordError(password);
      if (invalid) return authFailure({ code: 'weak_password', message: invalid });
      const epoch = authenticationEpoch.current;
      const isCurrent = fence.capture();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return authFailure(error);
      if (epoch !== authenticationEpoch.current || !isCurrent()) return authFailure({ code: 'operation_cancelled' });
      await authRecoveryStorage.clear();
      recoveryRequired.current = false;
      if (!isCurrent()) return authFailure({ code: 'operation_cancelled' });
      const currentUser = sessionUser.current;
      setTimeout(() => { if (isCurrent()) void fetchUserData(currentUser, true, true, true); }, 0);
      return { status: 'completed' };
    }), [fetchUserData, fence, runAuthentication]);

  const completeRegistration = useCallback((input: RegistrationInput): Promise<AuthOperationResult> =>
    runAuthentication<AuthOperationResult>(async () => {
      if (!sessionUser.current || recoveryRequired.current) return authFailure({ code: 'registration_unavailable' });
      const isCurrent = fence.capture();
      setRegistrationError(null);
      const { data, error } = await supabase.rpc('student_complete_registration', {
        name_value: input.name, student_number_value: input.studentNumber, goal_value: input.goal,
        semester_id_value: input.semesterId, enrollment_option_id_value: input.enrollmentOptionId,
      });
      if (!isCurrent()) return authFailure({ code: 'operation_cancelled' });
      if (error) return authFailure(error);
      if (data?.status !== 'completed') return authFailure({ code: data?.code ?? 'registration_unavailable', message: data?.message });
      setRegistrationDraft(null);
      // This best-effort cleanup is serialized with Auth operations. It must not
      // undo committed registration or run for an account that replaced this one.
      if (sessionUser.current?.user_metadata?.registration_draft) {
        try {
          const cleanup = await supabase.auth.updateUser({ data: { registration_draft: null } });
          if (cleanup.error) console.warn('Registration draft cleanup pending');
        } catch { console.warn('Registration draft cleanup pending'); }
      }
      if (!isCurrent()) return authFailure({ code: 'operation_cancelled' });
      const currentUser = sessionUser.current;
      setTimeout(() => { if (isCurrent()) void fetchUserData(currentUser, true, true, true); }, 0);
      return { status: 'completed' };
    }), [fetchUserData, fence, runAuthentication]);

  useEffect(() => {
    const identity = sessionUser.current?.id;
    if (access !== 'onboarding_required' || !identity || !registrationDraft || isAuthBusy || isSigningOut
      || recoveryRequired.current || automaticRegistrationAttempt.current === identity) return;
    automaticRegistrationAttempt.current = identity;
    const isCurrent = fence.capture(identity);
    // At most one automatic attempt per login. Failures leave the populated form
    // available for correction/retry rather than repeating on every refresh.
    void completeRegistration(registrationInput(registrationDraft)).then(result => {
      if (isCurrent() && result.status === 'error') setRegistrationError(result.message);
    });
  }, [access, registrationDraft, isAuthBusy, isSigningOut, completeRegistration, fence]);

  const updateProfile = useCallback(async (updates: StudentProfileUpdates) => {
    if (!user || !isAdmittedSession()) return { success: false, error: 'User is not signed in.' };
    const isCurrent = fence.capture(user.id);

    try {
      const { data, error: studentError } = await supabase
        .from('students')
        .update({ ...updates, email: profile?.email ?? user.email ?? '' })
        .eq('id', user.id)
        .select('*')
        .single();

      if (!isCurrent()) return { success: false, error: 'Session ended.' };
      if (studentError) {
        return { success: false, error: studentError.message };
      }

      setProfile((current) => current ? { ...current, ...data, display_name: data.name } : current);
      await supabase.from('profiles').update({ display_name: data.name }).eq('id', user.id);
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not update profile.' };
    }
  }, [profile, user, isAdmittedSession, fence]);

  useEffect(() => {
    fence.beginAuthentication();
    let isMounted = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const receiveSession = (nextUser: User | null, workspace = true) => {
      if (!isMounted || !fence.accept(nextUser?.id ?? null)) return;
      const changed = sessionUser.current?.id !== nextUser?.id;
      sessionUser.current = nextUser;
      if (changed || !nextUser) {
        setRegistrationDraft(null); setRegistrationError(null); automaticRegistrationAttempt.current = null;
        loadController.current?.abort(); workspaceReader.cancel(); loadTask.current = null; requestVersion.current += 1; }
      setRegistrationEmail(nextUser?.email ?? null);
      if (changed || !nextUser) clearUserData();
      if (!nextUser) {
        void cancelQuestNotifications().catch(error => console.warn('Reminder cleanup failed:', error));
        setAccess(current => current === 'blocked' ? current : 'signed_out');
        return;
      }
      if (changed) setAccess('checking');
      const isCurrent = fence.capture();
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (isMounted && isCurrent()) void fetchUserData(nextUser, changed, workspace);
      }, 0);
      timers.add(timer);
    };
    let latestEvent: User | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRequired.current = true;
        void authRecoveryStorage.set().catch(() => { if (isMounted) { clearUserData(); setAccess('verification_error'); setAccessMessage(VERIFICATION_MESSAGE); } });
      }
      latestEvent = session?.user ?? null;
      if (!startupReady.current) return;
      receiveSession(session?.user ?? null, event !== 'TOKEN_REFRESHED');
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { if (isMounted) void handleAuthCallback(url); });
    void (async () => {
      try {
        const [marker, initialUrl] = await Promise.all([authRecoveryStorage.get(), Linking.getInitialURL()]);
        if (!isMounted) return;
        recoveryRequired.current = recoveryRequired.current || !!marker;
        startupReady.current = true;
        if (initialUrl && parseAuthCallback(initialUrl, Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined)) {
          const result = await handleAuthCallback(initialUrl);
          if (!isMounted) return;
          if (result.status === 'error') setAccessMessage(result.message);
        }
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (error) throw error;
        receiveSession(latestEvent !== undefined ? latestEvent : session?.user ?? null);
      } catch {
        if (!isMounted) return;
        clearUserData(); setAccess('verification_error'); setAccessMessage(VERIFICATION_MESSAGE);
      }
    })();
    return () => {
      isMounted = false;
      fence.close();
      authenticationEpoch.current += 1;
      loadController.current?.abort(); workspaceReader.cancel();
      requestVersion.current += 1;
      startupReady.current = false;
      linkSubscription.remove();
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, [clearUserData, fetchUserData, fence, handleAuthCallback, workspaceReader]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const update = (state: string) => {
      if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => { subscription.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);

  const refreshWorkspace = useCallback(async (scope: WorkspaceSlice | 'all') => {
    const isCurrent = fence.capture();
    if (!isCurrent()) return;
    setIsRefreshing(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!isCurrent()) return;
      if (error) throw error;
      sessionUser.current = session?.user ?? null;
      await fetchUserData(sessionUser.current, false, scope === 'all' ? true : scope);
    } catch {
      if (isCurrent()) {
        fence.invalidate();
        fence.accept(null);
        clearUserData();
        setAccess('verification_error');
        setAccessMessage(VERIFICATION_MESSAGE);
      }
    } finally { if (isCurrent()) setIsRefreshing(false); }
  }, [clearUserData, fetchUserData, fence]);
  const refresh = useCallback(() => refreshWorkspace('all'), [refreshWorkspace]);
  const retryWorkspace = useCallback((slice: WorkspaceSlice) => refreshWorkspace(slice), [refreshWorkspace]);

  const completeQuest = useCallback(async (questId: string, proof?: ProofFile): Promise<{ success: boolean; error?: string }> => {
    if (!user || !isAdmittedSession()) {
      return { success: false, error: 'User is not signed in.' };
    }
    const isCurrent = fence.capture(user.id);

    let targetQuest: Pick<Quest, 'status' | 'requires_proof'> | undefined = quests.find((q) => q.id === questId);
    // A push can arrive before a newly assigned quest enters the cached list.
    if (!targetQuest) {
      try {
        const { data, error } = await supabase.from('quests')
          .select('status, requires_proof').eq('id', questId).eq('owner_id', user.id).maybeSingle();
        if (!isCurrent()) return { success: false, error: 'Session ended.' };
        if (error) return { success: false, error: 'Could not verify this quest. Try again.' };
        if (!data) return { success: false, error: 'Quest not found.' };
        targetQuest = data;
      } catch {
        return { success: false, error: isCurrent() ? 'Could not verify this quest. Try again.' : 'Session ended.' };
      }
    }

    if (targetQuest.status === 'completed') {
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    }

    if (targetQuest.requires_proof && !proof) {
      return { success: false, error: 'Attach a photo, video, or file as proof before completing this quest.' };
    }

    if (completingQuests.current.has(questId)) return { success: false, error: 'This quest is already being completed.' };
    completingQuests.current.add(questId);

    try {
      const result = await questCompletion.run({ ownerId: user.id, questId, proof, isCurrent });
      if (result.status === 'failed') return { success: false, error: result.message };
      if (result.status === 'cancelled') return { success: false, error: 'Session ended.' };
      // Refresh server timestamps, durable history and XP together.
      if (isCurrent()) await fetchUserData(user, false, true, true);
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      // Completion has already been acknowledged; refresh failures must not
      // remove the proof now referenced by the server.
      return {
        success: false,
        error: err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to complete quest.',
      };
    } finally { if (isCurrent()) completingQuests.current.delete(questId); }
  }, [user, quests, fetchUserData, isAdmittedSession, fence, questCompletion]);

  const notificationOwnerId = user?.id;
  useEffect(() => {
    if (!notificationOwnerId) return;
    return startQuestNotificationLifetime(notificationOwnerId, fence.capture(notificationOwnerId));
  }, [notificationOwnerId, fence]);

  const deleteQuest = useCallback(async (questId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user || !isAdmittedSession()) return { success: false, error: 'User is not signed in.' };
    const isCurrent = fence.capture(user.id);

    const previousQuests = [...quests];
    // Optimistic removal
    setQuests((prev) => prev.filter((q) => q.id !== questId));

    try {
      const { error: delError } = await supabase.from('quests').delete().eq('id', questId);
      if (delError) throw delError;
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      if (isCurrent()) setQuests(previousQuests);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete quest.',
      };
    }
  }, [user, quests, isAdmittedSession, fence]);

  const addQuest = useCallback(async (questData: QuestDraft): Promise<{ success: boolean; error?: string }> => {
    if (!user || !isAdmittedSession()) return { success: false, error: 'User is not signed in.' };
    const isCurrent = fence.capture(user.id);

    try {
      const questInsert = {
        owner_id: user.id,
        title: questData.title.trim(),
        description: questData.description?.trim() || null,
        category: questData.category,
        xp: questData.xp,
        location_id: questData.location_id ?? null,
        ...(questData.requires_proof ? { requires_proof: true } : {}),
        ...contextPayload(questData),
      };

      const { data, error: insertError } = await supabase
        .from('quests')
        .insert(questInsert)
        .select('*')
        .single();

      if (insertError) {
        if (questData.requires_proof && insertError.message.toLowerCase().includes('requires_proof')) {
          throw new Error('Proof quests are not enabled in Supabase yet. Run supabase/003_quest_proofs.sql first.');
        }
        throw new Error(databaseQuestError(insertError));
      }
      if (data && isCurrent()) {
        setQuests((prev) => [data as Quest, ...prev]);
      }
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create quest.',
      };
    }
  }, [user, isAdmittedSession, fence]);

  const updateQuest = useCallback(async (id: string, draft: QuestDraft) => {
    if (!user || !isAdmittedSession()) return { success: false, error: 'User is not signed in.' };
    const isCurrent = fence.capture(user.id);
    try {
      const { data, error: updateError } = await supabase.from('quests').update({
        title: draft.title.trim(), description: draft.description?.trim() || null,
        category: draft.category, location_id: draft.location_id ?? null,
        requires_proof: Boolean(draft.requires_proof),
        ...contextPayload(draft),
      }).eq('id', id).eq('owner_id', user.id).neq('status', 'completed').select('*').single();
      if (!isCurrent()) return { success: false, error: 'Session ended.' };
      if (updateError) return { success: false, error: databaseQuestError(updateError) };
      setQuests(previous => previous.map(q => q.id === id ? data as Quest : q));
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not update quest.' };
    }
  }, [user, isAdmittedSession, fence]);

  // Revalidate restored/open sessions even when Realtime is not enabled.
  useEffect(() => {
    const revalidate = () => {
      if (sessionUser.current && AppState.currentState === 'active') void fetchUserData(sessionUser.current);
    };
    const poll = setInterval(revalidate, 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') revalidate();
    });
    return () => { clearInterval(poll); subscription.remove(); };
  }, [fetchUserData]);

  const signOut = useCallback(() => endSession(), [endSession]);

  const activeQuests = useMemo(() => quests.filter((q) => q.status === 'active'), [quests]);
  const levelProgress = useMemo(() => {
    return calculateLevel(profile?.total_xp ?? 0);
  }, [profile?.total_xp]);

  const value = useMemo(
    () => ({
      user,
      access,
      accessMessage,
      isSigningOut,
      signIn,
      signUp,
      resendConfirmation,
      requestPasswordReset,
      updateRecoveryPassword,
      completeRegistration,
      handleAuthCallback,
      isAuthBusy,
      registrationEmail,
      registrationDraft,
      registrationError,
      profile,
      quests,
      questsHasMore,
      completionHistory,
      completionHistoryHasMore,
      progressSummary,
      activeQuests,
      isLoading,
      isRefreshing,
      error,
      workspaceErrors,
      levelProgress,
      updateProfile,
      refresh,
      retryWorkspace,
      completeQuest,
      deleteQuest,
      addQuest,
      updateQuest,
      signOut,
    }),
    [
      user,
      access,
      accessMessage,
      isSigningOut,
      signIn,
      signUp,
      resendConfirmation,
      requestPasswordReset,
      updateRecoveryPassword,
      completeRegistration,
      handleAuthCallback,
      isAuthBusy,
      registrationEmail,
      registrationDraft,
      registrationError,
      profile,
      quests,
      questsHasMore,
      completionHistory,
      completionHistoryHasMore,
      progressSummary,
      activeQuests,
      isLoading,
      isRefreshing,
      error,
      workspaceErrors,
      levelProgress,
      updateProfile,
      refresh,
      retryWorkspace,
      completeQuest,
      deleteQuest,
      addQuest,
      updateQuest,
      signOut,
    ]
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData() {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
}

function contextPayload(draft: QuestDraft): QuestContextFields {
  // Omit fields for legacy template callers; explicit null clears a field when editing.
  return Object.fromEntries(
    ['scheduled_at', 'preferred_time', 'deadline_at', 'importance', 'prerequisite_quest_id']
      .filter(key => key in draft).map(key => [key, draft[key as keyof QuestContextFields]])
  );
}
function databaseQuestError(error: { code?: string; message: string }): string {
  return error.code === 'PGRST204' || error.code === '42703'
    ? 'Quest scheduling needs the context-aware database update (008).'
    : error.message;
}
