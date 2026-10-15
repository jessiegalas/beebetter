import type { Quest } from '../context/user-data-context';
import { isStoredPreferredTime, timestamp } from './quest-time';
import { factMatches, isFresh, type RecommendationFact } from './recommendation-facts';
import { FALLBACK_REASON, formatRecommendationEvidence, meaningfulGoalTerms, type EvidenceCode, type RecommendationEvidence } from './recommendation-reasons';
export type CompletionRecord = { id: string; quest_id: string | null; title: string; category: Quest['category']; completed_at: string };
export type ContextPlace = { id: string; name: string; latitude: number; longitude: number; radius: number; is_active: boolean };
export type Position = { latitude: number; longitude: number; accuracy?: number | null };
export type RecommendationContext = {
  checkIn: { check_in_date: string; overall_wellbeing: number; stress_level: number; energy_level: number; motivation_level: number | null } | null;
  reflection: { quest_id: string | null; period_end: string; planning_score: number; follow_through_score: number; confidence_score: number } | null;
};
export type PriorityContext = {
  now: number; coords: Position | null; locationUpdatedAt: number | null; places: ContextPlace[];
  history: CompletionRecord[]; facts: RecommendationFact[];
  candidatesUpdatedAt: number | null; factsUpdatedAt: number | null; profileUpdatedAt: number | null; placesUpdatedAt: number | null;
  geofenceEvents?: Record<string, { inside: boolean; timestamp: number }>;
  wellness?: RecommendationContext | null; personalGoal?: string | null;
};
export type RecommendationReasonCode = EvidenceCode;
export type QuestTier = 'now' | 'next' | 'other' | 'history';
export type PrerequisiteState = 'none' | 'completed' | 'incomplete' | 'unknown';
export type RankedQuest = {
  quest: Quest; tier: QuestTier; reasons: string[]; constraints: string[]; evidence: RecommendationEvidence[];
  reasonCodes: RecommendationReasonCode[]; prerequisiteState: PrerequisiteState; fresh: boolean;
  locked: boolean; nearby: boolean; distance: number | null; score: number;
};
const MINUTE = 60_000, DAY = 1440 * MINUTE;
export const LOCATION_MAX_AGE = 5 * MINUTE;
export const TIER_LABELS: Record<QuestTier, string> = { now: 'Recommended now', next: 'Upcoming', other: 'Other options', history: 'Review & completed' };
export const TIER_ORDER: QuestTier[] = ['now', 'next', 'other', 'history'];
export function validPosition(p: Position): boolean {
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 &&
    (p.accuracy == null || (Number.isFinite(p.accuracy) && p.accuracy >= 0));
}
export function distanceMeters(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function hasFreshPosition(c: Pick<PriorityContext, 'coords' | 'locationUpdatedAt' | 'now'>): boolean {
  return !!c.coords && validPosition(c.coords) && isFresh(c.locationUpdatedAt, c.now);
}
/** Candidates remain browsable; authoritative facts establish prerequisite eligibility. */
export function prioritizeQuests(quests: Quest[], c: PriorityContext): RankedQuest[] {
  const places = new Map(c.places.map(p => [p.id, p]));
  const facts = new Map((c.facts ?? []).map(f => [f.quest_id, f]));
  const goalTerms = new Set(isFresh(c.profileUpdatedAt, c.now) ? meaningfulGoalTerms(c.personalGoal ?? '') : []);
  const ranked = quests.map((quest): RankedQuest => {
    let score = 8, nearby = false, distance: number | null = null;
    const evidence: RecommendationEvidence[] = [];
    const add = (contribution: number, code: EvidenceCode, values: RecommendationEvidence['values'] = {}, kind: RecommendationEvidence['kind'] = contribution < 0 ? 'constraint' : 'positive') => {
      score += contribution; evidence.push({ contribution, code, values, kind });
    };
    const fact = facts.get(quest.id);
    const factsValid = isFresh(c.factsUpdatedAt, c.now) && factMatches(quest, fact);
    const fresh = isFresh(c.candidatesUpdatedAt, c.now) && factsValid;
    const prerequisiteState: PrerequisiteState = !quest.prerequisite_quest_id ? 'none' : !factsValid || !fact?.prerequisite_status ? 'unknown' : fact.prerequisite_status === 'completed' ? 'completed' : 'incomplete';
    const locked = prerequisiteState === 'incomplete' || prerequisiteState === 'unknown';
    if (!isFresh(c.candidatesUpdatedAt, c.now)) add(0, 'data_stale', {}, 'constraint');
    if (!factsValid) add(0, 'facts_unknown', {}, 'constraint');
    if (locked) add(prerequisiteState === 'incomplete' ? -35 : 0, prerequisiteState === 'incomplete' ? 'prerequisite_incomplete' : 'prerequisite_unknown', { title: fact?.prerequisite_title ?? undefined }, 'constraint');
    let locationConflict = false;
    if (quest.location_id) {
      const place = places.get(quest.location_id), event = c.geofenceEvents?.[quest.location_id];
      const usableGPS = !!place && hasFreshPosition(c) && !!c.coords && (c.coords.accuracy == null || c.coords.accuracy <= Math.max(place.radius, 150));
      if (!place?.is_active || !validPosition(place) || !Number.isFinite(place.radius) || place.radius < 0 || !isFresh(c.placesUpdatedAt, c.now)) {
        locationConflict = true; add(0, place && !place.is_active ? 'place_inactive' : 'location_unknown', {}, 'constraint');
      } else if (event && isFresh(event.timestamp, c.now) && event.timestamp > (usableGPS ? c.locationUpdatedAt ?? 0 : 0)) {
        if (event.inside === true) { nearby = true; add(32, 'location_at', { place: place.name }); }
        else { locationConflict = true; add(-8, 'location_outside'); }
      } else if (usableGPS && c.coords) {
        distance = distanceMeters(c.coords, place); nearby = distance <= place.radius + 500;
        if (distance <= place.radius) add(32, 'location_at', { place: place.name });
        else if (nearby) add(14 + 14 * (1 - (distance - place.radius) / 500), 'location_nearby', { place: place.name });
        else { locationConflict = true; add(-20, 'location_away'); }
      } else { locationConflict = true; add(0, 'location_unknown', {}, 'constraint'); }
    }
    const deadline = timestamp(quest.deadline_at), due = deadline === null ? null : (deadline - c.now) / MINUTE;
    if (due !== null) {
      if (due < 0) add(46, 'deadline_overdue', { at: quest.deadline_at! });
      else if (due <= 120) add(40, 'deadline_soon', { at: quest.deadline_at! });
      else if (due <= 1440) add(24, 'deadline_day', { at: quest.deadline_at! });
      else if (due <= 4320) add(10, 'deadline_days', { at: quest.deadline_at! });
    }
    let timeMatch = false, futureSchedule = false;
    const scheduled = timestamp(quest.scheduled_at);
    if (scheduled !== null) {
      const minutes = (scheduled - c.now) / MINUTE;
      futureSchedule = minutes > 30;
      if (minutes >= -60 && minutes <= 30) { add(36, 'schedule_now', { at: quest.scheduled_at! }); timeMatch = true; }
      else if (minutes > 30 && minutes <= 120) { add(26, 'schedule_soon', { at: quest.scheduled_at! }); add(0, 'schedule_later', { at: quest.scheduled_at! }, 'constraint'); }
      else if (minutes > 120) add(-12, 'schedule_later', { at: quest.scheduled_at! });
      else add(8, 'schedule_earlier', { at: quest.scheduled_at! });
    } else if (isStoredPreferredTime(quest.preferred_time)) {
      const [h, m] = quest.preferred_time.split(':').map(Number), date = new Date(c.now);
      const diff = (h * 60 + m - date.getHours() * 60 - date.getMinutes() + 1440) % 1440;
      if (diff <= 30 || diff >= 1380) { add(32, 'preferred_now', { at: quest.preferred_time }); timeMatch = true; }
      else if (diff <= 120) add(22, 'preferred_soon', { at: quest.preferred_time });
      else add(-8, 'preferred_outside', { at: quest.preferred_time });
    }
    if (nearby && timeMatch) add(12, 'location_time');
    if (quest.importance === 'high') add(14, 'importance_high');
    else if (quest.importance === 'low') add(-5, 'importance_low');
    if (factsValid && fact) {
      const activity = timestamp(fact.latest_activity_at), category = timestamp(fact.latest_category_at);
      const latest = activity ?? category;
      if (latest !== null && latest <= c.now) {
        const days = (c.now - latest) / DAY;
        if (days >= 3) add(Math.min(14, 6 + days), activity !== null ? 'activity_gap' : 'activity_variety', { at: new Date(latest).toISOString(), category: quest.category });
        else if (days < .25 && activity !== null) add(-12, 'activity_recent', { at: fact.latest_activity_at! });
      }
    }
    const created = timestamp(quest.created_at);
    if (created !== null) { const age = Math.min(6, Math.max(0, (c.now - created) / DAY)); if (age > 0) add(age, 'quest_age'); }
    const count = quests.filter(q => q.prerequisite_quest_id === quest.id && (q.status === 'active' || q.status === 'rejected')).length;
    if (count) add(Math.min(12, count * 6), 'unlocks_quest', { count });
    const term = meaningfulGoalTerms(quest.title + ' ' + (quest.description ?? '') + ' ' + quest.category).find(word => goalTerms.has(word));
    if (term) add(5, 'goal_alignment', { term });
    const active = quest.status === 'active';
    let tier: QuestTier = 'other';
    if (quest.status === 'completed' || quest.status === 'pending') tier = 'history';
    else if (active && !locked && fresh && !locationConflict && !futureSchedule && score >= 35) tier = 'now';
    else if (active && !locked && (futureSchedule || score >= 18)) tier = 'next';
    // Dormant numeric wellness adjustments stay within the established tier.
    const check = c.wellness?.checkIn, reflection = c.wellness?.reflection;
    const checkAt = check ? timestamp(check.check_in_date + 'T23:59:59') : null;
    const reflectionAt = reflection ? timestamp(reflection.period_end + 'T23:59:59') : null;
    const recentCheck = checkAt !== null && checkAt >= c.now - 36 * 60 * MINUTE && checkAt <= c.now + DAY ? check : null;
    const recentReflection = reflectionAt !== null && reflectionAt >= c.now - 14 * DAY && reflectionAt <= c.now + DAY ? reflection : null;
    if (active && recentReflection?.quest_id === quest.id) add(6, 'reflection_related');
    else if (active && quest.xp <= 30 && ((recentCheck && (recentCheck.energy_level <= 2 || recentCheck.stress_level >= 4 || recentCheck.overall_wellbeing <= 2 || (recentCheck.motivation_level != null && recentCheck.motivation_level <= 2))) || (recentReflection && !recentReflection.quest_id && Math.min(recentReflection.planning_score, recentReflection.follow_through_score, recentReflection.confidence_score) <= 2))) add(4, 'manageable_step');
    else if (active && recentCheck?.motivation_level != null && recentCheck.motivation_level >= 4 && quest.importance === 'high') add(3, 'reported_momentum');
    const positive = evidence.filter(e => e.kind === 'positive').sort((a, b) => b.contribution - a.contribution);
    const reasons = positive.filter(e => e.code !== 'quest_age' || e.contribution >= 1).slice(0, 3).map(formatRecommendationEvidence);
    if (!reasons.length) reasons.push(quest.status === 'completed' ? 'Completed' : quest.status === 'pending' ? 'Pending review' : FALLBACK_REASON);
    const constraints = evidence.filter(e => e.kind === 'constraint').map(formatRecommendationEvidence);
    return { quest, tier, reasons, constraints, evidence, reasonCodes: [...new Set(evidence.map(e => e.code))], prerequisiteState, fresh, locked, nearby, distance, score };
  });
  return ranked.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.score - a.score || a.quest.created_at.localeCompare(b.quest.created_at) || a.quest.id.localeCompare(b.quest.id));
}
