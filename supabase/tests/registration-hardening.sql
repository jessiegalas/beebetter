-- Disposable stack only, after 036. Synthetic fixtures always roll back.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',label; end if; end; $$;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$
begin
  begin execute command; exception when insufficient_privilege then return; end;
  raise exception 'Expected privilege denial';
end; $$;
create function pg_temp.expect_failure(command text,expected_message text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise;
  end;
  raise exception 'Expected operation failure';
end; $$;

update public.academic_semesters set status='archived',archived_at=now() where status='active';
insert into public.academic_semesters(id,academic_year,term,status,activated_at)
values('03600000-0000-4000-8000-000000000100','2036-2037','Hardening fixture','active',now());
insert into public.student_enrollment_options(id,semester_id,course,year_level,campus,section)
values('03600000-0000-4000-8000-000000000101','03600000-0000-4000-8000-000000000100',
 'BSCS','4th Year','Cavite State University Bacoor City Campus','1');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('03600000-0000-4000-8000-000000000001','hardening-student@example.invalid',now(),'{"signup_intent":"student_registration"}'),
 ('03600000-0000-4000-8000-000000000002','hardening-other@example.invalid',now(),'{"signup_intent":"student_registration"}'),
 ('03600000-0000-4000-8000-000000000003','hardening-admin@example.invalid',now(),'{"signup_intent":"admin_access_request"}');
insert into public.admin_users(id,role,is_active)
values('03600000-0000-4000-8000-000000000003','admin',true);

set local role anon;
select pg_temp.assert_true((select count(*)=1 from public.registration_enrollment_options_v2()),'anonymous catalogue preserved');
select pg_temp.expect_denied('select * from public.students');
select pg_temp.expect_denied('select * from public.profiles');
select pg_temp.expect_denied('select public.canonical_student_email()');
select pg_temp.expect_denied('select public.sync_student_auth_email()');
reset role;
select pg_temp.assert_true(has_column_privilege('authenticated','public.students','email','UPDATE'),'legacy email updates retained');
select pg_temp.assert_true(has_column_privilege('supabase_auth_admin','public.students','status','SELECT'),'Auth-hook read retained');
select pg_temp.assert_true(has_table_privilege('service_role','public.students','DELETE'),'service jobs preserved');
do $$
declare role_name text; table_name text; permission text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach table_name in array array['students','profiles','academic_semesters','student_enrollment_options','student_enrollment_history'] loop
      foreach permission in array array['TRUNCATE','TRIGGER','REFERENCES'] loop
        if has_table_privilege(role_name,'public.'||table_name,permission) then
          raise exception 'Unexpected privilege % on % for %',permission,table_name,role_name;
        end if;
      end loop;
      if current_setting('server_version_num')::integer>=170000 then
        if has_table_privilege(role_name,'public.'||table_name,'MAINTAIN') then
          raise exception 'Unexpected MAINTAIN privilege on % for %',table_name,role_name;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','03600000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.student_complete_registration('Hardening Student','936000001','Build habits',
 '03600000-0000-4000-8000-000000000100','03600000-0000-4000-8000-000000000101')->>'status'='completed','student completes registration');
-- Older builds include email. It is accepted but cannot replace the Auth projection.
update public.students set email='client-replacement@example.invalid' where id=auth.uid();
select pg_temp.assert_true((select email='hardening-student@example.invalid' from public.students where id=auth.uid()),'client email ignored');
select pg_temp.expect_denied('truncate public.students');
select pg_temp.expect_denied('update public.students set status=''Inactive'' where id=auth.uid()');
select pg_temp.expect_denied('update public.student_enrollment_options set is_active=false');
select set_config('request.jwt.claim.sub','03600000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.students where id='03600000-0000-4000-8000-000000000001'),'other student cannot read projection');
update public.students set email='cross-owner@example.invalid' where id='03600000-0000-4000-8000-000000000001';
reset role;
select pg_temp.assert_true((select email='hardening-student@example.invalid' from public.students where id='03600000-0000-4000-8000-000000000001'),'other student cannot update projection');
update auth.users set email='confirmed-change@example.invalid' where id='03600000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select email='confirmed-change@example.invalid' from public.students where id='03600000-0000-4000-8000-000000000001'),'Auth email change synchronized');
select pg_temp.assert_true((select count(*)=1 from public.student_enrollment_history where student_id='03600000-0000-4000-8000-000000000001'),'email updates preserve enrollment history');

set local role authenticated;
select set_config('request.jwt.claim.sub','03600000-0000-4000-8000-000000000003',true);
select pg_temp.expect_failure($q$select public.admin_update_semester_section(
 '03600000-0000-4000-8000-000000000101','BSCS','4th Year','Cavite State University Bacoor City Campus','2',true)$q$,
 'associated section cannot be renamed');
select pg_temp.assert_true(public.admin_remove_semester_section('03600000-0000-4000-8000-000000000101')='archived','associated section retained');
select public.admin_archive_semester('03600000-0000-4000-8000-000000000100');
select pg_temp.expect_failure($q$select public.admin_create_semester_section(
 '03600000-0000-4000-8000-000000000100','BSCS','4th Year','Cavite State University Bacoor City Campus','2')$q$,
 'archived semester');
reset role;
insert into public.academic_semesters(id,academic_year,term)
values('03600000-0000-4000-8000-000000000200','2037-2038','Empty draft fixture');
set local role authenticated;
select pg_temp.expect_failure($q$select public.admin_activate_semester('03600000-0000-4000-8000-000000000200')$q$,
 'at least one active section');
reset role;
select pg_temp.assert_true((select status='draft' from public.academic_semesters where id='03600000-0000-4000-8000-000000000200'),'failed activation retains draft');
select pg_temp.assert_true((select count(*)=1 from public.student_enrollment_history where student_id='03600000-0000-4000-8000-000000000001'),'admin changes preserve history');
rollback;
