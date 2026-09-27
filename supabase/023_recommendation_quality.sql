-- Phase F: complete recommendation candidate retrieval and privacy-conscious effectiveness events.
-- Apply after 022_scalable_data_access.sql. This migration is additive.
begin;

create or replace function public.student_list_recommendation_candidates(
  page_size integer default 200, page_offset integer default 0
) returns setof public.quests
language plpgsql security definer set search_path = public stable as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if page_size not between 1 and 200 or page_offset < 0 or page_offset > 100000 then
    raise exception 'Invalid pagination';
  end if;
  return query select q.* from public.quests q
    where q.owner_id = auth.uid() and q.status <> 'completed'
    order by q.created_at desc, q.id
    limit page_size offset page_offset;
end;
$$;
revoke all on function public.student_list_recommendation_candidates(integer, integer) from public;
grant execute on function public.student_list_recommendation_candidates(integer, integer) to authenticated;

create table if not exists public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  event_type text not null check (event_type in ('exposure','selection','dismissal','completion')),
  surface text not null default 'quest_board' check (surface in ('quest_board')),
  session_id uuid,
  rank_position integer check (rank_position is null or rank_position between 1 and 1000),
  reason_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (event_type = 'completion' or session_id is not null),
  unique (student_id, quest_id, event_type, session_id)
);
create index if not exists recommendation_events_student_created_idx
  on public.recommendation_events(student_id, created_at desc);
create index if not exists recommendation_events_quest_created_idx
  on public.recommendation_events(quest_id, created_at desc);
alter table public.recommendation_events enable row level security;
revoke all on table public.recommendation_events from public, anon, authenticated;

create or replace function public.student_record_recommendation_event(
  quest_id_value uuid, event_type_value text, session_id_value uuid,
  rank_position_value integer default null, reason_codes_value text[] default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare allowed_codes constant text[] := array[
  'location_at','location_nearby','deadline_overdue','deadline_soon','deadline_day','deadline_days',
  'schedule_now','schedule_soon','schedule_earlier','preferred_now','preferred_soon','importance_high',
  'activity_gap','activity_variety','unlocks_quest','goal_alignment','reflection_related',
  'manageable_step','reported_momentum'
];
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  if event_type_value not in ('exposure','selection','dismissal') then raise exception 'Invalid recommendation event'; end if;
  if session_id_value is null then raise exception 'Recommendation session is required'; end if;
  if rank_position_value is not null and rank_position_value not between 1 and 1000 then raise exception 'Invalid rank position'; end if;
  if not exists (select 1 from public.quests q where q.id=quest_id_value and q.owner_id=auth.uid()) then
    raise exception 'Quest not found';
  end if;
  if exists (select 1 from unnest(coalesce(reason_codes_value,'{}')) c where not (c=any(allowed_codes))) then
    raise exception 'Invalid recommendation reason';
  end if;
  insert into public.recommendation_events(student_id,quest_id,event_type,session_id,rank_position,reason_codes)
    values(auth.uid(),quest_id_value,event_type_value,session_id_value,rank_position_value,coalesce(reason_codes_value,'{}'))
    on conflict(student_id,quest_id,event_type,session_id) do nothing;
end;
$$;
revoke all on function public.student_record_recommendation_event(uuid,text,uuid,integer,text[]) from public;
grant execute on function public.student_record_recommendation_event(uuid,text,uuid,integer,text[]) to authenticated;

create or replace function public.record_recommendation_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare exposure_session uuid;
begin
  select e.session_id into exposure_session from public.recommendation_events e
    where e.student_id=new.owner_id and e.quest_id=new.quest_id and e.event_type='exposure'
      and e.created_at >= new.completed_at - interval '30 days'
    order by e.created_at desc limit 1;
  if exposure_session is not null then
    insert into public.recommendation_events(student_id,quest_id,event_type,session_id)
      values(new.owner_id,new.quest_id,'completion',exposure_session)
      on conflict(student_id,quest_id,event_type,session_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists record_recommendation_completion on public.quest_completion_history;
create trigger record_recommendation_completion after insert on public.quest_completion_history
for each row execute function public.record_recommendation_completion();

commit;
