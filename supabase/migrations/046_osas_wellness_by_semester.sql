begin;

create function public.osas_wellness_by_semester(start_date date, end_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  scope record;
  report jsonb;
begin
  select * into scope from public.osas_report_scope_v2(start_date,end_date);

  with periods as materialized (
    select a.id, a.academic_year, a.term, a.activated_at,
      greatest(a.activated_at, scope.period_from) as from_time,
      least(coalesce(a.archived_at, scope.cutoff), scope.cutoff) as through_time
    from public.academic_semesters a
    where a.activated_at < scope.cutoff
      and greatest(a.activated_at, scope.period_from) < least(coalesce(a.archived_at, scope.cutoff), scope.cutoff)
  ), enrollment as materialized (
    select p.id as semester_id, h.student_id, public.normalize_student_year(h.year_level) as year_level,
      greatest(h.valid_from, p.from_time) as from_time,
      least(coalesce(h.valid_to, p.through_time), p.through_time) as through_time
    from periods p
    join public.student_enrollment_history h on h.semester_id = p.id
      and h.valid_from < p.through_time and (h.valid_to is null or h.valid_to > p.from_time)
    join public.students s on s.id = h.student_id and s.created_at < p.through_time
    where not exists (select 1 from public.admin_users a where a.id = s.id)
  ), per_student as materialized (
    select e.semester_id, e.year_level, e.student_id,
      avg(ci.overall_wellbeing) as wellbeing, avg(ci.stress_level) as stress, avg(ci.energy_level) as energy
    from enrollment e
    join public.student_check_ins ci on ci.student_id = e.student_id
      and ci.check_in_date between start_date and end_date
      and ci.created_at >= e.from_time and ci.created_at < e.through_time
    group by e.semester_id, e.year_level, e.student_id
  ), report_respondents as materialized (
    select distinct ci.student_id
    from public.student_check_ins ci
    join public.students s on s.id = ci.student_id and s.created_at < scope.cutoff
    where ci.check_in_date between start_date and least(end_date, (scope.cutoff at time zone scope.timezone_name)::date)
      and not exists (select 1 from public.admin_users a where a.id = s.id)
  ), semester_sizes as (
    select semester_id, count(distinct student_id) as enrolled from enrollment group by semester_id
  ), year_sizes as (
    select semester_id, year_level, count(distinct student_id) as enrolled from enrollment group by semester_id, year_level
  ), semester_responses as (
    select semester_id, count(distinct student_id) as respondents from per_student group by semester_id
  ), year_responses as (
    select semester_id, year_level, count(*) as respondents,
      round(avg(wellbeing),2) as average_wellbeing, round(avg(stress),2) as average_stress, round(avg(energy),2) as average_energy
    from per_student group by semester_id, year_level
  ), years(year_level, ordinal) as (
    values ('1st Year',1), ('2nd Year',2), ('3rd Year',3), ('4th Year',4), ('5th Year',5)
  ), candidates as materialized (
    select p.id as semester_id, p.academic_year, p.term, p.activated_at, y.year_level, y.ordinal,
      r.respondents, r.average_wellbeing, r.average_stress, r.average_energy,
      public.osas_release_fraction_v2(c.enrolled,s.enrolled)
        and public.osas_release_fraction_v2(r.respondents,c.enrolled)
        and public.osas_release_fraction_v2(r.respondents,sr.respondents)
        and public.osas_release_fraction_v2(r.respondents,(select count(*) from report_respondents)) as allowed
    from periods p cross join years y
    left join semester_sizes s on s.semester_id = p.id
    left join semester_responses sr on sr.semester_id = p.id
    left join year_sizes c on c.semester_id = p.id and c.year_level = y.year_level
    left join year_responses r on r.semester_id = p.id and r.year_level = y.year_level
  ), remainder as (
    -- The existing date report publishes overall ratings. Publishing several
    -- cells together must preserve a safe complement to that report as well.
    select count(*) not between 1 and 4 as allowed
    from report_respondents rr
    where not exists (
      select 1 from per_student ps join candidates c using (semester_id, year_level)
      where ps.student_id = rr.student_id and c.allowed
    )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'semester_id',c.semester_id,'academic_year',c.academic_year,'term',c.term,'year_level',c.year_level,
    'respondents',case when c.allowed and remainder.allowed then c.respondents end,
    'average_wellbeing',case when c.allowed and remainder.allowed then c.average_wellbeing end,
    'average_stress',case when c.allowed and remainder.allowed then c.average_stress end,
    'average_energy',case when c.allowed and remainder.allowed then c.average_energy end
  ) order by c.activated_at desc,c.semester_id,c.ordinal), '[]'::jsonb) into report
  from candidates c cross join remainder;

  insert into public.osas_report_audit_log(actor_id,action,period_start,period_end,filter_dimension,filter_value,outcome,cohort_size,complement_size)
  values (auth.uid(),'query',start_date,end_date,'year_level','Wellness by semester',
    case when exists (select 1 from jsonb_array_elements(report) as item(value) where item.value->>'respondents' is not null)
      then 'released' else 'suppressed' end,scope.registered,0);
  return report;
end;
$$;

revoke all on function public.osas_wellness_by_semester(date,date) from public, anon, authenticated, service_role;
grant execute on function public.osas_wellness_by_semester(date,date) to authenticated;

commit;
