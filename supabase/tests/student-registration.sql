-- Explicitly authorized disposable database only, after migration 034. Always rolls back.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',label; end if; end; $$;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$
begin
  begin execute command; exception when insufficient_privilege then return; end;
  raise exception 'Expected privilege denial';
end; $$;
-- Self-contained fixture, including a clean install with no enrollment rows.
update public.academic_semesters set status='archived',archived_at=now() where status='active';
insert into public.academic_semesters(id,academic_year,term,status,activated_at)
values('03400000-0000-4000-8000-000000000102','2034-2035','Registration fixture','active',now());
insert into public.student_enrollment_options(id,semester_id,course,year_level,campus,section)
values('03400000-0000-4000-8000-000000000101','03400000-0000-4000-8000-000000000102',
 'BSCS','4th Year','Cavite State University Bacoor City Campus','1');
create temporary table fixture_option as
select * from public.registration_enrollment_options_v2() where id='03400000-0000-4000-8000-000000000101';
grant select on fixture_option to authenticated;
select pg_temp.assert_true(exists(select 1 from fixture_option),'active option required');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('03400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'registration-'||n||'@example.invalid',
  case when n=2 then null else now() end,
  jsonb_build_object('signup_intent',case when n=4 then 'admin_access_request' else 'student_registration' end)
from generate_series(1,4) n;
insert into public.admin_users(id,role,is_active) values('03400000-0000-4000-8000-000000000004','admin',true);
select pg_temp.assert_true(not exists(select 1 from public.students where id::text like '03400000-%'),'new Auth identities reserve no Student rows');
select pg_temp.assert_true((select count(*)=4 from public.profiles where id::text like '03400000-%'),'minimal profiles created');
-- Legacy full-metadata signup still provisions validated enrollment atomically.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select '03400000-0000-4000-8000-000000000005','legacy-registration@example.invalid',now(),
 jsonb_build_object('name','Legacy Student','student_number','934000005','goal','Preserve history',
 'course',course,'year_level',year_level,'campus',campus,'section',section) from fixture_option;
set local role anon;
select pg_temp.expect_denied($q$select public.student_get_registration_state()$q$);
select pg_temp.expect_denied($q$select public.student_complete_registration('Student','934000001','Build habits',null,null)$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_denied($q$select public.student_get_registration_state()$q$);
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(public.student_get_registration_state()='confirmation_required','unconfirmed state');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000002','Build habits',semester_id,id)->>'code'='email_not_confirmed' from fixture_option),'unconfirmed completion denied');
select pg_temp.expect_denied($q$insert into public.students(id,student_number,name,email,course,year_level,campus,section,goal) values('03400000-0000-4000-8000-000000000002','934000002','Student','a@example.invalid','BSCS','4th Year','Bacoor','1','Build habits')$q$);
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true(public.student_get_registration_state()='unavailable','administrator unavailable');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000004','Build habits',semester_id,id)->>'code'='registration_unavailable' from fixture_option),'administrator completion denied');
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_get_registration_state()='onboarding_required','confirmed incomplete state');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000001',null,semester_id,id)->>'code'='invalid_registration' from fixture_option),'null goal denied');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000001','Build habits',semester_id,id)->>'status'='completed' from fixture_option),'completion succeeds');
select pg_temp.assert_true(public.student_get_registration_state()='active','active admission');
select pg_temp.assert_true(public.student_complete_registration(null,null,null,null,null)->>'status'='completed','successful retry is idempotent');
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select public.student_complete_registration('Other Student','934000001','Build habits',semester_id,id)->>'code'='student_number_unavailable' from fixture_option),'duplicate number unavailable');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.students where id='03400000-0000-4000-8000-000000000003'),'failed enrollment remains recoverable');
select pg_temp.assert_true((select count(*)=1 from public.student_enrollment_history where student_id='03400000-0000-4000-8000-000000000001'),'one initial history after retry');
select pg_temp.assert_true((select s.semester_id=o.semester_id and s.enrollment_option_id=o.id and s.email='registration-1@example.invalid' from public.students s cross join fixture_option o where s.id='03400000-0000-4000-8000-000000000001'),'identity and period derived server-side');
update public.student_enrollment_options set is_active=false where id=(select id from fixture_option);
set local role authenticated;
select pg_temp.assert_true((select public.student_complete_registration('Other Student','934000003','Build habits',semester_id,id)->>'code'='enrollment_changed' from fixture_option),'archived option requires reselection');
reset role;
update public.student_enrollment_options set is_active=true where id=(select id from fixture_option);
update public.academic_semesters set status='archived',archived_at=now() where id=(select semester_id from fixture_option);
set local role authenticated;
select pg_temp.assert_true((select public.student_complete_registration('Other Student','934000003','Build habits',semester_id,id)->>'code'='enrollment_changed' from fixture_option),'semester rollover rejects old period');
reset role;
update public.academic_semesters set status='active',activated_at=now(),archived_at=null where id=(select semester_id from fixture_option);
update public.students set status='Inactive' where id='03400000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_get_registration_state()='blocked','suspended state');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000001','Build habits',semester_id,id)->>'code'='registration_unavailable' from fixture_option),'suspended account cannot reregister');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.student_enrollment_history where student_id='03400000-0000-4000-8000-000000000005'),'legacy history preserved');
rollback;
