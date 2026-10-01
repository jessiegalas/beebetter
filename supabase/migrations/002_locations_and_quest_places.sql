-- Add saved places and bind quests to a specific place.
create table if not exists public.user_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  label text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius integer not null default 100 check (radius between 10 and 5000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quests
  add column if not exists location_id uuid references public.user_locations(id) on delete set null;

create index if not exists user_locations_owner_created_at_idx
  on public.user_locations (owner_id, created_at desc);

create index if not exists quests_location_id_idx on public.quests (location_id);

alter table public.user_locations enable row level security;

drop policy if exists "Users can view their own locations" on public.user_locations;
drop policy if exists "Users can create their own locations" on public.user_locations;
drop policy if exists "Users can update their own locations" on public.user_locations;
drop policy if exists "Users can delete their own locations" on public.user_locations;

create policy "Users can view their own locations"
  on public.user_locations for select to authenticated
  using (auth.uid() = owner_id);

create policy "Users can create their own locations"
  on public.user_locations for insert to authenticated
  with check (auth.uid() = owner_id);

create policy "Users can update their own locations"
  on public.user_locations for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own locations"
  on public.user_locations for delete to authenticated
  using (auth.uid() = owner_id);

-- Ensure a quest cannot point to somebody else's place.
create or replace function public.validate_quest_location_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.location_id is not null and not exists (
    select 1 from public.user_locations
    where id = new.location_id and owner_id = new.owner_id
  ) then
    raise exception 'Quest location must belong to the quest owner';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_quest_location_owner on public.quests;
create trigger validate_quest_location_owner
  before insert or update of owner_id, location_id on public.quests
  for each row execute procedure public.validate_quest_location_owner();
