import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/supabase';

export type Category = 'Academics' | 'Habits' | 'Social' | 'Health';
export type QuestStatus = 'active' | 'completed' | 'rejected' | 'pending';

export type Quest = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: Category;
  xp: number;
  status: QuestStatus;
  is_nearby: boolean;
  created_at: string;
  updated_at: string;
};

export type UserProfile = {
  id: string;
  display_name: string | null;
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
  activeQuests: Quest[];
  completedQuests: Quest[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  levelProgress: LevelProgress;
  refresh: () => Promise<void>;
  completeQuest: (questId: string) => Promise<{ success: boolean; error?: string }>;
  deleteQuest: (questId: string) => Promise<{ success: boolean; error?: string }>;
  addQuest: (quest: {
    title: string;
    description?: string;
    category: Category;
    xp: number;
    is_nearby?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
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

      if (profileData) {
        setProfile(profileData as UserProfile);
      } else {
        // Fallback default profile if trigger hasn't fired yet
        const defaultProfile: UserProfile = {
          id: currentUser.id,
          display_name: currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Bee Explorer',
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

  const completeQuest = useCallback(async (questId: string): Promise<{ success: boolean; error?: string }> => {
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

    const previousQuests = [...quests];
    const previousProfile = profile ? { ...profile } : null;

    // Calculate updated XP and Level
    const earnedXp = targetQuest.xp || 25;
    const currentXp = profile?.total_xp ?? 0;
    const newTotalXp = currentXp + earnedXp;
    const { level: newLevel } = calculateLevel(newTotalXp);

    // Optimistic UI update
    setQuests((prev) =>
      prev.map((q) => (q.id === questId ? { ...q, status: 'completed' as const, updated_at: new Date().toISOString() } : q))
    );

    if (profile) {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              total_xp: newTotalXp,
              level: newLevel,
              updated_at: new Date().toISOString(),
            }
          : null
      );
    }

    try {
      // 1. Mark quest completed in Supabase
      const { error: questError } = await supabase
        .from('quests')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', questId);

      if (questError) throw questError;

      // 2. Update user profile in Supabase
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          total_xp: newTotalXp,
          level: newLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      return { success: true };
    } catch (err) {
      // Revert optimistic updates on failure
      setQuests(previousQuests);
      setProfile(previousProfile);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to complete quest.',
      };
    }
  }, [user, quests, profile]);

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

  const addQuest = useCallback(async (questData: {
    title: string;
    description?: string;
    category: Category;
    xp: number;
    is_nearby?: boolean;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'User is not signed in.' };

    try {
      const { data, error: insertError } = await supabase
        .from('quests')
        .insert({
          owner_id: user.id,
          title: questData.title.trim(),
          description: questData.description?.trim() || null,
          category: questData.category,
          xp: questData.xp,
          is_nearby: Boolean(questData.is_nearby),
          status: 'active',
        })
        .select('*')
        .single();

      if (insertError) throw insertError;
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setQuests([]);
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
      activeQuests,
      completedQuests,
      isLoading,
      isRefreshing,
      error,
      levelProgress,
      refresh,
      completeQuest,
      deleteQuest,
      addQuest,
      signOut,
    }),
    [
      user,
      profile,
      quests,
      activeQuests,
      completedQuests,
      isLoading,
      isRefreshing,
      error,
      levelProgress,
      refresh,
      completeQuest,
      deleteQuest,
      addQuest,
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

