import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import type { CompletionRecord } from '@/lib/quest-priority';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/supabase';
import * as Notifications from 'expo-notifications';
import {
  COMPLETE_QUEST_ACTION,
  configureQuestNotifications,
  scheduleQuestNotifications,
} from '@/lib/quest-notifications';

export type Category = 'Academics' | 'Habits' | 'Social' | 'Health';
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
  is_nearby?: boolean; location_id?: string | null; requires_proof?: boolean;
};

export type Quest = QuestContextFields & {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: Category;
  xp: number;
  status: QuestStatus;
  is_nearby: boolean;
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
  profile: UserProfile | null;
  quests: Quest[];
  completionHistory: CompletionRecord[];
  activeQuests: Quest[];
  completedQuests: Quest[];
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [completionHistory, setCompletionHistory] = useState<CompletionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = useCallback(async (currentUser: User | null, showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);

    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setQuests([]);
      setCompletionHistory([]);
      setIsLoading(false);
      return;
    }

    setUser(currentUser);

    try {
      // 1. Fetch Profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileErr) {
        console.warn('Could not fetch profile:', profileErr.message);
      }

      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (studentErr) {
        console.warn('Could not fetch student information:', studentErr.message);
      }

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
          status: studentData?.status ?? 'Active',
          level: profileData?.level ?? 1,
          total_xp: profileData?.total_xp ?? 0,
          current_streak: profileData?.current_streak ?? 1,
          created_at: profileData?.created_at ?? studentData?.created_at ?? new Date().toISOString(),
          updated_at: profileData?.updated_at ?? studentData?.updated_at ?? new Date().toISOString(),
        });
      } else {
        // Fallback default profile if trigger hasn't fired yet
        const defaultProfile: UserProfile = {
          id: currentUser.id,
          display_name: currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Bee Explorer',
          student_number: `LEGACY-${currentUser.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          name: currentUser.user_metadata?.name || currentUser.user_metadata?.display_name || 'Bee Explorer',
          email: currentUser.email || '',
          course: 'Undeclared',
          year_level: 'Not specified',
          section: 'Not specified',
          campus: 'Not specified',
          goal: '',
          status: 'Active',
          level: 1,
          total_xp: 0,
          current_streak: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Try upserting default profile
        const { data: createdProfile } = await supabase
          .from('profiles')
          .upsert(defaultProfile, { onConflict: 'id' })
          .select('*')
          .maybeSingle();

        setProfile((createdProfile as UserProfile) ?? defaultProfile);
      }

      // Durable history supplements existing completed quests; old databases can still be read.
      const { data: historyData } = await supabase.from('quest_completion_history')
        .select('id,quest_id,title,category,completed_at').eq('owner_id', currentUser.id)
        .order('completed_at', { ascending: false }).limit(1000);
      setCompletionHistory((historyData as CompletionRecord[]) ?? []);

      // 2. Fetch Quests
      const { data: questsData, error: questsErr } = await supabase
        .from('quests')
        .select('*')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (questsErr) {
        setError(questsErr.code === '42P01' ? 'Run the Supabase SQL migration before loading quests.' : questsErr.message);
      } else if (questsData) {
        setQuests(questsData as Quest[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const updateProfile = useCallback(async (updates: StudentProfileUpdates) => {
    if (!user) return { success: false, error: 'User is not signed in.' };

    const { data, error: studentError } = await supabase
      .from('students')
      .update({ ...updates, email: profile?.email ?? user.email ?? '', updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('*')
      .single();

    if (studentError) {
      return { success: false, error: studentError.message };
    }

    setProfile((current) => current ? { ...current, ...data, display_name: data.name } : current);
    await supabase.from('profiles').update({ display_name: data.name, updated_at: new Date().toISOString() }).eq('id', user.id);
    return { success: true };
  }, [profile?.email, user]);

  useEffect(() => {
    let isMounted = true;

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      void fetchUserData(session?.user ?? null, true);
    });

    // Listen to real-time auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      void fetchUserData(session?.user ?? null, false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetchUserData(session?.user ?? null, false);
  }, [fetchUserData]);

  const completeQuest = useCallback(async (questId: string, proof?: ProofFile): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'User is not signed in.' };
    }

    const targetQuest = quests.find((q) => q.id === questId);
    if (!targetQuest) {
      return { success: false, error: 'Quest not found.' };
    }

    if (targetQuest.status === 'completed') {
      return { success: true };
    }

    if (targetQuest.requires_proof && !proof) {
      return { success: false, error: 'Attach a photo, video, or file as proof before completing this quest.' };
    }

    const previousQuests = [...quests];
    const previousProfile = profile ? { ...profile } : null;

    let proofPath: string | null = null;

    try {
      if (proof) {
        const extension = proof.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        proofPath = `${user.id}/${questId}/${Date.now()}.${extension}`;
        const response = await fetch(proof.uri);
        const fileBuffer = await response.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from('quest-proofs')
          .upload(proofPath, fileBuffer, { contentType: proof.mimeType, upsert: false });
        if (uploadError) throw uploadError;
      }

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
      await fetchUserData(user);
      return { success: true };
    } catch (err) {
      // Revert optimistic updates on failure
      setQuests(previousQuests);
      setProfile(previousProfile);
      if (proofPath) {
        await supabase.storage.from('quest-proofs').remove([proofPath]);
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to complete quest.',
      };
    }
  }, [user, quests, profile, fetchUserData]);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const action = response.actionIdentifier;
      const data = response.notification.request.content.data as { questId?: unknown };
      if (action === COMPLETE_QUEST_ACTION && typeof data.questId === 'string') {
        void completeQuest(data.questId);
      }
    });

    void configureQuestNotifications().then((configured) => {
      if (isMounted && configured) {
        return scheduleQuestNotifications(quests);
      }
      return undefined;
    });

    return () => {
      isMounted = false;
      responseSubscription.remove();
    };
  }, [user, quests, completeQuest]);

  const deleteQuest = useCallback(async (questId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'User is not signed in.' };

    const previousQuests = [...quests];
    // Optimistic removal
    setQuests((prev) => prev.filter((q) => q.id !== questId));

    try {
      const { error: delError } = await supabase.from('quests').delete().eq('id', questId);
      if (delError) throw delError;
      return { success: true };
    } catch (err) {
      setQuests(previousQuests);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete quest.',
      };
    }
  }, [user, quests]);

  const addQuest = useCallback(async (questData: QuestDraft): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'User is not signed in.' };

    try {
      const questInsert = {
        owner_id: user.id,
        title: questData.title.trim(),
        description: questData.description?.trim() || null,
        category: questData.category,
        xp: questData.xp,
        is_nearby: Boolean(questData.is_nearby),
        location_id: questData.location_id ?? null,
        status: 'active' as const,
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
      if (data) {
        setQuests((prev) => [data as Quest, ...prev]);
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create quest.',
      };
    }
  }, [user]);

  const updateQuest = useCallback(async (id: string, draft: QuestDraft) => {
    if (!user) return { success: false, error: 'User is not signed in.' };
    const { data, error: updateError } = await supabase.from('quests').update({
      title: draft.title.trim(), description: draft.description?.trim() || null,
      category: draft.category, location_id: draft.location_id ?? null,
      is_nearby: Boolean(draft.location_id), requires_proof: Boolean(draft.requires_proof),
      ...contextPayload(draft), updated_at: new Date().toISOString(),
    }).eq('id', id).eq('owner_id', user.id).neq('status', 'completed').select('*').single();
    if (updateError) return { success: false, error: databaseQuestError(updateError) };
    setQuests(previous => previous.map(q => q.id === id ? data as Quest : q));
    return { success: true };
  }, [user]);

  // Refresh remote edits and approvals even when Realtime isn't enabled in Supabase.
  useEffect(() => {
    if (!user) return;
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void fetchUserData(user);
    }, 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void fetchUserData(user);
    });
    return () => { clearInterval(poll); subscription.remove(); };
  }, [user, fetchUserData]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setQuests([]);
      setCompletionHistory([]);
  }, []);

  const activeQuests = useMemo(() => quests.filter((q) => q.status === 'active'), [quests]);
  const completedQuests = useMemo(() => quests.filter((q) => q.status === 'completed'), [quests]);

  const levelProgress = useMemo(() => {
    return calculateLevel(profile?.total_xp ?? 0);
  }, [profile?.total_xp]);

  const value = useMemo(
    () => ({
      user,
      profile,
      quests,
      completionHistory,
      activeQuests,
      completedQuests,
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
      profile,
      quests,
      completionHistory,
      activeQuests,
      completedQuests,
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
