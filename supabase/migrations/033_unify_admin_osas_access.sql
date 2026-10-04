-- OSAS is the purpose of the Admin Console: active admins receive both OSAS capabilities.
-- Historical osas_staff_permissions rows are retained but no longer decide access.
begin;

create or replace function public.has_osas_permission(permission_name text, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(permission_name in ('view_aggregates', 'manage_support_requests'), false)
    and public.is_active_admin(target_user_id);
$$;
revoke all on function public.has_osas_permission(text, uuid) from public, anon, authenticated;
grant execute on function public.has_osas_permission(text, uuid) to authenticated, service_role;

create or replace function public.osas_get_my_permissions()
returns table (can_view_aggregates boolean, can_manage_support_requests boolean, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select active, active, active
  from (select public.is_active_admin(auth.uid()) as active) current_admin;
$$;
revoke all on function public.osas_get_my_permissions() from public, anon, authenticated;
grant execute on function public.osas_get_my_permissions() to authenticated, service_role;

create or replace function public.osas_list_support_staff()
returns table (id uuid, email text, display_name text)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  if not public.has_osas_permission('manage_support_requests') then
    raise exception 'OSAS support permission required';
  end if;
  return query
    select a.id, u.email::text,
      coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), u.email)::text
    from public.admin_users a
    join auth.users u on u.id = a.id
    where a.is_active
    order by coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), u.email);
end;
$$;
revoke all on function public.osas_list_support_staff() from public, anon, authenticated;
grant execute on function public.osas_list_support_staff() to authenticated, service_role;

-- The old setter has no place in the active-admin OSAS model.
revoke all on function public.super_admin_set_osas_permissions(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;

commit;
