-- Add student information without replacing the existing profiles/progress model.
create table if not exists public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  student_number text not null unique,
  name text not null,
  email text not null,
  course text not null default 'Undeclared',
  year_level text not null default 'Not specified',
  section text not null default 'Not specified',
  campus text not null default 'Not specified',
  goal text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve existing accounts by creating a usable legacy student record for each one.
insert into public.students (id, student_number, name, email)
select
  users.id,
  'LEGACY-' || upper(left(replace(users.id::text, '-', ''), 8)),
  coalesce(profiles.display_name, split_part(users.email, '@', 1), 'Bee Explorer'),
  coalesce(users.email, '')
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
on conflict (id) do nothing;

create index if not exists students_status_idx on public.students (status);
create index if not exists students_created_at_idx on public.students (created_at desc);

alter table public.students enable row level security;

drop policy if exists "Students can view their own information" on public.students;
create policy "Students can view their own information"
  on public.students for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Students can insert their own information" on public.students;
create policy "Students can insert their own information"
  on public.students for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Students can update their own information" on public.students;
create policy "Students can update their own information"
  on public.students for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(metadata ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.students (id, student_number, name, email, course, year_level, section, campus, goal)
  values (
    new.id,
    coalesce(nullif(trim(metadata ->> 'student_number'), ''), 'LEGACY-' || upper(left(replace(new.id::text, '-', ''), 8))),
    coalesce(nullif(trim(metadata ->> 'name'), ''), metadata ->> 'display_name', split_part(new.email, '@', 1), 'Bee Explorer'),
    coalesce(new.email, ''),
    coalesce(nullif(trim(metadata ->> 'course'), ''), 'Undeclared'),
    coalesce(nullif(trim(metadata ->> 'year_level'), ''), 'Not specified'),
    coalesce(nullif(trim(metadata ->> 'section'), ''), 'Not specified'),
    coalesce(nullif(trim(metadata ->> 'campus'), ''), 'Not specified'),
    coalesce(metadata ->> 'goal', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop function if exists public.admin_list_students();
create or replace function public.admin_list_students()
returns table (
  id uuid,
  student_number text,
  name text,
  email text,
  course text,
  year_level text,
  section text,
  campus text,
  goal text,
  status text,
  level integer,
  total_xp integer,
  current_streak integer,
  quests_completed bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    students.id,
    students.student_number,
    students.name,
    students.email,
    students.course,
    students.year_level,
    students.section,
    students.campus,
    students.goal,
    students.status,
    profiles.level,
    profiles.total_xp,
    profiles.current_streak,
    count(quests.id) filter (where quests.status = 'completed'),
    students.created_at,
    students.updated_at
  from public.students as students
  left join public.profiles as profiles on profiles.id = students.id
  left join public.quests as quests on quests.owner_id = students.id
  where exists (select 1 from public.admin_users where admin_users.id = auth.uid())
  group by students.id, students.student_number, students.name, students.email,
    students.course, students.year_level, students.section, students.campus,
    students.goal, students.status, profiles.level, profiles.total_xp,
    profiles.current_streak, students.created_at, students.updated_at
  order by students.created_at desc;
$$;

revoke all on function public.admin_list_students() from public;
grant execute on function public.admin_list_students() to authenticated;

create or replace function public.admin_update_student(
  student_id uuid,
  student_number_value text,
  name_value text,
  email_value text,
  course_value text,
  year_level_value text,
  section_value text,
  campus_value text,
  goal_value text,
  status_value text
)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_student public.students;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only approved admins can update students';
  end if;

  update public.students
  set student_number = trim(student_number_value),
      name = trim(name_value),
      email = coalesce((select email from auth.users where auth.users.id = student_id), email),
      course = trim(course_value),
      year_level = trim(year_level_value),
      section = trim(section_value),
      campus = trim(campus_value),
      goal = trim(goal_value),
      status = status_value,
      updated_at = now()
  where id = student_id
  returning * into updated_student;

  if updated_student.id is null then
    raise exception 'Student not found';
  end if;
  return updated_student;
end;
$$;

revoke all on function public.admin_update_student(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_student(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
