import type { Category, QuestStatus } from '../context/user-data-context';
import type { RankedQuest } from './quest-priority';
import { timestamp } from './quest-time';

export type QuestFilters = {
  category: Category | null;
  status: QuestStatus | 'all';
  nearby: boolean;
  time: 'all' | 'today' | 'overdue' | 'scheduled' | 'anytime';
};
export const DEFAULT_FILTERS: QuestFilters = { category: null, status: 'all', nearby: false, time: 'all' };
export function activeFilterCount(filters: QuestFilters) {
  return Number(filters.category !== null) + Number(filters.status !== 'all') + Number(filters.nearby) + Number(filters.time !== 'all');
}
export function recommendedQuests(ranked: RankedQuest[]) {
  const completed = new Set(ranked.filter(item => item.quest.status === 'completed').map(item => item.quest.id));
  return ranked.filter(({ quest }) => (quest.status === 'active' || quest.status === 'rejected') &&
    (!quest.prerequisite_quest_id || completed.has(quest.prerequisite_quest_id)));
}
export function filterAllQuests(ranked: RankedQuest[], filters: QuestFilters, now: number) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return ranked.filter(({ quest, nearby }) => {
    if (filters.category !== null && quest.category !== filters.category) return false;
    if (filters.status !== 'all' && quest.status !== filters.status) return false;
    if (filters.nearby && !nearby) return false;
    const scheduled = timestamp(quest.scheduled_at), deadline = timestamp(quest.deadline_at);
    const preferred = !!quest.preferred_time && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(quest.preferred_time);
    const hasTime = scheduled !== null || deadline !== null || preferred;
    if (filters.time === 'scheduled') return hasTime;
    if (filters.time === 'anytime') return !hasTime;
    if (filters.time === 'overdue') return deadline !== null && deadline < now && (quest.status === 'active' || quest.status === 'rejected');
    if (filters.time === 'today') return preferred || [scheduled, deadline].some(time => time !== null && time >= start.getTime() && time < end.getTime());
    return true;
  }).sort((a, b) => b.quest.created_at.localeCompare(a.quest.created_at) || a.quest.id.localeCompare(b.quest.id));
}
