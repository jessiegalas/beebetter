-- Supabase's password API requires an email or phone identifier.
-- New student accounts use an opaque address inside Auth only.
begin;

create or replace function public.canonical_student_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  identity_email text;
  login_method text;
begin
  select lower(trim(email)), raw_app_meta_data->>'student_login' into identity_email, login_method
  from auth.users where id = new.id;
  if login_method = 'id_password' then
    new.email := '';
    return new;
  end if;
  if identity_email is not null and char_length(identity_email)<=254
    and identity_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    new.email:=identity_email;
  end if;
  return new;
end;
$$;
revoke all on function public.canonical_student_email() from public,anon,authenticated;

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
    if not (identity_only and new.email = '') and (char_length(new.email) > 254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
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

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  student_name text;
begin
  if new.raw_app_meta_data->>'student_login' = 'id_password' then
    -- Only the server's Auth Admin API sets this marker.
    if new.email is null or new.email !~ '^student-[0-9a-f-]{36}@beebetter[.]invalid$' then
      raise exception 'Invalid internal student login';
    end if;
    insert into public.students(id, student_number, name, email, goal)
    values (new.id, metadata->>'student_number', coalesce(metadata->>'name', ''), '', null)
    returning name into student_name;
    insert into public.profiles (id, display_name) values (new.id, nullif(student_name, ''));
    return new;
  end if;

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

create function public.student_password_identity(student_number_value text)
returns table(email text, status text)
language sql stable security definer set search_path = '' as $$
  select login.email::text, student.status
  from public.students student
  join auth.users login on login.id = student.id
  where student.student_number = student_number_value
    and not exists (select 1 from public.admin_users admin where admin.id = login.id);
$$;
revoke all on function public.student_password_identity(text) from public, anon, authenticated;
grant execute on function public.student_password_identity(text) to service_role;

-- Apply a shared limit to Auth Admin creation, which bypasses public signup limits.
create table public.student_signup_limit (
  singleton boolean primary key default true check (singleton),
  minute_started timestamptz not null,
  attempts integer not null
);
alter table public.student_signup_limit enable row level security;
revoke all on table public.student_signup_limit from public, anon, authenticated, service_role;

create function public.reserve_student_signup()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_minute timestamptz := date_trunc('minute', clock_timestamp());
begin
  insert into public.student_signup_limit as bucket (minute_started, attempts) values (current_minute, 1)
  on conflict (singleton) do update
    set minute_started = greatest(bucket.minute_started, excluded.minute_started),
        attempts = case when bucket.minute_started < excluded.minute_started
          then 1 else bucket.attempts + 1 end
  where bucket.minute_started < excluded.minute_started or bucket.attempts < 40;
  return found;
end;
$$;
revoke all on function public.reserve_student_signup() from public, anon, authenticated;
grant execute on function public.reserve_student_signup() to service_role;

commit;
