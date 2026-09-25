-- Registration catalogue and validation. Existing student fields and records stay intact.
begin;
create or replace function public.normalize_student_program(value text) returns text
language sql immutable set search_path = public as $$
  select case lower(regexp_replace(trim(value), '\s+', ' ', 'g'))
    when 'bscs' then 'BSCS' when 'bs computer science' then 'BSCS'
    when 'bsit' then 'BSIT' when 'bs information technology' then 'BSIT'
    when 'bshm' then 'BSHM' when 'bs hospitality management' then 'BSHM'
    when 'bscrim' then 'BSCrim' when 'bs criminology' then 'BSCrim'
    else regexp_replace(trim(value), '\s+', ' ', 'g') end;
$$;
create or replace function public.normalize_student_year(value text) returns text
language sql immutable set search_path = public as $$
  select case when trim(value) ~* '^[1-5](st|nd|rd|th)?( year)?$' then
    (array['1st Year','2nd Year','3rd Year','4th Year','5th Year'])[left(trim(value),1)::int]
    else trim(value) end;
$$;
create table if not exists public.student_enrollment_options (
  id uuid primary key default gen_random_uuid(),
  course text not null check (char_length(course) between 1 and 60 and course = public.normalize_student_program(course) and lower(course) <> 'others'),
  year_level text not null check (year_level in ('1st Year','2nd Year','3rd Year','4th Year','5th Year')),
  campus text not null check (char_length(campus) between 1 and 80 and campus = trim(campus)),
  section text not null check (char_length(section) between 1 and 30 and section = trim(section)),
  unique(course, year_level, campus, section)
);
-- Seed only actual school combinations; no invented campuses or sections.
insert into public.student_enrollment_options(course, year_level, campus, section)
select distinct public.normalize_student_program(course), public.normalize_student_year(year_level), trim(campus), trim(section)
from public.students
where char_length(public.normalize_student_program(course)) between 1 and 60
  and lower(trim(course)) not in ('undeclared','not specified','others')
  and public.normalize_student_year(year_level) in ('1st Year','2nd Year','3rd Year','4th Year','5th Year')
  and char_length(trim(campus)) between 1 and 80 and lower(trim(campus)) <> 'not specified'
  and char_length(trim(section)) between 1 and 30 and lower(trim(section)) <> 'not specified'
on conflict do nothing;
alter table public.student_enrollment_options enable row level security;
drop policy if exists "Read school options" on public.student_enrollment_options;
create policy "Read school options" on public.student_enrollment_options for select to anon, authenticated using (true);
drop policy if exists "Admins manage school options" on public.student_enrollment_options;
create policy "Admins manage school options" on public.student_enrollment_options for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
grant select on public.student_enrollment_options to anon, authenticated;
grant insert, update, delete on public.student_enrollment_options to authenticated;

create or replace function public.validate_student_information() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if TG_OP = 'INSERT' or new.name is distinct from old.name then
    new.name := regexp_replace(trim(normalize(new.name, NFC)), '\s+', ' ', 'g');
    if char_length(new.name) not between 1 and 30 or new.name !~ '[[:alpha:]]' or new.name !~ '^[[:alpha:] .''’\-]+$' then
      raise exception 'Full name must contain letters and valid name punctuation, up to 30 characters.';
    end if;
  end if;
  if TG_OP = 'INSERT' or new.student_number is distinct from old.student_number then
    new.student_number := trim(new.student_number);
    if new.student_number !~ '^[0-9]{9}$' then raise exception 'Student number must contain exactly 9 digits.'; end if;
  end if;
  if TG_OP = 'INSERT' or new.email is distinct from old.email then
    new.email := lower(trim(new.email));
    if char_length(new.email) > 254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address, up to 254 characters.'; end if;
  end if;
  if TG_OP = 'INSERT' or new.goal is distinct from old.goal then
    new.goal := trim(new.goal);
    if char_length(new.goal) not between 1 and 200 then raise exception 'Goal must contain 1 to 200 characters.'; end if;
  end if;
  if TG_OP = 'INSERT' or (new.course, new.year_level, new.campus, new.section) is distinct from (old.course, old.year_level, old.campus, old.section) then
    new.course := public.normalize_student_program(new.course);
    new.year_level := public.normalize_student_year(new.year_level);
    new.campus := trim(new.campus); new.section := trim(new.section);
    if not exists (select 1 from public.student_enrollment_options o where o.course = new.course and o.year_level = new.year_level and o.campus = new.campus and o.section = new.section) then
      raise exception 'Choose an available campus, program, year and section combination.';
    end if;
  end if;
  return new;
end;
$fn$;
drop trigger if exists validate_student_information on public.students;
create trigger validate_student_information before insert or update on public.students for each row execute function public.validate_student_information();
-- Let the validation trigger normalize changed fields. Preserve unchanged legacy
-- strings on admin edits instead of trimming every field unconditionally.
create or replace function public.admin_update_student(student_id uuid, student_number_value text, name_value text, email_value text, course_value text, year_level_value text, section_value text, campus_value text, goal_value text, status_value text)
returns public.students
language plpgsql security definer set search_path = public as $rpc$
declare updated_student public.students;
begin
  if not public.is_active_admin() then raise exception 'Only active admins can update students'; end if;
  update public.students set student_number = student_number_value, name = name_value,
    email = coalesce((select email from auth.users where auth.users.id = student_id), email),
    course = course_value, year_level = year_level_value, section = section_value,
    campus = campus_value, goal = goal_value, status = status_value, updated_at = now()
  where id = student_id returning * into updated_student;
  if updated_student.id is null then raise exception 'Student not found'; end if;
  return updated_student;
end;
$rpc$;
revoke all on function public.admin_update_student(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_student(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
commit;
