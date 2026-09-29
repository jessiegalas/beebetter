-- Semester-aware enrollment catalogue integrated with existing students and history.
-- Apply after 024_final_integration_fixes.sql. This migration is additive.
begin;

create table if not exists public.academic_semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null check (char_length(trim(academic_year)) between 4 and 30 and academic_year=trim(academic_year)),
  term text not null check (char_length(trim(term)) between 2 and 40 and term=trim(term)),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  activated_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academic_year,term),
  check ((status='active' and activated_at is not null and archived_at is null)
    or (status='archived' and archived_at is not null)
    or (status='draft' and activated_at is null and archived_at is null))
);
create unique index if not exists academic_semesters_one_active_idx
on public.academic_semesters((status)) where status='active';
alter table public.academic_semesters enable row level security;
revoke all on public.academic_semesters from public,anon,authenticated;

insert into public.academic_semesters(academic_year,term,status,activated_at)
select 'Legacy / Current','Unspecified','active',now()
where not exists(select 1 from public.academic_semesters);

alter table public.student_enrollment_options
  add column if not exists semester_id uuid references public.academic_semesters(id) on delete restrict,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
update public.student_enrollment_options
set semester_id=(select id from public.academic_semesters where status='active' limit 1)
where semester_id is null;
alter table public.student_enrollment_options alter column semester_id set not null;
alter table public.student_enrollment_options
  drop constraint if exists student_enrollment_options_course_year_level_campus_section_key;
create unique index if not exists student_enrollment_options_semester_combination_idx
on public.student_enrollment_options(semester_id,course,year_level,campus,section);

alter table public.students
  add column if not exists semester_id uuid references public.academic_semesters(id) on delete restrict,
  add column if not exists enrollment_option_id uuid references public.student_enrollment_options(id) on delete restrict;
update public.students s set semester_id=o.semester_id,enrollment_option_id=o.id
from public.student_enrollment_options o
where s.enrollment_option_id is null and o.course=public.normalize_student_program(s.course)
  and o.year_level=public.normalize_student_year(s.year_level)
  and o.campus=trim(s.campus) and o.section=trim(s.section);

alter table public.student_enrollment_history
  add column if not exists semester_id uuid references public.academic_semesters(id) on delete restrict,
  add column if not exists enrollment_option_id uuid references public.student_enrollment_options(id) on delete restrict;
update public.student_enrollment_history h set semester_id=o.semester_id,enrollment_option_id=o.id
from public.student_enrollment_options o
where h.enrollment_option_id is null and o.course=public.normalize_student_program(h.course)
  and o.year_level=public.normalize_student_year(h.year_level)
  and o.campus=trim(h.campus) and o.section=trim(h.section);
create index if not exists student_enrollment_history_semester_idx
on public.student_enrollment_history(semester_id,student_id,valid_from);

create or replace function public.set_semester_record_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=now(); return new; end;
$$;
drop trigger if exists set_academic_semesters_updated_at on public.academic_semesters;
create trigger set_academic_semesters_updated_at before update on public.academic_semesters
for each row execute function public.set_semester_record_updated_at();
drop trigger if exists set_enrollment_options_updated_at on public.student_enrollment_options;
create trigger set_enrollment_options_updated_at before update on public.student_enrollment_options
for each row execute function public.set_semester_record_updated_at();

create or replace function public.is_active_semester(target_semester_id uuid)
returns boolean language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.academic_semesters where id=target_semester_id and status='active');
$$;
revoke all on function public.is_active_semester(uuid) from public;
grant execute on function public.is_active_semester(uuid) to anon,authenticated;

drop policy if exists "Read school options" on public.student_enrollment_options;
create policy "Read active semester school options" on public.student_enrollment_options for select
to anon,authenticated using (
  is_active and public.is_active_semester(semester_id)
);
create policy "Admins read all semester school options" on public.student_enrollment_options for select
to authenticated using (public.is_active_admin());
drop policy if exists "Admins manage school options" on public.student_enrollment_options;
revoke insert,update,delete on public.student_enrollment_options from authenticated;

create or replace function public.registration_enrollment_options()
returns table(id uuid,course text,year_level text,campus text,section text)
language sql security definer set search_path=public stable as $$
  select o.id,o.course,o.year_level,o.campus,o.section
  from public.student_enrollment_options o join public.academic_semesters s on s.id=o.semester_id
  where s.status='active' and o.is_active
  order by o.campus,o.course,o.year_level,o.section;
$$;
revoke all on function public.registration_enrollment_options() from public;
grant execute on function public.registration_enrollment_options() to anon,authenticated;

create or replace function public.validate_student_information() returns trigger
language plpgsql set search_path=public as $fn$
declare selected_option public.student_enrollment_options%rowtype;
begin
  if TG_OP='INSERT' or new.name is distinct from old.name then
    new.name:=regexp_replace(trim(normalize(new.name,NFC)),'\s+',' ','g');
    if char_length(new.name) not between 1 and 30 or new.name !~ '[[:alpha:]]' or new.name !~ '^[[:alpha:] .''’\-]+$' then
      raise exception 'Full name must contain letters and valid name punctuation, up to 30 characters.';
    end if;
  end if;
  if TG_OP='INSERT' or new.student_number is distinct from old.student_number then
    new.student_number:=trim(new.student_number);
    if new.student_number !~ '^[0-9]{9}$' then raise exception 'Student number must contain exactly 9 digits.'; end if;
  end if;
  if TG_OP='INSERT' or new.email is distinct from old.email then
    new.email:=lower(trim(new.email));
    if char_length(new.email)>254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid email address, up to 254 characters.';
    end if;
  end if;
  if TG_OP='INSERT' or new.goal is distinct from old.goal then
    new.goal:=trim(new.goal);
    if char_length(new.goal) not between 1 and 200 then raise exception 'Goal must contain 1 to 200 characters.'; end if;
  end if;
  if TG_OP='INSERT' or (new.course,new.year_level,new.campus,new.section,new.semester_id,new.enrollment_option_id)
    is distinct from (old.course,old.year_level,old.campus,old.section,old.semester_id,old.enrollment_option_id) then
    new.course:=public.normalize_student_program(new.course);
    new.year_level:=public.normalize_student_year(new.year_level);
    new.campus:=trim(new.campus); new.section:=trim(new.section);
    select o.* into selected_option from public.student_enrollment_options o
      join public.academic_semesters s on s.id=o.semester_id
      where s.status='active' and o.is_active and o.course=new.course and o.year_level=new.year_level
        and o.campus=new.campus and o.section=new.section;
    if selected_option.id is null then
      raise exception 'Choose an available campus, program, year and section for the active semester.';
    end if;
    new.semester_id:=selected_option.semester_id;
    new.enrollment_option_id:=selected_option.id;
  end if;
  return new;
end;
$fn$;

create or replace function public.record_student_enrollment_period()
returns trigger language plpgsql security definer set search_path=public as $$
declare changed_at timestamptz:=clock_timestamp();
begin
  if tg_op='INSERT' then
    insert into public.student_enrollment_history(student_id,course,year_level,campus,section,
      semester_id,enrollment_option_id,valid_from)
    values(new.id,new.course,new.year_level,new.campus,new.section,new.semester_id,new.enrollment_option_id,
      coalesce(new.created_at,changed_at)) on conflict do nothing;
  elsif (new.course,new.year_level,new.campus,new.section,new.semester_id,new.enrollment_option_id)
    is distinct from (old.course,old.year_level,old.campus,old.section,old.semester_id,old.enrollment_option_id) then
    update public.student_enrollment_history set valid_to=changed_at
      where student_id=new.id and valid_to is null;
    insert into public.student_enrollment_history(student_id,course,year_level,campus,section,
      semester_id,enrollment_option_id,valid_from)
    values(new.id,new.course,new.year_level,new.campus,new.section,new.semester_id,new.enrollment_option_id,changed_at);
  end if;
  return new;
end;
$$;
drop trigger if exists record_student_enrollment_period on public.students;
create trigger record_student_enrollment_period after insert or update of
course,year_level,campus,section,semester_id,enrollment_option_id on public.students
for each row execute function public.record_student_enrollment_period();

create or replace function public.admin_list_semesters()
returns table(id uuid,academic_year text,term text,status text,activated_at timestamptz,
  archived_at timestamptz,created_at timestamptz,section_count bigint,student_count bigint)
language plpgsql security definer set search_path=public stable as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  return query select s.id,s.academic_year,s.term,s.status,s.activated_at,s.archived_at,s.created_at,
    count(distinct o.id),count(distinct h.student_id)
  from public.academic_semesters s
  left join public.student_enrollment_options o on o.semester_id=s.id
  left join public.student_enrollment_history h on h.semester_id=s.id
  group by s.id order by case s.status when 'active' then 0 when 'draft' then 1 else 2 end,s.created_at desc;
end;
$$;
revoke all on function public.admin_list_semesters() from public;
grant execute on function public.admin_list_semesters() to authenticated;

create or replace function public.admin_list_semester_sections(semester_id_value uuid)
returns table(id uuid,course text,year_level text,campus text,section text,is_active boolean,
  student_count bigint,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public stable as $$
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  return query select o.id,o.course,o.year_level,o.campus,o.section,o.is_active,
    count(distinct h.student_id),o.created_at,o.updated_at
  from public.student_enrollment_options o
  left join public.student_enrollment_history h on h.enrollment_option_id=o.id
  where o.semester_id=semester_id_value
  group by o.id order by o.campus,o.course,o.year_level,o.section;
end;
$$;
revoke all on function public.admin_list_semester_sections(uuid) from public;
grant execute on function public.admin_list_semester_sections(uuid) to authenticated;

create or replace function public.admin_create_semester(academic_year_value text,term_value text)
returns public.academic_semesters language plpgsql security definer set search_path=public as $$
declare saved public.academic_semesters;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if char_length(trim(coalesce(academic_year_value,''))) not between 4 and 30 then raise exception 'Academic year must contain 4 to 30 characters'; end if;
  if char_length(trim(coalesce(term_value,''))) not between 2 and 40 then raise exception 'Term must contain 2 to 40 characters'; end if;
  insert into public.academic_semesters(academic_year,term,created_by)
  values(trim(academic_year_value),trim(term_value),auth.uid()) returning * into saved;
  return saved;
end;
$$;
revoke all on function public.admin_create_semester(text,text) from public;
grant execute on function public.admin_create_semester(text,text) to authenticated;

create or replace function public.admin_activate_semester(semester_id_value uuid)
returns public.academic_semesters language plpgsql security definer set search_path=public as $$
declare saved public.academic_semesters;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  lock table public.academic_semesters in share row exclusive mode;
  if not exists(select 1 from public.academic_semesters where id=semester_id_value and status='draft') then
    raise exception 'Only a draft semester can be activated';
  end if;
  if not exists(select 1 from public.student_enrollment_options where semester_id=semester_id_value and is_active) then
    raise exception 'Add at least one active section before activating this semester';
  end if;
  update public.academic_semesters set status='archived',archived_at=now()
    where status='active';
  update public.academic_semesters set status='active',activated_at=now(),archived_at=null
    where id=semester_id_value returning * into saved;
  return saved;
end;
$$;
revoke all on function public.admin_activate_semester(uuid) from public;
grant execute on function public.admin_activate_semester(uuid) to authenticated;

create or replace function public.admin_archive_semester(semester_id_value uuid)
returns public.academic_semesters language plpgsql security definer set search_path=public as $$
declare saved public.academic_semesters;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  update public.academic_semesters set status='archived',archived_at=now()
    where id=semester_id_value and status in ('active','draft') returning * into saved;
  if saved.id is null then raise exception 'Semester is already archived or was not found'; end if;
  return saved;
end;
$$;
revoke all on function public.admin_archive_semester(uuid) from public;
grant execute on function public.admin_archive_semester(uuid) to authenticated;

create or replace function public.admin_create_semester_section(
  semester_id_value uuid,course_value text,year_level_value text,campus_value text,section_value text
) returns public.student_enrollment_options
language plpgsql security definer set search_path=public as $$
declare saved public.student_enrollment_options; normalized_course text; normalized_year text;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if not exists(select 1 from public.academic_semesters where id=semester_id_value and status in ('draft','active')) then
    raise exception 'Sections cannot be changed in an archived semester';
  end if;
  normalized_course:=public.normalize_student_program(course_value);
  normalized_year:=public.normalize_student_year(year_level_value);
  insert into public.student_enrollment_options(semester_id,course,year_level,campus,section)
  values(semester_id_value,normalized_course,normalized_year,trim(campus_value),trim(section_value))
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.admin_create_semester_section(uuid,text,text,text,text) from public;
grant execute on function public.admin_create_semester_section(uuid,text,text,text,text) to authenticated;

create or replace function public.admin_update_semester_section(
  section_id_value uuid,course_value text,year_level_value text,campus_value text,section_value text,active_value boolean
) returns public.student_enrollment_options
language plpgsql security definer set search_path=public as $$
declare saved public.student_enrollment_options;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if exists(select 1 from public.student_enrollment_history where enrollment_option_id=section_id_value)
    and exists(select 1 from public.student_enrollment_options o where o.id=section_id_value and
      (o.course,o.year_level,o.campus,o.section) is distinct from
      (public.normalize_student_program(course_value),public.normalize_student_year(year_level_value),trim(campus_value),trim(section_value))) then
    raise exception 'An associated section cannot be renamed; deactivate it and create a replacement';
  end if;
  update public.student_enrollment_options o set course=public.normalize_student_program(course_value),
    year_level=public.normalize_student_year(year_level_value),campus=trim(campus_value),
    section=trim(section_value),is_active=active_value
  where o.id=section_id_value and exists(
    select 1 from public.academic_semesters s where s.id=o.semester_id and s.status in ('draft','active'))
  returning o.* into saved;
  if saved.id is null then raise exception 'Editable section not found'; end if;
  return saved;
end;
$$;
revoke all on function public.admin_update_semester_section(uuid,text,text,text,text,boolean) from public;
grant execute on function public.admin_update_semester_section(uuid,text,text,text,text,boolean) to authenticated;

create or replace function public.admin_remove_semester_section(section_id_value uuid)
returns text language plpgsql security definer set search_path=public as $$
declare associated boolean;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if not exists(select 1 from public.student_enrollment_options o join public.academic_semesters s on s.id=o.semester_id
    where o.id=section_id_value and s.status in ('draft','active')) then raise exception 'Editable section not found'; end if;
  associated:=exists(select 1 from public.students where enrollment_option_id=section_id_value)
    or exists(select 1 from public.student_enrollment_history where enrollment_option_id=section_id_value);
  if associated then
    update public.student_enrollment_options set is_active=false where id=section_id_value;
    return 'archived';
  end if;
  delete from public.student_enrollment_options where id=section_id_value;
  return 'deleted';
end;
$$;
revoke all on function public.admin_remove_semester_section(uuid) from public;
grant execute on function public.admin_remove_semester_section(uuid) to authenticated;

commit;

