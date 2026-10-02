-- Dedicated fixtures for two independent psql connections. Disposable database only.
begin;
insert into public.student_enrollment_options(course,year_level,campus,section,semester_id)
select 'BSCS','4th Year','Synthetic Test Campus','Push Test',id from public.academic_semesters where status='active'
on conflict do nothing;
insert into auth.users(id,email,raw_user_meta_data)
select '44444444-4444-4444-8444-444444444444','push-concurrency@example.invalid',
 jsonb_build_object('student_number','900000004','name','Push Concurrent','goal','Synthetic concurrency check',
 'course',o.course,'year_level',o.year_level,'campus',o.campus,'section',o.section)
from public.registration_enrollment_options() o limit 1;
insert into public.quest_push_devices(token,owner_id) values('ExpoPushToken[concurrent]','44444444-4444-4444-8444-444444444444');
alter table public.quests disable trigger validate_quest_dates;
insert into public.quests(id,owner_id,title,category,scheduled_at) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','44444444-4444-4444-8444-444444444444','Concurrent Alpha','Habits',now()-interval '1 minute'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','44444444-4444-4444-8444-444444444444','Concurrent Beta','Habits',now()-interval '1 minute');
alter table public.quests enable trigger validate_quest_dates;
insert into public.quest_push_deliveries(quest_id,token,kind,due_at)
select id,'ExpoPushToken[concurrent]','scheduled',scheduled_at from public.quests where owner_id='44444444-4444-4444-8444-444444444444';
commit;
