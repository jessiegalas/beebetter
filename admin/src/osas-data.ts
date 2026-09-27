import { supabase } from './supabase';

export type OsasPermissions = { can_view_aggregates: boolean; can_manage_support_requests: boolean; is_active: boolean };
export type OsasPermissionRow = OsasPermissions & { user_id: string };
export type OsasSupportStaff = { id: string; email: string; display_name: string };
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
  withdrawn_at: string | null;
  created_at: string; updated_at: string;
};
export type SupportRequestEvent = {
  id: string; event_type: string; from_status: string | null; to_status: string | null;
  assigned_to: string | null; actor_label: string; note: string | null; created_at: string;
};
export type DashboardFilters = { startDate: string; endDate: string; campus: string | null; course: string | null; yearLevel: string | null };
export type DashboardFilterOption = { dimension: 'campus' | 'course' | 'year_level'; value: string };
export type DashboardAnalytics = {
  suppressed: boolean; minimum_cohort: number; period_start: string; period_end: string;
  participation: null | { registered_students: number; participating_students: number | null; completion_events: number | null; students_with_goals: number | null; current_quests_created: number | null; current_quests_completed: number | null; current_quest_completion_rate: number | null };
  wellbeing: null | { student_count: number; check_in_count: number; motivation_response_count: number; average_wellbeing: number; average_stress: number; average_energy: number; average_motivation: number | null };
  self_management: null | { student_count: number; reflection_count: number; average_planning: number; average_follow_through: number; average_confidence: number };
  support: null | { student_count: number; request_count: number; submitted_count: number; acknowledged_count: number; in_progress_count: number; resolved_count: number; withdrawn_count: number };
  activity_trends: { bucket_start: string; student_count: number; completion_events: number }[];
  category_participation: { category: string; student_count: number; completion_events: number }[];
  wellbeing_trends: { bucket_start: string; student_count: number; check_in_count: number; motivation_response_count: number; average_wellbeing: number; average_stress: number; average_energy: number; average_motivation: number | null }[];
  reflection_trends: { bucket_start: string; student_count: number; reflection_count: number; average_planning: number; average_follow_through: number; average_confidence: number }[];
  support_trends: { bucket_start: string; student_count: number; request_count: number }[];
  support_categories: { category: string; student_count: number; request_count: number }[];
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
export async function getDashboardFilterOptions(): Promise<DashboardFilterOption[]> {
  const { data, error } = await supabase.rpc('osas_dashboard_filter_options');
  if (error) throw error;
  return (data ?? []) as DashboardFilterOption[];
}
export async function getDashboardAnalytics(filters: DashboardFilters): Promise<DashboardAnalytics> {
  const { data, error } = await supabase.rpc('osas_dashboard_analytics', {
    start_date: filters.startDate, end_date: filters.endDate, campus_filter: filters.campus,
    course_filter: filters.course, year_level_filter: filters.yearLevel,
  });
  if (error) throw error;
  return data as DashboardAnalytics;
}
export async function logDashboardExport(filters: DashboardFilters): Promise<void> {
  const { error } = await supabase.rpc('osas_log_dashboard_export', {
    start_date: filters.startDate, end_date: filters.endDate, campus_filter: filters.campus,
    course_filter: filters.course, year_level_filter: filters.yearLevel,
  });
  if (error) throw error;
}
export async function listSupportRequests(status: string | null = null): Promise<OsasSupportRequest[]> {
  const { data, error } = await supabase.rpc('osas_list_support_requests', { status_filter: status });
  if (error) throw error;
  return (data ?? []) as OsasSupportRequest[];
}
export async function listSupportStaff(): Promise<OsasSupportStaff[]> {
  const { data, error } = await supabase.rpc('osas_list_support_staff');
  if (error) throw error;
  return (data ?? []) as OsasSupportStaff[];
}
export async function listSupportRequestEvents(requestId: string): Promise<SupportRequestEvent[]> {
  const { data, error } = await supabase.rpc('osas_list_support_request_events', { request_id_value: requestId });
  if (error) throw error;
  return (data ?? []) as SupportRequestEvent[];
}
export async function listOsasPermissionRows(): Promise<OsasPermissionRow[]> {
  const { data, error } = await supabase.from('osas_staff_permissions').select('user_id,can_view_aggregates,can_manage_support_requests,is_active');
  if (error) throw error;
  return (data ?? []) as OsasPermissionRow[];
}
export async function updateSupportRequest(requestId: string, status: 'acknowledged' | 'in_progress' | 'resolved', assignedTo: string | null, resolutionNote: string | null): Promise<OsasSupportRequest> {
  const { data, error } = await supabase.rpc('osas_update_support_request', {
    request_id: requestId, status_value: status, assigned_to_value: assignedTo, resolution_note_value: resolutionNote,
  });
  if (error) throw error;
  return data as OsasSupportRequest;
}
export async function setOsasPermissions(userId: string, viewAggregates: boolean, manageSupportRequests: boolean, active = true): Promise<OsasPermissions | null> {
  const { data, error } = await supabase.rpc('super_admin_set_osas_permissions', {
    target_user_id: userId, view_aggregates: viewAggregates, manage_support_requests: manageSupportRequests, active,
  });
  if (error) throw error;
  return (data ?? null) as OsasPermissions | null;
}
