begin;

-- This client-supplied intent only skips student-row creation for an admin
-- signup; it never grants access. Admin membership remains server-authorized.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(metadata ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  if metadata ->> 'signup_intent' = 'admin_access_request' then
    return new;
  end if;

  insert into public.students (id, student_number, name, email, course, year_level, section, campus, goal)
  values (
    new.id,
    coalesce(nullif(trim(metadata ->> 'student_number'), ''), 'LEGACY-' || upper(left(replace(new.id::text, '-', ''), 8))),
    coalesce(nullif(trim(metadata ->> 'name'), ''), metadata ->> 'display_name', split_part(new.email, '@', 1), 'Bee Explorer'),
    coalesce(new.email, ''),
    coalesce(nullif(trim(metadata ->> 'course'), ''), 'Undeclared'),
    coalesce(nullif(trim(metadata ->> 'year_level'), ''), 'Not specified'),
    coalesce(nullif(trim(metadata ->> 'section'), ''), 'Not specified'),
    coalesce(nullif(trim(metadata ->> 'campus'), ''), 'Not specified'),
    coalesce(metadata ->> 'goal', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table public.admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  constraint admin_access_requests_review_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status in ('approved', 'declined') and reviewed_at is not null)
  )
);
create unique index admin_access_requests_one_pending
  on public.admin_access_requests(user_id) where status = 'pending';
create index admin_access_requests_user_latest
  on public.admin_access_requests(user_id, submitted_at desc);
create index admin_access_requests_pending_order
  on public.admin_access_requests(submitted_at, id) where status = 'pending';

alter table public.admin_access_requests enable row level security;
revoke all on public.admin_access_requests from public, anon, authenticated, service_role;
grant select on public.admin_access_requests to authenticated;
create policy "Users can view their own admin access requests"
  on public.admin_access_requests for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.admin_request_access()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  requester_id uuid := auth.uid();
begin
  if requester_id is null then raise exception 'Authentication is required'; end if;
  if exists (select 1 from public.admin_users where id = requester_id) then
    raise exception 'Admin access for this account is already managed';
  end if;
  select r.id into request_id from public.admin_access_requests r
    where r.user_id = requester_id and r.status = 'pending';
  if request_id is not null then return request_id; end if;
  insert into public.admin_access_requests(user_id) values (requester_id)
    on conflict (user_id) where status = 'pending' do nothing
    returning id into request_id;
  if request_id is null then
    select r.id into request_id from public.admin_access_requests r
      where r.user_id = requester_id and r.status = 'pending';
  end if;
  return request_id;
end;
$$;
revoke all on function public.admin_request_access() from public, anon;
grant execute on function public.admin_request_access() to authenticated;

create or replace function public.super_admin_list_access_requests()
returns table(request_id uuid, user_id uuid, email text, display_name text, submitted_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if not public.is_super_admin() then raise exception 'Only Super Admins can review access requests'; end if;
  return query
    select r.id, r.user_id, u.email::text,
      coalesce(p.display_name, u.email)::text, r.submitted_at
    from public.admin_access_requests r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    where r.status = 'pending'
    order by r.submitted_at, r.id;
end;
$$;
revoke all on function public.super_admin_list_access_requests() from public, anon;
grant execute on function public.super_admin_list_access_requests() to authenticated;

create or replace function public.super_admin_review_access_request(
  request_id_value uuid,
  approve_value boolean
)
returns public.admin_access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.admin_access_requests;
  saved_request public.admin_access_requests;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admins can review access requests'; end if;
  select * into request_row from public.admin_access_requests
    where id = request_id_value and status = 'pending'
    for update;
  if request_row.id is null then raise exception 'Pending access request not found'; end if;

  if approve_value then
    if exists (select 1 from public.admin_users where id = request_row.user_id) then
      raise exception 'Admin access for this account is already managed';
    end if;
    insert into public.admin_users(id, role, is_active) values (request_row.user_id, 'admin', true);
  end if;

  update public.admin_access_requests
    set status = case when approve_value then 'approved' else 'declined' end,
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = request_row.id
    returning * into saved_request;
  return saved_request;
end;
$$;
revoke all on function public.super_admin_review_access_request(uuid, boolean) from public, anon;
grant execute on function public.super_admin_review_access_request(uuid, boolean) to authenticated;

commit;
