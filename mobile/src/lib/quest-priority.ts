import type { Quest } from '../context/user-data-context';
import { timestamp } from './quest-time';

export type CompletionRecord = {
  id: string;
  quest_id: string | null;
  title: string;
  category: Quest['category'];
  completed_at: string;
};

export type ContextPlace = {
  id: string; name: string; latitude: number; longitude: number; radius: number; is_active: boolean;
};
export type Position = { latitude: number; longitude: number; accuracy?: number | null };
export type PriorityContext = {
  now: number;
  coords: Position | null;
  locationUpdatedAt: number | null;
  places: ContextPlace[];
  history: CompletionRecord[];
  geofenceEvents?: Record<string, { inside: boolean; timestamp: number }>;
};
export type QuestTier = 'now' | 'next' | 'other' | 'history';
export type RankedQuest = {
  quest: Quest;
  tier: QuestTier;
  reasons: string[];
  nearby: boolean;
  distance: number | null;
  score: number; // Internal only. UI renders tier + reasons, never this value.
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const LOCATION_MAX_AGE = 5 * MINUTE;
export const TIER_LABELS: Record<QuestTier, string> = {
  now: 'Recommended now', next: 'Up next', other: 'Other quests', history: 'Review & completed',
};
export const TIER_ORDER: QuestTier[] = ['now', 'next', 'other', 'history'];

export function distanceMeters(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function hasFreshPosition(context: Pick<PriorityContext, 'coords' | 'locationUpdatedAt' | 'now'>): boolean {
  return !!context.coords && Number.isFinite(context.coords.latitude) && Number.isFinite(context.coords.longitude) &&
    context.locationUpdatedAt != null && context.now - context.locationUpdatedAt <= LOCATION_MAX_AGE &&
    context.now >= context.locationUpdatedAt;
}

/** Every saved quest is returned once. Context affects recommendations, never permission to act. */
export function prioritizeQuests(quests: Quest[], context: PriorityContext): RankedQuest[] {
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const places = new Map(context.places.map(place => [place.id, place]));
  // Legacy completed quests remain usable if history hasn't been migrated yet.
  const history = [
    ...context.history,
    ...quests.filter(q => q.status === 'completed').map(q => ({
      id: q.id, quest_id: q.id, title: q.title, category: q.category,
      completed_at: q.completed_at || q.updated_at,
    })),
  ];
  const ranked = quests.map((quest): RankedQuest => {
    let score = 8;
    const signals: { text: string; weight: number }[] = [];
    const notes: string[] = [];
    const add = (weight: number, text: string) => { score += weight; signals.push({ text, weight }); };
    let nearby = false;
    let distance: number | null = null;
    let away = false;
    let locationUnknown = false;
    const place = quest.location_id ? places.get(quest.location_id) : undefined;
    if (quest.location_id) {
      const event = context.geofenceEvents?.[quest.location_id];
      if (place?.is_active && event && context.now >= event.timestamp &&
          context.now - event.timestamp <= LOCATION_MAX_AGE && event.timestamp > (context.locationUpdatedAt ?? 0)) {
        if (event.inside) { nearby = true; add(32, "You're at " + place.name); }
        else { notes.push('Outside your saved place'); score -= 8; }
      } else if (place?.is_active && hasFreshPosition(context) && context.coords &&
          (context.coords.accuracy == null || context.coords.accuracy <= Math.max(place.radius, 150))) {
        distance = distanceMeters(context.coords, place);
        nearby = distance <= place.radius + 500;
        if (distance <= place.radius) add(32, "You're at " + place.name);
        else if (nearby) add(14 + 14 * (1 - (distance - place.radius) / 500), "You're nearby");
        else { score -= 20; away = true; notes.push('Away from your saved place'); }
      } else {
        locationUnknown = true;
        notes.push(place && !place.is_active ? 'Saved place is inactive' : 'Location unavailable');
      }
    }

    const deadline = timestamp(quest.deadline_at);
    const dueMinutes = deadline === null ? null : (deadline - context.now) / MINUTE;
    if (dueMinutes !== null) {
      if (dueMinutes < 0) add(46, 'Overdue');
      else if (dueMinutes <= 120) add(40, 'Due soon');
      else if (dueMinutes <= 1440) add(24, 'Due within a day');
      else if (dueMinutes <= 4320) add(10, 'Due in a few days');
    }

    let timeMatch = false;
    let futureSchedule = false;
    const scheduled = timestamp(quest.scheduled_at);
    if (scheduled !== null) {
      const minutes = (scheduled - context.now) / MINUTE;
      if (minutes >= -60 && minutes <= 30) { add(36, 'Good time now'); timeMatch = true; }
      else if (minutes > 30 && minutes <= 120) { add(26, 'Scheduled soon'); timeMatch = true; }
      else if (minutes > 120) { score -= 12; futureSchedule = true; notes.push('Scheduled for later'); }
      else add(8, 'Scheduled earlier');
    } else if (quest.preferred_time && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(quest.preferred_time)) {
      const [hour, minute] = quest.preferred_time.split(':').map(Number);
      const now = new Date(context.now);
      const difference = (hour * 60 + minute - now.getHours() * 60 - now.getMinutes() + 1440) % 1440;
      if (difference <= 30 || difference >= 1380) { add(32, 'Good time now'); timeMatch = true; }
      else if (difference <= 120) { add(22, 'Preferred time soon'); timeMatch = true; }
      else { score -= 8; notes.push('Outside your preferred time'); }
    }
    if (nearby && timeMatch) score += 12;
    if (quest.importance === 'high') add(14, 'High importance');
    else if (quest.importance === 'low') score -= 5;

    const validHistory = history.filter(h => h.category === quest.category &&
      timestamp(h.completed_at) !== null && timestamp(h.completed_at)! <= context.now);
    const sameActivity = validHistory.filter(h => h.title.trim().toLocaleLowerCase() === quest.title.trim().toLocaleLowerCase());
    const relevant = sameActivity.length ? sameActivity : validHistory;
    if (relevant.length) {
      const latest = Math.max(...relevant.map(h => timestamp(h.completed_at)!));
      const days = (context.now - latest) / DAY;
      if (days >= 3) add(Math.min(14, 6 + days), sameActivity.length ? 'Not done recently' : 'A change of activity');
      else if (days < 0.25 && sameActivity.length) score -= 12;
    }
    const created = timestamp(quest.created_at);
    if (created !== null) score += Math.min(6, Math.max(0, (context.now - created) / DAY));

    const dependency = quest.prerequisite_quest_id ? byId.get(quest.prerequisite_quest_id) : undefined;
    const waiting = !!quest.prerequisite_quest_id && dependency?.status !== 'completed';
    if (waiting) { score -= 35; notes.unshift(dependency ? 'Do after: ' + dependency.title : 'Prerequisite unavailable'); }
    const dependents = quests.filter(q => q.prerequisite_quest_id === quest.id && (q.status === 'active' || q.status === 'rejected'));
    if (dependents.length) add(Math.min(12, dependents.length * 6), 'Helps you start another quest');

    const active = quest.status === 'active' || quest.status === 'rejected';
    const urgent = dueMinutes !== null && dueMinutes <= 120;
    let tier: QuestTier = 'other';
    if (!active) tier = 'history';
    else if (!waiting && !away && !locationUnknown && (!futureSchedule || urgent) && score >= 35) tier = 'now';
    else if (!waiting && score >= 18) tier = 'next';

    const reasons = active
      ? [...notes, ...signals.sort((a, b) => b.weight - a.weight).map(s => s.text)].slice(0, 3)
      : [quest.status === 'completed' ? 'Completed' : 'Pending review'];
    if (!reasons.length) reasons.push('Fits whenever you have time');
    return { quest, tier, reasons, nearby, distance, score };
  });
  return ranked.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
    b.score - a.score || a.quest.created_at.localeCompare(b.quest.created_at) || a.quest.id.localeCompare(b.quest.id));
}
