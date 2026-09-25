-- Context-aware quests. Apply after 007_super_admin_management.sql.
-- Additive: existing quests and admin_create_quest keep their current defaults.
begin;

alter table public.quests
  add column if not exists scheduled_at timestamptz,
  add column if not exists preferred_time time,
  add column if not exists deadline_at timestamptz,
  add column if not exists importance text not null default 'normal',
  add column if not exists prerequisite_quest_id uuid references public.quests(id) on delete set null;

alter table public.quests drop constraint if exists quests_importance_check;
alter table public.quests add constraint quests_importance_check check (importance in ('low', 'normal', 'high'));
alter table public.quests drop constraint if exists quests_schedule_check;
alter table public.quests add constraint quests_schedule_check check (
  (scheduled_at is null or preferred_time is null) and
  (scheduled_at is null or deadline_at is null or scheduled_at <= deadline_at)
);
alter table public.quests drop constraint if exists quests_preferred_time_check;
alter table public.quests add constraint quests_preferred_time_check check (
  preferred_time is null or (preferred_time < time '24:00' and extract(second from preferred_time) = 0)
);
create index if not exists quests_prerequisite_idx on public.quests(prerequisite_quest_id);

create or replace function public.validate_quest_prerequisite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Serialize graph changes per owner so simultaneous edits cannot create a cycle.
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  if new.prerequisite_quest_id is not null then
    if not exists (
      select 1 from public.quests where id = new.prerequisite_quest_id and owner_id = new.owner_id
    ) then raise exception 'Choose a prerequisite belonging to the quest owner'; end if;
    if exists (
      with recursive ancestors as (
        select id, prerequisite_quest_id from public.quests where id = new.prerequisite_quest_id
        union
        select q.id, q.prerequisite_quest_id from public.quests q join ancestors a on q.id = a.prerequisite_quest_id
      )
      select 1 from ancestors where id = new.id
    ) then raise exception 'Quests cannot depend on themselves or form a cycle'; end if;
  end if;
  if exists (select 1 from public.quests where prerequisite_quest_id = new.id and owner_id <> new.owner_id) then
    raise exception 'Dependent quests must belong to the same owner';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_quest_prerequisite on public.quests;
create trigger validate_quest_prerequisite before insert or update of prerequisite_quest_id, owner_id on public.quests
for each row execute function public.validate_quest_prerequisite();

-- Retain activity history even if the original quest is subsequently deleted.
create table if not exists public.quest_completion_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  title text not null,
  category text not null,
  completed_at timestamptz not null,
  unique(quest_id, completed_at)
);
create index if not exists quest_history_owner_time_idx on public.quest_completion_history(owner_id, completed_at desc);
alter table public.quest_completion_history enable row level security;
drop policy if exists "Users can read their activity history" on public.quest_completion_history;
create policy "Users can read their activity history" on public.quest_completion_history for select to authenticated using (owner_id = auth.uid());
grant select on public.quest_completion_history to authenticated;
revoke insert, update, delete on public.quest_completion_history from authenticated, anon;

insert into public.quest_completion_history(owner_id, quest_id, title, category, completed_at)
select owner_id, id, title, category, coalesce(completed_at, updated_at) from public.quests where status = 'completed'
on conflict (quest_id, completed_at) do nothing;

create or replace function public.stamp_quest_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_quest_completion on public.quests;
create trigger stamp_quest_completion before insert or update of status on public.quests
for each row execute function public.stamp_quest_completion();

create or replace function public.record_quest_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    insert into public.quest_completion_history(owner_id, quest_id, title, category, completed_at)
    values(new.owner_id, new.id, new.title, new.category, new.completed_at)
    on conflict (quest_id, completed_at) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists record_quest_completion on public.quests;
create trigger record_quest_completion after insert or update of status on public.quests
for each row execute function public.record_quest_completion();

-- Atomic completion prevents duplicate taps awarding XP twice or partial writes
-- leaving the history, quest status, and XP out of sync.
create or replace function public.complete_quest(
  quest_id_value uuid, proof_path_value text default null, proof_mime_type_value text default null
) returns void language plpgsql security definer set search_path = public as $$
declare target public.quests%rowtype;
begin
  select * into target from public.quests where id = quest_id_value and owner_id = auth.uid() for update;
  if not found then raise exception 'Quest not found'; end if;
  if target.status = 'completed' then return; end if;
  if target.requires_proof and proof_path_value is null then raise exception 'Attach proof before completing this quest'; end if;
  if proof_path_value is not null and (
    proof_path_value not like auth.uid()::text || '/' || target.id::text || '/%' or
    not exists(select 1 from storage.objects where bucket_id = 'quest-proofs' and name = proof_path_value)
  ) then raise exception 'Quest proof was not uploaded for this quest'; end if;

  update public.quests set status = 'completed', proof_path = proof_path_value,
    proof_mime_type = proof_mime_type_value,
    proof_submitted_at = case when proof_path_value is null then null else now() end,
    updated_at = now() where id = target.id;
  insert into public.profiles(id, total_xp, level) values(target.owner_id, target.xp, target.xp / 100 + 1)
  on conflict(id) do update set total_xp = profiles.total_xp + target.xp,
    level = (profiles.total_xp + target.xp) / 100 + 1, updated_at = now();
end;
$$;
revoke all on function public.complete_quest(uuid, text, text) from public;
grant execute on function public.complete_quest(uuid, text, text) to authenticated;
commit;
