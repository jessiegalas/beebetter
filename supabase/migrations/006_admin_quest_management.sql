-- Admin quest management. Run after 005_students.sql.
-- A quest assigned to Everyone is stored once for each active student so the
-- existing mobile owner_id security model can continue to work.

drop function if exists public.admin_list_quests();
create or replace function public.admin_list_quests()
returns table (
  id uuid,
  owner_id uuid,
  title text,
  description text,
  category text,
  xp integer,
  status text,
  completions bigint,
  assignee text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    quests.id,
    quests.owner_id,
    quests.title,
    quests.description,
    quests.category,
    quests.xp,
    quests.status,
    count(completed.id) filter (where completed.status = 'completed'),
    coalesce(students.name, 'Unknown student'),
    quests.created_at
  from public.quests as quests
  left join public.students as students on students.id = quests.owner_id
  left join public.quests as completed on completed.title = quests.title
    and completed.owner_id = quests.owner_id
  where exists (select 1 from public.admin_users where admin_users.id = auth.uid())
  group by quests.id, quests.owner_id, quests.title, quests.description,
    quests.category, quests.xp, quests.status, students.name, quests.created_at
  order by quests.created_at desc;
$$;

revoke all on function public.admin_list_quests() from public;
grant execute on function public.admin_list_quests() to authenticated;

drop function if exists public.admin_create_quest(text, text, text, integer, text, uuid);
create or replace function public.admin_create_quest(
  title_value text,
  description_value text,
  category_value text,
  xp_value integer,
  status_value text,
  assignee_id uuid default null
)
returns table (id uuid, owner_id uuid, assignee text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where admin_users.id = auth.uid()) then
    raise exception 'Only approved admins can create quests';
  end if;

  if trim(coalesce(title_value, '')) = '' then
    raise exception 'Quest title is required';
  end if;
  if category_value not in ('Academics', 'Habits', 'Social', 'Health') then
    raise exception 'Invalid quest category';
  end if;
  if xp_value not between 1 and 100 then
    raise exception 'Quest XP must be between 1 and 100';
  end if;
  if status_value not in ('active', 'pending') then
    raise exception 'Invalid quest status';
  end if;
  if assignee_id is not null and not exists (
    select 1 from public.students where students.id = assignee_id and students.status = 'Active'
  ) then
    raise exception 'The selected student is not active or does not exist';
  end if;

  return query
  insert into public.quests (owner_id, title, description, category, xp, status)
  select
    students.id,
    trim(title_value),
    nullif(trim(coalesce(description_value, '')), ''),
    category_value,
    xp_value,
    status_value
  from public.students as students
  where students.status = 'Active'
    and (assignee_id is null or students.id = assignee_id)
  returning quests.id, quests.owner_id,
    (select students.name from public.students where students.id = quests.owner_id);
end;
$$;

revoke all on function public.admin_create_quest(text, text, text, integer, text, uuid) from public;
grant execute on function public.admin_create_quest(text, text, text, integer, text, uuid) to authenticated;
