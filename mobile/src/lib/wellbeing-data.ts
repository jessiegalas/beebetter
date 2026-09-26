import { supabase } from '@/supabase';

export type WellbeingCheckIn = {
  id: string; student_id: string; check_in_date: string;
  overall_wellbeing: number; stress_level: number; energy_level: number;
  note: string | null; created_at: string; updated_at: string;
};
export type CheckInInput = Pick<WellbeingCheckIn, 'check_in_date' | 'overall_wellbeing' | 'stress_level' | 'energy_level'> & { note?: string | null };

export type SelfManagementReflection = {
  id: string; student_id: string; quest_id: string | null; period_start: string; period_end: string;
  planning_score: number; follow_through_score: number; confidence_score: number;
  accomplishment: string | null; challenge: string | null; next_step: string | null;
  created_at: string; updated_at: string;
};
export type ReflectionInput = Pick<SelfManagementReflection, 'period_start' | 'period_end' | 'planning_score' | 'follow_through_score' | 'confidence_score'> &
  Partial<Pick<SelfManagementReflection, 'quest_id' | 'accomplishment' | 'challenge' | 'next_step'>>;

export type SupportRequest = {
  id: string; student_id: string;
  category: 'academic' | 'personal' | 'wellbeing' | 'financial' | 'safety' | 'other';
  message: string; preferred_contact: 'email' | 'phone' | 'in_app' | 'in_person';
  contact_detail: string | null; consent_to_contact: boolean; priority: 'normal' | 'soon' | 'urgent';
  status: 'submitted' | 'acknowledged' | 'in_progress' | 'resolved' | 'withdrawn';
  assigned_to: string | null; resolution_note: string | null; resolved_at: string | null;
  created_at: string; updated_at: string;
};
export type SupportRequestInput = Pick<SupportRequest, 'category' | 'message' | 'preferred_contact' | 'consent_to_contact' | 'priority'> & { contact_detail?: string | null };

export async function listMyCheckIns(studentId: string): Promise<WellbeingCheckIn[]> {
  const { data, error } = await supabase.from('student_check_ins').select('*').eq('student_id', studentId).order('check_in_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WellbeingCheckIn[];
}
export async function saveMyCheckIn(studentId: string, input: CheckInInput): Promise<WellbeingCheckIn> {
  const { data, error } = await supabase.from('student_check_ins')
    .upsert({ ...input, note: input.note?.trim() || null, student_id: studentId }, { onConflict: 'student_id,check_in_date' }).select('*').single();
  if (error) throw error;
  return data as WellbeingCheckIn;
}
export async function listMyReflections(studentId: string): Promise<SelfManagementReflection[]> {
  const { data, error } = await supabase.from('self_management_reflections').select('*').eq('student_id', studentId).order('period_end', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SelfManagementReflection[];
}
export async function createMyReflection(studentId: string, input: ReflectionInput): Promise<SelfManagementReflection> {
  const { data, error } = await supabase.from('self_management_reflections').insert({ ...input, student_id: studentId }).select('*').single();
  if (error) throw error;
  return data as SelfManagementReflection;
}
export async function listMySupportRequests(studentId: string): Promise<SupportRequest[]> {
  const { data, error } = await supabase.from('support_requests').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportRequest[];
}
export async function createMySupportRequest(studentId: string, input: SupportRequestInput): Promise<SupportRequest> {
  const { data, error } = await supabase.from('support_requests')
    .insert({ ...input, message: input.message.trim(), contact_detail: input.contact_detail?.trim() || null, student_id: studentId }).select('*').single();
  if (error) throw error;
  return data as SupportRequest;
}
export async function withdrawMySupportRequest(requestId: string): Promise<SupportRequest> {
  const { data, error } = await supabase.rpc('student_withdraw_support_request', { request_id: requestId });
  if (error) throw error;
  return data as SupportRequest;
}
