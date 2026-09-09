-- BeeBetter minimum end-to-end transaction schema.
-- Run this once in Supabase Dashboard > SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  level integer not null default 1 check (level >= 1),
  total_xp integer not null default 0 check (total_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text,
  category text not null check (category in ('Academics', 'Habits', 'Social', 'Health')),
  xp integer not null default 25 check (xp between 1 and 100),
  status text not null default 'active' check (status in ('active', 'completed', 'rejected', 'pending')),
  is_nearby boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quests_owner_created_at_idx on public.quests (owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.quests enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can view their own quests"
  on public.quests for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Users can create their own quests"
  on public.quests for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Users can update their own quests"
  on public.quests for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own quests"
  on public.quests for delete
  to authenticated
  using (auth.uid() = owner_id);
