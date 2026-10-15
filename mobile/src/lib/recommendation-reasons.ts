import type { PrerequisiteState } from './quest-priority';

export function prerequisiteMessage(state: PrerequisiteState, title?: string): string {
  if (state === 'unknown') return 'Prerequisite status could not be verified. Refresh to check.';
  if (state === 'incomplete') return 'Complete the prerequisite quest first' + (title ? ': ' + title : '.');
  return '';
}
export type EvidenceCode = 'location_at' | 'location_nearby' | 'location_outside' | 'location_away' | 'location_unknown' | 'place_inactive' |
  'deadline_overdue' | 'deadline_soon' | 'deadline_day' | 'deadline_days' | 'schedule_now' | 'schedule_soon' | 'schedule_later' | 'schedule_earlier' |
  'preferred_now' | 'preferred_soon' | 'preferred_outside' | 'importance_high' | 'importance_low' | 'activity_gap' | 'activity_variety' | 'activity_recent' |
  'unlocks_quest' | 'goal_alignment' | 'reflection_related' | 'manageable_step' | 'reported_momentum' | 'quest_age' | 'location_time' |
  'prerequisite_incomplete' | 'prerequisite_unknown' | 'data_stale' | 'facts_unknown';
export type RecommendationEvidence = {
  code: EvidenceCode; contribution: number; kind: 'positive' | 'constraint';
  values: { at?: string; place?: string; term?: string; title?: string; category?: string; count?: number };
};
const dateTime = (at?: string) => at ? new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
export function formatRecommendationEvidence(e: RecommendationEvidence): string {
  const v = e.values;
  switch (e.code) {
    case 'location_at': return 'Your recent location is within your saved ' + v.place + ' area';
    case 'location_nearby': return 'Your recent location is near your saved ' + v.place + ' area';
    case 'location_outside': return 'Outside your saved area; distance is unknown';
    case 'location_away': return 'Away from your saved place';
    case 'location_unknown': return 'Location unavailable';
    case 'place_inactive': return 'Saved place is inactive';
    case 'deadline_overdue': return 'Deadline passed: ' + dateTime(v.at);
    case 'deadline_soon': case 'deadline_day': case 'deadline_days': return 'Due ' + dateTime(v.at);
    case 'schedule_now': case 'schedule_soon': case 'schedule_earlier': return 'You scheduled this for ' + dateTime(v.at);
    case 'schedule_later': return 'Scheduled for later: ' + dateTime(v.at);
    case 'preferred_now': case 'preferred_soon': return 'Your preferred time is ' + v.at?.slice(0, 5);
    case 'preferred_outside': return 'Outside your preferred time of ' + v.at?.slice(0, 5);
    case 'importance_high': return 'You marked this quest high importance';
    case 'importance_low': return 'You marked this quest low importance';
    case 'activity_gap': return 'Latest matching completion: ' + dateTime(v.at);
    case 'activity_variety': return 'Latest ' + v.category + ' completion: ' + dateTime(v.at);
    case 'activity_recent': return 'You recorded a matching completion recently: ' + dateTime(v.at);
    case 'unlocks_quest': return v.count + ' unfinished quest' + (v.count === 1 ? '' : 's') + ' list this as a prerequisite';
    case 'goal_alignment': return 'This quest and your goal both mention “' + v.term + '”';
    case 'reflection_related': return 'This quest is linked to your recent reflection';
    case 'manageable_step': return 'Lower XP reward; favored by your reported check-in or reflection';
    case 'reported_momentum': return 'You reported high motivation and marked this quest high importance';
    case 'quest_age': return 'This quest has been waiting longer';
    case 'location_time': return 'Both your saved place and chosen time fit';
    case 'prerequisite_incomplete': return prerequisiteMessage('incomplete', v.title);
    case 'prerequisite_unknown': return prerequisiteMessage('unknown');
    case 'data_stale': return 'Context is out of date. Refresh to check what fits now';
    case 'facts_unknown': return 'Activity and prerequisite context could not be refreshed';
  }
}
export const FALLBACK_REASON = 'No timing, location, or activity reason currently raises this quest’s priority';
// Common English/Filipino function words are excluded from whole-word matching.
export const GOAL_STOPWORDS = new Set(('the and for with from that this these those have has had will would could should ' +
  'your you our their its into about some more most very just also want wants goal goals ' +
  'are was were been being not can but how who why all any out over under when where then than them they there here this through after before while during which what other each only same such both either neither myself yourself ourselves themselves complete finish improve achieve better ' +
  'ang mga nang para kay kina ako ikaw siya kami tayo sila isang ito iyon nito may maging gusto kong lang dahil pero kapag upang').split(' '));
export function meaningfulGoalTerms(text: string): string[] {
  return [...new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(w => !GOAL_STOPWORDS.has(w)))];
}
