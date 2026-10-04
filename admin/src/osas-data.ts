import { supabase } from './supabase';

export type OsasPermissions = { can_view_aggregates: boolean; can_manage_support_requests: boolean; is_active: boolean };
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
export type SupportRequestFilters = { page: number; pageSize: number; status: string; category: string; search: string; from: string; to: string };
export type DashboardFilters = { startDate: string; endDate: string; campus: string | null; course: string | null; yearLevel: string | null };
export type DashboardFilterOption = { dimension: 'campus' | 'course' | 'year_level'; value: string };
export type DashboardAnalytics = {
  suppressed: boolean; minimum_cohort: number; period_start: string; period_end: string; institutional_timezone: string; cohort_as_of: string;
  participation: null | { registered_students: number; participating_students: number | null; completion_events: number | null; students_with_goals: number | null; quests_created: number | null; quests_completed: number | null; quest_completion_rate: number | null };
  wellbeing: null | { student_count: number; check_in_count: number; motivation_response_count: number; averaging_method: string; average_wellbeing: number; average_stress: number; average_energy: number; average_motivation: number | null };
  self_management: null | { student_count: number; reflection_count: number; averaging_method: string; average_planning: number; average_follow_through: number; average_confidence: number };
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
export async function listSupportRequests(filters: SupportRequestFilters): Promise<{ rows: OsasSupportRequest[]; total: number }> {
  const { data, error } = await supabase.rpc('osas_list_support_requests_page', {
    page_size: filters.pageSize, page_offset: filters.page * filters.pageSize, status_filter: filters.status || null,
    category_filter: filters.category || null, search_query: filters.search.trim() || null,
    from_date: filters.from || null, to_date: filters.to || null,
  });
  if (error) throw error;
  return { rows: (data ?? []) as OsasSupportRequest[], total: Number(data?.[0]?.total_count ?? 0) };
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
export async function updateSupportRequest(requestId: string, status: 'acknowledged' | 'in_progress' | 'resolved', assignedTo: string | null, resolutionNote: string | null): Promise<OsasSupportRequest> {
  const { data, error } = await supabase.rpc('osas_update_support_request', {
    request_id: requestId, status_value: status, assigned_to_value: assignedTo, resolution_note_value: resolutionNote,
  });
  if (error) throw error;
  return data as OsasSupportRequest;
}
