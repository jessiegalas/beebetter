import { Quest, Category } from '@/context/user-data-context';
import { Ionicons } from '@expo/vector-icons';

export type SuggestionReason = 
  | { type: 'time'; text: string; icon: keyof typeof Ionicons.glyphMap }
  | { type: 'location'; text: string; icon: keyof typeof Ionicons.glyphMap }
  | { type: 'recency'; text: string; icon: keyof typeof Ionicons.glyphMap }
  | { type: 'streak'; text: string; icon: keyof typeof Ionicons.glyphMap };

export type SuggestedQuest = {
  id: string | number;
  title: string;
  description?: string | null;
  category: Category;
  xp: number;
  icon: keyof typeof Ionicons.glyphMap;
  reason: SuggestionReason;
  is_nearby?: boolean;
};

const TEMPLATE_POOL: Omit<SuggestedQuest, 'reason' | 'id'>[] = [
  { title: 'Morning Run', category: 'Health', xp: 50, icon: 'walk-outline', is_nearby: true },
  { title: 'Healthy Breakfast', category: 'Health', xp: 20, icon: 'restaurant-outline' },
  { title: 'Read a Chapter', category: 'Academics', xp: 30, icon: 'book-outline' },
  { title: 'Call a Friend', category: 'Social', xp: 20, icon: 'call-outline' },
  { title: 'Drink Water', category: 'Health', xp: 10, icon: 'water-outline' },
  { title: 'Study Session', category: 'Academics', xp: 40, icon: 'school-outline', is_nearby: true },
  { title: 'Tidy Room', category: 'Habits', xp: 25, icon: 'home-outline' },
  { title: 'Deep Work', category: 'Academics', xp: 50, icon: 'briefcase-outline' },
  { title: 'Meditation', category: 'Health', xp: 20, icon: 'leaf-outline' },
  { title: 'Gym Workout', category: 'Health', xp: 60, icon: 'barbell-outline', is_nearby: true },
];

export function getSmartSuggestions(
  allQuests: Quest[],
  currentLocationName?: string | null
): SuggestedQuest[] {
  const suggestions: SuggestedQuest[] = [];
  const now = new Date();
  const hour = now.getHours();

  // 1. Time-based logic
  let timeReason: SuggestionReason | null = null;
  if (hour >= 5 && hour < 11) {
    timeReason = { type: 'time', text: 'Great for your morning', icon: 'sunny-outline' };
  } else if (hour >= 11 && hour < 17) {
    timeReason = { type: 'time', text: 'Productive afternoon', icon: 'partly-sunny-outline' };
  } else if (hour >= 17 && hour < 22) {
    timeReason = { type: 'time', text: 'Evening wind-down', icon: 'moon-outline' };
  } else {
    timeReason = { type: 'time', text: 'Night owl session', icon: 'star-outline' };
  }

  // 2. Location-based logic
  if (currentLocationName) {
    const locQuest = TEMPLATE_POOL.find(t => t.is_nearby && t.title.toLowerCase().includes(currentLocationName.toLowerCase()));
    if (locQuest) {
      suggestions.push({
        ...locQuest,
        id: 'loc-1',
        reason: { type: 'location', text: `You're at ${currentLocationName}`, icon: 'location' }
      });
    }
  }

  // 3. Recency-based logic ("You haven't done X in a while")
  const categories: Category[] = ['Health', 'Academics', 'Social', 'Habits'];
  categories.forEach(cat => {
    const lastQuestOfCat = allQuests
      .filter(q => q.category === cat && q.status === 'completed')
      .sort((a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime())[0];

    if (lastQuestOfCat) {
      const daysSince = (now.getTime() - new Date(lastQuestOfCat.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 3) {
        const recencyQuest = TEMPLATE_POOL.find(t => t.category === cat && !suggestions.find(s => s.title === t.title));
        if (recencyQuest) {
          suggestions.push({
            ...recencyQuest,
            id: `recency-${cat}`,
            reason: { type: 'recency', text: `Haven't done ${cat} in ${Math.floor(daysSince)} days`, icon: 'alert-circle-outline' }
          });
        }
      }
    }
  });

  // 4. Fill remaining with time-based suggestions
  TEMPLATE_POOL.forEach((template, index) => {
    if (suggestions.length >= 5) return;
    if (suggestions.find(s => s.title === template.title)) return;

    // Filter by time of day for variety
    const isMorningQuest = ['Morning Run', 'Healthy Breakfast', 'Meditation'].includes(template.title);
    const isEveningQuest = ['Tidy Room', 'Read a Chapter', 'Reflect'].includes(template.title);

    if (hour < 12 && isMorningQuest) {
        suggestions.push({ ...template, id: `time-${index}`, reason: timeReason! });
    } else if (hour > 18 && isEveningQuest) {
        suggestions.push({ ...template, id: `time-${index}`, reason: timeReason! });
    } else if (suggestions.length < 3) {
        // Fallback for general templates
        suggestions.push({ ...template, id: `gen-${index}`, reason: timeReason! });
    }
  });

  return suggestions;
}
