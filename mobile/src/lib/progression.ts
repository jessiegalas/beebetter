// Pure progression definitions shared by mobile screens and tests.
// Keep this module free of React Native, Supabase, theme, and environment imports.

export const XP_PER_LEVEL = 100;

export type LevelProgress = {
  level: number;
  currentLevelXp: number;
  xpForNextLevel: number;
  progressPercent: number;
};

export function calculateLevel(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, totalXp);
  const level = Math.max(1, Math.floor(safeXp / XP_PER_LEVEL) + 1);
  const currentLevelXp = Math.max(0, safeXp % XP_PER_LEVEL);
  const xpForNextLevel = XP_PER_LEVEL;
  const progressPercent = Math.min(100, Math.round((currentLevelXp / xpForNextLevel) * 100));
  return { level, currentLevelXp, xpForNextLevel, progressPercent };
}

export type Milestone = {
  id: string;
  xp: number;
  label: string;
  level: number;
};

const EARLY_MILESTONE_XP = [25, 50, 75, 100, 125, 150] as const;

function milestoneAt(index: number): Milestone {
  const xp = index < EARLY_MILESTONE_XP.length
    ? EARLY_MILESTONE_XP[index]
    // After the early ladder, milestones follow level boundaries: Level 3 at
    // 200 XP, Level 4 at 300 XP, and so on without an upper cap.
    : (index - EARLY_MILESTONE_XP.length + 2) * XP_PER_LEVEL;
  return {
    id: `xp-${xp}`,
    xp,
    label: `${xp} XP`,
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
  };
}

export function countReachedMilestones(totalXp: number): number {
  const safeXp = Math.max(0, totalXp);
  const early = EARLY_MILESTONE_XP.filter(xp => safeXp >= xp).length;
  const levelBoundaries = Math.max(0, Math.floor(safeXp / XP_PER_LEVEL) - 1);
  return early + levelBoundaries;
}

export function nextMilestone(totalXp: number): Milestone {
  return milestoneAt(countReachedMilestones(totalXp));
}

/** Return a stable-size window around the current position. The window always
 * includes upcoming milestones because the level-boundary ladder is unbounded. */
export function milestoneWindow(totalXp: number, size = 6): Milestone[] {
  const windowSize = Math.max(1, Math.floor(size));
  const reached = countReachedMilestones(totalXp);
  const start = Math.max(0, reached - Math.floor(windowSize / 2));
  return Array.from({ length: windowSize }, (_, offset) => milestoneAt(start + offset));
}

export const CORE_BRANCHES = ['Academics', 'Habits', 'Social', 'Health'] as const;
export type CoreBranch = (typeof CORE_BRANCHES)[number];

export type BranchProgress = LevelProgress & {
  category: string;
  xp: number;
  completed: number;
};

/** Merge database-attributed category XP with completion counts. Core branches
 * always render; custom branches remain first-class and appear only once used. */
export function branchProgressList(
  xpByCategory: Record<string, number> = {},
  completedByCategory: Record<string, number> = {},
): BranchProgress[] {
  const core: readonly string[] = CORE_BRANCHES;
  const custom = Array.from(new Set([...Object.keys(xpByCategory), ...Object.keys(completedByCategory)]))
    .filter(category => !core.includes(category)
      && ((xpByCategory[category] ?? 0) > 0 || (completedByCategory[category] ?? 0) > 0))
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return [...CORE_BRANCHES, ...custom].map(category => {
    const xp = Math.max(0, xpByCategory[category] ?? 0);
    return {
      category,
      xp,
      completed: Math.max(0, completedByCategory[category] ?? 0),
      ...calculateLevel(xp),
    };
  });
}

export type AchievementIcon = 'sparkles' | 'trophy' | 'star' | 'flame' | 'ribbon';

export type AchievementStats = {
  questsCompleted: number;
  level: number;
  currentStreak: number;
};

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  icon: AchievementIcon;
  unlocked: (stats: AchievementStats) => boolean;
};

export type AchievementStatus = Omit<AchievementDefinition, 'unlocked'> & { unlocked: boolean };

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first_quest', title: 'First Flight', description: 'Complete 1 quest', icon: 'sparkles', unlocked: stats => stats.questsCompleted >= 1 },
  { id: 'five_quests', title: 'Busy Worker', description: 'Complete 5 quests', icon: 'trophy', unlocked: stats => stats.questsCompleted >= 5 },
  { id: 'level_2', title: 'Hive Rising', description: 'Reach Level 2', icon: 'star', unlocked: stats => stats.level >= 2 },
  { id: 'streak_3', title: 'On A Roll', description: 'Reach a 3-day streak', icon: 'flame', unlocked: stats => stats.currentStreak >= 3 },
  { id: 'level_5', title: 'Master Pollinator', description: 'Reach Level 5', icon: 'ribbon', unlocked: stats => stats.level >= 5 },
];

export function evaluateAchievements(stats: AchievementStats): AchievementStatus[] {
  return ACHIEVEMENTS.map(({ unlocked, ...definition }) => ({ ...definition, unlocked: unlocked(stats) }));
}
