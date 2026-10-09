-- Read-only operator preflight; contains no credentials or student values.
-- Run with an authorized metadata-reading connection before reviewing hosted rollout.
begin read only;
select version();
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,p.proconfig,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'handle_new_user','validate_student_information','student_get_registration_state',
 'student_complete_registration','registration_enrollment_options','registration_enrollment_options_v2',
 'admin_activate_semester','admin_archive_semester','admin_create_semester_section',
 'admin_update_semester_section','admin_remove_semester_section')
order by p.proname;
select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and ((n.nspname='public' and c.relname in ('students','profiles'))
  or (n.nspname='auth' and c.relname='users')) order by n.nspname,c.relname,t.tgname;
select * from information_schema.table_privileges where table_schema='public'
  and table_name in ('students','profiles','academic_semesters','student_enrollment_options','student_enrollment_history')
  order by table_name,grantee,privilege_type;
select * from information_schema.column_privileges where table_schema='public'
  and table_name in ('students','profiles') order by table_name,grantee,column_name,privilege_type;
select * from pg_policies where schemaname='public'
  and tablename in ('students','profiles','academic_semesters','student_enrollment_options','student_enrollment_history');
rollback;
