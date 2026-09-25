-- Dynamic default and private categories; existing quest category text is preserved.
begin;
create table if not exists public.quest_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null check (name = trim(name) and char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists quest_categories_default_name on public.quest_categories(lower(name)) where owner_id is null;
create unique index if not exists quest_categories_owner_name on public.quest_categories(owner_id, lower(name)) where owner_id is not null;
insert into public.quest_categories(name) values ('Academics'), ('Habits'), ('Social'), ('Health') on conflict do nothing;
alter table public.quest_categories enable row level security;
drop policy if exists "Read available categories" on public.quest_categories;
create policy "Read available categories" on public.quest_categories for select to authenticated using (owner_id is null or owner_id = auth.uid());
drop policy if exists "Create own categories" on public.quest_categories;
create policy "Create own categories" on public.quest_categories for insert to authenticated with check (owner_id = auth.uid());
grant select, insert on public.quest_categories to authenticated;
-- Category names are stable identifiers for existing quests and completion history.
revoke update, delete on public.quest_categories from authenticated;
alter table public.quests drop constraint if exists quests_category_check;
create or replace function public.validate_quest_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.quest_categories c where c.name = new.category and (c.owner_id is null or c.owner_id = new.owner_id)) then
    raise exception 'Choose an available quest category';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_quest_category on public.quests;
create trigger validate_quest_category before insert or update of category, owner_id on public.quests for each row execute function public.validate_quest_category();
commit;
