-- Normalize category references and enforce consistency of compatibility caches.
-- Apply after 025_semester_section_management.sql. This migration is additive.
begin;

-- Quest categories were previously validated only by their name. Retain the text
-- column for existing clients and immutable snapshots, but make the category row
-- the canonical relationship for current quests.
alter table public.quests
  add column if not exists category_id uuid references public.quest_categories(id) on delete restrict;

update public.quests q
set category_id=(
  select c.id from public.quest_categories c
  where c.name=q.category and (c.owner_id is null or c.owner_id=q.owner_id)
  order by (c.owner_id=q.owner_id) desc nulls last,c.id limit 1
)
where q.category_id is null and exists(
  select 1 from public.quest_categories c
  where c.name=q.category and (c.owner_id is null or c.owner_id=q.owner_id)
);

create index if not exists quests_category_id_idx on public.quests(category_id);

create or replace function public.validate_quest_category()
returns trigger language plpgsql security definer set search_path=public as $$
declare selected_category public.quest_categories%rowtype;
begin
  select c.* into selected_category
  from public.quest_categories c
  where c.name=new.category and (c.owner_id is null or c.owner_id=new.owner_id)
  order by (c.owner_id=new.owner_id) desc nulls last,c.id
  limit 1;
  if selected_category.id is null then raise exception 'Choose an available quest category'; end if;
  new.category_id:=selected_category.id;
  return new;
end;
$$;
drop trigger if exists validate_quest_category on public.quests;
create trigger validate_quest_category before insert or update of category,owner_id,category_id
on public.quests for each row execute function public.validate_quest_category();

-- Existing clients write category names. Keep category_id server-controlled.
revoke insert,update on public.quests from authenticated;
grant insert(owner_id,title,description,category,xp,location_id,requires_proof,scheduled_at,
  preferred_time,deadline_at,importance,prerequisite_quest_id) on public.quests to authenticated;
grant update(title,description,category,xp,location_id,requires_proof,scheduled_at,
  preferred_time,deadline_at,importance,prerequisite_quest_id) on public.quests to authenticated;

-- semester_id remains a compatibility cache on students/history. The readable
-- course/year/campus/section values may intentionally retain legacy spelling or
-- event-time labels, so only the option-to-semester dependency is constrained.
drop index if exists public.student_enrollment_options_identity_idx;
create unique index if not exists student_enrollment_options_semester_identity_idx
on public.student_enrollment_options(id,semester_id);

alter table public.students drop constraint if exists students_enrollment_pair_check;
alter table public.students add constraint students_enrollment_pair_check check (
  (semester_id is null and enrollment_option_id is null)
  or (semester_id is not null and enrollment_option_id is not null)
) not valid;
alter table public.students validate constraint students_enrollment_pair_check;
alter table public.students drop constraint if exists students_enrollment_identity_fkey;
alter table public.students add constraint students_enrollment_identity_fkey
foreign key(enrollment_option_id,semester_id)
references public.student_enrollment_options(id,semester_id)
on delete restrict not valid;
alter table public.students validate constraint students_enrollment_identity_fkey;

alter table public.student_enrollment_history drop constraint if exists enrollment_history_pair_check;
alter table public.student_enrollment_history add constraint enrollment_history_pair_check check (
  (semester_id is null and enrollment_option_id is null)
  or (semester_id is not null and enrollment_option_id is not null)
) not valid;
alter table public.student_enrollment_history validate constraint enrollment_history_pair_check;
alter table public.student_enrollment_history drop constraint if exists enrollment_history_identity_fkey;
alter table public.student_enrollment_history add constraint enrollment_history_identity_fkey
foreign key(enrollment_option_id,semester_id)
references public.student_enrollment_options(id,semester_id)
on delete restrict not valid;
alter table public.student_enrollment_history validate constraint enrollment_history_identity_fkey;

-- level is a server-maintained cache of total_xp, not an independent fact.
update public.profiles set level=total_xp/100+1 where level<>total_xp/100+1;
alter table public.profiles drop constraint if exists profiles_level_matches_xp_check;
alter table public.profiles add constraint profiles_level_matches_xp_check
check(level=total_xp/100+1);

comment on column public.quests.category is
'Compatibility label maintained from category_id. Completion and lifecycle tables retain immutable category snapshots.';
comment on column public.profiles.level is
'Server-maintained cache derived as total_xp / 100 + 1; constrained by profiles_level_matches_xp_check.';
comment on column public.students.semester_id is
'Compatibility cache constrained to match enrollment_option_id; readable legacy labels are preserved.';

commit;
