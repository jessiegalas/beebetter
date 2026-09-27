-- Phase C: reporting privacy, immutable case history, and proof governance.
-- Apply after 017_admin_functionality_cleanup.sql. This migration is additive.
begin;

create table if not exists public.osas_report_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('query', 'export')),
  period_start date not null,
  period_end date not null,
  filter_dimension text check (filter_dimension in ('campus', 'course', 'year_level')),
  filter_value text,
  outcome text not null check (outcome in ('released', 'suppressed')),
  cohort_size bigint not null check (cohort_size >= 0),
  complement_size bigint not null check (complement_size >= 0),
  created_at timestamptz not null default now(),
  check ((filter_dimension is null) = (filter_value is null))
);
alter table public.osas_report_audit_log enable row level security;
revoke all on public.osas_report_audit_log from public, anon, authenticated;
grant select on public.osas_report_audit_log to authenticated;
drop policy if exists "Super admins read OSAS report audit logs" on public.osas_report_audit_log;
create policy "Super admins read OSAS report audit logs" on public.osas_report_audit_log
for select to authenticated using (public.is_super_admin());

create table if not exists public.support_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('submitted', 'status_changed', 'assigned', 'follow_up', 'withdrawn')),
  from_status text,
  to_status text,
  assigned_to uuid references public.admin_users(id) on delete set null,
  note text check (note is null or char_length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists support_request_events_request_created_idx
on public.support_request_events(request_id, created_at);
alter table public.support_request_events enable row level security;
revoke all on public.support_request_events from public, anon, authenticated;
grant select on public.support_request_events to authenticated;
drop policy if exists "Authorized OSAS staff read support request events" on public.support_request_events;
create policy "Authorized OSAS staff read support request events" on public.support_request_events
for select to authenticated using (public.has_osas_permission('manage_support_requests'));

insert into public.support_request_events(request_id, actor_id, event_type, to_status, assigned_to, note, created_at)
select r.id, r.student_id, 'submitted', 'submitted', null, null, r.created_at
from public.support_requests r
where not exists (select 1 from public.support_request_events e where e.request_id = r.id);

create or replace function public.record_support_request_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.support_request_events(request_id,actor_id,event_type,to_status,created_at)
  values(new.id,new.student_id,'submitted',new.status,new.created_at);
  return new;
end;
$$;
drop trigger if exists record_support_request_submission on public.support_requests;
create trigger record_support_request_submission after insert on public.support_requests
for each row execute function public.record_support_request_submission();

alter table public.support_requests add column if not exists withdrawn_at timestamptz;
update public.support_requests set withdrawn_at = updated_at where status = 'withdrawn' and withdrawn_at is null;

create table if not exists public.quest_proof_cleanup_queue (
  proof_path text primary key,
  reason text not null check (reason in ('quest_deleted', 'proof_replaced', 'abandoned_upload')),
  eligible_after timestamptz not null,
  queued_at timestamptz not null default now()
);
alter table public.quest_proof_cleanup_queue enable row level security;
revoke all on public.quest_proof_cleanup_queue from public, anon, authenticated;

update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime']
where id = 'quest-proofs';

create or replace function public.queue_retired_quest_proof()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_path text;
begin
  old_path := old.proof_path;
  if old_path is not null and (tg_op = 'DELETE' or old_path is distinct from new.proof_path) then
    insert into public.quest_proof_cleanup_queue(proof_path, reason, eligible_after)
    values(old_path, case when tg_op = 'DELETE' then 'quest_deleted' else 'proof_replaced' end, now() + interval '30 days')
    on conflict(proof_path) do update set eligible_after = least(quest_proof_cleanup_queue.eligible_after, excluded.eligible_after);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists queue_retired_quest_proof on public.quests;
create trigger queue_retired_quest_proof after update of proof_path or delete on public.quests
for each row execute function public.queue_retired_quest_proof();

create or replace function public.quest_proof_cleanup_candidates(batch_size integer default 100)
returns table(proof_path text, reason text)
language plpgsql security definer set search_path = public, storage as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if batch_size not between 1 and 500 then raise exception 'Batch size must be between 1 and 500'; end if;
  insert into public.quest_proof_cleanup_queue(proof_path, reason, eligible_after)
  select o.name, 'abandoned_upload', now()
  from storage.objects o
  where o.bucket_id = 'quest-proofs' and o.created_at < now() - interval '7 days'
    and not exists (select 1 from public.quests q where q.proof_path = o.name)
  on conflict(proof_path) do nothing;
  return query select q.proof_path, q.reason from public.quest_proof_cleanup_queue q
    where q.eligible_after <= now() order by q.eligible_after limit batch_size;
end;
$$;
revoke all on function public.quest_proof_cleanup_candidates(integer) from public;
grant execute on function public.quest_proof_cleanup_candidates(integer) to service_role;

create or replace function public.confirm_quest_proof_cleanup(cleaned_paths text[])
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  delete from public.quest_proof_cleanup_queue where proof_path = any(cleaned_paths);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.confirm_quest_proof_cleanup(text[]) from public;
grant execute on function public.confirm_quest_proof_cleanup(text[]) to service_role;

create or replace function public.complete_quest(
  quest_id_value uuid, proof_path_value text default null, proof_mime_type_value text default null
) returns void language plpgsql security definer set search_path = public, storage as $$
declare target public.quests%rowtype; proof_object storage.objects%rowtype; proof_size bigint;
declare allowed_mimes constant text[] := array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime'];
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  select * into target from public.quests where id = quest_id_value and owner_id = auth.uid() for update;
  if not found then raise exception 'Quest not found'; end if;
  if target.status = 'completed' then return; end if;
  if target.status <> 'active' then raise exception 'Only active quests can be completed'; end if;
  if target.prerequisite_quest_id is not null and not exists (
    select 1 from public.quests where id = target.prerequisite_quest_id and owner_id = target.owner_id and status = 'completed'
  ) then raise exception 'Complete the prerequisite quest first'; end if;
  if target.requires_proof and proof_path_value is null then raise exception 'Attach proof before completing this quest'; end if;
  if proof_path_value is not null then
    if proof_path_value not like auth.uid()::text || '/' || target.id::text || '/%' then raise exception 'Invalid quest proof path'; end if;
    select * into proof_object from storage.objects where bucket_id = 'quest-proofs' and name = proof_path_value;
    if not found then raise exception 'Quest proof was not uploaded for this quest'; end if;
    if proof_mime_type_value is null or proof_mime_type_value <> proof_object.metadata ->> 'mimetype'
      or proof_mime_type_value <> all(allowed_mimes) then raise exception 'Unsupported or mismatched proof file type'; end if;
    if coalesce(proof_object.metadata ->> 'size', '') !~ '^[0-9]+$' then raise exception 'Quest proof size metadata is missing'; end if;
    proof_size := (proof_object.metadata ->> 'size')::bigint;
    if proof_size <= 0 or proof_size > 10485760 then raise exception 'Quest proof must be no larger than 10 MB'; end if;
  end if;
  update public.quests set status = 'completed', proof_path = proof_path_value,
    proof_mime_type = proof_mime_type_value, proof_submitted_at = case when proof_path_value is null then null else now() end
  where id = target.id;
  insert into public.profiles(id, total_xp, level) values(target.owner_id, target.xp, target.xp / 100 + 1)
  on conflict(id) do update set total_xp = profiles.total_xp + target.xp,
    level = (profiles.total_xp + target.xp) / 100 + 1;
end;
$$;
revoke all on function public.complete_quest(uuid, text, text) from public;
grant execute on function public.complete_quest(uuid, text, text) to authenticated;

create or replace function public.student_withdraw_support_request(request_id uuid)
returns public.support_requests language plpgsql security definer set search_path = public as $$
declare saved_request public.support_requests; prior_status text;
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  select status into prior_status from public.support_requests
    where id = request_id and student_id = auth.uid() and status in ('submitted','acknowledged','in_progress') for update;
  if not found then raise exception 'Support request cannot be withdrawn'; end if;
  update public.support_requests set status = 'withdrawn', resolved_at = null, withdrawn_at = now()
    where id = request_id returning * into saved_request;
  insert into public.support_request_events(request_id, actor_id, event_type, from_status, to_status, assigned_to)
    values(request_id, auth.uid(), 'withdrawn', prior_status, 'withdrawn', saved_request.assigned_to);
  return saved_request;
end;
$$;
revoke all on function public.student_withdraw_support_request(uuid) from public;
grant execute on function public.student_withdraw_support_request(uuid) to authenticated;

drop function if exists public.osas_list_support_requests(text);
create function public.osas_list_support_requests(status_filter text default null)
returns table(id uuid, student_id uuid, student_number text, student_name text, student_email text,
  course text, year_level text, campus text, category text, message text, preferred_contact text,
  contact_detail text, priority text, status text, assigned_to uuid, resolution_note text,
  resolved_at timestamptz, withdrawn_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  if status_filter is not null and status_filter not in ('submitted','acknowledged','in_progress','resolved','withdrawn') then raise exception 'Invalid support request status'; end if;
  return query select r.id,r.student_id,s.student_number,s.name,s.email,s.course,s.year_level,s.campus,
    r.category,r.message,r.preferred_contact,r.contact_detail,r.priority,r.status,r.assigned_to,
    r.resolution_note,r.resolved_at,r.withdrawn_at,r.created_at,r.updated_at
  from public.support_requests r join public.students s on s.id=r.student_id
  where status_filter is null or r.status=status_filter order by r.created_at desc;
end;
$$;
revoke all on function public.osas_list_support_requests(text) from public;
grant execute on function public.osas_list_support_requests(text) to authenticated;

create or replace function public.osas_list_support_request_events(request_id_value uuid)
returns table(id uuid, event_type text, from_status text, to_status text, assigned_to uuid,
  actor_label text, note text, created_at timestamptz)
language plpgsql security definer set search_path = public, auth stable as $$
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  return query select e.id,e.event_type,e.from_status,e.to_status,e.assigned_to,
    coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),u.email,'System')::text,
    e.note,e.created_at from public.support_request_events e left join auth.users u on u.id=e.actor_id
    where e.request_id=request_id_value order by e.created_at,e.id;
end;
$$;
revoke all on function public.osas_list_support_request_events(uuid) from public;
grant execute on function public.osas_list_support_request_events(uuid) to authenticated;

create or replace function public.osas_update_support_request(
  request_id uuid, status_value text, assigned_to_value uuid default null, resolution_note_value text default null
) returns public.support_requests language plpgsql security definer set search_path = public as $$
declare saved_request public.support_requests; prior public.support_requests%rowtype; clean_note text;
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  if status_value not in ('acknowledged','in_progress','resolved') then raise exception 'Invalid support request status'; end if;
  if assigned_to_value is not null and not public.has_osas_permission('manage_support_requests',assigned_to_value) then raise exception 'Assignee must be authorized OSAS support personnel'; end if;
  clean_note := nullif(trim(resolution_note_value),'');
  if clean_note is not null and char_length(clean_note) > 2000 then raise exception 'Follow-up note must contain at most 2000 characters'; end if;
  select * into prior from public.support_requests where id=request_id and status<>'withdrawn' for update;
  if not found then raise exception 'Support request not found or withdrawn'; end if;
  update public.support_requests set status=status_value,assigned_to=assigned_to_value,
    resolution_note=coalesce(clean_note,resolution_note),resolved_at=case when status_value='resolved' then coalesce(resolved_at,now()) else null end,
    withdrawn_at=null where id=request_id returning * into saved_request;
  if prior.status is distinct from status_value then
    insert into public.support_request_events(request_id,actor_id,event_type,from_status,to_status,assigned_to)
      values(request_id,auth.uid(),'status_changed',prior.status,status_value,assigned_to_value);
  end if;
  if prior.assigned_to is distinct from assigned_to_value then
    insert into public.support_request_events(request_id,actor_id,event_type,from_status,to_status,assigned_to)
      values(request_id,auth.uid(),'assigned',prior.status,status_value,assigned_to_value);
  end if;
  if clean_note is not null then
    insert into public.support_request_events(request_id,actor_id,event_type,from_status,to_status,assigned_to,note)
      values(request_id,auth.uid(),'follow_up',prior.status,status_value,assigned_to_value,clean_note);
  end if;
  return saved_request;
end;
$$;
revoke all on function public.osas_update_support_request(uuid,text,uuid,text) from public;
grant execute on function public.osas_update_support_request(uuid,text,uuid,text) to authenticated;

commit;
