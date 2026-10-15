-- Version 2 measurements are separate from legacy synthetic top-ten exposures.
begin;
create table public.recommendation_events_v2 (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  impression_id uuid not null, session_id uuid not null,
  surface text not null check(surface in ('home','quest_board')),
  recommendation_group text not null check(recommendation_group in ('now','upcoming','other','revision')),
  rank_position integer not null check(rank_position between 1 and 100000),
  recommendation_version text not null check(recommendation_version='rules-v2'),
  reason_codes text[] not null default '{}',
  event_type text not null check(event_type in ('exposure','selection','snooze','completion')),
  occurred_at timestamptz not null, created_at timestamptz not null default now(),
  unique(student_id,impression_id,event_type)
);
create index recommendation_v2_attribution_idx
  on public.recommendation_events_v2(student_id,quest_id,occurred_at desc) where event_type='exposure';
alter table public.recommendation_events_v2 enable row level security;
revoke all on public.recommendation_events_v2 from public,anon,authenticated;
grant all on public.recommendation_events_v2 to service_role;

create function public.student_record_recommendation_event_v2(
  quest_id_value uuid, impression_id_value uuid, session_id_value uuid,
  surface_value text, group_value text, rank_value integer, reason_codes_value text[],
  event_type_value text, occurred_at_value timestamptz, version_value text default 'rules-v2'
) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare allowed_codes constant text[]:=array[
  'location_at','location_nearby','location_outside','location_away','location_unknown','place_inactive',
  'deadline_overdue','deadline_soon','deadline_day','deadline_days','schedule_now','schedule_soon','schedule_later','schedule_earlier',
  'preferred_now','preferred_soon','preferred_outside','importance_high','importance_low','activity_gap','activity_variety','activity_recent',
  'unlocks_quest','goal_alignment','reflection_related','manageable_step','reported_momentum','quest_age','location_time',
  'prerequisite_incomplete','prerequisite_unknown','data_stale','facts_unknown'
];
begin
  if not public.is_active_student() then raise exception 'Active student required'; end if;
  if event_type_value is null or event_type_value not in ('exposure','selection','snooze') then raise exception 'Invalid event'; end if;
  if occurred_at_value is null or not isfinite(occurred_at_value) or occurred_at_value>statement_timestamp()+interval '1 minute'
    or occurred_at_value<statement_timestamp()-interval '24 hours' then raise exception 'Invalid event time'; end if;
  if reason_codes_value is null or cardinality(reason_codes_value)>40 or array_position(reason_codes_value,null) is not null
    or exists(select 1 from unnest(reason_codes_value) c where not(c=any(allowed_codes))) then raise exception 'Invalid reasons'; end if;
  if not exists(select 1 from public.quests q where q.id=quest_id_value and q.owner_id=auth.uid()) then raise exception 'Quest not found'; end if;
  -- Impression metadata must be immutable across its actions and qualified exposure.
  if exists(select 1 from public.recommendation_events_v2 e where e.student_id=auth.uid() and e.impression_id=impression_id_value
    and (e.quest_id is distinct from quest_id_value or e.session_id is distinct from session_id_value
      or e.surface is distinct from surface_value or e.recommendation_group is distinct from group_value
      or e.rank_position is distinct from rank_value or e.reason_codes is distinct from reason_codes_value
      or e.recommendation_version is distinct from version_value)) then raise exception 'Impression changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||impression_id_value::text,0));
  -- Recheck under the impression lock for concurrent requests.
  if exists(select 1 from public.recommendation_events_v2 e where e.student_id=auth.uid() and e.impression_id=impression_id_value
    and (e.quest_id is distinct from quest_id_value or e.session_id is distinct from session_id_value
      or e.surface is distinct from surface_value or e.recommendation_group is distinct from group_value
      or e.rank_position is distinct from rank_value or e.reason_codes is distinct from reason_codes_value
      or e.recommendation_version is distinct from version_value)) then raise exception 'Impression changed'; end if;
  insert into public.recommendation_events_v2(student_id,quest_id,impression_id,session_id,surface,recommendation_group,rank_position,
    recommendation_version,reason_codes,event_type,occurred_at)
  values(auth.uid(),quest_id_value,impression_id_value,session_id_value,surface_value,group_value,rank_value,
    version_value,reason_codes_value,event_type_value,occurred_at_value)
  on conflict(student_id,impression_id,event_type) do nothing;
end;
$$;
revoke all on function public.student_record_recommendation_event_v2(uuid,uuid,uuid,text,text,integer,text[],text,timestamptz,text) from public,anon;
grant execute on function public.student_record_recommendation_event_v2(uuid,uuid,uuid,text,text,integer,text[],text,timestamptz,text) to authenticated;

create function public.record_recommendation_completion_v2()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare exposure public.recommendation_events_v2%rowtype;
begin
  select e.* into exposure from public.recommendation_events_v2 e
  where e.student_id=new.owner_id and e.quest_id=new.quest_id and e.event_type='exposure'
    and e.occurred_at between new.completed_at-interval '30 days' and new.completed_at
  order by e.occurred_at desc,e.id limit 1;
  if exposure.id is not null then
    insert into public.recommendation_events_v2(student_id,quest_id,impression_id,session_id,surface,recommendation_group,rank_position,
      recommendation_version,reason_codes,event_type,occurred_at)
    values(exposure.student_id,exposure.quest_id,exposure.impression_id,exposure.session_id,exposure.surface,
      exposure.recommendation_group,exposure.rank_position,exposure.recommendation_version,exposure.reason_codes,'completion',new.completed_at)
    on conflict(student_id,impression_id,event_type) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.record_recommendation_completion_v2() from public,anon,authenticated;
create trigger record_recommendation_completion_v2 after insert on public.quest_completion_history
  for each row execute function public.record_recommendation_completion_v2();
comment on table public.recommendation_events_v2 is 'Observed visibility and actions, rules-v2. Completion attribution is observational, not causal. Do not pool with legacy events.';
commit;
