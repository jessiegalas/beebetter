-- Run only on the explicitly disposable database: all fixtures roll back.
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

insert into public.student_enrollment_options(course,year_level,campus,section,semester_id)
select 'BSCS','4th Year','Synthetic Test Campus','Push Test',id from public.academic_semesters where status='active'
on conflict do nothing;
insert into auth.users(id,email,raw_user_meta_data)
select v.id,v.email,jsonb_build_object('student_number',v.student_number,'name',v.name,'goal','Synthetic notification verification',
  'course',o.course,'year_level',o.year_level,'campus',o.campus,'section',o.section)
from (values
 ('11111111-1111-4111-8111-111111111111'::uuid,'push-a@example.invalid','900000001','Push Alpha'),
 ('22222222-2222-4222-8222-222222222222'::uuid,'push-b@example.invalid','900000002','Push Beta'),
 ('33333333-3333-4333-8333-333333333333'::uuid,'push-inactive@example.invalid','900000003','Push Inactive')) v(id,email,student_number,name)
cross join lateral (select * from public.registration_enrollment_options() limit 1) o;
update public.students set status='Inactive' where id='33333333-3333-4333-8333-333333333333';

set local role anon;
select pg_temp.expect_error($q$select public.register_quest_push_device('ExpoPushToken[a]','11111111-1111-4111-8111-111111111111')$q$,'permission denied');
select pg_temp.expect_error('select * from public.claim_quest_push_deliveries()','permission denied');
select pg_temp.expect_error('select * from public.quest_push_devices','permission denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.expect_error($q$select public.register_quest_push_device('ExpoPushToken[a]','22222222-2222-4222-8222-222222222222')$q$,'Account changed');
select public.register_quest_push_device('ExpoPushToken[a]','11111111-1111-4111-8111-111111111111');
select pg_temp.expect_error('select * from public.quest_push_devices','permission denied');
select pg_temp.expect_error('select * from public.quest_push_deliveries','permission denied');
select pg_temp.expect_error('select * from public.claim_quest_push_deliveries()','permission denied');
select pg_temp.expect_error($q$select * from public.validate_quest_push_claims('[]')$q$,'permission denied');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select pg_temp.expect_error($q$select public.register_quest_push_device('ExpoPushToken[i]','33333333-3333-4333-8333-333333333333')$q$,'inactive');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.register_quest_push_device('ExpoPushToken[b]','22222222-2222-4222-8222-222222222222');
reset role;

-- Model dates booked earlier, without weakening production date validation.
alter table public.quests disable trigger validate_quest_dates;
insert into public.quests(id,owner_id,title,category,scheduled_at,deadline_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','Scheduled','Habits',now()-interval '1 minute',null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111','Deadline','Habits',null,now()+interval '59 minutes'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','11111111-1111-4111-8111-111111111111','Expired','Habits',now()-interval '20 minutes',null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','22222222-2222-4222-8222-222222222222','Foreign','Habits',now()-interval '1 minute',null);
alter table public.quests enable trigger validate_quest_dates;
set local role service_role;
create temp table claims as select * from public.claim_quest_push_deliveries(array['11111111-1111-4111-8111-111111111111']::uuid[]);
select pg_temp.assert_true((select count(*)=2 from claims),'scheduled and deadline only');
select pg_temp.assert_true((select bool_and(owner_id='11111111-1111-4111-8111-111111111111' and attempts=1 and claim_id is not null and device_registered_at is not null) from claims),'owner scope and attempt metadata');
select pg_temp.assert_true((select count(*)=0 from public.claim_quest_push_deliveries('{}'::uuid[])),'empty allowlist sends nothing');
select pg_temp.assert_true((select count(*)=0 from public.claim_quest_push_deliveries(array['11111111-1111-4111-8111-111111111111']::uuid[])),'live lease is not reclaimed');
select pg_temp.assert_true((select count(*)=2 from public.validate_quest_push_claims((select jsonb_agg(jsonb_build_object('delivery_id',delivery_id,'claim_id',claim_id)) from claims))),'live validation');
update public.quest_push_deliveries set updated_at=now()-interval '3 minutes' where id in(select delivery_id from claims);
create temp table reclaimed as select * from public.claim_quest_push_deliveries(array['11111111-1111-4111-8111-111111111111']::uuid[]);
select pg_temp.assert_true((select count(*)=2 and bool_and(attempts=2) from reclaimed),'expired leases reclaimed');
select pg_temp.assert_true((select count(*)=0 from public.validate_quest_push_claims((select jsonb_agg(jsonb_build_object('delivery_id',delivery_id,'claim_id',claim_id)) from claims))),'stale claims rejected');
select pg_temp.assert_true((select count(*)=0 from public.quest_push_deliveries n join claims c on c.delivery_id=n.id and c.claim_id=n.claim_id),'old worker cannot match replacement claims');

reset role;
update public.quests set scheduled_at=now()+interval '1 hour' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
set local role service_role;
select * from public.claim_quest_push_deliveries(array['11111111-1111-4111-8111-111111111111']::uuid[]);
select pg_temp.assert_true((select status='cancelled' from public.quest_push_deliveries where quest_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),'changed schedule cancelled');
update public.quest_push_deliveries set status='pending',attempts=3 where quest_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
select * from public.claim_quest_push_deliveries(array['11111111-1111-4111-8111-111111111111']::uuid[]);
select pg_temp.assert_true((select status='failed' and attempts=3 from public.quest_push_deliveries where quest_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),'three-attempt limit');
select pg_temp.assert_true((select count(*)=1 from public.claim_quest_push_deliveries(array['22222222-2222-4222-8222-222222222222']::uuid[])),'other owner still untouched');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.expect_error($q$select public.complete_quest('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4')$q$,'Quest not found');
select public.complete_quest('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
select public.complete_quest('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
select pg_temp.assert_true((select total_xp=25 from public.profiles where id=auth.uid()),'duplicate completion awards XP once');
select pg_temp.assert_true((select count(*)=1 from public.quest_completion_history where quest_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),'one completion history record');
select public.register_quest_push_device('ExpoPushToken[a]','11111111-1111-4111-8111-111111111111',false);
reset role;
select pg_temp.assert_true((select count(*)=0 from public.quest_push_devices where token='ExpoPushToken[a]'),'owner unregister');
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.register_quest_push_device('ExpoPushToken[b]','22222222-2222-4222-8222-222222222222',false);
reset role;
select pg_temp.assert_true((select count(*)=0 from public.quest_push_deliveries where quest_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'),'unregister cancels by cascading device work');
rollback;
\echo Notification authorization, claim recovery, cancellation and idempotent completion checks passed.
