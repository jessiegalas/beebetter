import { supabase } from '@/supabase';
import type { RecommendationEvent } from './recommendation-measurement';
import type { RecommendationReasonCode } from './quest-priority';

export type RecommendationEventType = 'exposure' | 'selection' | 'dismissal';
export function createRecommendationSession(): string {
  const random = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${random()}-${random().slice(0, 4)}-4${random().slice(0, 3)}-a${random().slice(0, 3)}-${random()}${random().slice(0, 4)}`;
}
export async function recordRecommendationEvent(input: {
  questId: string; eventType: RecommendationEventType; sessionId: string;
  rankPosition?: number; reasonCodes?: RecommendationReasonCode[];
}): Promise<void> {
  const { error } = await supabase.rpc('student_record_recommendation_event', {
    quest_id_value: input.questId,
    event_type_value: input.eventType,
    session_id_value: input.sessionId,
    rank_position_value: input.rankPosition ?? null,
    reason_codes_value: input.reasonCodes ?? [],
  });
  if (error) throw error;
}

export async function recordRecommendationEventV2(e: RecommendationEvent): Promise<void> {
  const { error } = await supabase.rpc('student_record_recommendation_event_v2', {
    quest_id_value: e.questId, impression_id_value: e.impressionId, session_id_value: e.sessionId,
    surface_value: e.surface, group_value: e.group, rank_value: e.rank, reason_codes_value: e.reasonCodes,
    event_type_value: e.eventType, occurred_at_value: e.occurredAt, version_value: e.version,
  });
  if (error) { if (__DEV__) console.warn('Recommendation measurement delivery failed'); throw error; }
}
