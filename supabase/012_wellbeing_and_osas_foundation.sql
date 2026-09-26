-- Private student well-being records and separately authorized OSAS support access.
-- Apply after 011_student_registration_validation.sql. This migration is additive.
begin;

create table if not exists public.student_check_ins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  check_in_date date not null default current_date,
  overall_wellbeing smallint not null check (overall_wellbeing between 1 and 5),
  stress_level smallint not null check (stress_level between 1 and 5),
  energy_level smallint not null check (energy_level between 1 and 5),
  note text check (note is null or char_length(trim(note)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, check_in_date)
);

create table if not exists public.self_management_reflections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  period_start date not null,
  period_end date not null,
  planning_score smallint not null check (planning_score between 1 and 5),
  follow_through_score smallint not null check (follow_through_score between 1 and 5),
  confidence_score smallint not null check (confidence_score between 1 and 5),
  accomplishment text check (accomplishment is null or char_length(trim(accomplishment)) between 1 and 1000),
  challenge text check (challenge is null or char_length(trim(challenge)) between 1 and 1000),
  next_step text check (next_step is null or char_length(trim(next_step)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end),
  check (period_end - period_start <= 366)
);

-- OSAS permissions are deliberately independent from the broad admin role.
-- A person must first be an active admin, then receive one or both permissions.
create table if not exists public.osas_staff_permissions (
  user_id uuid primary key references public.admin_users(id) on delete cascade,
  can_view_aggregates boolean not null default false,
  can_manage_support_requests boolean not null default false,
  is_active boolean not null default true,
  granted_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (can_view_aggregates or can_manage_support_requests)
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  category text not null check (category in ('academic', 'personal', 'wellbeing', 'financial', 'safety', 'other')),
  message text not null check (char_length(trim(message)) between 1 and 2000),
  preferred_contact text not null check (preferred_contact in ('email', 'phone', 'in_app', 'in_person')),
  contact_detail text check (contact_detail is null or char_length(trim(contact_detail)) between 1 and 254),
  consent_to_contact boolean not null check (consent_to_contact),
  priority text not null default 'normal' check (priority in ('normal', 'soon', 'urgent')),
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'in_progress', 'resolved', 'withdrawn')),
  assigned_to uuid references public.admin_users(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(trim(resolution_note)) between 1 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved' and resolved_at is not null) or (status <> 'resolved' and resolved_at is null))
);

create index if not exists student_check_ins_student_date_idx on public.student_check_ins(student_id, check_in_date desc);
create index if not exists reflections_student_period_idx on public.self_management_reflections(student_id, period_end desc);
create index if not exists support_requests_status_created_idx on public.support_requests(status, created_at desc);
create index if not exists support_requests_student_created_idx on public.support_requests(student_id, created_at desc);

create or replace function public.set_wellbeing_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_student_check_ins_updated_at on public.student_check_ins;
create trigger set_student_check_ins_updated_at before update on public.student_check_ins
for each row execute function public.set_wellbeing_updated_at();
drop trigger if exists set_reflections_updated_at on public.self_management_reflections;
create trigger set_reflections_updated_at before update on public.self_management_reflections
for each row execute function public.set_wellbeing_updated_at();
drop trigger if exists set_support_requests_updated_at on public.support_requests;
create trigger set_support_requests_updated_at before update on public.support_requests
for each row execute function public.set_wellbeing_updated_at();
drop trigger if exists set_osas_permissions_updated_at on public.osas_staff_permissions;
create trigger set_osas_permissions_updated_at before update on public.osas_staff_permissions
for each row execute function public.set_wellbeing_updated_at();

create or replace function public.has_osas_permission(permission_name text, target_user_id uuid default auth.uid())
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_active_admin(target_user_id) and exists (
    select 1 from public.osas_staff_permissions permissions
    where permissions.user_id = target_user_id and permissions.is_active
      and case permission_name
        when 'view_aggregates' then permissions.can_view_aggregates
        when 'manage_support_requests' then permissions.can_manage_support_requests
        else false
      end
  );
$$;
revoke all on function public.has_osas_permission(text, uuid) from public;
grant execute on function public.has_osas_permission(text, uuid) to authenticated;

alter table public.student_check_ins enable row level security;
alter table public.self_management_reflections enable row level security;
alter table public.osas_staff_permissions enable row level security;
alter table public.support_requests enable row level security;

drop policy if exists "Students manage their own check-ins" on public.student_check_ins;
create policy "Students manage their own check-ins" on public.student_check_ins for all to authenticated
using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "Students manage their own reflections" on public.self_management_reflections;
create policy "Students manage their own reflections" on public.self_management_reflections for all to authenticated
using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "OSAS staff read their permissions" on public.osas_staff_permissions;
create policy "OSAS staff read their permissions" on public.osas_staff_permissions for select to authenticated
using (user_id = auth.uid() or public.is_super_admin());
drop policy if exists "Super admins manage OSAS permissions" on public.osas_staff_permissions;
create policy "Super admins manage OSAS permissions" on public.osas_staff_permissions for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Students create their own support requests" on public.support_requests;
create policy "Students create their own support requests" on public.support_requests for insert to authenticated
with check (student_id = auth.uid() and status = 'submitted' and assigned_to is null and resolution_note is null and resolved_at is null);
drop policy if exists "Students read their own support requests" on public.support_requests;
create policy "Students read their own support requests" on public.support_requests for select to authenticated
using (student_id = auth.uid());
drop policy if exists "Authorized OSAS staff read support requests" on public.support_requests;
create policy "Authorized OSAS staff read support requests" on public.support_requests for select to authenticated
using (public.has_osas_permission('manage_support_requests'));
drop policy if exists "Authorized OSAS staff update support requests" on public.support_requests;
create policy "Authorized OSAS staff update support requests" on public.support_requests for update to authenticated
using (public.has_osas_permission('manage_support_requests'))
with check (public.has_osas_permission('manage_support_requests'));

revoke all on table public.student_check_ins, public.self_management_reflections,
  public.osas_staff_permissions, public.support_requests from public, anon, authenticated;
grant select, insert, update, delete on public.student_check_ins, public.self_management_reflections to authenticated;
grant select on public.osas_staff_permissions to authenticated;
grant select, insert on public.support_requests to authenticated;

-- Students can withdraw a request but cannot edit case-management fields.
create or replace function public.student_withdraw_support_request(request_id uuid)
returns public.support_requests language plpgsql security definer set search_path = public as $$
declare saved_request public.support_requests;
begin
  update public.support_requests
  set status = 'withdrawn', assigned_to = null, resolution_note = null, resolved_at = null
  where id = request_id and student_id = auth.uid() and status in ('submitted', 'acknowledged', 'in_progress')
  returning * into saved_request;
  if saved_request.id is null then raise exception 'Support request cannot be withdrawn'; end if;
  return saved_request;
end;
$$;
revoke all on function public.student_withdraw_support_request(uuid) from public;
grant execute on function public.student_withdraw_support_request(uuid) to authenticated;

create or replace function public.osas_get_my_permissions()
returns table (can_view_aggregates boolean, can_manage_support_requests boolean, is_active boolean)
language sql security definer set search_path = public stable as $$
  select coalesce(p.can_view_aggregates, false) and coalesce(p.is_active, false) and public.is_active_admin(),
    coalesce(p.can_manage_support_requests, false) and coalesce(p.is_active, false) and public.is_active_admin(),
    coalesce(p.is_active, false) and public.is_active_admin()
  from (select 1) seed
  left join public.osas_staff_permissions p on p.user_id = auth.uid();
$$;
revoke all on function public.osas_get_my_permissions() from public;
grant execute on function public.osas_get_my_permissions() to authenticated;

create or replace function public.super_admin_set_osas_permissions(
  target_user_id uuid, view_aggregates boolean, manage_support_requests boolean, active boolean default true
) returns public.osas_staff_permissions
language plpgsql security definer set search_path = public as $$
declare saved_permissions public.osas_staff_permissions;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admins can manage OSAS permissions'; end if;
  if not exists (select 1 from public.admin_users where id = target_user_id) then
    raise exception 'OSAS personnel must have an admin account first';
  end if;
  if not view_aggregates and not manage_support_requests then
    delete from public.osas_staff_permissions where user_id = target_user_id returning * into saved_permissions;
    return saved_permissions;
  end if;
  insert into public.osas_staff_permissions(user_id, can_view_aggregates, can_manage_support_requests, is_active, granted_by)
  values(target_user_id, view_aggregates, manage_support_requests, active, auth.uid())
  on conflict(user_id) do update set can_view_aggregates = excluded.can_view_aggregates,
    can_manage_support_requests = excluded.can_manage_support_requests, is_active = excluded.is_active,
    granted_by = auth.uid(), updated_at = now()
  returning * into saved_permissions;
  return saved_permissions;
end;
$$;
revoke all on function public.super_admin_set_osas_permissions(uuid, boolean, boolean, boolean) from public;
grant execute on function public.super_admin_set_osas_permissions(uuid, boolean, boolean, boolean) to authenticated;

-- Raw check-ins never leave the student's RLS scope. Reports expose only cohorts
-- containing at least five distinct students.
create or replace function public.osas_check_in_summary(start_date date, end_date date, group_by text default 'all')
returns table (
  period_start date, period_end date, group_dimension text, group_value text,
  student_count bigint, check_in_count bigint, average_wellbeing numeric,
  average_stress numeric, average_energy numeric
) language plpgsql security definer set search_path = public stable as $$
begin
  if not public.has_osas_permission('view_aggregates') then raise exception 'OSAS aggregate permission required'; end if;
  if start_date is null or end_date is null or start_date > end_date or end_date - start_date > 366 then
    raise exception 'Choose a valid reporting period of at most 366 days';
  end if;
  if group_by not in ('all', 'course', 'year_level', 'campus') then raise exception 'Invalid grouping'; end if;
  return query
  select start_date, end_date, group_by,
    case group_by when 'course' then s.course when 'year_level' then s.year_level
      when 'campus' then s.campus else 'All students' end,
    count(distinct c.student_id), count(*), round(avg(c.overall_wellbeing), 2),
    round(avg(c.stress_level), 2), round(avg(c.energy_level), 2)
  from public.student_check_ins c join public.students s on s.id = c.student_id
  where c.check_in_date between start_date and end_date
  group by case group_by when 'course' then s.course when 'year_level' then s.year_level
    when 'campus' then s.campus else 'All students' end
  having count(distinct c.student_id) >= 5;
end;
$$;
revoke all on function public.osas_check_in_summary(date, date, text) from public;
grant execute on function public.osas_check_in_summary(date, date, text) to authenticated;

create or replace function public.osas_self_management_summary(start_date date, end_date date, group_by text default 'all')
returns table (
  period_start date, period_end date, group_dimension text, group_value text,
  student_count bigint, reflection_count bigint, average_planning numeric,
  average_follow_through numeric, average_confidence numeric
) language plpgsql security definer set search_path = public stable as $$
begin
  if not public.has_osas_permission('view_aggregates') then raise exception 'OSAS aggregate permission required'; end if;
  if start_date is null or end_date is null or start_date > end_date or end_date - start_date > 366 then
    raise exception 'Choose a valid reporting period of at most 366 days';
  end if;
  if group_by not in ('all', 'course', 'year_level', 'campus') then raise exception 'Invalid grouping'; end if;
  return query
  select start_date, end_date, group_by,
    case group_by when 'course' then s.course when 'year_level' then s.year_level
      when 'campus' then s.campus else 'All students' end,
    count(distinct r.student_id), count(*), round(avg(r.planning_score), 2),
    round(avg(r.follow_through_score), 2), round(avg(r.confidence_score), 2)
  from public.self_management_reflections r join public.students s on s.id = r.student_id
  where r.period_end between start_date and end_date
  group by case group_by when 'course' then s.course when 'year_level' then s.year_level
    when 'campus' then s.campus else 'All students' end
  having count(distinct r.student_id) >= 5;
end;
$$;
revoke all on function public.osas_self_management_summary(date, date, text) from public;
grant execute on function public.osas_self_management_summary(date, date, text) to authenticated;

create or replace function public.osas_list_support_requests(status_filter text default null)
returns table (
  id uuid, student_id uuid, student_number text, student_name text, student_email text,
  course text, year_level text, campus text, category text, message text,
  preferred_contact text, contact_detail text, priority text, status text,
  assigned_to uuid, resolution_note text, resolved_at timestamptz,
  created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = public stable as $$
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  if status_filter is not null and status_filter not in ('submitted', 'acknowledged', 'in_progress', 'resolved', 'withdrawn') then
    raise exception 'Invalid support request status';
  end if;
  return query select r.id, r.student_id, s.student_number, s.name, s.email,
    s.course, s.year_level, s.campus, r.category, r.message, r.preferred_contact,
    r.contact_detail, r.priority, r.status, r.assigned_to, r.resolution_note,
    r.resolved_at, r.created_at, r.updated_at
  from public.support_requests r join public.students s on s.id = r.student_id
  where status_filter is null or r.status = status_filter order by r.created_at desc;
end;
$$;
revoke all on function public.osas_list_support_requests(text) from public;
grant execute on function public.osas_list_support_requests(text) to authenticated;

create or replace function public.osas_update_support_request(
  request_id uuid, status_value text, assigned_to_value uuid default null, resolution_note_value text default null
) returns public.support_requests language plpgsql security definer set search_path = public as $$
declare saved_request public.support_requests;
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  if status_value not in ('acknowledged', 'in_progress', 'resolved') then raise exception 'Invalid support request status'; end if;
  if assigned_to_value is not null and not public.has_osas_permission('manage_support_requests', assigned_to_value) then
    raise exception 'Assignee must be authorized OSAS support personnel';
  end if;
  if resolution_note_value is not null and char_length(trim(resolution_note_value)) not between 1 and 2000 then
    raise exception 'Resolution note must contain 1 to 2000 characters';
  end if;
  update public.support_requests set status = status_value, assigned_to = assigned_to_value,
    resolution_note = nullif(trim(resolution_note_value), ''),
    resolved_at = case when status_value = 'resolved' then now() else null end
  where id = request_id and status <> 'withdrawn' returning * into saved_request;
  if saved_request.id is null then raise exception 'Support request not found or withdrawn'; end if;
  return saved_request;
end;
$$;
revoke all on function public.osas_update_support_request(uuid, text, uuid, text) from public;
grant execute on function public.osas_update_support_request(uuid, text, uuid, text) to authenticated;

commit;
