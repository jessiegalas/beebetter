import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import type { CompletionRecord } from '@/lib/quest-priority';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/supabase';
import { SessionFence, studentAccessMessage, VERIFICATION_MESSAGE, type AccountAccess } from '@/lib/account-access';
import * as Notifications from 'expo-notifications';
import {
  COMPLETE_QUEST_ACTION,
  configureQuestNotifications,
  scheduleQuestNotifications,
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

export type ProofFile = {
  uri: string;
  name: string;
  mimeType: string;
};

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
  beginAuthentication: () => boolean;
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
  levelProgress: LevelProgress;
  updateProfile: (updates: StudentProfileUpdates) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
  completeQuest: (questId: string, proof?: ProofFile) => Promise<{ success: boolean; error?: string }>;
  deleteQuest: (questId: string) => Promise<{ success: boolean; error?: string }>;
  addQuest: (quest: QuestDraft) => Promise<{ success: boolean; error?: string }>;
  updateQuest: (id: string, quest: QuestDraft) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

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
  const logoutTask = useRef<Promise<void> | null>(null);
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
  const [error, setError] = useState<string | null>(null);

  const clearUserData = useCallback(() => {
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
    completingQuests.current.clear();
  }, []);

  const endSession = useCallback((reason?: string): Promise<void> => {
    if (logoutTask.current) return logoutTask.current;
    fence.close();
    requestVersion.current += 1;
    sessionUser.current = null;
    clearUserData();
    setAccess(reason ? 'blocked' : 'signed_out');
    setAccessMessage(reason ?? null);
    setIsSigningOut(true);
    // Defer out of onAuthStateChange; never await Auth calls inside its lock.
    const task = Promise.resolve().then(async () => {
      const results = await Promise.allSettled([
        supabase.auth.signOut({ scope: reason ? 'local' : 'global' }).then(({ error }) => { if (error) throw error; }),
        cancelQuestNotifications(),
      ]);
      const authFailure = results[0].status === 'rejected';
      cleanupFailed.current = authFailure;
      if (authFailure) {
        setAccessMessage([reason, 'Sign-out could not finish. Your app access is locked. Retry sign-out before signing in again.'].filter(Boolean).join(' '));
        setAccess('blocked');
      }
      results.forEach(result => { if (result.status === 'rejected') console.warn('Session cleanup failed:', result.reason); });
    }).catch(() => {
      cleanupFailed.current = true;
      setAccess('blocked');
      setAccessMessage('Sign-out could not finish. Retry sign-out before signing in again.');
    }).finally(() => { logoutTask.current = null; setIsSigningOut(false); });
    logoutTask.current = task;
    return task;
  }, [clearUserData, fence]);

  const beginAuthentication = useCallback(() => {
    if (logoutTask.current || cleanupFailed.current) return false;
    fence.beginAuthentication();
    sessionUser.current = null;
    requestVersion.current += 1;
    clearUserData();
    setAccess('signed_out');
    setAccessMessage(null);
    return true;
  }, [clearUserData, fence]);

  const fetchUserData = useCallback(async (currentUser: User | null, showLoading = false) => {
    if (!fence.accept(currentUser?.id ?? null)) return;
    const isSessionCurrent = fence.capture();
    const version = ++requestVersion.current;
    const isCurrent = () => isSessionCurrent() && version === requestVersion.current;
    if (showLoading) setIsLoading(true);
    setError(null);

    if (!currentUser) {
      clearUserData();
      setAccess(current => current === 'blocked' ? current : 'signed_out');
      return;
    }

    try {
      // Admission is authoritative student data, never Auth metadata or a default.
      const { data: studentData, error: studentErr } = await supabase
        .from('students').select('*').eq('id', currentUser.id).maybeSingle();
      if (!isCurrent()) return;
      if (studentErr) throw studentErr;
      const denied = studentAccessMessage(studentData);
      if (denied) { await endSession(denied); return; }
      setUser(previous => previous?.id === currentUser.id ? previous : currentUser);
      setAccess('active');
      setAccessMessage(null);

      const { data: profileData, error: profileErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
      if (!isCurrent()) return;
      if (profileErr) console.warn('Could not fetch profile:', profileErr.message);
      const { data: calculatedStreak } = await supabase.rpc('student_get_current_streak');
      if (!isCurrent()) return;

      if (profileData || studentData) {
        setProfile({
          id: currentUser.id,
          display_name: profileData?.display_name ?? studentData?.name ?? null,
          student_number: studentData?.student_number ?? `LEGACY-${currentUser.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          name: studentData?.name ?? profileData?.display_name ?? currentUser.email?.split('@')[0] ?? 'Bee Explorer',
          email: studentData?.email ?? currentUser.email ?? '',
          course: studentData?.course ?? 'Undeclared',
          year_level: studentData?.year_level ?? 'Not specified',
          section: studentData?.section ?? 'Not specified',
          campus: studentData?.campus ?? 'Not specified',
          goal: studentData?.goal ?? '',
          status: 'Active',
          level: profileData?.level ?? 1,
          total_xp: profileData?.total_xp ?? 0,
          current_streak: typeof calculatedStreak === 'number' ? calculatedStreak : profileData?.current_streak ?? 0,
          created_at: profileData?.created_at ?? studentData?.created_at ?? new Date().toISOString(),
          updated_at: profileData?.updated_at ?? studentData?.updated_at ?? new Date().toISOString(),
        });
      }

      // Durable history supplements existing completed quests; old databases can still be read.
      const [{ data: historyData, error: historyError }, { data: progressData, error: progressError }] = await Promise.all([
        supabase.rpc('student_list_completion_history', { page_size: 100, page_offset: 0 }),
        supabase.rpc('student_progress_summary'),
      ]);
      if (!isCurrent()) return;
      if (historyError) console.warn('Could not fetch bounded completion history:', historyError.message);
      const historyRows = (historyData ?? []) as (CompletionRecord & { total_count: number })[];
      setCompletionHistory(historyRows);
      setCompletionHistoryHasMore(Number(historyRows[0]?.total_count ?? 0) > historyRows.length);
      if (!progressError && progressData?.[0]) {
        const value = progressData[0];
        setProgressSummary({ totalCompleted: Number(value.total_completed), byCategory: { Academics: Number(value.academics_completed), Habits: Number(value.habits_completed), Social: Number(value.social_completed), Health: Number(value.health_completed) } });
        setProfile(current => current ? { ...current, total_xp: Number(value.total_xp), level: Number(value.level), current_streak: Number(value.current_streak) } : current);
      }

      // 2. Fetch Quests
      const allCandidates: Quest[] = [];
      const candidatePageSize = 200;
      let candidateOffset = 0;
      let candidateError: { code?: string; message: string } | null = null;
      do {
        const { data, error } = await supabase.rpc('student_list_recommendation_candidates', {
          page_size: candidatePageSize, page_offset: candidateOffset,
        });
        if (error) { candidateError = error; break; }
        const page = (data ?? []) as Quest[];
        allCandidates.push(...page);
        candidateOffset += page.length;
        if (page.length < candidatePageSize) break;
      } while (isCurrent());

      if (!isCurrent()) return;
      if (candidateError) {
        setError(candidateError.code === 'PGRST202' ? 'Run Supabase migration 023 before loading recommendations.' : candidateError.message);
      } else {
        setQuests(allCandidates);
        setQuestsHasMore(false);
      }
    } catch {
      if (isCurrent()) {
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
  }, [clearUserData, endSession, fence]);

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
    let isMounted = true;
    let authEventReceived = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const receiveSession = (nextUser: User | null) => {
      if (!isMounted || !fence.accept(nextUser?.id ?? null)) return;
      const changed = sessionUser.current?.id !== nextUser?.id;
      sessionUser.current = nextUser;
      requestVersion.current += 1;
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
        if (isMounted && isCurrent()) void fetchUserData(nextUser, changed);
      }, 0);
      timers.add(timer);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      receiveSession(session?.user ?? null);
    });
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!isMounted || authEventReceived) return;
      if (error) throw error;
      receiveSession(session?.user ?? null);
    }).catch(() => {
      if (!isMounted || authEventReceived) return;
      clearUserData();
      setAccess('verification_error');
      setAccessMessage(VERIFICATION_MESSAGE);
    });
    return () => {
      isMounted = false;
      fence.invalidate();
      requestVersion.current += 1;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, [clearUserData, fetchUserData, fence]);

  const refresh = useCallback(async () => {
    const isCurrent = fence.capture();
    if (!isCurrent()) return;
    setIsRefreshing(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!isCurrent()) return;
      if (error) throw error;
      sessionUser.current = session?.user ?? null;
      await fetchUserData(sessionUser.current);
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

  const completeQuest = useCallback(async (questId: string, proof?: ProofFile): Promise<{ success: boolean; error?: string }> => {
    if (!user || !isAdmittedSession()) {
      return { success: false, error: 'User is not signed in.' };
    }
    const isCurrent = fence.capture(user.id);

    const targetQuest = quests.find((q) => q.id === questId);
    if (!targetQuest) {
      return { success: false, error: 'Quest not found.' };
    }

    if (targetQuest.status === 'completed') {
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    }

    if (targetQuest.requires_proof && !proof) {
      return { success: false, error: 'Attach a photo, video, or file as proof before completing this quest.' };
    }

    if (completingQuests.current.has(questId)) return { success: false, error: 'This quest is already being completed.' };
    completingQuests.current.add(questId);

    let proofPath: string | null = null;

    try {
      if (proof) {
        const extension = proof.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        proofPath = `${user.id}/${questId}/${Date.now()}.${extension}`;
        const response = await fetch(proof.uri);
        const fileBuffer = await response.arrayBuffer();
        if (!isCurrent()) return { success: false, error: 'Session ended.' };
        const { error: uploadError } = await supabase.storage
          .from('quest-proofs')
          .upload(proofPath, fileBuffer, { contentType: proof.mimeType, upsert: false });
        if (uploadError) throw uploadError;
      }

      if (!isCurrent()) return { success: false, error: 'Session ended.' };
      const { error: completionError } = await supabase.rpc('complete_quest', {
        quest_id_value: questId,
        proof_path_value: proofPath,
        proof_mime_type_value: proof?.mimeType ?? null,
      });
      if (completionError) {
        if (completionError.code === 'PGRST202') throw new Error('Quest completion needs the context-aware database update (008).');
        throw completionError;
      }
      // Refresh server timestamps, durable history and XP together.
      if (isCurrent()) await fetchUserData(user);
      return isCurrent() ? { success: true } : { success: false, error: 'Session ended.' };
    } catch (err) {
      if (proofPath && isCurrent()) {
        await supabase.storage.from('quest-proofs').remove([proofPath]).catch(() => {});
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to complete quest.',
      };
    } finally { if (isCurrent()) completingQuests.current.delete(questId); }
  }, [user, quests, fetchUserData, isAdmittedSession, fence]);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const isCurrent = fence.capture(user.id);
    let responseSubscription: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined;
    try {
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const action = response.actionIdentifier;
        const data = response.notification.request.content.data as { questId?: unknown };
        if (isCurrent() && action === COMPLETE_QUEST_ACTION && typeof data?.questId === 'string') {
          void completeQuest(data.questId).catch(error => console.warn('Notification action failed:', error));
        }
      });
    } catch (error) { console.warn('Notification listener unavailable:', error); }

    void configureQuestNotifications().then((configured) => {
      if (isMounted && isCurrent() && configured) {
        return scheduleQuestNotifications(quests, () => isMounted && isCurrent());
      }
      return undefined;
    }).catch(error => console.warn('Notification setup failed:', error));

    return () => {
      isMounted = false;
      try { responseSubscription?.remove(); }
      catch (error) { console.warn('Notification listener cleanup failed:', error); }
      void cancelQuestNotifications().catch(error => console.warn('Reminder cleanup failed:', error));
    };
  }, [user, quests, completeQuest, fence]);

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
      beginAuthentication,
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
      levelProgress,
      updateProfile,
      refresh,
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
      beginAuthentication,
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
      levelProgress,
      updateProfile,
      refresh,
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
