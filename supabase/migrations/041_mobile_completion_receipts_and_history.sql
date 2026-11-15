begin;

CREATE FUNCTION public.complete_quest_v2(quest_id_value uuid, proof_path_value text DEFAULT NULL::text, proof_mime_type_value text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare target public.quests%rowtype; proof_object storage.objects%rowtype; proof_size bigint; resulting_xp integer;
declare allowed_mimes constant text[] := array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/quicktime'];
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  select * into target from public.quests where id = quest_id_value and owner_id = auth.uid() for update;
  if not found then raise exception 'Quest not found'; end if;
  if target.status = 'completed' then
    return jsonb_build_object('status', 'already_completed');
  end if;
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
    level = (profiles.total_xp + target.xp) / 100 + 1
  returning total_xp into resulting_xp;
  return jsonb_build_object('status', 'completed', 'title', target.title,
    'awarded_xp', target.xp, 'total_xp', resulting_xp);
end;
$_$;

-- Keep the legacy RPC contract while sharing the locked mutation.
create or replace function public.complete_quest(
  quest_id_value uuid, proof_path_value text default null, proof_mime_type_value text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.complete_quest_v2(quest_id_value, proof_path_value, proof_mime_type_value);
end;
$$;

revoke execute on function public.complete_quest_v2(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_quest_v2(uuid, text, text) to authenticated;
revoke execute on function public.complete_quest(uuid, text, text) from public, anon;
grant execute on function public.complete_quest(uuid, text, text) to authenticated;

create index quest_history_owner_cursor_idx
  on public.quest_completion_history(owner_id, completed_at desc, id desc);
create index quest_history_owner_category_cursor_idx
  on public.quest_completion_history(owner_id, category, completed_at desc, id desc);

create function public.student_list_completed_quests(
  page_size integer default 50, category_value text default null,
  before_completed_at timestamptz default null, before_id uuid default null
) returns table(id uuid, quest_id uuid, title text, category text, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  if page_size is null or page_size not between 1 and 100 or
     (before_completed_at is null) <> (before_id is null) then
    raise exception 'Invalid pagination';
  end if;
  return query
    select h.id, h.quest_id, h.title, h.category, h.completed_at
    from public.quest_completion_history h
    where h.owner_id = auth.uid()
      and (category_value is null or h.category = category_value)
      and (before_completed_at is null or (h.completed_at, h.id) < (before_completed_at, before_id))
    order by h.completed_at desc, h.id desc
    limit page_size;
end;
$$;

create function public.student_list_completed_quest_categories()
returns setof text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  return query select distinct h.category from public.quest_completion_history h
    where h.owner_id = auth.uid() order by h.category;
end;
$$;

revoke execute on function public.student_list_completed_quests(integer, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function public.student_list_completed_quest_categories()
  from public, anon, authenticated;
grant execute on function public.student_list_completed_quests(integer, text, timestamptz, uuid) to authenticated;
grant execute on function public.student_list_completed_quest_categories() to authenticated;

commit;
