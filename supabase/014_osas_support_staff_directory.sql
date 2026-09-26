-- Minimal assignee directory for personnel authorized to manage support cases.
-- Apply after 012_wellbeing_and_osas_foundation.sql. This migration is additive.
begin;
create or replace function public.osas_list_support_staff()
returns table (id uuid, email text, display_name text)
language plpgsql security definer set search_path = public, auth stable as $$
begin
  if not public.has_osas_permission('manage_support_requests') then raise exception 'OSAS support permission required'; end if;
  return query select a.id, u.email::text, coalesce(nullif(trim(a.display_name), ''), u.email)::text
  from public.admin_users a join auth.users u on u.id = a.id join public.osas_staff_permissions p on p.user_id = a.id
  where a.is_active and p.is_active and p.can_manage_support_requests
  order by coalesce(nullif(trim(a.display_name), ''), u.email);
end;
$$;
revoke all on function public.osas_list_support_staff() from public;
grant execute on function public.osas_list_support_staff() to authenticated;
commit;
