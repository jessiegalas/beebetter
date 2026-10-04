-- New enrollment configuration is for CvSU Bacoor only. Historical labels remain unchanged.
begin;

create or replace function public.admin_create_semester(academic_year_value text,term_value text)
returns public.academic_semesters language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.academic_semesters; year_label text:=trim(academic_year_value);
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if year_label is null or year_label !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'Choose an academic year in YYYY-YYYY format';
  end if;
  if substring(year_label from 6 for 4)::integer<>substring(year_label from 1 for 4)::integer+1 then
    raise exception 'Academic year must contain consecutive years';
  end if;
  if char_length(trim(coalesce(term_value,''))) not between 2 and 40 then raise exception 'Term must contain 2 to 40 characters'; end if;
  insert into public.academic_semesters(academic_year,term,created_by)
  values(year_label,trim(term_value),auth.uid()) returning * into saved;
  return saved;
end;
$$;

create or replace function public.admin_create_semester_section(
  semester_id_value uuid,course_value text,year_level_value text,campus_value text,section_value text
) returns public.student_enrollment_options language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.student_enrollment_options; normalized_course text; normalized_year text;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  if not exists(select 1 from public.academic_semesters where id=semester_id_value and status in ('draft','active')) then
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
) returns public.student_enrollment_options language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.student_enrollment_options; existing public.student_enrollment_options;
begin
  if not public.is_active_admin() then raise exception 'Active admin access required'; end if;
  select * into existing from public.student_enrollment_options where id=section_id_value for update;
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

revoke all on function public.admin_create_semester(text,text) from public,anon;
revoke all on function public.admin_create_semester_section(uuid,text,text,text,text) from public,anon;
revoke all on function public.admin_update_semester_section(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.admin_create_semester(text,text) to authenticated;
grant execute on function public.admin_create_semester_section(uuid,text,text,text,text) to authenticated;
grant execute on function public.admin_update_semester_section(uuid,text,text,text,text,boolean) to authenticated;

commit;
