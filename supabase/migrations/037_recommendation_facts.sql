-- Additive facts contract. Existing candidate/history RPCs remain compatible.
begin;
create or replace function public.student_get_recommendation_facts(quest_ids uuid[])
returns table(
  quest_id uuid, status text, updated_at timestamptz, prerequisite_quest_id uuid,
  prerequisite_status text, prerequisite_title text,
  latest_activity_at timestamptz, latest_category_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_catalog as $$
begin
  if not public.is_active_student() then raise exception 'Active student required'; end if;
  if quest_ids is null or cardinality(quest_ids) > 200 or array_position(quest_ids,null) is not null then
    raise exception 'Supply at most 200 quest IDs';
  end if;
  if exists(select 1 from unnest(quest_ids) i where not exists(
    select 1 from public.quests q where q.id=i and q.owner_id=auth.uid()
  )) then raise exception 'Quest not found'; end if;
  return query
  select q.id,q.status,q.updated_at,q.prerequisite_quest_id,p.status,p.title,
    h.latest_activity_at,h.latest_category_at
  from public.quests q
  left join public.quests p on p.id=q.prerequisite_quest_id and p.owner_id=q.owner_id
  left join lateral (
    select max(c.completed_at) filter(where lower(trim(c.title))=lower(trim(q.title))) as latest_activity_at,
      max(c.completed_at) as latest_category_at
    from public.quest_completion_history c
    where c.owner_id=q.owner_id and c.category=q.category and c.completed_at<=statement_timestamp()
  ) h on true
  where q.owner_id=auth.uid() and q.id=any(quest_ids);
end;
$$;
revoke all on function public.student_get_recommendation_facts(uuid[]) from public,anon;
grant execute on function public.student_get_recommendation_facts(uuid[]) to authenticated;
create index if not exists quest_history_owner_category_time_idx
  on public.quest_completion_history(owner_id,category,completed_at desc);
commit;
