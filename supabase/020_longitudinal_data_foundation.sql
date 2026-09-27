-- Phase D: institutional time, effective-dated enrollment, quest lifecycle history,
-- and completion-day streak semantics. Apply after 019_osas_reporting_privacy.sql.
begin;

create table if not exists public.system_configuration (
  singleton boolean primary key default true check (singleton),
  institutional_timezone text not null,
  updated_at timestamptz not null default now()
);
insert into public.system_configuration(singleton,institutional_timezone)
values(true,'Asia/Manila') on conflict(singleton) do update
set institutional_timezone=excluded.institutional_timezone,updated_at=now();
alter table public.system_configuration enable row level security;
revoke all on public.system_configuration from public,anon,authenticated;

create or replace function public.validate_institutional_timezone()
returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.institutional_timezone) then
    raise exception 'Unknown institutional timezone';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_institutional_timezone on public.system_configuration;
create trigger validate_institutional_timezone before insert or update of institutional_timezone
on public.system_configuration for each row execute function public.validate_institutional_timezone();

create or replace function public.institutional_timezone()
returns text language sql security definer set search_path=public stable as $$
  select institutional_timezone from public.system_configuration where singleton;
$$;
revoke all on function public.institutional_timezone() from public;
grant execute on function public.institutional_timezone() to authenticated;

create table if not exists public.student_enrollment_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course text not null,
  year_level text not null,
  campus text not null,
  section text not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  recorded_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);
create unique index if not exists student_enrollment_history_current_idx
on public.student_enrollment_history(student_id) where valid_to is null;
create index if not exists student_enrollment_history_period_idx
on public.student_enrollment_history(student_id,valid_from,valid_to);
alter table public.student_enrollment_history enable row level security;
revoke all on public.student_enrollment_history from public,anon,authenticated;

insert into public.student_enrollment_history(student_id,course,year_level,campus,section,valid_from)
select s.id,s.course,s.year_level,s.campus,s.section,s.created_at from public.students s
where not exists(select 1 from public.student_enrollment_history h where h.student_id=s.id)
on conflict do nothing;

create or replace function public.record_student_enrollment_period()
returns trigger language plpgsql security definer set search_path=public as $$
declare changed_at timestamptz := clock_timestamp();
begin
  if tg_op='INSERT' then
    insert into public.student_enrollment_history(student_id,course,year_level,campus,section,valid_from)
    values(new.id,new.course,new.year_level,new.campus,new.section,coalesce(new.created_at,changed_at))
    on conflict do nothing;
  elsif (new.course,new.year_level,new.campus,new.section) is distinct from (old.course,old.year_level,old.campus,old.section) then
    update public.student_enrollment_history set valid_to=changed_at
      where student_id=new.id and valid_to is null;
    insert into public.student_enrollment_history(student_id,course,year_level,campus,section,valid_from)
    values(new.id,new.course,new.year_level,new.campus,new.section,changed_at);
  end if;
  return new;
end;
$$;
drop trigger if exists record_student_enrollment_period on public.students;
create trigger record_student_enrollment_period after insert or update of course,year_level,campus,section
on public.students for each row execute function public.record_student_enrollment_period();

create table if not exists public.quest_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null,
  owner_id uuid not null,
  event_type text not null check(event_type in ('created','status_changed','completed','deleted')),
  from_status text,
  to_status text,
  title text not null,
  category text not null,
  xp integer not null,
  course text,
  year_level text,
  campus text,
  section text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create unique index if not exists quest_lifecycle_created_once_idx on public.quest_lifecycle_events(quest_id) where event_type='created';
create unique index if not exists quest_lifecycle_completed_once_idx on public.quest_lifecycle_events(quest_id) where event_type='completed';
create index if not exists quest_lifecycle_owner_time_idx on public.quest_lifecycle_events(owner_id,occurred_at);
alter table public.quest_lifecycle_events enable row level security;
revoke all on public.quest_lifecycle_events from public,anon,authenticated;
grant select on public.quest_lifecycle_events to authenticated;
drop policy if exists "Students read their quest lifecycle" on public.quest_lifecycle_events;
create policy "Students read their quest lifecycle" on public.quest_lifecycle_events for select to authenticated
using(owner_id=auth.uid());

insert into public.quest_lifecycle_events(quest_id,owner_id,event_type,to_status,title,category,xp,course,year_level,campus,section,occurred_at)
select q.id,q.owner_id,'created',q.status,q.title,q.category,q.xp,s.course,s.year_level,s.campus,s.section,q.created_at
from public.quests q left join public.students s on s.id=q.owner_id
where not exists(select 1 from public.quest_lifecycle_events e where e.quest_id=q.id and e.event_type='created');
insert into public.quest_lifecycle_events(quest_id,owner_id,event_type,from_status,to_status,title,category,xp,course,year_level,campus,section,occurred_at)
select q.id,q.owner_id,'completed','active','completed',q.title,q.category,q.xp,s.course,s.year_level,s.campus,s.section,coalesce(q.completed_at,q.updated_at)
from public.quests q left join public.students s on s.id=q.owner_id where q.status='completed'
and not exists(select 1 from public.quest_lifecycle_events e where e.quest_id=q.id and e.event_type='completed');

create or replace function public.record_quest_lifecycle_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare enrollment public.students%rowtype; kind text;
begin
  select * into enrollment from public.students where id=coalesce(new.owner_id,old.owner_id);
  if tg_op='INSERT' then kind:='created';
  elsif tg_op='DELETE' then kind:='deleted';
  elsif new.status is not distinct from old.status then return new;
  elsif new.status='completed' then kind:='completed';
  else kind:='status_changed'; end if;
  insert into public.quest_lifecycle_events(quest_id,owner_id,event_type,from_status,to_status,title,category,xp,course,year_level,campus,section,occurred_at)
  values(coalesce(new.id,old.id),coalesce(new.owner_id,old.owner_id),kind,
    case when tg_op='INSERT' then null else old.status end,case when tg_op='DELETE' then null else new.status end,
    coalesce(new.title,old.title),coalesce(new.category,old.category),coalesce(new.xp,old.xp),
    enrollment.course,enrollment.year_level,enrollment.campus,enrollment.section,
    case when kind='created' then new.created_at when kind='completed' then new.completed_at else now() end)
  on conflict do nothing;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists record_quest_lifecycle_event on public.quests;
create trigger record_quest_lifecycle_event after insert or update of status or delete on public.quests
for each row execute function public.record_quest_lifecycle_event();

create or replace function public.calculate_student_streak(target_student_id uuid)
returns integer language plpgsql security definer set search_path=public stable as $$
declare streak integer; latest_day date; today_local date;
begin
  today_local := (now() at time zone public.institutional_timezone())::date;
  with days as (
    select distinct (h.completed_at at time zone public.institutional_timezone())::date completion_date
    from public.quest_completion_history h where h.owner_id=target_student_id
  ), latest as (select max(completion_date) completion_date from days), numbered as (
    select d.completion_date,row_number() over(order by d.completion_date desc) rn from days d
  )
  select case when l.completion_date is null or l.completion_date < today_local-1 then 0
    else count(*) filter(where n.completion_date=l.completion_date-(n.rn::integer-1)) end, l.completion_date
  into streak,latest_day from latest l left join numbered n on true group by l.completion_date;
  streak:=coalesce(streak,0);
  return streak;
end;
$$;
revoke all on function public.calculate_student_streak(uuid) from public;

create or replace function public.refresh_student_streak(target_student_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare streak integer;
begin
  streak:=public.calculate_student_streak(target_student_id);
  update public.profiles set current_streak=streak,updated_at=now() where id=target_student_id;
  return streak;
end;
$$;
revoke all on function public.refresh_student_streak(uuid) from public;

create or replace function public.student_get_current_streak()
returns integer language sql security definer set search_path=public stable as $$
  select public.calculate_student_streak(auth.uid());
$$;
revoke all on function public.student_get_current_streak() from public;
grant execute on function public.student_get_current_streak() to authenticated;

create or replace function public.admin_list_students()
returns table(id uuid,student_number text,name text,email text,course text,year_level text,section text,campus text,
  goal text,status text,level integer,total_xp integer,current_streak integer,quests_completed bigint,created_at timestamptz,updated_at timestamptz)
language sql security definer set search_path=public,auth stable as $$
  select s.id,s.student_number,s.name,s.email,s.course,s.year_level,s.section,s.campus,s.goal,s.status,
    p.level,p.total_xp,public.calculate_student_streak(s.id),count(q.id) filter(where q.status='completed'),s.created_at,s.updated_at
  from public.students s left join public.profiles p on p.id=s.id left join public.quests q on q.owner_id=s.id
  where public.is_active_admin() and not exists(select 1 from public.admin_users a where a.id=s.id)
  group by s.id,s.student_number,s.name,s.email,s.course,s.year_level,s.section,s.campus,s.goal,s.status,
    p.level,p.total_xp,s.created_at,s.updated_at order by s.created_at desc;
$$;
revoke all on function public.admin_list_students() from public;
grant execute on function public.admin_list_students() to authenticated;

create or replace function public.refresh_streak_after_completion()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.refresh_student_streak(new.owner_id); return new; end;
$$;
drop trigger if exists zz_refresh_streak_after_completion on public.quest_completion_history;
create trigger zz_refresh_streak_after_completion after insert on public.quest_completion_history
for each row execute function public.refresh_streak_after_completion();

do $$ declare student record; begin
  for student in select id from public.students loop perform public.refresh_student_streak(student.id); end loop;
end $$;

comment on column public.profiles.current_streak is
'Consecutive institutional calendar days with at least one quest completion, ending today or yesterday in the configured institutional timezone.';

commit;
