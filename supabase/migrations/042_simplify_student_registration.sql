-- Allow confirmed students to register before they have enrollment details.
begin;

create or replace function public.validate_student_information()
returns trigger language plpgsql set search_path = '' as $$
declare
  selected_option public.student_enrollment_options%rowtype;
  -- Only the guarded registration RPC sends a null goal. The stored default
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
    if char_length(new.email) > 254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
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

create or replace function public.student_complete_registration(
  name_value text, student_number_value text, goal_value text, semester_id_value uuid, enrollment_option_id_value uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  identity_id uuid := auth.uid();
  identity_email text;
  confirmed_at timestamptz;
  intent text;
  state text;
  option_record public.student_enrollment_options%rowtype;
  identity_only boolean := goal_value is null and semester_id_value is null and enrollment_option_id_value is null;
  registered_name text;
begin
  if identity_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-registration:' || identity_id::text, 0));
  -- Use the same lock as administrator approval to prevent overlapping provisioning.
  select email, email_confirmed_at, raw_user_meta_data->>'signup_intent'
  into identity_email, confirmed_at, intent from auth.users where id = identity_id for update;
  if confirmed_at is null then return jsonb_build_object('status', 'error', 'code', 'email_not_confirmed'); end if;
  if exists(select 1 from public.admin_users where id = identity_id) then
    return jsonb_build_object('status', 'error', 'code', 'registration_unavailable');
  end if;

  select status into state from public.students where id = identity_id for update;
  if state = 'Active' then return jsonb_build_object('status', 'completed'); end if;
  if state is not null or intent is distinct from 'student_registration' then
    return jsonb_build_object('status', 'error', 'code', 'registration_unavailable');
  end if;
  if student_number_value is null or (not identity_only and (name_value is null or goal_value is null)) then
    return jsonb_build_object('status', 'error', 'code', 'invalid_registration');
  end if;

  if not identity_only then
    -- Older clients supply an enrollment pair. Lock the semester before the section.
    perform 1 from public.academic_semesters where id = semester_id_value and status = 'active' for share;
    if not found then return jsonb_build_object('status', 'error', 'code', 'enrollment_changed',
      'message', 'The active semester changed. Refresh the choices and select your enrollment again.'); end if;
    select * into option_record from public.student_enrollment_options
    where id = enrollment_option_id_value and semester_id = semester_id_value and is_active for share;
    if not found then return jsonb_build_object('status', 'error', 'code', 'enrollment_changed',
      'message', 'This section is no longer available. Refresh the choices and select your enrollment again.'); end if;
  end if;

  begin
    if identity_only then
      insert into public.students(id, name, student_number, email, goal)
      values (identity_id, coalesce(name_value, ''), student_number_value, identity_email, null)
      returning name into registered_name;
    else
      insert into public.students(id, name, student_number, email, goal, course, year_level, campus, section, semester_id, enrollment_option_id)
      values (identity_id, name_value, student_number_value, identity_email, goal_value, option_record.course,
        option_record.year_level, option_record.campus, option_record.section, semester_id_value, enrollment_option_id_value)
      returning name into registered_name;
    end if;
    update public.profiles set display_name = nullif(registered_name, '') where id = identity_id;
  exception when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'student_number_unavailable',
      'message', 'This student ID is unavailable. Check it or contact your administrator.');
  end;
  return jsonb_build_object('status', 'completed');
end;
$$;

revoke all on function public.student_complete_registration(text, text, text, uuid, uuid) from public, anon;
grant execute on function public.student_complete_registration(text, text, text, uuid, uuid) to authenticated;

create function public.sync_student_display_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set display_name = nullif(new.name, '') where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_student_display_name() from public, anon, authenticated;
create trigger sync_student_display_name after update of name on public.students
for each row when (new.name is distinct from old.name) execute function public.sync_student_display_name();

commit;
