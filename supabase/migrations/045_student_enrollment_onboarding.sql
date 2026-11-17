-- Enrolled signup and self-service enrollment for existing student accounts.
begin;

create function public.lock_student_registration_section(semester_id_value uuid, enrollment_option_id_value uuid, expected_labels jsonb)
returns public.student_enrollment_options language plpgsql set search_path = '' as $$
declare
  selected_option public.student_enrollment_options%rowtype;
begin
  -- Match the semester-before-section lock order of the admin and legacy registration RPCs.
  perform 1 from public.academic_semesters where id = semester_id_value and status = 'active' for share;
  if not found then return null; end if;
  select * into selected_option from public.student_enrollment_options
  where id = enrollment_option_id_value and semester_id = semester_id_value and is_active
    and (expected_labels is null or expected_labels = jsonb_build_object(
      'course', course, 'year_level', year_level, 'campus', campus, 'section', section))
  for share;
  return selected_option;
end;
$$;
revoke all on function public.lock_student_registration_section(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.validate_student_information()
returns trigger language plpgsql set search_path = '' as $$
declare
  selected_option public.student_enrollment_options%rowtype;
  -- The guarded registration paths send a null goal. The stored default
  -- remains an empty string, and legacy signup still requires real enrollment.
  identity_only boolean := tg_op = 'INSERT' and new.goal is null
    and new.semester_id is null and new.enrollment_option_id is null
    and (new.course, new.year_level, new.campus, new.section)
      = ('Undeclared', 'Not specified', 'Not specified', 'Not specified');
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.name := trim(regexp_replace(normalize(new.name, NFC), '\s+', ' ', 'g'));
    if (new.name = '' and tg_op = 'INSERT' and not identity_only)
        or char_length(new.name) > 30
        or (new.name <> '' and (new.name !~ '[[:alpha:]]' or new.name !~ '^[[:alpha:] .''’\-]+$')) then
      raise exception 'Use up to 30 characters: letters, spaces, hyphens, apostrophes or periods.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.student_number is distinct from old.student_number then
    new.student_number := trim(new.student_number);
    if new.student_number !~ '^[0-9]{9}$' then
      raise exception 'Student ID must contain exactly 9 digits.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    new.email := lower(trim(new.email));
    if (char_length(new.email) > 254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      and not (new.email = '' and (identity_only or (tg_op = 'INSERT' and exists (
        select 1 from auth.users u where u.id = new.id and u.raw_app_meta_data->>'student_login' = 'id_password'
      )))) then
      raise exception 'Enter a valid email address, up to 254 characters.';
    end if;
  end if;

  if identity_only then
    new.goal := '';
    return new;
  end if;

  if tg_op = 'INSERT' or new.goal is distinct from old.goal then
    new.goal := trim(new.goal);
    if char_length(new.goal) not between 1 and 200 then
      raise exception 'Goal must contain 1 to 200 characters.';
    end if;
  end if;
  if tg_op = 'INSERT' or (new.course, new.year_level, new.campus, new.section, new.semester_id, new.enrollment_option_id)
      is distinct from (old.course, old.year_level, old.campus, old.section, old.semester_id, old.enrollment_option_id) then
    -- Registration supplies an exact pair. Preserve the catalogue labels, including legacy spelling.
    if new.semester_id is not null and new.enrollment_option_id is not null
      and (tg_op = 'INSERT' or (new.semester_id, new.enrollment_option_id)
        is distinct from (old.semester_id, old.enrollment_option_id)) then
      select o.* into selected_option
      from public.student_enrollment_options o
      join public.academic_semesters s on s.id = o.semester_id
      where s.status = 'active' and o.is_active
        and o.semester_id = new.semester_id and o.id = new.enrollment_option_id;
      if selected_option.id is null then
        raise exception 'Choose an available section for the active semester.';
      end if;
      new.course := selected_option.course;
      new.year_level := selected_option.year_level;
      new.campus := selected_option.campus;
      new.section := selected_option.section;
      return new;
    end if;
    new.course := public.normalize_student_program(new.course);
    new.year_level := public.normalize_student_year(new.year_level);
    new.campus := trim(new.campus);
    new.section := trim(new.section);

    select o.* into selected_option
    from public.student_enrollment_options o
    join public.academic_semesters s on s.id = o.semester_id
    where s.status = 'active' and o.is_active and o.course = new.course and o.year_level = new.year_level
      and o.campus = new.campus and o.section = new.section;
    if selected_option.id is null then
      raise exception 'Choose an available campus, program, year and section for the active semester.';
    end if;
    new.semester_id := selected_option.semester_id;
    new.enrollment_option_id := selected_option.id;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  enrollment jsonb := metadata->'initial_enrollment';
  selected_option public.student_enrollment_options%rowtype;
  student_name text;
  internal_identity boolean := coalesce(new.email ~ '^student-[0-9a-f-]{36}@beebetter[.]invalid$', false);
begin
  if new.raw_app_meta_data->>'student_login' = 'id_password' then
    -- Only the server's Auth Admin API sets this marker.
    if not internal_identity then
      raise exception 'Invalid internal student login';
    end if;
    if enrollment is null then
      -- Installed releases still use the short signup contract.
      insert into public.students(id, student_number, name, email, goal)
      values (new.id, metadata->>'student_number', coalesce(metadata->>'name', ''), '', null)
      returning name into student_name;
    else
      if coalesce(char_length(trim(enrollment->>'goal')), 0) not between 1 and 200 then
        raise exception 'Enter your goal using 1 to 200 characters.';
      end if;
      selected_option := public.lock_student_registration_section(
        (enrollment->>'semester_id')::uuid, (enrollment->>'enrollment_option_id')::uuid, enrollment->'expected_labels');
      if selected_option.id is null then raise exception 'Enrollment choices changed'; end if;
      insert into public.students(id, student_number, name, email, goal,
        course, year_level, campus, section, semester_id, enrollment_option_id)
      values (new.id, metadata->>'student_number', coalesce(metadata->>'name', ''), '', enrollment->>'goal',
        selected_option.course, selected_option.year_level, selected_option.campus, selected_option.section,
        selected_option.semester_id, selected_option.id)
      returning name into student_name;

      -- Registration choices and the free-text goal belong in the student record.
      update auth.users set raw_user_meta_data = raw_user_meta_data - 'initial_enrollment' where id = new.id;
    end if;
    insert into public.profiles (id, display_name) values (new.id, nullif(student_name, ''));
    return new;
  end if;

  -- Auth Admin inserts the identity before setting app metadata in the same
  -- transaction. A reserved address alone must never provision a student.
  if internal_identity then return new; end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(metadata ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  if metadata ->> 'signup_intent' in ('admin_access_request', 'student_registration') then return new; end if;
  -- Older clients keep their atomic, validated signup contract.
  insert into public.students (id,student_number,name,email,course,year_level,section,campus,goal)
  values (new.id,
    coalesce(nullif(trim(metadata->>'student_number'),''),'LEGACY-'||upper(left(replace(new.id::text,'-',''),8))),
    coalesce(nullif(trim(metadata->>'name'),''),metadata->>'display_name',split_part(new.email,'@',1),'Bee Explorer'),
    coalesce(new.email,''),coalesce(nullif(trim(metadata->>'course'),''),'Undeclared'),
    coalesce(nullif(trim(metadata->>'year_level'),''),'Not specified'),
    coalesce(nullif(trim(metadata->>'section'),''),'Not specified'),
    coalesce(nullif(trim(metadata->>'campus'),''),'Not specified'),coalesce(metadata->>'goal',''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_student_password_marker
after update of raw_app_meta_data on auth.users
for each row when (old.raw_app_meta_data->>'student_login' is distinct from 'id_password'
  and new.raw_app_meta_data->>'student_login' = 'id_password')
execute function public.handle_new_user();

create function public.student_complete_enrollment(
  name_value text, goal_value text, semester_id_value uuid, enrollment_option_id_value uuid, expected_labels jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  student public.students%rowtype;
  selected_option public.student_enrollment_options%rowtype;
  student_name text := trim(regexp_replace(normalize(coalesce(name_value, ''), NFC), '\s+', ' ', 'g'));
  student_goal text := trim(coalesce(goal_value, ''));
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if exists (select 1 from public.admin_users where id = caller_id) then
    return jsonb_build_object('status', 'error', 'code', 'registration_unavailable');
  end if;
  select * into student from public.students where id = caller_id for update;
  if student.status is distinct from 'Active' then
    return jsonb_build_object('status', 'error', 'code', 'registration_unavailable');
  end if;
  -- Retrying after success or an OSAS assignment leaves the record untouched.
  if student.enrollment_option_id is not null and student.semester_id is not null then
    return jsonb_build_object('status', 'completed');
  end if;
  if char_length(student_name) not between 1 and 30 or student_name !~ '[[:alpha:]]'
    or student_name !~ '^[[:alpha:] .''’\-]+$' or char_length(student_goal) not between 1 and 200 then
    return jsonb_build_object('status', 'error', 'code', 'invalid_registration');
  end if;
  selected_option := public.lock_student_registration_section(semester_id_value, enrollment_option_id_value, expected_labels);
  if selected_option.id is null then return jsonb_build_object('status', 'error', 'code', 'enrollment_changed'); end if;

  update public.students set name = student_name, goal = student_goal, course = selected_option.course,
    year_level = selected_option.year_level, campus = selected_option.campus, section = selected_option.section,
    semester_id = selected_option.semester_id, enrollment_option_id = selected_option.id, updated_at = now()
  where id = caller_id;
  return jsonb_build_object('status', 'completed');
end;
$$;
revoke all on function public.student_complete_enrollment(text, text, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.student_complete_enrollment(text, text, uuid, uuid, jsonb) to authenticated;

commit;
