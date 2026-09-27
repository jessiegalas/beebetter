import { supabase } from '@/supabase';
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
