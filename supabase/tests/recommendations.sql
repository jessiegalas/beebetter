-- Run after 037/038/039 ONLY on an explicitly authorized disposable Supabase stack.
-- Requires an active registration enrollment option. All synthetic data rolls back.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',label; end if; end; $$;
create function pg_temp.expect_error(command text,expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected,sqlerrm;
  end;
  raise exception 'Expected denial: %',command;
end; $$;

insert into auth.users(id,email,raw_user_meta_data)
select v.id,v.email,jsonb_build_object('student_number',v.student_number,'name',v.name,'goal','Synthetic recommendation verification',
  'course',o.course,'year_level',o.year_level,'campus',o.campus,'section',o.section)
from (values
 ('71000000-0000-4000-8000-000000000001'::uuid,'recommendation-a@example.invalid','910000001','Recommendation Alpha'),
 ('71000000-0000-4000-8000-000000000002'::uuid,'recommendation-b@example.invalid','910000002','Recommendation Beta'),
 ('71000000-0000-4000-8000-000000000003'::uuid,'recommendation-inactive@example.invalid','910000003','Recommendation Inactive')) v(id,email,student_number,name)
cross join lateral (select * from public.registration_enrollment_options() limit 1) o;
select pg_temp.assert_true((select count(*)=3 from public.students where id in (
 '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003')),'fixtures require active enrollment option');
update public.students set status='Inactive' where id='71000000-0000-4000-8000-000000000003';
insert into public.quests(id,owner_id,title,category) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Prepare','Academics'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','Study','Academics'),
 ('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000002','Foreign quest','Habits');
update public.quests set prerequisite_quest_id='72000000-0000-4000-8000-000000000001' where id='72000000-0000-4000-8000-000000000002';

set local role anon;
select pg_temp.expect_error($q$select * from public.student_get_recommendation_facts('{}')$q$,'permission denied');
select pg_temp.expect_error($q$select * from public.recommendation_events_v2$q$,'permission denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error($q$select * from public.student_get_recommendation_facts('{}')$q$,'Active student required');
select pg_temp.expect_error($q$select public.student_record_recommendation_event_v2(null,null,null,'home','now',1,'{}','exposure',now())$q$,'Active student required');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select * from public.student_get_recommendation_facts(array['72000000-0000-4000-8000-000000000003']::uuid[])$q$,'Quest not found');
select pg_temp.expect_error($q$select * from public.student_get_recommendation_facts(array_fill('72000000-0000-4000-8000-000000000001'::uuid,array[201]))$q$,'at most 200');
select pg_temp.assert_true((select prerequisite_status='active' from public.student_get_recommendation_facts(array['72000000-0000-4000-8000-000000000002']::uuid[])),'incomplete prerequisite');
select public.complete_quest('72000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not exists(select 1 from public.student_list_recommendation_candidates() where id='72000000-0000-4000-8000-000000000001'),'completed parent absent from candidates');
select pg_temp.assert_true((select prerequisite_status='completed' and prerequisite_title='Prepare' from public.student_get_recommendation_facts(array['72000000-0000-4000-8000-000000000002']::uuid[])),'completed prerequisite remains authoritative');
select pg_temp.expect_error($q$select * from public.recommendation_events_v2$q$,'permission denied');
reset role;
-- More than 100 newer unrelated records must not erase the matching activity.
insert into public.quest_completion_history(owner_id,title,category,completed_at)
values('71000000-0000-4000-8000-000000000001',' Study ','Academics',statement_timestamp()-interval '7 days'),
 ('71000000-0000-4000-8000-000000000001','Study','Academics',statement_timestamp()+interval '1 day');
insert into public.quest_completion_history(owner_id,title,category,completed_at)
select '71000000-0000-4000-8000-000000000001','Unrelated '||i,'Academics',statement_timestamp()-i*interval '1 minute' from generate_series(1,105) i;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select latest_activity_at<statement_timestamp()-interval '6 days' from public.student_get_recommendation_facts(array['72000000-0000-4000-8000-000000000002']::uuid[])),'complete-history aggregate excludes future records');
select pg_temp.assert_true(not exists(select 1 from public.student_list_completion_history() where lower(trim(title))='study' and completed_at<now()),'matching record outside history page');

select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','home','now',1,array['schedule_now'],'selection',now()-interval '2 seconds');
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','home','now',1,array['schedule_now'],'exposure',now()-interval '1 second');
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','home','now',1,array['schedule_now'],'exposure',now()-interval '1 second');
select pg_temp.expect_error($q$select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','home','now',2,array['schedule_now'],'selection',statement_timestamp())$q$,'Impression changed');
select pg_temp.expect_error($q$select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000003',gen_random_uuid(),gen_random_uuid(),'home','now',1,'{}','exposure',statement_timestamp())$q$,'Quest not found');
select pg_temp.expect_error($q$select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),'home','now',1,array['invented'],'exposure',statement_timestamp())$q$,'Invalid reasons');
select pg_temp.expect_error($q$select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),'home','now',1,'{}','completion',statement_timestamp())$q$,'Invalid event');
select pg_temp.expect_error($q$select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),'home','now',1,'{}','exposure',statement_timestamp()+interval '2 minutes')$q$,'Invalid event time');
-- A future exposure within clock tolerance cannot steal preceding-exposure attribution.
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','quest_board','now',1,'{}','exposure',statement_timestamp()+interval '30 seconds');
select public.complete_quest('72000000-0000-4000-8000-000000000002');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.recommendation_events_v2 where student_id='71000000-0000-4000-8000-000000000001' and impression_id='73000000-0000-4000-8000-000000000001' and event_type='exposure'),'duplicate exposure is idempotent');
select pg_temp.assert_true((select count(*)=1 from public.recommendation_events_v2 where student_id='71000000-0000-4000-8000-000000000001' and impression_id='73000000-0000-4000-8000-000000000001' and event_type='completion'),'completion uses preceding exposure');
select pg_temp.assert_true(not exists(select 1 from public.recommendation_events_v2 where impression_id='73000000-0000-4000-8000-000000000002' and event_type='completion'),'future exposure not attributed');
select pg_temp.assert_true(not exists(select 1 from public.recommendation_events where student_id='71000000-0000-4000-8000-000000000001'),'v2 events do not enter legacy measurement');
-- Canonical query-time attribution. Historical ingestion-time completion events stay intact.
set local role anon;
select pg_temp.expect_error($q$select * from public.recommendation_completion_attributions_v2$q$,'permission denied');
reset role;
set local role authenticated;
select pg_temp.expect_error($q$select * from public.recommendation_completion_attributions_v2$q$,'permission denied');
reset role;
insert into public.quests(id,owner_id,title,category) values
 ('72000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','Offline attribution','Habits'),
 ('72000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000001','Deleted attribution','Habits');
insert into public.quest_completion_history(id,owner_id,quest_id,title,category,completed_at) values
 ('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000004','Offline attribution','Habits',now()-interval '1 hour'),
 ('75000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000004','Offline attribution','Habits',now()-interval '4 hours'),
 ('75000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000005','Deleted attribution','Habits',now()-interval '1 hour');
set local role service_role;
select pg_temp.assert_true((select exposure_event_id is null from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000001'),'unmatched completion retained');
reset role;
-- Accepted offline exposure delivered after the durable completion.
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000004','74000000-0000-4000-8000-000000000001','home','now',1,'{}','exposure',now()-interval '3 hours');
reset role;
select pg_temp.assert_true((select exposed_at=now()-interval '3 hours' from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000001'),'late exposure attributes existing completion');
set local role authenticated;
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000005','74000000-0000-4000-8000-000000000001','quest_board','other',2,'{}','exposure',now()-interval '2 hours');
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000005','74000000-0000-4000-8000-000000000001','quest_board','other',2,'{}','exposure',now()-interval '2 hours');
-- Older delivery and an exposure after completion cannot displace the latest preceding exposure.
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000006','74000000-0000-4000-8000-000000000001','home','other',3,'{}','exposure',now()-interval '150 minutes');
select public.student_record_recommendation_event_v2('72000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000007','74000000-0000-4000-8000-000000000001','home','other',3,'{}','exposure',now()-interval '30 minutes');
reset role;
select pg_temp.assert_true((select impression_id='73000000-0000-4000-8000-000000000005' from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000001'),'latest preceding event wins independent of delivery order and duplicates');
-- Privileged fixtures exercise old timestamps outside the RPC's intentional 24-hour delivery bound.
insert into public.recommendation_events_v2(id,student_id,quest_id,impression_id,session_id,surface,recommendation_group,rank_position,recommendation_version,event_type,occurred_at) values
 ('76000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000004',gen_random_uuid(),gen_random_uuid(),'home','other',1,'rules-v2','exposure',now()-interval '30 days 4 hours'),
 ('76000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000004',gen_random_uuid(),gen_random_uuid(),'home','other',1,'rules-v2','exposure',now()-interval '30 days 4 hours 1 microsecond'),
 ('76000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000004',gen_random_uuid(),gen_random_uuid(),'home','other',1,'rules-v2','exposure',now()-interval '4 hours');
select pg_temp.assert_true((select exposure_event_id='76000000-0000-4000-8000-000000000001' from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000002'),'inclusive 30-day lower bound and owner isolation');
delete from public.recommendation_events_v2 where id='76000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select exposure_event_id is null from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000002'),'exposure one microsecond outside 30 days excluded');
insert into public.recommendation_events_v2(id,student_id,quest_id,impression_id,session_id,surface,recommendation_group,rank_position,recommendation_version,event_type,occurred_at) values
 ('76000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000004',gen_random_uuid(),gen_random_uuid(),'home','other',1,'rules-v2','exposure',now()-interval '1 hour'),
 ('76000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000004',gen_random_uuid(),gen_random_uuid(),'home','other',1,'rules-v2','exposure',now()-interval '1 hour');
select pg_temp.assert_true((select exposure_event_id='76000000-0000-4000-8000-000000000005' from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000001'),'inclusive upper bound and deterministic descending event ID tie break');
select pg_temp.assert_true((select count(*)=2 from public.recommendation_completion_attributions_v2 where quest_id='72000000-0000-4000-8000-000000000004'),'repeated completions keep one attribution row per history ID');
delete from public.quests where id='72000000-0000-4000-8000-000000000005';
select pg_temp.assert_true((select quest_id is null and exposure_event_id is null from public.recommendation_completion_attributions_v2 where completion_history_id='75000000-0000-4000-8000-000000000003'),'deleted quest history remains unattributed');
select pg_temp.assert_true((select count(*)=1 from public.recommendation_events_v2 where student_id='71000000-0000-4000-8000-000000000001' and impression_id='73000000-0000-4000-8000-000000000001' and event_type='completion'),'ingestion-time historical completion unchanged');
rollback;
