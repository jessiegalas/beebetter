-- Run only with explicit authorization on a disposable database after migration 033.
-- Requires an active registration option for the synthetic student fixture.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %', label; end if; end; $$;
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise exception 'Unexpected error (%): %', expected, sqlerrm;
  end;
  raise exception 'Expected denial: %', command;
end; $$;

-- Six active admins cover each role with absent, disabled and restrictive legacy rows.
insert into auth.users(id,email,raw_user_meta_data)
select ('03300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'osas-' || n || '@example.invalid', '{"signup_intent":"admin_access_request","display_name":"Synthetic OSAS"}'::jsonb
from generate_series(1,8) n;
insert into public.admin_users(id,role,is_active)
select ('03300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  case when n <= 3 then 'admin' else 'super_admin' end, n <= 6
from generate_series(1,7) n;
insert into public.admin_access_requests(user_id)
values ('03300000-0000-4000-8000-000000000008');
insert into public.osas_staff_permissions(user_id,can_view_aggregates,can_manage_support_requests,is_active)
select ('03300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  true, n in (2,5,7), n not in (2,5)
from unnest(array[2,3,5,6,7]) n;
select pg_temp.assert_true(exists(select 1 from public.registration_enrollment_options()), 'student fixture needs enrollment option');
insert into auth.users(id,email,raw_user_meta_data)
select '03300000-0000-4000-8000-000000000009', 'osas-student@example.invalid',
  jsonb_build_object('student_number','933000009','name','Synthetic Student','goal','Synthetic OSAS verification',
    'course',course,'year_level',year_level,'campus',campus,'section',section)
from public.registration_enrollment_options() limit 1;

-- Student-owned insertion, OSAS assignment/events, and withdrawn-case protection.
set local role authenticated;
select set_config('request.jwt.claim.sub','03300000-0000-4000-8000-000000000009',true);
insert into public.support_requests(id,student_id,category,message,preferred_contact,consent_to_contact)
values ('03300000-0000-4000-8000-000000000010','03300000-0000-4000-8000-000000000009','academic','Synthetic case','email',true);
select pg_temp.assert_true(exists(select 1 from public.support_requests where id='03300000-0000-4000-8000-000000000010'), 'student reads own case');
select set_config('request.jwt.claim.sub','03300000-0000-4000-8000-000000000008',true);
select pg_temp.assert_true(not exists(select 1 from public.support_requests where id='03300000-0000-4000-8000-000000000010'), 'other account cannot read student case');
select set_config('request.jwt.claim.sub','03300000-0000-4000-8000-000000000002',true);
select public.osas_update_support_request('03300000-0000-4000-8000-000000000010','in_progress','03300000-0000-4000-8000-000000000003','Synthetic follow-up');
select pg_temp.expect_error($q$select public.osas_update_support_request('03300000-0000-4000-8000-000000000010','in_progress','03300000-0000-4000-8000-000000000007')$q$, 'Assignee must be authorized');
select set_config('request.jwt.claim.sub','03300000-0000-4000-8000-000000000009',true);
select public.student_withdraw_support_request('03300000-0000-4000-8000-000000000010');
select pg_temp.assert_true((select status='withdrawn' and assigned_to='03300000-0000-4000-8000-000000000003' and resolution_note='Synthetic follow-up' from public.support_requests where id='03300000-0000-4000-8000-000000000010'), 'withdrawal retains notes and assignment');
select set_config('request.jwt.claim.sub','03300000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.osas_update_support_request('03300000-0000-4000-8000-000000000010','resolved')$q$, 'not found or withdrawn');
reset role;
select pg_temp.assert_true((select count(*)>=4 from public.support_request_events where request_id='03300000-0000-4000-8000-000000000010'), 'status, assignment, follow-up and withdrawal events retained');
set local role authenticated;
do $
declare n integer; staff_count integer; report jsonb;
begin
  for n in 1..6 loop
    perform set_config('request.jwt.claim.sub','03300000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    perform pg_temp.assert_true(public.has_osas_permission('view_aggregates'), 'active admin reporting');
    perform pg_temp.assert_true(public.has_osas_permission('manage_support_requests'), 'active admin support');
    perform pg_temp.assert_true((select can_view_aggregates and can_manage_support_requests and is_active from public.osas_get_my_permissions()), 'compatible permission response');
    perform pg_temp.assert_true(not public.has_osas_permission('unknown') and not public.has_osas_permission(null), 'unknown and null names denied');
    select count(*) into staff_count from public.osas_list_support_staff() where id::text like '03300000-%';
    perform pg_temp.assert_true(staff_count=6, 'all active admins appear as assignees');
    perform pg_temp.expect_error($q$select public.super_admin_set_osas_permissions('03300000-0000-4000-8000-000000000001',true,true,true)$q$, 'permission denied');
    report := public.osas_dashboard_analytics(current_date-7,current_date,'Synthetic absent campus 033');
    perform pg_temp.assert_true((report->>'suppressed')::boolean, 'small cohort remains suppressed');
    perform pg_temp.expect_error($q$select public.osas_log_dashboard_export(current_date-7,current_date,'Synthetic absent campus 033')$q$, 'suppressed');
  end loop;
  for n in 7..9 loop
    perform set_config('request.jwt.claim.sub','03300000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    perform pg_temp.assert_true((select not can_view_aggregates and not can_manage_support_requests and not is_active from public.osas_get_my_permissions()), 'inactive, pending and student denied');
    perform pg_temp.expect_error('select * from public.osas_list_support_staff()', 'OSAS support permission required');
    perform pg_temp.expect_error('select public.osas_dashboard_analytics(current_date-7,current_date)', 'OSAS aggregate permission required');
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  perform pg_temp.assert_true(not public.has_osas_permission('view_aggregates'), 'missing identity denied');
end; $$;
reset role;
update public.admin_users set is_active=false where id='03300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','03300000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(not public.has_osas_permission('view_aggregates') and not public.has_osas_permission('manage_support_requests'), 'deactivation denies old session immediately');
reset role;
select pg_temp.assert_true(exists(select 1 from public.osas_report_audit_log where actor_id='03300000-0000-4000-8000-000000000002' and outcome='suppressed'), 'report audits retained');
select pg_temp.assert_true((select count(*)=5 from public.osas_staff_permissions where user_id::text like '03300000-%'), 'legacy records retained');
set local role anon;
select pg_temp.expect_error('select * from public.osas_get_my_permissions()', 'permission denied');
select pg_temp.expect_error('select * from public.osas_list_support_staff()', 'permission denied');
select pg_temp.expect_error($q$select public.has_osas_permission('view_aggregates')$q$, 'permission denied');
reset role;
rollback;
