-- Explicitly authorized disposable database only, after migration 045. Always rolls back.
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
select pg_temp.assert_true(public.student_complete_registration(null,'934000002',null,null,null)->>'code'='email_not_confirmed','ID-only registration still requires email confirmation');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000002','Build habits',semester_id,id)->>'code'='email_not_confirmed' from fixture_option),'unconfirmed completion denied');
select pg_temp.expect_denied($q$insert into public.students(id,student_number,name,email,course,year_level,campus,section,goal) values('03400000-0000-4000-8000-000000000002','934000002','Student','a@example.invalid','BSCS','4th Year','Bacoor','1','Build habits')$q$);
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true(public.student_get_registration_state()='unavailable','administrator unavailable');
select pg_temp.assert_true(public.student_complete_registration(null,'934000004',null,null,null)->>'code'='registration_unavailable','administrator cannot register with an ID alone');
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
select pg_temp.assert_true(public.student_complete_registration(null,'934000001',null,null,null)->>'code'='student_number_unavailable','ID-only registration rejects duplicates');
select pg_temp.assert_true(public.student_complete_registration(null,'934000003',null,null,null)->>'status'='completed','ID alone completes registration without an active semester');
select pg_temp.assert_true(public.student_get_registration_state()='active','ID-only student is admitted');
update public.students set name='Honey Bee' where id=auth.uid();
select pg_temp.assert_true((select display_name='Honey Bee' from public.profiles where id=auth.uid()),'nickname update syncs the profile');
update public.students set name='' where id=auth.uid();
select pg_temp.assert_true((select display_name is null from public.profiles where id=auth.uid()),'nickname can be cleared');
reset role;
select pg_temp.assert_true((select semester_id is null and enrollment_option_id is null and goal='' and name=''
  from public.students where id='03400000-0000-4000-8000-000000000003'),'unassigned student uses existing defaults');
select pg_temp.assert_true((select count(*)=1 from public.student_enrollment_history
  where student_id='03400000-0000-4000-8000-000000000003' and enrollment_option_id is null),'nickname changes preserve the initial unassigned period');
update public.academic_semesters set status='active',activated_at=now(),archived_at=null where id=(select semester_id from fixture_option);
update public.students set status='Inactive' where id='03400000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_get_registration_state()='blocked','suspended state');
select pg_temp.assert_true((select public.student_complete_registration('New Student','934000001','Build habits',semester_id,id)->>'code'='registration_unavailable' from fixture_option),'suspended account cannot reregister');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.student_enrollment_history where student_id='03400000-0000-4000-8000-000000000005'),'legacy history preserved');

-- The Auth Admin service marker provisions a student atomically. Metadata an
-- ordinary signup can supply must never enter this path.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values ('04300000-0000-4000-8000-000000000001','student-04300000-0000-4000-8000-000000000001@beebetter.invalid',now(),
  '{"student_login":"id_password"}','{"student_number":"943000001","name":""}'),
 ('04300000-0000-4000-8000-000000000002','registration-043@example.invalid',null,
  '{}','{"signup_intent":"student_registration","student_login":"id_password","student_number":"943000002"}');
select pg_temp.assert_true((select email='' and name='' and status='Active' and enrollment_option_id is null
  from public.students where id='04300000-0000-4000-8000-000000000001'),'student signup stores no email or enrollment');
select pg_temp.assert_true(not exists(select 1 from public.students where id='04300000-0000-4000-8000-000000000002'),
  'client metadata cannot provision a student');
set local role authenticated;
select set_config('request.jwt.claim.sub','04300000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_get_registration_state()='active','ID/password signup is admitted');
select pg_temp.expect_denied($q$select public.student_password_identity('943000001')$q$);
select pg_temp.expect_denied($q$select public.reserve_student_signup()$q$);
reset role;
set local role service_role;
select pg_temp.assert_true((select email='student-04300000-0000-4000-8000-000000000001@beebetter.invalid' and status='Active'
  from public.student_password_identity('943000001')),'server can look up the internal identity by student ID');
select pg_temp.assert_true((select email='registration-1@example.invalid' and status='Inactive'
  from public.student_password_identity('934000001')),'server can look up an established email account by student ID');
select pg_temp.assert_true(public.reserve_student_signup(),'server can reserve an account creation attempt');
reset role;

-- The enrolled Auth path derives the labels, stores one initial period, and removes
-- temporary enrollment metadata. An unsuccessful Auth insert rolls everything back.
create function pg_temp.enrolled_signup(identity_id uuid, student_number text, selected_semester uuid, selected_option uuid, section_label text default '1')
returns void language sql as $$
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values(identity_id,'student-'||identity_id||'@beebetter.invalid',now(),'{"student_login":"id_password"}',
    jsonb_build_object('student_number',student_number,'name','Enrolled Student','initial_enrollment',
      jsonb_build_object('semester_id',selected_semester,'enrollment_option_id',selected_option,'goal','Prepare for finals',
        'expected_labels', jsonb_build_object('course','BSCS','year_level','4th Year',
          'campus','Cavite State University Bacoor City Campus','section',section_label))));
$$;
-- Model the Auth Admin API write order: user metadata on INSERT, trusted
-- app metadata on UPDATE, then confirmation, all in the same transaction.
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select '04500000-0000-4000-8000-000000000001','student-04500000-0000-4000-8000-000000000001@beebetter.invalid','{}',
  jsonb_build_object('student_number','945000001','name','Enrolled Student','initial_enrollment',
    jsonb_build_object('semester_id',semester_id,'enrollment_option_id',id,'goal','Prepare for finals',
      'expected_labels',jsonb_build_object('course',course,'year_level',year_level,'campus',campus,'section',section)))
from fixture_option;
select pg_temp.assert_true(not exists(select 1 from public.students where id='04500000-0000-4000-8000-000000000001')
  and not exists(select 1 from public.profiles where id='04500000-0000-4000-8000-000000000001'),
  'reserved address and user-supplied enrollment cannot provision a student');
update auth.users set raw_app_meta_data='{"student_login":"id_password"}' where id='04500000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=now() where id='04500000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select s.email='' and s.goal='Prepare for finals' and s.semester_id=o.semester_id
  and s.enrollment_option_id=o.id and (s.course,s.year_level,s.campus,s.section)=(o.course,o.year_level,o.campus,o.section)
  from public.students s cross join fixture_option o where s.id='04500000-0000-4000-8000-000000000001'),
  'enrolled signup stores server-derived labels and no email');
select pg_temp.assert_true((select display_name='Enrolled Student' from public.profiles
  where id='04500000-0000-4000-8000-000000000001'),'enrolled signup creates the profile');
select pg_temp.assert_true((select count(*)=1 and bool_and(enrollment_option_id is not null and valid_to is null)
  from public.student_enrollment_history where student_id='04500000-0000-4000-8000-000000000001'),
  'enrolled signup creates exactly one assigned period');
select pg_temp.assert_true((select not (raw_user_meta_data ? 'initial_enrollment') from auth.users
  where id='04500000-0000-4000-8000-000000000001'),'temporary enrollment input stays out of Auth metadata');
do $test$
begin
  begin
    perform pg_temp.enrolled_signup('04500000-0000-4000-8000-000000000002','945000001',semester_id,id) from fixture_option;
    raise exception 'Duplicate student ID was accepted';
  exception when unique_violation then null;
  end;
  begin
    perform pg_temp.enrolled_signup('04500000-0000-4000-8000-000000000003','945000003',
      '04500000-0000-4000-8000-000000000300',id) from fixture_option;
    raise exception 'Stale semester was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Enrollment choices changed' then raise; end if;
  end;
  begin
    perform pg_temp.enrolled_signup('04500000-0000-4000-8000-000000000004','945000004',semester_id,id,'2') from fixture_option;
    raise exception 'Stale section label was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Enrollment choices changed' then raise; end if;
  end;
end;
$test$;
select pg_temp.assert_true(not exists(select 1 from auth.users where id in (
  '04500000-0000-4000-8000-000000000002','04500000-0000-4000-8000-000000000003','04500000-0000-4000-8000-000000000004'))
  and not exists(select 1 from public.student_enrollment_history where student_id in (
  '04500000-0000-4000-8000-000000000002','04500000-0000-4000-8000-000000000003','04500000-0000-4000-8000-000000000004')),
  'rejected signup leaves neither an Auth user nor a history period');

set local role anon;
select pg_temp.expect_denied($q$select public.student_complete_enrollment('Student','Study',null,null)$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_complete_enrollment('Student','Study',null,null)->>'code'='registration_unavailable','inactive student denied');
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true(public.student_complete_enrollment('Student','Study',null,null)->>'code'='registration_unavailable','admin denied enrollment');
select set_config('request.jwt.claim.sub','04300000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_complete_enrollment('Student','Study',null,null)->>'code'='enrollment_changed','unavailable choice can be retried');
select pg_temp.assert_true((select public.student_complete_enrollment('Student','Study',semester_id,id)->>'status'='completed'
  from fixture_option),'older password account completes enrollment');
select pg_temp.assert_true(public.student_complete_enrollment('Different Name','Different goal',null,null)->>'status'='completed','completion retry is idempotent');
reset role;
select pg_temp.assert_true((select student_number='943000001' and email='' and goal='Study' and name='Student'
  from public.students where id='04300000-0000-4000-8000-000000000001'),'enrollment preserves ID and does not overwrite a completed assignment');
select pg_temp.assert_true((select count(*)=2 and count(*) filter (where valid_to is null and enrollment_option_id is not null)=1
  from public.student_enrollment_history where student_id='04300000-0000-4000-8000-000000000001'),'unassigned period closed and one assigned period appended');

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('04500000-0000-4000-8000-000000000010','enrollment-super@example.invalid',now(),'{"signup_intent":"admin_access_request"}'),
  ('04500000-0000-4000-8000-000000000011','enrollment-inactive@example.invalid',now(),'{"signup_intent":"admin_access_request"}');
insert into public.admin_users(id,role,is_active) values
  ('04500000-0000-4000-8000-000000000010','super_admin',true),
  ('04500000-0000-4000-8000-000000000011','admin',false);
set local role authenticated;
select set_config('request.jwt.claim.sub','03400000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true(exists(select 1 from public.admin_list_semesters()),'ordinary active admin can list semesters');
select (public.admin_create_semester('2045-2046','Enrollment rollover')).id;
select (public.admin_create_semester_section(id,'BSCS','4th Year','Cavite State University Bacoor City Campus','2')).id
  from public.admin_list_semesters() where academic_year='2045-2046' and term='Enrollment rollover';
select set_config('request.jwt.claim.sub','04500000-0000-4000-8000-000000000010',true);
select pg_temp.assert_true((select (public.admin_activate_semester(id)).status='active'
  from public.admin_list_semesters() where academic_year='2045-2046' and term='Enrollment rollover'),
  'active super admin can activate a semester prepared by an ordinary admin');
select pg_temp.assert_true((select count(*)=1 and bool_and(section='2') from public.registration_enrollment_options_v2()),
  'activation switches the published enrollment choices');
select set_config('request.jwt.claim.sub','04500000-0000-4000-8000-000000000011',true);
do $test$
begin
  begin
    perform public.admin_list_semesters();
    raise exception 'Inactive admin could list semesters';
  exception when raise_exception then
    if sqlerrm <> 'Active admin access required' then raise; end if;
  end;
end;
$test$;
reset role;
select pg_temp.assert_true((select s.semester_id=o.semester_id and s.enrollment_option_id=o.id
  from public.students s cross join fixture_option o where s.id='04500000-0000-4000-8000-000000000001'),
  'rollover keeps existing student assignments');
rollback;
