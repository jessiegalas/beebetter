-- Secure admin-only access to student profiles for the separate admin app.
-- After running this migration, add approved admin auth users with:
-- insert into public.admin_users (id) values ('AUTH_USER_UUID');

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can view their own admin record" on public.admin_users;
create policy "Admins can view their own admin record"
  on public.admin_users for select
  to authenticated
  using (auth.uid() = id);

drop function if exists public.admin_list_students();
create or replace function public.admin_list_students()
returns table (
  id uuid,
  email text,
  display_name text,
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
    profiles.id,
    users.email,
    profiles.display_name,
    profiles.level,
    profiles.total_xp,
    profiles.current_streak,
    count(quests.id) filter (where quests.status = 'completed'),
    profiles.created_at,
    profiles.updated_at
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  left join public.quests as quests on quests.owner_id = profiles.id
  where exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
  )
  group by profiles.id, users.email, profiles.display_name, profiles.level,
    profiles.total_xp, profiles.current_streak, profiles.created_at, profiles.updated_at
  order by profiles.created_at desc;
$$;

revoke all on function public.admin_list_students() from public;
grant execute on function public.admin_list_students() to authenticated;
