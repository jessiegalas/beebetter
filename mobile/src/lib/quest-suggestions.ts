import type { Category } from '@/context/user-data-context';
import type { Ionicons } from '@expo/vector-icons';

export type SuggestedQuest = {
  id: string;
  title: string;
  description?: string | null;
  category: Category;
  xp: number;
  icon: keyof typeof Ionicons.glyphMap;
  is_nearby?: boolean;
  reason: { text: string; icon: keyof typeof Ionicons.glyphMap };
};

const TEMPLATE_POOL: Omit<SuggestedQuest, 'reason' | 'id'>[] = [
  { title: 'Morning Run', category: 'Health', xp: 50, icon: 'walk-outline' },
  { title: 'Healthy Breakfast', category: 'Health', xp: 20, icon: 'restaurant-outline' },
  { title: 'Read a Chapter', category: 'Academics', xp: 30, icon: 'book-outline' },
  { title: 'Call a Friend', category: 'Social', xp: 20, icon: 'call-outline' },
  { title: 'Drink Water', category: 'Health', xp: 10, icon: 'water-outline' },
  { title: 'Study Session', category: 'Academics', xp: 40, icon: 'school-outline' },
  { title: 'Tidy Room', category: 'Habits', xp: 25, icon: 'home-outline' },
  { title: 'Deep Work', category: 'Academics', xp: 50, icon: 'briefcase-outline' },
  { title: 'Meditation', category: 'Health', xp: 20, icon: 'leaf-outline' },
  { title: 'Gym Workout', category: 'Health', xp: 60, icon: 'barbell-outline' },
];


/** Creation ideas only. Saved quests are ranked by quest-priority.ts using live context. */
export function getQuestIdeas(): SuggestedQuest[] {
  return TEMPLATE_POOL.map((template, index) => ({
    ...template,
    id: `template-${index}`,
    reason: { text: `${template.category} quest`, icon: 'add-circle-outline' },
  }));
}
