begin;

alter table public.quest_push_deliveries
  add column claim_id uuid,
  add column sent_at timestamptz,
  add column receipt_available_at timestamptz,
  add column device_registered_at timestamptz;
update public.quest_push_deliveries
set sent_at = updated_at, receipt_available_at = updated_at + interval '15 minutes'
where status = 'sent';
create index quest_push_receipt_work on public.quest_push_deliveries(receipt_available_at, id) where status = 'sent';

-- NULL permits all owners; an empty array permits none. Only the service role can claim.
drop function public.claim_quest_push_deliveries();
create function public.claim_quest_push_deliveries(owner_ids_value uuid[] default null)
returns table(delivery_id uuid, token text, owner_id uuid, quest_id uuid, title text, kind text,
  can_complete boolean, due_at timestamptz, attempts integer, claim_id uuid, device_registered_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.quest_push_deliveries n using public.quests q
  where n.quest_id = q.id and n.updated_at < now() - interval '7 days'
    and (owner_ids_value is null or q.owner_id = any(owner_ids_value));
  delete from public.quest_push_devices d where d.updated_at < now() - interval '30 days'
    and (owner_ids_value is null or d.owner_id = any(owner_ids_value));
  insert into public.quest_push_deliveries(quest_id, token, kind, due_at)
  select q.id, d.token, e.kind, e.due_at
  from public.quests q join public.quest_push_devices d on d.owner_id = q.owner_id
  join public.students s on s.id = q.owner_id and s.status = 'Active'
  cross join lateral (values ('scheduled', q.scheduled_at), ('deadline', q.deadline_at - interval '1 hour')) e(kind, due_at)
  where q.status = 'active' and e.due_at <= now() and e.due_at > now() - interval '15 minutes'
    and (e.kind = 'scheduled' or q.scheduled_at is distinct from e.due_at)
    and (owner_ids_value is null or q.owner_id = any(owner_ids_value))
  on conflict do nothing;

  update public.quest_push_deliveries n set status = 'cancelled', claim_id = null, updated_at = now()
  where n.status in ('pending', 'sending')
    and exists (select 1 from public.quests scope where scope.id = n.quest_id
      and (owner_ids_value is null or scope.owner_id = any(owner_ids_value)))
    and (n.due_at <= now() - interval '15 minutes' or not exists (
      select 1 from public.quests q join public.quest_push_devices d on d.token = n.token and d.owner_id = q.owner_id
      join public.students s on s.id = q.owner_id and s.status = 'Active'
      where q.id = n.quest_id and q.status = 'active'
        and n.due_at = case n.kind when 'scheduled' then q.scheduled_at else q.deadline_at - interval '1 hour' end
    ));
  update public.quest_push_deliveries n set status = 'failed', claim_id = null, last_error = 'RetryLimitReached', updated_at = now()
  where n.attempts >= 3 and (n.status = 'pending' or (n.status = 'sending' and n.updated_at <= now() - interval '2 minutes'))
    and exists (select 1 from public.quests q where q.id = n.quest_id
      and (owner_ids_value is null or q.owner_id = any(owner_ids_value)));

  return query
  with picked as (
    select n.id from public.quest_push_deliveries n join public.quests q on q.id = n.quest_id
    where (n.status = 'pending' or (n.status = 'sending' and n.updated_at <= now() - interval '2 minutes'))
      and n.available_at <= now() and n.attempts < 3
      and (owner_ids_value is null or q.owner_id = any(owner_ids_value))
    order by n.due_at, n.id limit 100 for update of n skip locked
  ), claimed as (
    update public.quest_push_deliveries n set status = 'sending', attempts = n.attempts + 1,
      claim_id = gen_random_uuid(), updated_at = now(),
      device_registered_at = (select d.updated_at from public.quest_push_devices d where d.token = n.token)
    from picked where n.id = picked.id returning n.*
  )
  select n.id, n.token, q.owner_id, q.id, q.title, n.kind,
    not q.requires_proof and (q.prerequisite_quest_id is null or exists (
      select 1 from public.quests p where p.id = q.prerequisite_quest_id and p.owner_id = q.owner_id and p.status = 'completed'
    )), n.due_at, n.attempts, n.claim_id, n.device_registered_at
  from claimed n join public.quests q on q.id = n.quest_id;
end;
$$;
revoke all on function public.claim_quest_push_deliveries(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_quest_push_deliveries(uuid[]) to service_role;

create function public.validate_quest_push_claims(claims_value jsonb)
returns table(delivery_id uuid) language sql stable security definer set search_path = public as $$
  select n.id from jsonb_to_recordset(claims_value) as requested(delivery_id uuid, claim_id uuid)
  join public.quest_push_deliveries n on n.id = requested.delivery_id and n.claim_id = requested.claim_id
  join public.quests q on q.id = n.quest_id and q.status = 'active'
  join public.quest_push_devices d on d.token = n.token and d.owner_id = q.owner_id
  join public.students s on s.id = q.owner_id and s.status = 'Active'
  where n.status = 'sending' and n.updated_at > now() - interval '2 minutes'
    and n.due_at > now() - interval '15 minutes' and n.due_at <= now()
    and n.due_at = case n.kind when 'scheduled' then q.scheduled_at else q.deadline_at - interval '1 hour' end;
$$;
revoke all on function public.validate_quest_push_claims(jsonb) from public, anon, authenticated;
grant execute on function public.validate_quest_push_claims(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
