-- Phase E: bounded admin/student reads and consolidated progression truth.
-- Apply after 021_osas_longitudinal_analytics.sql.
begin;

create or replace function public.admin_list_students_page(
  page_size integer default 50,page_offset integer default 0,search_query text default null,status_filter text default null
) returns table(id uuid,student_number text,name text,email text,course text,year_level text,section text,campus text,
  goal text,status text,level integer,total_xp integer,current_streak integer,quests_completed bigint,
  created_at timestamptz,updated_at timestamptz,total_count bigint)
language plpgsql security definer set search_path=public,auth stable as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if page_size not between 1 and 100 or page_offset < 0 or page_offset > 100000 then raise exception 'Invalid pagination'; end if;
  if status_filter is not null and status_filter not in ('Active','Inactive') then raise exception 'Invalid student status'; end if;
  return query with filtered as (
    select s.*,p.level,p.total_xp,public.calculate_student_streak(s.id) calculated_streak,
      (select count(*) from public.quest_completion_history h where h.owner_id=s.id) completed_count
    from public.students s left join public.profiles p on p.id=s.id
    where not exists(select 1 from public.admin_users a where a.id=s.id)
      and (status_filter is null or s.status=status_filter)
      and (nullif(trim(search_query),'') is null or concat_ws(' ',s.student_number,s.name,s.email,s.course,s.year_level,s.section,s.campus,s.goal) ilike '%'||trim(search_query)||'%')
  ) select f.id,f.student_number,f.name,f.email,f.course,f.year_level,f.section,f.campus,f.goal,f.status,
    f.level,f.total_xp,f.calculated_streak,f.completed_count,f.created_at,f.updated_at,count(*) over()
    from filtered f order by f.created_at desc,f.id limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_students_page(integer,integer,text,text) from public;
grant execute on function public.admin_list_students_page(integer,integer,text,text) to authenticated;

create or replace function public.admin_search_active_students(search_query text default null,result_limit integer default 50)
returns table(id uuid,name text,student_number text)
language plpgsql security definer set search_path=public stable as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if result_limit not between 1 and 100 then raise exception 'Invalid result limit'; end if;
  return query select s.id,s.name,s.student_number from public.students s
    where s.status='Active' and not exists(select 1 from public.admin_users a where a.id=s.id)
      and (nullif(trim(search_query),'') is null or concat_ws(' ',s.name,s.student_number,s.email) ilike '%'||trim(search_query)||'%')
    order by s.name,s.id limit result_limit;
end;
$$;
revoke all on function public.admin_search_active_students(text,integer) from public;
grant execute on function public.admin_search_active_students(text,integer) to authenticated;

create or replace function public.admin_list_quests_page(
  page_size integer default 50,page_offset integer default 0,search_query text default null,
  status_filter text default null,difficulty_filter text default null
) returns table(id uuid,owner_id uuid,title text,description text,category text,xp integer,status text,
  completions bigint,assignee text,created_at timestamptz,total_count bigint)
language plpgsql security definer set search_path=public stable as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if page_size not between 1 and 100 or page_offset < 0 or page_offset > 100000 then raise exception 'Invalid pagination'; end if;
  if status_filter is not null and status_filter not in ('active','pending','completed','rejected') then raise exception 'Invalid quest status'; end if;
  if difficulty_filter is not null and difficulty_filter not in ('Easy','Medium','Hard') then raise exception 'Invalid difficulty'; end if;
  return query with filtered as (
    select q.id,q.owner_id,q.title,q.description,q.category,q.xp,q.status,
      count(h.id) completions,coalesce(s.name,s.email,q.owner_id::text) assignee,q.created_at
    from public.quests q left join public.students s on s.id=q.owner_id
    left join public.quest_completion_history h on h.quest_id=q.id
    where not exists(select 1 from public.admin_users a where a.id=q.owner_id)
      and (status_filter is null or q.status=status_filter)
      and (difficulty_filter is null or case when q.xp>=50 then 'Hard' when q.xp>=30 then 'Medium' else 'Easy' end=difficulty_filter)
      and (nullif(trim(search_query),'') is null or concat_ws(' ',q.title,q.category,s.name,s.student_number) ilike '%'||trim(search_query)||'%')
    group by q.id,q.owner_id,q.title,q.description,q.category,q.xp,q.status,s.name,s.email,q.created_at
  ) select f.*,count(*) over() from filtered f order by f.created_at desc,f.id limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_quests_page(integer,integer,text,text,text) from public;
grant execute on function public.admin_list_quests_page(integer,integer,text,text,text) to authenticated;

drop function if exists public.osas_list_support_requests_page(integer,integer,text,text,text,date,date);
create function public.osas_list_support_requests_page(page_size integer default 50,page_offset integer default 0,
  status_filter text default null,category_filter text default null,search_query text default null,
  from_date date default null,to_date date default null)
returns table(id uuid,student_id uuid,student_number text,student_name text,student_email text,course text,
  year_level text,campus text,category text,message text,preferred_contact text,contact_detail text,priority text,
  status text,assigned_to uuid,resolution_note text,resolved_at timestamptz,withdrawn_at timestamptz,
  created_at timestamptz,updated_at timestamptz,total_count bigint)
language plpgsql security definer set search_path=public stable as $$
declare start_at timestamptz; end_at timestamptz;
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  if page_size not between 1 and 100 or page_offset<0 or page_offset>100000 then raise exception 'Invalid pagination'; end if;
  if status_filter is not null and status_filter not in ('submitted','acknowledged','in_progress','resolved','withdrawn') then raise exception 'Invalid support request status'; end if;
  if category_filter is not null and category_filter not in ('academic','personal','wellbeing','financial','safety','other') then raise exception 'Invalid support category'; end if;
  if from_date is not null and to_date is not null and from_date>to_date then raise exception 'Invalid date range'; end if;
  start_at:=case when from_date is null then null else from_date::timestamp at time zone public.institutional_timezone() end;
  end_at:=case when to_date is null then null else (to_date+1)::timestamp at time zone public.institutional_timezone() end;
  return query select r.id,r.student_id,s.student_number,s.name,s.email,s.course,s.year_level,s.campus,r.category,
    r.message,r.preferred_contact,r.contact_detail,r.priority,r.status,r.assigned_to,r.resolution_note,r.resolved_at,
    r.withdrawn_at,r.created_at,r.updated_at,count(*) over()
  from public.support_requests r join public.students s on s.id=r.student_id
  where (status_filter is null or r.status=status_filter) and (category_filter is null or r.category=category_filter)
    and (start_at is null or r.created_at>=start_at) and (end_at is null or r.created_at<end_at)
    and (nullif(trim(search_query),'') is null or concat_ws(' ',s.name,s.student_number,s.email,r.message) ilike '%'||trim(search_query)||'%')
  order by r.created_at desc,r.id limit page_size offset page_offset;
end;
$$;
revoke all on function public.osas_list_support_requests_page(integer,integer,text,text,text,date,date) from public;
grant execute on function public.osas_list_support_requests_page(integer,integer,text,text,text,date,date) to authenticated;

create or replace function public.student_list_completion_history(page_size integer default 100,page_offset integer default 0)
returns table(id uuid,quest_id uuid,title text,category text,completed_at timestamptz,total_count bigint)
language plpgsql security definer set search_path=public stable as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if page_size not between 1 and 200 or page_offset<0 or page_offset>100000 then raise exception 'Invalid pagination'; end if;
  return query select h.id,h.quest_id,h.title,h.category,h.completed_at,count(*) over()
    from public.quest_completion_history h where h.owner_id=auth.uid()
    order by h.completed_at desc,h.id limit page_size offset page_offset;
end;
$$;
revoke all on function public.student_list_completion_history(integer,integer) from public;
grant execute on function public.student_list_completion_history(integer,integer) to authenticated;

create or replace function public.student_progress_summary()
returns table(total_xp integer,level integer,current_streak integer,total_completed bigint,
  academics_completed bigint,habits_completed bigint,social_completed bigint,health_completed bigint)
language sql security definer set search_path=public stable as $$
  select coalesce(p.total_xp,0),coalesce(p.level,1),public.calculate_student_streak(auth.uid()),count(h.id),
    count(h.id) filter(where h.category='Academics'),count(h.id) filter(where h.category='Habits'),
    count(h.id) filter(where h.category='Social'),count(h.id) filter(where h.category='Health')
  from public.profiles p left join public.quest_completion_history h on h.owner_id=p.id where p.id=auth.uid()
  group by p.total_xp,p.level;
$$;
revoke all on function public.student_progress_summary() from public;
grant execute on function public.student_progress_summary() to authenticated;

comment on column public.quests.is_nearby is 'Deprecated cached flag. Live proximity is derived from location_id, saved locations, and current geofence/GPS context.';
revoke insert,update on public.quests from authenticated;
grant insert(owner_id,title,description,category,xp,location_id,requires_proof,scheduled_at,preferred_time,deadline_at,importance,prerequisite_quest_id) on public.quests to authenticated;
grant update(title,description,category,xp,location_id,requires_proof,scheduled_at,preferred_time,deadline_at,importance,prerequisite_quest_id) on public.quests to authenticated;

commit;
