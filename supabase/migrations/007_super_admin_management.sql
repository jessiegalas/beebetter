-- Role-aware admin management. Run after 006_admin_quest_management.sql.
-- Super Admins manage access for existing auth.users accounts. Auth account
-- creation itself must remain in Supabase Auth or a server-side invite flow.

alter table public.admin_users
  add column if not exists role text not null default 'admin'
    check (role in ('admin', 'super_admin')),
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists admin_users_role_active_idx
  on public.admin_users (role, is_active);

create or replace function public.is_active_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = user_id and is_active = true
  );
$$;

create or replace function public.is_super_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = user_id and role = 'super_admin' and is_active = true
  );
$$;

revoke all on function public.is_active_admin(uuid) from public;
revoke all on function public.is_super_admin(uuid) from public;
grant execute on function public.is_active_admin(uuid) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;

-- Keep existing admin read access, but only expose records to active admins.
drop policy if exists "Admins can view their own admin record" on public.admin_users;
create policy "Admins can view their own admin record"
  on public.admin_users for select
  to authenticated
  using (auth.uid() = id or public.is_active_admin());

drop policy if exists "Super admins manage admin records" on public.admin_users;
create policy "Super admins manage admin records"
  on public.admin_users for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.admin_get_my_role()
returns table (id uuid, role text, is_active boolean)
language sql
security definer
set search_path = public
stable
as $$
  select admin_users.id, admin_users.role, admin_users.is_active
  from public.admin_users
  where admin_users.id = auth.uid();
$$;

revoke all on function public.admin_get_my_role() from public;
grant execute on function public.admin_get_my_role() to authenticated;

drop function if exists public.super_admin_list_admins();
create or replace function public.super_admin_list_admins()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select admins.id, users.email, profiles.display_name, admins.role,
    admins.is_active, admins.created_at, admins.updated_at
  from public.admin_users as admins
  join auth.users as users on users.id = admins.id
  left join public.profiles as profiles on profiles.id = admins.id
  where public.is_super_admin();
$$;

revoke all on function public.super_admin_list_admins() from public;
grant execute on function public.super_admin_list_admins() to authenticated;

drop function if exists public.super_admin_grant_admin(uuid, text);
create or replace function public.super_admin_grant_admin(
  target_user_id uuid,
  role_value text default 'admin'
)
returns public.admin_users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_admin public.admin_users;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admins can manage admins';
  end if;
  if role_value not in ('admin', 'super_admin') then
    raise exception 'Invalid admin role';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Auth user not found. Create the account in Supabase Auth first.';
  end if;
  if target_user_id = auth.uid() and role_value <> 'super_admin' then
    raise exception 'A Super Admin cannot remove their own Super Admin role';
  end if;

  insert into public.admin_users (id, role, is_active, updated_at)
  values (target_user_id, role_value, true, now())
  on conflict (id) do update set role = excluded.role,
    is_active = true, updated_at = now()
  returning * into saved_admin;
  return saved_admin;
end;
$$;

revoke all on function public.super_admin_grant_admin(uuid, text) from public;
grant execute on function public.super_admin_grant_admin(uuid, text) to authenticated;

drop function if exists public.super_admin_update_admin(uuid, text, boolean);
create or replace function public.super_admin_update_admin(
  target_user_id uuid,
  role_value text,
  is_active_value boolean
)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_admin public.admin_users;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admins can manage admins';
  end if;
  if role_value not in ('admin', 'super_admin') then
    raise exception 'Invalid admin role';
  end if;
  if target_user_id = auth.uid() and (role_value <> 'super_admin' or not is_active_value) then
    raise exception 'A Super Admin cannot disable or demote their own account';
  end if;

  update public.admin_users
  set role = role_value, is_active = is_active_value, updated_at = now()
  where id = target_user_id
  returning * into saved_admin;
  if saved_admin.id is null then
    raise exception 'Admin record not found';
  end if;
  return saved_admin;
end;
$$;

revoke all on function public.super_admin_update_admin(uuid, text, boolean) from public;
grant execute on function public.super_admin_update_admin(uuid, text, boolean) to authenticated;

drop function if exists public.super_admin_remove_admin(uuid);
create or replace function public.super_admin_remove_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admins can manage admins';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'A Super Admin cannot remove their own account';
  end if;
  delete from public.admin_users where id = target_user_id;
end;
$$;

revoke all on function public.super_admin_remove_admin(uuid) from public;
grant execute on function public.super_admin_remove_admin(uuid) to authenticated;

-- Replace the existing admin RPC guards so disabling an admin also revokes
-- access to student and quest data immediately.
create or replace function public.admin_list_students()
returns table (id uuid, student_number text, name text, email text, course text, year_level text, section text, campus text, goal text, status text, level integer, total_xp integer, current_streak integer, quests_completed bigint, created_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = public, auth stable
as $$
  select students.id, students.student_number, students.name, students.email,
    students.course, students.year_level, students.section, students.campus,
    students.goal, students.status, profiles.level, profiles.total_xp,
    profiles.current_streak, count(quests.id) filter (where quests.status = 'completed'),
    students.created_at, students.updated_at
  from public.students as students
  left join public.profiles as profiles on profiles.id = students.id
  left join public.quests as quests on quests.owner_id = students.id
  where public.is_active_admin()
  group by students.id, students.student_number, students.name, students.email,
    students.course, students.year_level, students.section, students.campus,
    students.goal, students.status, profiles.level, profiles.total_xp,
    profiles.current_streak, students.created_at, students.updated_at
  order by students.created_at desc;
$$;
revoke all on function public.admin_list_students() from public;
grant execute on function public.admin_list_students() to authenticated;

create or replace function public.admin_update_student(student_id uuid, student_number_value text, name_value text, email_value text, course_value text, year_level_value text, section_value text, campus_value text, goal_value text, status_value text)
returns public.students
language plpgsql security definer set search_path = public
as $$
declare updated_student public.students;
begin
  if not public.is_active_admin() then raise exception 'Only active admins can update students'; end if;
  update public.students set student_number = trim(student_number_value), name = trim(name_value),
    email = coalesce((select email from auth.users where auth.users.id = student_id), email),
    course = trim(course_value), year_level = trim(year_level_value), section = trim(section_value),
    campus = trim(campus_value), goal = trim(goal_value), status = status_value, updated_at = now()
  where id = student_id returning * into updated_student;
  if updated_student.id is null then raise exception 'Student not found'; end if;
  return updated_student;
end;
$$;
revoke all on function public.admin_update_student(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_student(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.admin_list_quests()
returns table (id uuid, owner_id uuid, title text, description text, category text, xp integer, status text, completions bigint, assignee text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select quests.id, quests.owner_id, quests.title, quests.description, quests.category,
    quests.xp, quests.status, count(completed.id) filter (where completed.status = 'completed'),
    coalesce(students.name, 'Unknown student'), quests.created_at
  from public.quests as quests
  left join public.students as students on students.id = quests.owner_id
  left join public.quests as completed on completed.title = quests.title and completed.owner_id = quests.owner_id
  where public.is_active_admin()
  group by quests.id, quests.owner_id, quests.title, quests.description, quests.category,
    quests.xp, quests.status, students.name, quests.created_at
  order by quests.created_at desc;
$$;
revoke all on function public.admin_list_quests() from public;
grant execute on function public.admin_list_quests() to authenticated;

create or replace function public.admin_create_quest(title_value text, description_value text, category_value text, xp_value integer, status_value text, assignee_id uuid default null)
returns table (id uuid, owner_id uuid, assignee text)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_admin() then raise exception 'Only active admins can create quests'; end if;
  if trim(coalesce(title_value, '')) = '' then raise exception 'Quest title is required'; end if;
  if category_value not in ('Academics', 'Habits', 'Social', 'Health') then raise exception 'Invalid quest category'; end if;
  if xp_value not between 1 and 100 then raise exception 'Quest XP must be between 1 and 100'; end if;
  if status_value not in ('active', 'pending') then raise exception 'Invalid quest status'; end if;
  if assignee_id is not null and not exists (select 1 from public.students where id = assignee_id and status = 'Active') then raise exception 'The selected student is not active or does not exist'; end if;
  return query insert into public.quests (owner_id, title, description, category, xp, status)
    select students.id, trim(title_value), nullif(trim(coalesce(description_value, '')), ''), category_value, xp_value, status_value
    from public.students as students where students.status = 'Active' and (assignee_id is null or students.id = assignee_id)
    returning quests.id, quests.owner_id, (select students.name from public.students where students.id = quests.owner_id);
end;
$$;
revoke all on function public.admin_create_quest(text, text, text, integer, text, uuid) from public;
grant execute on function public.admin_create_quest(text, text, text, integer, text, uuid) to authenticated;
