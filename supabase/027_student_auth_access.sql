-- Install after 026, then enable this function as the Custom Access Token Hook.
-- Installation alone does not change Supabase Auth configuration.
begin;

create or replace function public.student_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
begin
  -- Preserve active admin access for identities with legacy student rows.
  if exists (select 1 from public.students
             where id = (event->>'user_id')::uuid and status = 'Inactive')
     and not exists (select 1 from public.admin_users
                     where id = (event->>'user_id')::uuid and is_active = true) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Your account is suspended. Contact your administrator.'
    ));
  end if;
  return jsonb_build_object('claims', event->'claims');
end;
$$;

revoke all on function public.student_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.student_access_token_hook(jsonb) to supabase_auth_admin;
grant select (id, status) on public.students to supabase_auth_admin;
grant select (id, is_active) on public.admin_users to supabase_auth_admin;
create policy "Auth hook can read student status" on public.students
  for select to supabase_auth_admin using (true);
create policy "Auth hook can read administrator eligibility" on public.admin_users
  for select to supabase_auth_admin using (true);

commit;
