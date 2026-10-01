-- Phase D longitudinal analytics with institutional-time boundaries, historical
-- enrollment cohorts, lifecycle denominators, and student-weighted averages.
-- Apply after 020_longitudinal_data_foundation.sql.
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
language plpgsql security definer set search_path = public as $$
declare
  cohort_size bigint;
  total_size bigint;
  complement_size bigint;
  filter_count integer;
  selected_dimension text;
  selected_value text;
  timezone_name text;
  period_start_at timestamptz;
  period_end_at timestamptz;
  result jsonb;
begin
  if not public.has_osas_permission('view_aggregates') then
    raise exception 'OSAS aggregate permission required';
  end if;
  if start_date is null or end_date is null or start_date > end_date or end_date - start_date > 366 then
    raise exception 'Choose a valid reporting period of at most 366 days';
  end if;
  filter_count := (campus_filter is not null)::integer + (course_filter is not null)::integer + (year_level_filter is not null)::integer;
  if filter_count > 1 then raise exception 'Choose only one demographic filter at a time'; end if;
  selected_dimension := case when campus_filter is not null then 'campus' when course_filter is not null then 'course' when year_level_filter is not null then 'year_level' end;
  selected_value := coalesce(campus_filter, course_filter, year_level_filter);
  timezone_name := public.institutional_timezone();
  period_start_at := start_date::timestamp at time zone timezone_name;
  period_end_at := (end_date + 1)::timestamp at time zone timezone_name;

  select count(*) into total_size from public.student_enrollment_history eh
  where eh.valid_from < period_end_at and (eh.valid_to is null or eh.valid_to >= period_end_at)
    and not exists (select 1 from public.admin_users a where a.id = eh.student_id);

  select count(*) into cohort_size
  from public.student_enrollment_history eh
  where eh.valid_from < period_end_at and (eh.valid_to is null or eh.valid_to >= period_end_at)
    and not exists (select 1 from public.admin_users a where a.id = eh.student_id)
    and (campus_filter is null or eh.campus = campus_filter)
    and (course_filter is null or eh.course = course_filter)
    and (year_level_filter is null or eh.year_level = year_level_filter);
  complement_size := case when filter_count = 0 then 0 else total_size - cohort_size end;

  if cohort_size < 5 or (complement_size between 1 and 4) then
    insert into public.osas_report_audit_log(actor_id,action,period_start,period_end,filter_dimension,filter_value,outcome,cohort_size,complement_size)
    values(auth.uid(),'query',start_date,end_date,selected_dimension,selected_value,'suppressed',cohort_size,complement_size);
    return jsonb_build_object(
      'suppressed', true,
      'minimum_cohort', 5,
      'period_start', start_date,
      'period_end', end_date,
      'institutional_timezone', timezone_name,
      'cohort_as_of', end_date,
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
    select eh.student_id id,s.goal
    from public.student_enrollment_history eh join public.students s on s.id=eh.student_id
    where eh.valid_from < period_end_at and (eh.valid_to is null or eh.valid_to >= period_end_at)
      and not exists (select 1 from public.admin_users a where a.id = eh.student_id)
      and (campus_filter is null or eh.campus = campus_filter)
      and (course_filter is null or eh.course = course_filter)
      and (year_level_filter is null or eh.year_level = year_level_filter)
  ),
  history as (
    select h.owner_id,h.category,h.occurred_at completed_at
    from public.quest_lifecycle_events h join cohort c on c.id=h.owner_id
    where h.event_type='completed' and h.occurred_at >= period_start_at and h.occurred_at < period_end_at
  ),
  created_quests as (
    select q.quest_id,q.owner_id,q.occurred_at created_at,
      exists(select 1 from public.quest_lifecycle_events done where done.quest_id=q.quest_id
        and done.event_type='completed' and done.occurred_at < period_end_at) completed
    from public.quest_lifecycle_events q join cohort c on c.id=q.owner_id
    where q.event_type='created' and q.occurred_at >= period_start_at and q.occurred_at < period_end_at
  ),
  activity_students as (
    select owner_id from history
    union
    select owner_id from created_quests
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
    where sr.created_at >= period_start_at and sr.created_at < period_end_at
  ),
  checkin_student_averages as (
    select student_id,avg(overall_wellbeing) average_wellbeing,avg(stress_level) average_stress,
      avg(energy_level) average_energy,avg(motivation_level) average_motivation
    from checkins group by student_id
  ),
  reflection_student_averages as (
    select student_id,avg(planning_score) average_planning,avg(follow_through_score) average_follow_through,
      avg(confidence_score) average_confidence from reflections group by student_id
  ),
  activity_buckets as (
    select case when end_date-start_date <= 31 then (h.completed_at at time zone timezone_name)::date
      else date_trunc('week',h.completed_at at time zone timezone_name)::date end bucket_start,
      count(distinct h.owner_id) student_count, count(*) completion_events
    from history h group by 1 having count(distinct h.owner_id) >= 5
  ),
  category_buckets as (
    select h.category, count(distinct h.owner_id) student_count, count(*) completion_events
    from history h group by h.category having count(distinct h.owner_id) >= 5
  ),
  wellbeing_student_buckets as (
    select case when end_date-start_date <= 31 then c.check_in_date
      else date_trunc('week',c.check_in_date::timestamp)::date end bucket_start,c.student_id,
      count(*) check_in_count,count(c.motivation_level) motivation_response_count,
      avg(c.overall_wellbeing) average_wellbeing,avg(c.stress_level) average_stress,
      avg(c.energy_level) average_energy,avg(c.motivation_level) average_motivation
    from checkins c group by 1,c.student_id
  ),
  wellbeing_buckets as (
    select bucket_start,count(*) student_count,sum(check_in_count) check_in_count,
      sum(motivation_response_count) motivation_response_count,round(avg(average_wellbeing),2) average_wellbeing,
      round(avg(average_stress),2) average_stress,round(avg(average_energy),2) average_energy,
      round(avg(average_motivation),2) average_motivation
    from wellbeing_student_buckets group by bucket_start having count(*) >= 5
  ),
  reflection_student_buckets as (
    select case when end_date-start_date <= 31 then r.period_end
      else date_trunc('week',r.period_end::timestamp)::date end bucket_start,r.student_id,
      count(*) reflection_count,avg(r.planning_score) average_planning,
      avg(r.follow_through_score) average_follow_through,avg(r.confidence_score) average_confidence
    from reflections r group by 1,r.student_id
  ),
  reflection_buckets as (
    select bucket_start,count(*) student_count,sum(reflection_count) reflection_count,
      round(avg(average_planning),2) average_planning,round(avg(average_follow_through),2) average_follow_through,
      round(avg(average_confidence),2) average_confidence
    from reflection_student_buckets group by bucket_start having count(*) >= 5
  ),
  support_buckets as (
    select case when end_date-start_date <= 31 then (r.created_at at time zone timezone_name)::date
      else date_trunc('week',r.created_at at time zone timezone_name)::date end bucket_start,
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
    'institutional_timezone', timezone_name,
    'cohort_as_of', end_date,
    'participation', jsonb_build_object(
      'registered_students', cohort_size,
      'participating_students', case when (select count(*) from activity_students) >= 5 then (select count(*) from activity_students) else null end,
      'completion_events', case when (select count(distinct owner_id) from history) >= 5 then (select count(*) from history) else null end,
      'students_with_goals', case when (select count(*) from cohort where nullif(trim(goal), '') is not null and lower(trim(goal)) <> 'not specified') >= 5 then (select count(*) from cohort where nullif(trim(goal), '') is not null and lower(trim(goal)) <> 'not specified') else null end,
      'quests_created', case when (select count(distinct owner_id) from created_quests) >= 5 then (select count(*) from created_quests) else null end,
      'quests_completed', case when (select count(distinct owner_id) from created_quests where completed) >= 5 then (select count(*) from created_quests where completed) else null end,
      'quest_completion_rate', case when (select count(distinct owner_id) from created_quests) >= 5 and (select count(distinct owner_id) from created_quests where completed) >= 5 then (select round(100.0*count(*) filter(where completed)/nullif(count(*),0),1) from created_quests) else null end
    ),
    'wellbeing', case when (select count(distinct student_id) from checkins) >= 5 then
      (select jsonb_build_object('student_count', count(distinct student_id), 'check_in_count', count(*),
        'motivation_response_count',count(motivation_level),'averaging_method','equal weight per participating student',
        'average_wellbeing',(select round(avg(average_wellbeing),2) from checkin_student_averages),
        'average_stress',(select round(avg(average_stress),2) from checkin_student_averages),
        'average_energy',(select round(avg(average_energy),2) from checkin_student_averages),
        'average_motivation',(select round(avg(average_motivation),2) from checkin_student_averages)) from checkins) else null end,
    'self_management', case when (select count(distinct student_id) from reflections) >= 5 then
      (select jsonb_build_object('student_count', count(distinct student_id), 'reflection_count', count(*),
        'averaging_method','equal weight per participating student',
        'average_planning',(select round(avg(average_planning),2) from reflection_student_averages),
        'average_follow_through',(select round(avg(average_follow_through),2) from reflection_student_averages),
        'average_confidence',(select round(avg(average_confidence),2) from reflection_student_averages)) from reflections) else null end,
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

  insert into public.osas_report_audit_log(actor_id,action,period_start,period_end,filter_dimension,filter_value,outcome,cohort_size,complement_size)
  values(auth.uid(),'query',start_date,end_date,selected_dimension,selected_value,'released',cohort_size,complement_size);
  return result;
end;
$$;
revoke all on function public.osas_dashboard_analytics(date, date, text, text, text) from public;
grant execute on function public.osas_dashboard_analytics(date, date, text, text, text) to authenticated;

create or replace function public.osas_log_dashboard_export(
  start_date date, end_date date, campus_filter text default null,
  course_filter text default null, year_level_filter text default null
) returns void language plpgsql security definer set search_path = public as $$
declare cohort_size bigint; total_size bigint; complement_size bigint; filter_count integer;
declare selected_dimension text; selected_value text; period_end_at timestamptz;
begin
  if not public.has_osas_permission('view_aggregates') then raise exception 'OSAS aggregate permission required'; end if;
  if start_date is null or end_date is null or start_date > end_date or end_date-start_date > 366 then raise exception 'Choose a valid reporting period of at most 366 days'; end if;
  filter_count := (campus_filter is not null)::integer + (course_filter is not null)::integer + (year_level_filter is not null)::integer;
  if filter_count > 1 then raise exception 'Choose only one demographic filter at a time'; end if;
  selected_dimension := case when campus_filter is not null then 'campus' when course_filter is not null then 'course' when year_level_filter is not null then 'year_level' end;
  selected_value := coalesce(campus_filter,course_filter,year_level_filter);
  period_end_at := (end_date+1)::timestamp at time zone public.institutional_timezone();
  select count(*) into total_size from public.student_enrollment_history eh
    where eh.valid_from < period_end_at and (eh.valid_to is null or eh.valid_to >= period_end_at)
      and not exists(select 1 from public.admin_users a where a.id=eh.student_id);
  select count(*) into cohort_size from public.student_enrollment_history eh
    where eh.valid_from < period_end_at and (eh.valid_to is null or eh.valid_to >= period_end_at)
      and not exists(select 1 from public.admin_users a where a.id=eh.student_id)
      and (campus_filter is null or eh.campus=campus_filter) and (course_filter is null or eh.course=course_filter)
      and (year_level_filter is null or eh.year_level=year_level_filter);
  complement_size := case when filter_count=0 then 0 else total_size-cohort_size end;
  if cohort_size < 5 or complement_size between 1 and 4 then raise exception 'This cohort is suppressed and cannot be exported'; end if;
  insert into public.osas_report_audit_log(actor_id,action,period_start,period_end,filter_dimension,filter_value,outcome,cohort_size,complement_size)
  values(auth.uid(),'export',start_date,end_date,selected_dimension,selected_value,'released',cohort_size,complement_size);
end;
$$;
revoke all on function public.osas_log_dashboard_export(date,date,text,text,text) from public;
grant execute on function public.osas_log_dashboard_export(date,date,text,text,text) to authenticated;

commit;
