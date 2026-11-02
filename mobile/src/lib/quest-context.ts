import type { Quest } from '../context/user-data-context';
import { factMatches, isFresh, type RecommendationFact } from './recommendation-facts';

export type Position = { latitude: number; longitude: number; accuracy?: number | null };
export type ContextPlace = { id: string; name: string; latitude: number; longitude: number; radius: number; is_active: boolean };
export type PrerequisiteState = 'none' | 'completed' | 'incomplete' | 'unknown';
export type QuestLocationContext = {
  now: number; coords: Position | null; locationUpdatedAt: number | null; places: ContextPlace[];
  placesUpdatedAt: number | null; geofenceEvents?: Record<string, { inside: boolean; timestamp: number }>;
};

export function validPosition(p: Position): boolean {
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 &&
    (p.accuracy == null || (Number.isFinite(p.accuracy) && p.accuracy >= 0));
}
export function distanceMeters(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function hasFreshPosition(c: Pick<QuestLocationContext, 'coords' | 'locationUpdatedAt' | 'now'>): boolean {
  return !!c.coords && validPosition(c.coords) && isFresh(c.locationUpdatedAt, c.now);
}
export function questPrerequisite(quest: Quest, fact: RecommendationFact | undefined, factsUpdatedAt: number | null, now: number) {
  const verified = isFresh(factsUpdatedAt, now) && factMatches(quest, fact);
  const prerequisiteState: PrerequisiteState = !quest.prerequisite_quest_id ? 'none'
    : !verified || !fact?.prerequisite_status ? 'unknown' : fact.prerequisite_status === 'completed' ? 'completed' : 'incomplete';
  return { prerequisiteState, locked: prerequisiteState === 'incomplete' || prerequisiteState === 'unknown',
    prerequisiteTitle: verified ? fact?.prerequisite_title ?? undefined : undefined };
}

export function prerequisiteMessage(state: PrerequisiteState, title?: string): string {
  if (state === 'unknown') return 'Prerequisite status could not be verified. Refresh to check.';
  if (state === 'incomplete') return 'Complete the prerequisite quest first' + (title ? ': ' + title : '.');
  return '';
}

/** Location evidence is independent of recommendation scores and completion authorization. */
export function questProximity(quest: Quest, place: ContextPlace | undefined, c: QuestLocationContext): {
  fit: 'none' | 'inside' | 'nearby' | 'outside' | 'away' | 'inactive' | 'unknown'; nearby: boolean; distance: number | null;
} {
  if (!quest.location_id) return { fit: 'none', nearby: false, distance: null };
  const event = c.geofenceEvents?.[quest.location_id];
  const usableGPS = !!place && hasFreshPosition(c) && !!c.coords && (c.coords.accuracy == null || c.coords.accuracy <= Math.max(place.radius, 150));
  if (!place?.is_active || !validPosition(place) || !Number.isFinite(place.radius) || place.radius < 0 || !isFresh(c.placesUpdatedAt, c.now)) {
    return { fit: place && !place.is_active ? 'inactive' : 'unknown', nearby: false, distance: null };
  }
  if (event && isFresh(event.timestamp, c.now) && event.timestamp > (usableGPS ? c.locationUpdatedAt ?? 0 : 0)) {
    return { fit: event.inside === true ? 'inside' : 'outside', nearby: event.inside === true, distance: null };
  }
  if (usableGPS && c.coords) {
    const distance = distanceMeters(c.coords, place), nearby = distance <= place.radius + 500;
    return { fit: distance <= place.radius ? 'inside' : nearby ? 'nearby' : 'away', nearby, distance };
  }
  return { fit: 'unknown', nearby: false, distance: null };
}

export type QuestBrowseItem = { quest: Quest; nearby: boolean; locked: boolean; prerequisiteState: PrerequisiteState; prerequisiteTitle?: string };
export function browseQuests(quests: Quest[], facts: RecommendationFact[], factsUpdatedAt: number | null, context: QuestLocationContext): QuestBrowseItem[] {
  const byId = new Map(facts.map(fact => [fact.quest_id, fact]));
  const places = new Map(context.places.map(place => [place.id, place]));
  return quests.map(quest => ({ quest, ...questPrerequisite(quest, byId.get(quest.id), factsUpdatedAt, context.now),
    nearby: questProximity(quest, places.get(quest.location_id ?? ''), context).nearby }));
}

/** Sample wall time at evaluation, so a just-refreshed fact is never future-dated by an old timer tick. */
export function questBrowsingSnapshot(quests: Quest[], facts: RecommendationFact[], factsUpdatedAt: number | null,
  input: QuestLocationContext, clock = Date.now) {
  const now = clock(), context = { ...input, now };
  return { items: browseQuests(quests, facts, factsUpdatedAt, context), now, locationAvailable: hasFreshPosition(context) };
}
