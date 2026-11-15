-- Apply migration 041 on an authorized disposable stack before running.
begin;
create function pg_temp.check_result(ok boolean, description text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Assertion failed: %', description; end if;
end;
$$;
create function pg_temp.expect_error(command text, message text) returns void
language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if position(message in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected denial: %', command;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data)
select v.id,v.email,jsonb_build_object('student_number',v.student_number,'name',v.name,'goal','Verify completion',
  'course',o.course,'year_level',o.year_level,'campus',o.campus,'section',o.section)
from (values
 ('74100000-0000-4000-8000-000000000001'::uuid,'receipt-a@example.invalid','941000001','Receipt Alpha'),
 ('74100000-0000-4000-8000-000000000002'::uuid,'receipt-b@example.invalid','941000002','Receipt Beta')
) v(id,email,student_number,name)
cross join lateral (select * from public.registration_enrollment_options() limit 1) o;
select pg_temp.check_result((select count(*)=2 from public.students
  where id in ('74100000-0000-4000-8000-000000000001','74100000-0000-4000-8000-000000000002')),
  'fixtures require active registration options');

insert into public.quests(id,owner_id,title,category,xp) values
 ('74200000-0000-4000-8000-000000000001','74100000-0000-4000-8000-000000000001','Server title','Academics',35),
 ('74200000-0000-4000-8000-000000000002','74100000-0000-4000-8000-000000000001','Legacy client','Academics',25),
 ('74200000-0000-4000-8000-000000000003','74100000-0000-4000-8000-000000000002','Foreign quest','Academics',25);
insert into public.quest_completion_history(owner_id,title,category,completed_at)
values
 ('74100000-0000-4000-8000-000000000001','Deleted first','Legacy category',now()-interval '1 day'),
 ('74100000-0000-4000-8000-000000000001','Deleted second','Legacy category',now()-interval '1 day'),
 ('74100000-0000-4000-8000-000000000002','Foreign history','Legacy category',now()-interval '1 day');

set local role anon;
select pg_temp.expect_error('select public.complete_quest_v2(null)', 'permission denied');
select pg_temp.expect_error('select public.student_list_completed_quests()', 'permission denied');
select pg_temp.expect_error('select public.student_list_completed_quest_categories()', 'permission denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','74100000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.complete_quest_v2('74200000-0000-4000-8000-000000000003')$q$, 'Quest not found');
select pg_temp.check_result(
  public.complete_quest_v2('74200000-0000-4000-8000-000000000001') =
  '{"status":"completed","title":"Server title","awarded_xp":35,"total_xp":35}'::jsonb,
  'first attempt returns locked row reward');
select pg_temp.check_result(
  public.complete_quest_v2('74200000-0000-4000-8000-000000000001') = '{"status":"already_completed"}'::jsonb,
  'retry does not return a fresh award');
select public.complete_quest('74200000-0000-4000-8000-000000000002');
select public.complete_quest('74200000-0000-4000-8000-000000000002');
select pg_temp.check_result((select total_xp=60 from public.student_progress_summary()), 'legacy and v2 award once');
select pg_temp.check_result((select count(*)=4 from public.student_list_completed_quests()), 'owner-only history contains one entry per completion');
select pg_temp.check_result(exists(select 1 from public.student_list_completed_quest_categories() as category where category='Legacy category'), 'includes historical category');
with first_page as (select * from public.student_list_completed_quests(1,'Legacy category'))
select pg_temp.check_result((select count(*)=1 and bool_and(second.id <> first_page.id and second.quest_id is null)
  from first_page cross join lateral public.student_list_completed_quests(1,'Legacy category',first_page.completed_at,first_page.id) second),
  'cursor distinguishes tied timestamps and retains deleted quests');
select pg_temp.expect_error('select * from public.student_list_completed_quests(null)', 'Invalid pagination');
reset role;

update public.students set status='Inactive' where id='74100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_error('select public.complete_quest_v2(null)', 'Student account is inactive');
select pg_temp.expect_error('select public.student_list_completed_quests()', 'Student account is inactive');
select pg_temp.expect_error('select public.student_list_completed_quest_categories()', 'Student account is inactive');
reset role;
rollback;
