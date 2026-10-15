import type { Quest, QuestStatus } from '../context/user-data-context';
export const CONTEXT_MAX_AGE = 300_000;
export type RecommendationFact = {
  quest_id: string; status: QuestStatus; updated_at: string;
  prerequisite_quest_id: string | null; prerequisite_status: QuestStatus | null; prerequisite_title: string | null;
  latest_activity_at: string | null; latest_category_at: string | null;
};
export type RecommendationData = {
  facts: RecommendationFact[]; candidatesUpdatedAt: number | null; factsUpdatedAt: number | null;
  profileUpdatedAt: number | null; error: string | null;
};
export const EMPTY_RECOMMENDATION_DATA: RecommendationData = {
  facts: [], candidatesUpdatedAt: null, factsUpdatedAt: null, profileUpdatedAt: null, error: null,
};
export function isFresh(at: number | null | undefined, now: number): boolean {
  return at != null && Number.isFinite(at) && now >= at && now - at <= CONTEXT_MAX_AGE;
}
export function factMatches(q: Quest, f: RecommendationFact | undefined): f is RecommendationFact {
  return !!f && f.quest_id === q.id && f.status === q.status && f.updated_at === q.updated_at &&
    f.prerequisite_quest_id === (q.prerequisite_quest_id ?? null);
}
