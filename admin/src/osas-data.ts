import { supabase } from './supabase';

export type OsasPermissions = { can_view_aggregates: boolean; can_manage_support_requests: boolean; is_active: boolean };
export type ReportGrouping = 'all' | 'course' | 'year_level' | 'campus';
export type CheckInSummary = {
  period_start: string; period_end: string; group_dimension: ReportGrouping; group_value: string;
  student_count: number; check_in_count: number; average_wellbeing: number; average_stress: number; average_energy: number;
};
export type SelfManagementSummary = {
  period_start: string; period_end: string; group_dimension: ReportGrouping; group_value: string;
  student_count: number; reflection_count: number; average_planning: number; average_follow_through: number; average_confidence: number;
};
export type OsasSupportRequest = {
  id: string; student_id: string; student_number: string; student_name: string; student_email: string;
  course: string; year_level: string; campus: string; category: string; message: string;
  preferred_contact: string; contact_detail: string | null; priority: string; status: string;
  assigned_to: string | null; resolution_note: string | null; resolved_at: string | null;
  created_at: string; updated_at: string;
};

export async function getMyOsasPermissions(): Promise<OsasPermissions> {
  const { data, error } = await supabase.rpc('osas_get_my_permissions');
  if (error) throw error;
  return (data?.[0] ?? { can_view_aggregates: false, can_manage_support_requests: false, is_active: false }) as OsasPermissions;
}
export async function getCheckInSummary(startDate: string, endDate: string, groupBy: ReportGrouping): Promise<CheckInSummary[]> {
  const { data, error } = await supabase.rpc('osas_check_in_summary', { start_date: startDate, end_date: endDate, group_by: groupBy });
  if (error) throw error;
  return (data ?? []) as CheckInSummary[];
}
export async function getSelfManagementSummary(startDate: string, endDate: string, groupBy: ReportGrouping): Promise<SelfManagementSummary[]> {
  const { data, error } = await supabase.rpc('osas_self_management_summary', { start_date: startDate, end_date: endDate, group_by: groupBy });
  if (error) throw error;
  return (data ?? []) as SelfManagementSummary[];
}
export async function listSupportRequests(status: string | null = null): Promise<OsasSupportRequest[]> {
  const { data, error } = await supabase.rpc('osas_list_support_requests', { status_filter: status });
  if (error) throw error;
  return (data ?? []) as OsasSupportRequest[];
}
export async function updateSupportRequest(requestId: string, status: 'acknowledged' | 'in_progress' | 'resolved', assignedTo: string | null, resolutionNote: string | null): Promise<OsasSupportRequest> {
  const { data, error } = await supabase.rpc('osas_update_support_request', {
    request_id: requestId, status_value: status, assigned_to_value: assignedTo, resolution_note_value: resolutionNote,
  });
  if (error) throw error;
  return data as OsasSupportRequest;
}
export async function setOsasPermissions(userId: string, viewAggregates: boolean, manageSupportRequests: boolean, active = true): Promise<OsasPermissions> {
  const { data, error } = await supabase.rpc('super_admin_set_osas_permissions', {
    target_user_id: userId, view_aggregates: viewAggregates, manage_support_requests: manageSupportRequests, active,
  });
  if (error) throw error;
  return data as OsasPermissions;
}
