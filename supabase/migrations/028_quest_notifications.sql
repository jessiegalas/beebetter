begin;

create table public.quest_push_devices (
  token text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.quest_push_devices enable row level security;
revoke all on public.quest_push_devices from anon, authenticated;
grant all on public.quest_push_devices to service_role;

create or replace function public.register_quest_push_device(token_value text, owner_id_value uuid, enabled_value boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from owner_id_value then raise exception 'Account changed'; end if;
  if not enabled_value then
    delete from public.quest_push_devices where token = token_value and owner_id = auth.uid();
    return;
  end if;
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  insert into public.quest_push_devices(token, owner_id) values(token_value, auth.uid())
  on conflict(token) do update set owner_id = excluded.owner_id, updated_at = now();
end;
$$;
revoke all on function public.register_quest_push_device(text,uuid,boolean) from public;
grant execute on function public.register_quest_push_device(text,uuid,boolean) to authenticated;

create table public.quest_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  token text not null references public.quest_push_devices(token) on delete cascade,
  kind text not null check (kind in ('scheduled','deadline')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','delivered','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  ticket_id text,
  last_error text,
  updated_at timestamptz not null default now(),
  unique(quest_id, token, kind, due_at)
);
alter table public.quest_push_deliveries enable row level security;
revoke all on public.quest_push_deliveries from anon, authenticated;
grant all on public.quest_push_deliveries to service_role;
create index quest_push_delivery_work on public.quest_push_deliveries(status, available_at);
create index quest_push_device_owner on public.quest_push_devices(owner_id);

-- A minute-level worker discovers due events. No backfill of old reminders.
-- Leases recover interrupted runs; unique events prevent overlapping cron sends.
create or replace function public.claim_quest_push_deliveries()
returns table(delivery_id uuid, token text, owner_id uuid, quest_id uuid, title text, kind text, can_complete boolean)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.quest_push_deliveries where updated_at < now() - interval '7 days';
  delete from public.quest_push_devices where updated_at < now() - interval '30 days';
  insert into public.quest_push_deliveries(quest_id, token, kind, due_at)
  select q.id, d.token, e.kind, e.due_at
  from public.quests q join public.quest_push_devices d on d.owner_id = q.owner_id
  join public.students s on s.id = q.owner_id and s.status = 'Active'
  cross join lateral (values ('scheduled', q.scheduled_at), ('deadline', q.deadline_at - interval '1 hour')) e(kind,due_at)
  where q.status = 'active' and e.due_at <= now() and e.due_at > now() - interval '15 minutes'
    and (e.kind = 'scheduled' or q.scheduled_at is distinct from e.due_at)
  on conflict do nothing;

  update public.quest_push_deliveries n set status = 'cancelled', updated_at = now()
  where n.status in ('pending','sending') and (n.due_at < now() - interval '15 minutes' or not exists (
    select 1 from public.quests q join public.quest_push_devices d on d.token = n.token and d.owner_id = q.owner_id
    join public.students s on s.id = q.owner_id and s.status = 'Active'
    where q.id = n.quest_id and q.status = 'active'
    and n.due_at = case n.kind when 'scheduled' then q.scheduled_at else q.deadline_at - interval '1 hour' end
  ));

  update public.quest_push_deliveries n set status = 'failed', last_error = 'Retry limit reached', updated_at = now()
  where n.attempts >= 3 and (n.status = 'pending' or (n.status = 'sending' and n.updated_at < now() - interval '2 minutes'));

  return query
  with picked as (
    select n.id from public.quest_push_deliveries n
    where (n.status = 'pending' or (n.status = 'sending' and n.updated_at < now() - interval '2 minutes'))
      and n.available_at <= now() and n.attempts < 3
    order by n.due_at limit 100 for update skip locked
  ), claimed as (
    update public.quest_push_deliveries n set status = 'sending', attempts = attempts + 1, updated_at = now()
    from picked where n.id = picked.id returning n.*
  )
  select n.id, n.token, q.owner_id, q.id, q.title, n.kind,
    not q.requires_proof and (q.prerequisite_quest_id is null or exists (
      select 1 from public.quests p where p.id = q.prerequisite_quest_id and p.owner_id = q.owner_id and p.status = 'completed'
    ))
  from claimed n join public.quests q on q.id = n.quest_id;
end;
$$;
revoke all on function public.claim_quest_push_deliveries() from public;
grant execute on function public.claim_quest_push_deliveries() to service_role;

commit;
