begin;

-- The hosted schema already has provenance. Older installs of the numbered
-- migrations may lack it. An existing quest alone does not prove its origin.
create table if not exists public.admin_quest_assignments (
  original_quest_id uuid primary key,
  quest_id uuid unique references public.quests(id) on delete set null,
  owner_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);
alter table public.admin_quest_assignments enable row level security;
revoke all on public.admin_quest_assignments from public, anon, authenticated;
grant all on public.admin_quest_assignments to service_role;

alter table public.admin_quest_assignments
  add column publish_batch_id uuid,
  add column published_at timestamptz,
  add column published_category text,
  add constraint admin_quest_assignments_publication_check check (
    (publish_batch_id is null and published_at is null and published_category is null)
    or (publish_batch_id is not null and published_at is not null and published_category is not null)
  );
create unique index admin_quest_assignments_batch_owner_idx
  on public.admin_quest_assignments(publish_batch_id, owner_id) where publish_batch_id is not null;
create index admin_quest_assignments_publication_idx
  on public.admin_quest_assignments(published_at) where published_at is not null;

alter table public.quest_lifecycle_events add column student_created boolean;
create index quest_lifecycle_active_quest_time_idx
  on public.quest_lifecycle_events(quest_id, occurred_at) where to_status='active' and event_type in ('created','status_changed');

create or replace function public.record_quest_lifecycle_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare enrollment public.students%rowtype; kind text;
begin
  select * into enrollment from public.students where id=coalesce(new.owner_id,old.owner_id);
  if tg_op='INSERT' then kind:='created';
  elsif tg_op='DELETE' then kind:='deleted';
  elsif new.status is not distinct from old.status then return new;
  elsif new.status='completed' then kind:='completed';
  else kind:='status_changed'; end if;
  insert into public.quest_lifecycle_events(
    quest_id, owner_id, event_type, from_status, to_status, title, category, xp,
    course, year_level, campus, section, occurred_at, student_created
  ) values (
    coalesce(new.id,old.id),coalesce(new.owner_id,old.owner_id),kind,
    case when tg_op='INSERT' then null else old.status end,case when tg_op='DELETE' then null else new.status end,
    coalesce(new.title,old.title),coalesce(new.category,old.category),coalesce(new.xp,old.xp),
    enrollment.course,enrollment.year_level,enrollment.campus,enrollment.section,
    case when kind='created' then new.created_at when kind='completed' then new.completed_at else now() end,
    case when kind='created' then auth.uid() = new.owner_id and not public.is_active_admin() end
  ) on conflict do nothing;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.admin_create_quest(
  title_value text, description_value text, category_value text, xp_value integer,
  status_value text, assignee_id uuid default null
) returns table(id uuid, owner_id uuid, assignee text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  batch_id uuid := case when status_value = 'active' then gen_random_uuid() end;
begin
  if not public.is_active_admin() then raise exception 'Only active admins can create quests'; end if;
  if trim(coalesce(title_value,''))='' then raise exception 'Quest title is required'; end if;
  if char_length(trim(title_value))>100 then raise exception 'Quest title must not exceed 100 characters'; end if;
  if category_value not in ('Academics','Habits','Social','Health') then raise exception 'Invalid quest category'; end if;
  if xp_value not between 1 and 100 then raise exception 'Quest XP must be between 1 and 100'; end if;
  if status_value not in ('active','pending') then raise exception 'Invalid quest status'; end if;
  if assignee_id is not null and not exists(
    select 1 from public.students s where s.id=assignee_id and s.status='Active'
      and not exists(select 1 from public.admin_users a where a.id=s.id)
  ) then raise exception 'The selected student is not active or does not exist'; end if;

  return query with created as (
    insert into public.quests(owner_id,title,description,category,xp,status)
    select s.id,trim(title_value),nullif(trim(coalesce(description_value,'')),''),category_value,xp_value,status_value
    from public.students s where s.status='Active'
      and not exists(select 1 from public.admin_users a where a.id=s.id)
      and (assignee_id is null or s.id=assignee_id)
    returning quests.id,quests.owner_id
  ), marked as (
    insert into public.admin_quest_assignments(
      original_quest_id,quest_id,owner_id,assigned_by,publish_batch_id,published_at,published_category
    )
    select c.id,c.id,c.owner_id,auth.uid(),batch_id,
      case when batch_id is not null then now() end,
      case when batch_id is not null then category_value end
    from created c
    returning admin_quest_assignments.quest_id
  ) select c.id,c.owner_id,s.name from created c
    join marked m on m.quest_id=c.id join public.students s on s.id=c.owner_id;
end;
$$;

create or replace function public.admin_update_quest(
  quest_id_value uuid, title_value text, description_value text, category_value text,
  xp_value integer, status_value text
) returns public.quests
language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_quest public.quests;
begin
  if not public.is_active_admin() then raise exception 'Only active admins can update quests'; end if;
  if trim(coalesce(title_value,''))='' then raise exception 'Quest title is required'; end if;
  if char_length(trim(title_value))>100 then raise exception 'Quest title must not exceed 100 characters'; end if;
  if category_value not in ('Academics','Habits','Social','Health') then raise exception 'Invalid quest category'; end if;
  if xp_value not between 1 and 100 then raise exception 'Quest XP must be between 1 and 100'; end if;
  if status_value not in ('active','pending') then raise exception 'Invalid quest status'; end if;
  update public.quests q set title=trim(title_value),description=nullif(trim(coalesce(description_value,'')),''),
    category=category_value,xp=xp_value,status=status_value
  where q.id=quest_id_value and q.status in ('active','pending')
    and exists(select 1 from public.admin_quest_assignments a where a.quest_id=q.id and a.owner_id=q.owner_id)
    and not exists(select 1 from public.admin_users staff where staff.id=q.owner_id)
  returning q.* into saved_quest;
  if saved_quest.id is null then raise exception 'Editable admin-assigned quest not found'; end if;

  if status_value = 'active' then
    update public.admin_quest_assignments a
    set publish_batch_id=gen_random_uuid(),published_at=now(),published_category=category_value
    where a.quest_id=saved_quest.id and a.publish_batch_id is null
      and exists (
        select 1 from public.quest_lifecycle_events e
        where e.quest_id=a.original_quest_id and e.event_type='created' and e.to_status='pending'
          and e.occurred_at=e.recorded_at
      )
      and not exists (
        select 1 from public.quest_lifecycle_events e
        where e.quest_id=a.original_quest_id and e.to_status='active' and e.occurred_at < now()
      );
  end if;
  return saved_quest;
end;
$$;

create function public.admin_get_quest_activity_code(quest_id_value uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  return (select a.publish_batch_id from public.admin_quest_assignments a where a.original_quest_id=quest_id_value);
end;
$$;

-- Match the deployed assignment list on an install from the numbered history.
create or replace function public.admin_list_quests_page(
  page_size integer default 50,page_offset integer default 0,search_query text default null,
  status_filter text default null,difficulty_filter text default null
) returns table(id uuid,owner_id uuid,title text,description text,category text,xp integer,status text,
  completions bigint,assignee text,created_at timestamptz,total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if page_size not between 1 and 100 or page_offset<0 or page_offset>100000 then raise exception 'Invalid pagination'; end if;
  if status_filter is not null and status_filter not in ('active','pending','completed','rejected') then raise exception 'Invalid quest status'; end if;
  if difficulty_filter is not null and difficulty_filter not in ('Easy','Medium','Hard') then raise exception 'Invalid difficulty'; end if;
  return query with filtered as (
    select q.id,q.owner_id,q.title,q.description,q.category,q.xp,q.status,
      count(h.id) completions,coalesce(s.name,s.email,q.owner_id::text) assignee,q.created_at
    from public.quests q
    join public.admin_quest_assignments a on a.quest_id=q.id and a.owner_id=q.owner_id
    left join public.students s on s.id=q.owner_id
    left join public.quest_completion_history h on h.quest_id=q.id
    where not exists(select 1 from public.admin_users staff where staff.id=q.owner_id)
      and (status_filter is null or q.status=status_filter)
      and (difficulty_filter is null or case when q.xp>=50 then 'Hard' when q.xp>=30 then 'Medium' else 'Easy' end=difficulty_filter)
      and (nullif(trim(search_query),'') is null or concat_ws(' ',q.title,q.category,s.name,s.student_number) ilike '%'||trim(search_query)||'%')
    group by q.id,q.owner_id,q.title,q.description,q.category,q.xp,q.status,s.name,s.email,q.created_at
  ) select f.*,count(*) over() from filtered f order by f.created_at desc,f.id limit page_size offset page_offset;
end;
$$;

-- Reuse the current eligibility check and period bounds when authorizing either
-- a report query or its export. Student registration does not require a section.
create function public.osas_report_scope_v2(start_date date, end_date date)
returns table(timezone_name text, period_from timestamptz, cutoff timestamptz, registered bigint)
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if not public.has_osas_permission('view_aggregates') then raise exception 'OSAS aggregate permission required'; end if;
  if start_date is null or end_date is null or start_date > end_date or end_date-start_date > 366 then
    raise exception 'Choose a valid reporting period of at most 366 days';
  end if;
  timezone_name := public.institutional_timezone();
  period_from := start_date::timestamp at time zone timezone_name;
  cutoff := least((end_date+1)::timestamp at time zone timezone_name, statement_timestamp());
  select count(*) into registered from public.students s
  where s.created_at < cutoff and not exists (select 1 from public.admin_users a where a.id=s.id);
  return next;
end;
$$;

create function public.osas_release_fraction_v2(numerator bigint, denominator bigint) returns boolean
language sql immutable set search_path = '' as $$
  select denominator >= 5 and numerator >= 5 and (denominator-numerator = 0 or denominator-numerator >= 5);
$$;

create function public.osas_dashboard_analytics_v2(start_date date, end_date date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare scope record; report jsonb;
begin
  select * into scope from public.osas_report_scope_v2(start_date,end_date);
  insert into public.osas_report_audit_log(actor_id,action,period_start,period_end,outcome,cohort_size,complement_size)
  values (auth.uid(),'query',start_date,end_date,case when scope.registered < 5 then 'suppressed' else 'released' end,scope.registered,0);

  report := jsonb_build_object(
    'suppressed',scope.registered < 5,'minimum_cohort',5,'period_start',start_date,'period_end',end_date,
    'institutional_timezone',scope.timezone_name,
    'cohort_as_of',least(end_date,(scope.cutoff at time zone scope.timezone_name)::date),
    'participation',null,'activity_trends','[]'::jsonb,'student_interests','[]'::jsonb,
    'first_week',null,'repeat_participation','[]'::jsonb,'assignment_outcomes','[]'::jsonb,
    'wellbeing',null,'wellbeing_trends','[]'::jsonb
  );
  if scope.registered < 5 then return report; end if;

  return report || (
    with cohort as materialized (
      select s.id, s.created_at from public.students s where s.created_at < scope.cutoff
        and not exists (select 1 from public.admin_users a where a.id=s.id)
    ), events as materialized (
      select e.quest_id,e.owner_id,e.event_type,e.category,e.occurred_at
      from public.quest_lifecycle_events e join cohort c on c.id=e.owner_id
      where e.occurred_at >= scope.period_from and e.occurred_at < scope.cutoff
        and e.event_type in ('created','completed')
    ), activity_buckets as (
      select case when end_date-start_date <= 31 then (e.occurred_at at time zone scope.timezone_name)::date
        else date_trunc('week',e.occurred_at at time zone scope.timezone_name)::date end bucket_start,
        count(distinct e.owner_id) student_count,count(*) completion_events
      from events e where e.event_type='completed' group by 1 having count(distinct e.owner_id) >= 5
    ), interest_labels(category, ordinal) as (
      values ('Academics',1),('Habits',2),('Social',3),('Health',4),('Other',5)
    ), interest_counts as (
      select case when e.category in ('Academics','Habits','Social','Health') then e.category else 'Other' end category,
        count(distinct e.owner_id) filter(where e.event_type='created') creators,
        count(distinct e.owner_id) filter(where e.event_type='completed') completers
      from events e
      where exists (
        select 1 from public.quest_lifecycle_events origin where origin.quest_id=e.quest_id
          and origin.owner_id=e.owner_id and origin.event_type='created' and origin.student_created
      ) and not exists (select 1 from public.admin_quest_assignments a where a.original_quest_id=e.quest_id)
      group by 1
    ), first_week as (
      select count(*) eligible, count(*) filter (where exists (
        select 1 from public.quest_lifecycle_events e where e.owner_id=c.id and e.event_type='completed'
          and e.occurred_at >= c.created_at and e.occurred_at < c.created_at + interval '168 hours'
      )) completed
      from cohort c where c.created_at >= scope.period_from and c.created_at + interval '168 hours' <= scope.cutoff
    ), weeks as (
      select w::date week_start,
        greatest(w::date,start_date) from_date,
        least(w::date+7,end_date+1,(scope.cutoff at time zone scope.timezone_name)::date+1) before_date,
        w::date < start_date or ((w::date+7)::timestamp at time zone scope.timezone_name) > scope.cutoff partial
      from generate_series(date_trunc('week',start_date::timestamp),date_trunc('week',end_date::timestamp),interval '7 days') w
      where greatest(w::date,start_date)::timestamp at time zone scope.timezone_name < scope.cutoff
    ), weekly_completers as (
      select distinct e.owner_id,date_trunc('week',e.occurred_at at time zone scope.timezone_name)::date week_start
      from events e where e.event_type='completed'
    ), repeat_counts as (
      select w.week_start,count(a.owner_id) eligible,count(b.owner_id) completed
      from weeks w join weeks next_week on next_week.week_start=w.week_start+7 and not next_week.partial
      left join weekly_completers a on a.week_start=w.week_start
      left join weekly_completers b on b.week_start=next_week.week_start and b.owner_id=a.owner_id
      where not w.partial group by w.week_start
    ), checkins as materialized (
      select w.week_start,w.before_date,ci.student_id,ci.overall_wellbeing,ci.stress_level,ci.energy_level
      from weeks w join public.student_check_ins ci on ci.check_in_date >= w.from_date and ci.check_in_date < w.before_date
      join cohort c on c.id=ci.student_id
        and c.created_at < (w.before_date::timestamp at time zone scope.timezone_name)
    ), wellness_buckets as (
      select week_start,count(*) student_count,round(avg(wellbeing),2) average_wellbeing,
        round(avg(stress),2) average_stress,round(avg(energy),2) average_energy
      from (
        select week_start,student_id,avg(overall_wellbeing) wellbeing,avg(stress_level) stress,avg(energy_level) energy
        from checkins group by week_start,student_id
      ) per_student group by week_start having count(*) >= 5
    ), wellness_period as (
      select count(*) student_count,round(avg(wellbeing),2) average_wellbeing,
        round(avg(stress),2) average_stress,round(avg(energy),2) average_energy
      from (
        select student_id,avg(overall_wellbeing) wellbeing,avg(stress_level) stress,avg(energy_level) energy
        from checkins group by student_id
      ) per_student having count(*) >= 5
    ), legacy_publications as (
      select a.original_quest_id,a.owner_id,first_live.occurred_at published_at,first_live.category published_category
      from public.admin_quest_assignments a join cohort c on c.id=a.owner_id
      join public.quest_lifecycle_events created on created.quest_id=a.original_quest_id
        and created.owner_id=a.owner_id and created.event_type='created' and created.occurred_at=created.recorded_at
      cross join lateral (
        select e.occurred_at,e.category from public.quest_lifecycle_events e
        where e.quest_id=a.original_quest_id and e.owner_id=a.owner_id and e.to_status='active'
          and e.event_type in ('created','status_changed') and e.occurred_at >= created.occurred_at
        order by e.occurred_at,e.id limit 1
      ) first_live
      where a.publish_batch_id is null
        and first_live.occurred_at >= scope.period_from and first_live.occurred_at + interval '336 hours' <= scope.cutoff
    ), publications as (
      select a.original_quest_id,a.owner_id,a.publish_batch_id,a.published_at,a.published_category
      from public.admin_quest_assignments a join cohort c on c.id=a.owner_id
      where a.published_at >= scope.period_from and a.published_at < scope.cutoff
      union all
      select l.original_quest_id,l.owner_id,null::uuid,l.published_at,l.published_category from legacy_publications l
    ), assignment_students as (
      select p.publish_batch_id,p.published_category,p.owner_id,min(p.published_at) published_at,
        min(extract(epoch from (done.occurred_at-p.published_at))/3600) hours_to_complete
      from publications p left join public.quest_lifecycle_events done
        on done.quest_id=p.original_quest_id and done.owner_id=p.owner_id and done.event_type='completed'
        and done.occurred_at >= p.published_at and done.occurred_at < p.published_at + interval '336 hours'
        and done.occurred_at < scope.cutoff
      group by p.publish_batch_id,p.published_category,p.owner_id
    ), assignment_counts as (
      select publish_batch_id,published_category,min(published_at) published_at,
        count(*) eligible,count(hours_to_complete) completed,
        round((percentile_cont(0.5) within group (order by hours_to_complete))::numeric,1) median_hours
      from assignment_students group by publish_batch_id,published_category having count(*) >= 5
    ), assignment_rows as (
      select a.*,a.publish_batch_id is not null and a.published_at+interval '336 hours' > scope.cutoff in_progress
      from assignment_counts a
    )
    select jsonb_build_object(
      'participation',jsonb_build_object(
        'registered_students',scope.registered,
        'participating_students',(select count(distinct owner_id) from events having count(distinct owner_id) >= 5),
        'completion_events',(select count(*) from events where event_type='completed' having count(distinct owner_id) >= 5)
      ),
      'activity_trends',coalesce((select jsonb_agg(to_jsonb(a) order by a.bucket_start) from activity_buckets a),'[]'::jsonb),
      'student_interests',(select jsonb_agg(jsonb_build_object('category',l.category,
        'creators',case when public.osas_release_fraction_v2(i.creators,scope.registered) then i.creators end,
        'completers',case when public.osas_release_fraction_v2(i.completers,scope.registered) then i.completers end
      ) order by l.ordinal) from interest_labels l left join interest_counts i using(category)),
      'first_week',(select case when public.osas_release_fraction_v2(f.completed,f.eligible) then
        jsonb_build_object('eligible',f.eligible,'completed',f.completed,'rate',round(100.0*f.completed/f.eligible,1))
      end from first_week f),
      'repeat_participation',coalesce((select jsonb_agg(jsonb_build_object(
        'week_start',r.week_start,'next_week_start',r.week_start+7,
        'eligible',case when released.allowed then r.eligible end,
        'completed',case when released.allowed then r.completed end,
        'rate',case when released.allowed then round(100.0*r.completed/r.eligible,1) end
      ) order by r.week_start) from repeat_counts r cross join lateral (
        select public.osas_release_fraction_v2(r.completed,r.eligible) allowed
      ) released),'[]'::jsonb),
      'assignment_outcomes',coalesce((select jsonb_agg(jsonb_build_object(
        'activity_code',a.publish_batch_id,
        'published_date',case when a.publish_batch_id is not null then (a.published_at at time zone scope.timezone_name)::date end,
        'category',case when a.published_category in ('Academics','Habits','Social','Health') then a.published_category else 'Other' end,
        'assigned',a.eligible,'in_progress',a.in_progress,
        'completed',case when released.allowed then a.completed end,
        'rate',case when released.allowed then round(100.0*a.completed/a.eligible,1) end,
        'median_hours',case when released.allowed then a.median_hours end
      ) order by a.publish_batch_id is null,a.published_at desc,a.publish_batch_id,a.published_category)
      from assignment_rows a cross join lateral (
        select not a.in_progress and public.osas_release_fraction_v2(a.completed,a.eligible) allowed
      ) released),'[]'::jsonb),
      'wellbeing',(select to_jsonb(p) from wellness_period p where public.osas_release_fraction_v2(p.student_count,scope.registered)),
      'wellbeing_trends',(select coalesce(jsonb_agg(jsonb_build_object(
        'bucket_start',w.week_start,'from_date',w.from_date,'through_date',w.before_date-1,'partial',w.partial,
        'student_count',b.student_count,'registered_students',case when eligible.total >= 5 then eligible.total end,
        'coverage',case when public.osas_release_fraction_v2(b.student_count,eligible.total)
          then round(100.0*b.student_count/eligible.total,1) end,
        'average_wellbeing',b.average_wellbeing,'average_stress',b.average_stress,'average_energy',b.average_energy
      ) order by w.week_start),'[]'::jsonb) from weeks w
      cross join lateral (select count(*) total from cohort c where c.created_at < (w.before_date::timestamp at time zone scope.timezone_name)) eligible
      left join wellness_buckets b on b.week_start=w.week_start and public.osas_release_fraction_v2(b.student_count,eligible.total))
    )
  );
end;
$$;

create function public.osas_log_dashboard_export_v2(start_date date, end_date date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare scope record;
begin
  select * into scope from public.osas_report_scope_v2(start_date,end_date);
  if scope.registered < 5 then raise exception 'This cohort is suppressed and cannot be exported'; end if;
  insert into public.osas_report_audit_log(actor_id,action,period_start,period_end,outcome,cohort_size,complement_size)
  values(auth.uid(),'export',start_date,end_date,'released',scope.registered,0);
end;
$$;

revoke all on function public.osas_report_scope_v2(date,date),public.osas_release_fraction_v2(bigint,bigint)
  from public,anon,authenticated;
revoke all on function public.osas_dashboard_analytics_v2(date,date),public.osas_log_dashboard_export_v2(date,date),
  public.admin_get_quest_activity_code(uuid),public.admin_create_quest(text,text,text,integer,text,uuid),
  public.admin_update_quest(uuid,text,text,text,integer,text),public.admin_list_quests_page(integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.osas_dashboard_analytics_v2(date,date),public.osas_log_dashboard_export_v2(date,date),
  public.admin_get_quest_activity_code(uuid),public.admin_create_quest(text,text,text,integer,text,uuid),
  public.admin_update_quest(uuid,text,text,text,integer,text),public.admin_list_quests_page(integer,integer,text,text,text) to authenticated;

commit;
