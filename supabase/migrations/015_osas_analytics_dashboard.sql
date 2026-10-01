-- Privacy-preserving OSAS analytics for the Phase 5 admin dashboard.
-- Apply after 014_osas_support_staff_directory.sql. This migration is additive.
begin;

create or replace function public.osas_dashboard_filter_options()
returns table (dimension text, value text)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.has_osas_permission('view_aggregates') then
    raise exception 'OSAS aggregate permission required';
  end if;
  return query
    select 'campus', campus from public.student_enrollment_options group by campus
    union all select 'course', course from public.student_enrollment_options group by course
    union all select 'year_level', year_level from public.student_enrollment_options group by year_level
    order by 1, 2;
end;
$$;
revoke all on function public.osas_dashboard_filter_options() from public;
grant execute on function public.osas_dashboard_filter_options() to authenticated;

create or replace function public.osas_dashboard_analytics(
  start_date date,
  end_date date,
  campus_filter text default null,
  course_filter text default null,
  year_level_filter text default null
) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  cohort_size bigint;
  result jsonb;
begin
  if not public.has_osas_permission('view_aggregates') then
    raise exception 'OSAS aggregate permission required';
  end if;
  if start_date is null or end_date is null or start_date > end_date or end_date - start_date > 366 then
    raise exception 'Choose a valid reporting period of at most 366 days';
  end if;

  select count(*) into cohort_size
  from public.students s
  where not exists (select 1 from public.admin_users a where a.id = s.id)
    and (campus_filter is null or s.campus = campus_filter)
    and (course_filter is null or s.course = course_filter)
    and (year_level_filter is null or s.year_level = year_level_filter);

  if cohort_size < 5 then
    return jsonb_build_object(
      'suppressed', true,
      'minimum_cohort', 5,
      'period_start', start_date,
      'period_end', end_date,
      'participation', null,
      'wellbeing', null,
      'self_management', null,
      'support', null,
      'activity_trends', '[]'::jsonb,
      'category_participation', '[]'::jsonb,
      'wellbeing_trends', '[]'::jsonb,
      'reflection_trends', '[]'::jsonb,
      'support_trends', '[]'::jsonb,
      'support_categories', '[]'::jsonb
    );
  end if;

  with cohort as (
    select s.id, s.goal
    from public.students s
    where not exists (select 1 from public.admin_users a where a.id = s.id)
      and (campus_filter is null or s.campus = campus_filter)
      and (course_filter is null or s.course = course_filter)
      and (year_level_filter is null or s.year_level = year_level_filter)
  ),
  history as (
    select h.owner_id, h.category, h.completed_at
    from public.quest_completion_history h join cohort c on c.id = h.owner_id
    where h.completed_at >= start_date::timestamptz
      and h.completed_at < (end_date + 1)::timestamptz
  ),
  current_quests as (
    select q.owner_id, q.status, q.created_at, q.completed_at
    from public.quests q join cohort c on c.id = q.owner_id
    where q.created_at >= start_date::timestamptz
      and q.created_at < (end_date + 1)::timestamptz
  ),
  activity_students as (
    select owner_id from history
    union
    select owner_id from current_quests
  ),
  checkins as (
    select ci.* from public.student_check_ins ci join cohort c on c.id = ci.student_id
    where ci.check_in_date between start_date and end_date
  ),
  reflections as (
    select r.* from public.self_management_reflections r join cohort c on c.id = r.student_id
    where r.period_end between start_date and end_date
  ),
  requests as (
    select sr.* from public.support_requests sr join cohort c on c.id = sr.student_id
    where sr.created_at >= start_date::timestamptz
      and sr.created_at < (end_date + 1)::timestamptz
  ),
  activity_buckets as (
    select case when end_date - start_date <= 31 then h.completed_at::date
      else date_trunc('week', h.completed_at)::date end bucket_start,
      count(distinct h.owner_id) student_count, count(*) completion_events
    from history h group by 1 having count(distinct h.owner_id) >= 5
  ),
  category_buckets as (
    select h.category, count(distinct h.owner_id) student_count, count(*) completion_events
    from history h group by h.category having count(distinct h.owner_id) >= 5
  ),
  wellbeing_buckets as (
    select case when end_date - start_date <= 31 then c.check_in_date
      else date_trunc('week', c.check_in_date)::date end bucket_start,
      count(distinct c.student_id) student_count, count(*) check_in_count,
      count(c.motivation_level) motivation_response_count,
      round(avg(c.overall_wellbeing), 2) average_wellbeing,
      round(avg(c.stress_level), 2) average_stress,
      round(avg(c.energy_level), 2) average_energy,
      round(avg(c.motivation_level), 2) average_motivation
    from checkins c group by 1 having count(distinct c.student_id) >= 5
  ),
  reflection_buckets as (
    select case when end_date - start_date <= 31 then r.period_end
      else date_trunc('week', r.period_end)::date end bucket_start,
      count(distinct r.student_id) student_count, count(*) reflection_count,
      round(avg(r.planning_score), 2) average_planning,
      round(avg(r.follow_through_score), 2) average_follow_through,
      round(avg(r.confidence_score), 2) average_confidence
    from reflections r group by 1 having count(distinct r.student_id) >= 5
  ),
  support_buckets as (
    select case when end_date - start_date <= 31 then r.created_at::date
      else date_trunc('week', r.created_at)::date end bucket_start,
      count(distinct r.student_id) student_count, count(*) request_count
    from requests r group by 1 having count(distinct r.student_id) >= 5
  ),
  support_category_buckets as (
    select r.category, count(distinct r.student_id) student_count, count(*) request_count
    from requests r group by r.category having count(distinct r.student_id) >= 5
  )
  select jsonb_build_object(
    'suppressed', false,
    'minimum_cohort', 5,
    'period_start', start_date,
    'period_end', end_date,
    'participation', jsonb_build_object(
      'registered_students', cohort_size,
      'participating_students', (select count(*) from activity_students),
      'completion_events', (select count(*) from history),
      'students_with_goals', (select count(*) from cohort where nullif(trim(goal), '') is not null and lower(trim(goal)) <> 'not specified'),
      'current_quests_created', (select count(*) from current_quests),
      'current_quests_completed', (select count(*) from current_quests where status = 'completed' and completed_at < (end_date + 1)::timestamptz),
      'current_quest_completion_rate', (select round(100.0 * count(*) filter (where status = 'completed' and completed_at < (end_date + 1)::timestamptz) / nullif(count(*), 0), 1) from current_quests)
    ),
    'wellbeing', case when (select count(distinct student_id) from checkins) >= 5 then
      (select jsonb_build_object('student_count', count(distinct student_id), 'check_in_count', count(*),
        'motivation_response_count', count(motivation_level), 'average_wellbeing', round(avg(overall_wellbeing), 2),
        'average_stress', round(avg(stress_level), 2), 'average_energy', round(avg(energy_level), 2),
        'average_motivation', round(avg(motivation_level), 2)) from checkins) else null end,
    'self_management', case when (select count(distinct student_id) from reflections) >= 5 then
      (select jsonb_build_object('student_count', count(distinct student_id), 'reflection_count', count(*),
        'average_planning', round(avg(planning_score), 2), 'average_follow_through', round(avg(follow_through_score), 2),
        'average_confidence', round(avg(confidence_score), 2)) from reflections) else null end,
    'support', case when (select count(distinct student_id) from requests) >= 5 then
      (select jsonb_build_object('student_count', count(distinct student_id), 'request_count', count(*),
        'submitted_count', count(*) filter (where status = 'submitted'),
        'acknowledged_count', count(*) filter (where status = 'acknowledged'),
        'in_progress_count', count(*) filter (where status = 'in_progress'),
        'resolved_count', count(*) filter (where status = 'resolved'),
        'withdrawn_count', count(*) filter (where status = 'withdrawn')) from requests) else null end,
    'activity_trends', coalesce((select jsonb_agg(to_jsonb(a) order by a.bucket_start) from activity_buckets a), '[]'::jsonb),
    'category_participation', coalesce((select jsonb_agg(to_jsonb(c) order by c.completion_events desc) from category_buckets c), '[]'::jsonb),
    'wellbeing_trends', coalesce((select jsonb_agg(to_jsonb(w) order by w.bucket_start) from wellbeing_buckets w), '[]'::jsonb),
    'reflection_trends', coalesce((select jsonb_agg(to_jsonb(r) order by r.bucket_start) from reflection_buckets r), '[]'::jsonb),
    'support_trends', coalesce((select jsonb_agg(to_jsonb(s) order by s.bucket_start) from support_buckets s), '[]'::jsonb),
    'support_categories', coalesce((select jsonb_agg(to_jsonb(s) order by s.request_count desc) from support_category_buckets s), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
revoke all on function public.osas_dashboard_analytics(date, date, text, text, text) from public;
grant execute on function public.osas_dashboard_analytics(date, date, text, text, text) to authenticated;

commit;
