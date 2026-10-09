-- Additive hardening after 034. Prepared from repository definitions.
-- Before hosted rollout, review tests/registration-preflight.sql against deployed definitions.
begin;
do $$
begin
  if to_regprocedure('public.student_complete_registration(text,text,text,uuid,uuid)') is null
    or to_regprocedure('public.registration_enrollment_options_v2()') is null then
    raise exception 'Registration lifecycle migration 034 is required';
  end if;
end;
$$;

create or replace function public.admin_create_semester_section(
  semester_id_value uuid,course_value text,year_level_value text,campus_value text,section_value text
) returns public.student_enrollment_options language plpgsql security definer set search_path='' as $$
declare saved public.student_enrollment_options; normalized_course text; normalized_year text;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  perform 1 from public.academic_semesters where id=semester_id_value and status in ('draft','active') for share;
  if not found then
    raise exception 'Sections cannot be changed in an archived semester';
  end if;
  if campus_value is distinct from 'Cavite State University Bacoor City Campus' then
    raise exception 'New sections must use CvSU Bacoor Campus';
  end if;
  if section_value is null or section_value !~ '^[1-9][0-9]{0,29}$' then
    raise exception 'Section must be a positive whole number, up to 30 digits';
  end if;
  normalized_course:=public.normalize_student_program(course_value);
  normalized_year:=public.normalize_student_year(year_level_value);
  insert into public.student_enrollment_options(semester_id,course,year_level,campus,section)
  values(semester_id_value,normalized_course,normalized_year,campus_value,section_value) returning * into saved;
  return saved;
end;
$$;

create or replace function public.admin_update_semester_section(
  section_id_value uuid,course_value text,year_level_value text,campus_value text,section_value text,active_value boolean
) returns public.student_enrollment_options language plpgsql security definer set search_path='' as $$
declare saved public.student_enrollment_options; existing public.student_enrollment_options; parent_id uuid;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  select semester_id into parent_id from public.student_enrollment_options where id=section_id_value;
  perform 1 from public.academic_semesters where id=parent_id and status in ('draft','active') for share;
  if not found then raise exception 'Editable section not found'; end if;
  select * into existing from public.student_enrollment_options where id=section_id_value and semester_id=parent_id for update;
  if existing.id is null then raise exception 'Editable section not found'; end if;
  -- Unchanged legacy values must still support status changes and historical edits.
  if campus_value is distinct from existing.campus and campus_value is distinct from 'Cavite State University Bacoor City Campus' then
    raise exception 'Changed campus must use CvSU Bacoor Campus';
  end if;
  if section_value is distinct from existing.section and (section_value is null or section_value !~ '^[1-9][0-9]{0,29}$') then
    raise exception 'Section must be a positive whole number, up to 30 digits';
  end if;
  if exists(select 1 from public.student_enrollment_history where enrollment_option_id=section_id_value)
    and (existing.course,existing.year_level,existing.campus,existing.section) is distinct from
      (public.normalize_student_program(course_value),public.normalize_student_year(year_level_value),trim(campus_value),trim(section_value)) then
    raise exception 'An associated section cannot be renamed; deactivate it and create a replacement';
  end if;
  update public.student_enrollment_options o set course=public.normalize_student_program(course_value),
    year_level=public.normalize_student_year(year_level_value),campus=trim(campus_value),section=trim(section_value),is_active=active_value
  where o.id=section_id_value and exists(
    select 1 from public.academic_semesters s where s.id=o.semester_id and s.status in ('draft','active'))
  returning o.* into saved;
  if saved.id is null then raise exception 'Editable section not found'; end if;
  return saved;
end;
$$;

create or replace function public.admin_remove_semester_section(section_id_value uuid)
returns text language plpgsql security definer set search_path='' as $$
declare associated boolean; parent_id uuid;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  select semester_id into parent_id from public.student_enrollment_options where id=section_id_value;
  perform 1 from public.academic_semesters where id=parent_id and status in ('draft','active') for share;
  if not found then raise exception 'Editable section not found'; end if;
  perform 1 from public.student_enrollment_options where id=section_id_value and semester_id=parent_id for update;
  if not found then raise exception 'Editable section not found'; end if;
  -- Re-read associations after waiting for any registration transaction.
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

create or replace function public.admin_activate_semester(semester_id_value uuid)
returns public.academic_semesters language plpgsql security definer set search_path='' as $$
declare saved public.academic_semesters;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  lock table public.academic_semesters in share row exclusive mode;
  perform 1 from public.academic_semesters where id=semester_id_value and status='draft' for update;
  if not found then
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

revoke all on function public.admin_create_semester_section(uuid,text,text,text,text) from public,anon;
revoke all on function public.admin_update_semester_section(uuid,text,text,text,text,boolean) from public,anon;
revoke all on function public.admin_remove_semester_section(uuid) from public,anon;
revoke all on function public.admin_activate_semester(uuid) from public,anon;
grant execute on function public.admin_create_semester_section(uuid,text,text,text,text) to authenticated;
grant execute on function public.admin_update_semester_section(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.admin_remove_semester_section(uuid) to authenticated;
grant execute on function public.admin_activate_semester(uuid) to authenticated;
commit;
