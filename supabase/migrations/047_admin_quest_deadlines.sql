begin;

create function public.admin_list_quests_page_with_deadline(
  page_size integer default 50,
  page_offset integer default 0,
  search_query text default null,
  status_filter text default null,
  difficulty_filter text default null
) returns table(
  id uuid,
  owner_id uuid,
  title text,
  description text,
  category text,
  xp integer,
  status text,
  completions bigint,
  assignee text,
  created_at timestamptz,
  deadline_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  return query
    select p.id,p.owner_id,p.title,p.description,p.category,p.xp,p.status,p.completions,
      p.assignee,p.created_at,q.deadline_at,p.total_count
    from public.admin_list_quests_page(page_size,page_offset,search_query,status_filter,difficulty_filter) p
    join public.quests q on q.id=p.id
    order by p.created_at desc,p.id;
end;
$$;

create function public.admin_create_quest_with_deadline(
  title_value text,
  description_value text,
  category_value text,
  xp_value integer,
  status_value text,
  assignee_id uuid,
  deadline_at_value timestamptz
) returns table(id uuid, owner_id uuid, assignee text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if deadline_at_value is null then
    return query
      select * from public.admin_create_quest(
        title_value,description_value,category_value,xp_value,status_value,assignee_id
      );
    return;
  end if;

  return query
    with assigned as materialized (
      select a.id,a.owner_id,a.assignee
      from public.admin_create_quest(
        title_value,description_value,category_value,xp_value,status_value,assignee_id
      ) a
    ), saved as (
      update public.quests q
      set deadline_at=deadline_at_value
      from assigned a
      where q.id=a.id
      returning q.id,q.owner_id,a.assignee
    )
    select saved.id,saved.owner_id,saved.assignee from saved;
end;
$$;

create function public.admin_update_quest_with_deadline(
  quest_id_value uuid,
  title_value text,
  description_value text,
  category_value text,
  xp_value integer,
  status_value text,
  deadline_at_value timestamptz
) returns public.quests
language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_quest public.quests;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  saved_quest := public.admin_update_quest(
    quest_id_value,title_value,description_value,category_value,xp_value,status_value
  );

  if saved_quest.deadline_at is distinct from deadline_at_value then
    update public.quests q
    set deadline_at=deadline_at_value
    where q.id=saved_quest.id
    returning q.* into saved_quest;
    if not found then raise exception 'Editable admin-assigned quest not found'; end if;
  end if;

  return saved_quest;
end;
$$;

revoke all on function public.admin_list_quests_page_with_deadline(integer,integer,text,text,text) from public,anon;
revoke all on function public.admin_create_quest_with_deadline(text,text,text,integer,text,uuid,timestamptz) from public,anon;
revoke all on function public.admin_update_quest_with_deadline(uuid,text,text,text,integer,text,timestamptz) from public,anon;
grant execute on function public.admin_list_quests_page_with_deadline(integer,integer,text,text,text) to authenticated;
grant execute on function public.admin_create_quest_with_deadline(text,text,text,integer,text,uuid,timestamptz) to authenticated;
grant execute on function public.admin_update_quest_with_deadline(uuid,text,text,text,integer,text,timestamptz) to authenticated;

commit;
