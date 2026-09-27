-- Phase B: truthful admin operations, real quest editing, and student/admin separation.
-- Apply after 016_system_hardening_phase_a.sql. This migration is additive.
begin;

create or replace function public.admin_list_students()
returns table (
  id uuid, student_number text, name text, email text, course text,
  year_level text, section text, campus text, goal text, status text,
  level integer, total_xp integer, current_streak integer,
  quests_completed bigint, created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public, auth stable as $$
  select s.id, s.student_number, s.name, s.email, s.course, s.year_level,
    s.section, s.campus, s.goal, s.status, p.level, p.total_xp,
    p.current_streak, count(q.id) filter (where q.status = 'completed'),
    s.created_at, s.updated_at
  from public.students s
  left join public.profiles p on p.id = s.id
  left join public.quests q on q.owner_id = s.id
  where public.is_active_admin()
    and not exists (select 1 from public.admin_users a where a.id = s.id)
  group by s.id, s.student_number, s.name, s.email, s.course, s.year_level,
    s.section, s.campus, s.goal, s.status, p.level, p.total_xp,
    p.current_streak, s.created_at, s.updated_at
  order by s.created_at desc;
$$;
revoke all on function public.admin_list_students() from public;
grant execute on function public.admin_list_students() to authenticated;

create or replace function public.admin_list_quests()
returns table (
  id uuid, owner_id uuid, title text, description text, category text,
  xp integer, status text, completions bigint, assignee text, created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select q.id, q.owner_id, q.title, q.description, q.category, q.xp, q.status,
    case when q.status = 'completed' then 1::bigint else 0::bigint end,
    coalesce(s.name, 'Unknown student'), q.created_at
  from public.quests q
  left join public.students s on s.id = q.owner_id
  where public.is_active_admin()
    and not exists (select 1 from public.admin_users a where a.id = q.owner_id)
  order by q.created_at desc;
$$;
revoke all on function public.admin_list_quests() from public;
grant execute on function public.admin_list_quests() to authenticated;

create or replace function public.admin_create_quest(
  title_value text,
  description_value text,
  category_value text,
  xp_value integer,
  status_value text,
  assignee_id uuid default null
)
returns table (id uuid, owner_id uuid, assignee text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_admin() then raise exception 'Only active admins can create quests'; end if;
  if trim(coalesce(title_value, '')) = '' then raise exception 'Quest title is required'; end if;
  if char_length(trim(title_value)) > 100 then raise exception 'Quest title must not exceed 100 characters'; end if;
  if category_value not in ('Academics', 'Habits', 'Social', 'Health') then raise exception 'Invalid quest category'; end if;
  if xp_value not between 1 and 100 then raise exception 'Quest XP must be between 1 and 100'; end if;
  if status_value not in ('active', 'pending') then raise exception 'Invalid quest status'; end if;
  if assignee_id is not null and not exists (
    select 1 from public.students s
    where s.id = assignee_id and s.status = 'Active'
      and not exists (select 1 from public.admin_users a where a.id = s.id)
  ) then raise exception 'The selected student is not active or does not exist'; end if;

  return query
  insert into public.quests (owner_id, title, description, category, xp, status)
  select s.id, trim(title_value), nullif(trim(coalesce(description_value, '')), ''),
    category_value, xp_value, status_value
  from public.students s
  where s.status = 'Active'
    and not exists (select 1 from public.admin_users a where a.id = s.id)
    and (assignee_id is null or s.id = assignee_id)
  returning quests.id, quests.owner_id,
    (select students.name from public.students where students.id = quests.owner_id);
end;
$$;
revoke all on function public.admin_create_quest(text, text, text, integer, text, uuid) from public;
grant execute on function public.admin_create_quest(text, text, text, integer, text, uuid) to authenticated;

create or replace function public.admin_update_quest(
  quest_id_value uuid,
  title_value text,
  description_value text,
  category_value text,
  xp_value integer,
  status_value text
)
returns public.quests
language plpgsql security definer set search_path = public as $$
declare
  saved_quest public.quests;
begin
  if not public.is_active_admin() then raise exception 'Only active admins can update quests'; end if;
  if trim(coalesce(title_value, '')) = '' then raise exception 'Quest title is required'; end if;
  if char_length(trim(title_value)) > 100 then raise exception 'Quest title must not exceed 100 characters'; end if;
  if category_value not in ('Academics', 'Habits', 'Social', 'Health') then raise exception 'Invalid quest category'; end if;
  if xp_value not between 1 and 100 then raise exception 'Quest XP must be between 1 and 100'; end if;
  if status_value not in ('active', 'pending') then raise exception 'Invalid quest status'; end if;

  update public.quests q
  set title = trim(title_value),
      description = nullif(trim(coalesce(description_value, '')), ''),
      category = category_value,
      xp = xp_value,
      status = status_value
  where q.id = quest_id_value
    and q.status in ('active', 'pending')
    and not exists (select 1 from public.admin_users a where a.id = q.owner_id)
  returning q.* into saved_quest;

  if saved_quest.id is null then
    raise exception 'Editable student quest not found';
  end if;
  return saved_quest;
end;
$$;
revoke all on function public.admin_update_quest(uuid, text, text, text, integer, text) from public;
grant execute on function public.admin_update_quest(uuid, text, text, text, integer, text) to authenticated;

commit;
