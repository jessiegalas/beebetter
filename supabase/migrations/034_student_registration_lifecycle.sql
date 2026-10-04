-- Credential-only Student signup; apply before releasing the redesigned client.
-- Auth password minimum/confirmation/redirect settings are separate rollout steps.
begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
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

create function public.student_get_registration_state()
returns text language plpgsql stable security definer set search_path = '' as $$
declare identity_id uuid := auth.uid(); student_status text; confirmed_at timestamptz; intent text;
begin
  if identity_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- A signup marker never grants administrator or active-student access.
  if exists(select 1 from public.admin_users where id=identity_id) then return 'unavailable'; end if;
  select email_confirmed_at, raw_user_meta_data->>'signup_intent' into confirmed_at,intent
  from auth.users where id=identity_id;
  if confirmed_at is null then return 'confirmation_required'; end if;
  select status into student_status from public.students where id=identity_id;
  if student_status='Active' then return 'active'; end if;
  if student_status='Inactive' then return 'blocked'; end if;
  if student_status is not null then return 'unavailable'; end if;
  if intent='student_registration' then return 'onboarding_required'; end if;
  return 'unavailable';
end;
$$;
revoke all on function public.student_get_registration_state() from public, anon;
grant execute on function public.student_get_registration_state() to authenticated;

create function public.registration_enrollment_options_v2()
returns table(id uuid,course text,year_level text,campus text,section text,semester_id uuid,academic_year text,term text)
language sql stable security definer set search_path = '' as $$
  select o.id,o.course,o.year_level,o.campus,o.section,s.id,s.academic_year,s.term
  from public.student_enrollment_options o join public.academic_semesters s on s.id=o.semester_id
  where s.status='active' and o.is_active
  order by o.campus,o.course,o.year_level,o.section;
$$;
revoke all on function public.registration_enrollment_options_v2() from public;
grant execute on function public.registration_enrollment_options_v2() to anon,authenticated;

create function public.student_complete_registration(name_value text,student_number_value text,goal_value text,
  semester_id_value uuid,enrollment_option_id_value uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identity_id uuid := auth.uid(); identity_email text; confirmed_at timestamptz;
  intent text; state text; option_record public.student_enrollment_options%rowtype;
begin
  if identity_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Serialize per Auth identity without inventing a pending Student row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-registration:'||identity_id::text,0));
  -- Prevent administrator approval from racing Student provisioning.
  select email,email_confirmed_at,raw_user_meta_data->>'signup_intent' into identity_email,confirmed_at,intent
  from auth.users where id=identity_id for update;
  if confirmed_at is null then return jsonb_build_object('status','error','code','email_not_confirmed'); end if;
  if exists(select 1 from public.admin_users where id=identity_id) then
    return jsonb_build_object('status','error','code','registration_unavailable');
  end if;
  select status into state from public.students where id=identity_id for update;
  if state='Active' then return jsonb_build_object('status','completed'); end if;
  if state is not null or intent is distinct from 'student_registration' then
    return jsonb_build_object('status','error','code','registration_unavailable');
  end if;
  -- Lock the period before its option, matching semester-management ordering.
  perform 1 from public.academic_semesters where id=semester_id_value and status='active' for share;
  if not found then return jsonb_build_object('status','error','code','enrollment_changed',
    'message','The active semester changed. Refresh the choices and select your enrollment again.'); end if;
  select * into option_record from public.student_enrollment_options
  where id=enrollment_option_id_value and semester_id=semester_id_value and is_active for share;
  if not found then return jsonb_build_object('status','error','code','enrollment_changed',
    'message','This section is no longer available. Refresh the choices and select your enrollment again.'); end if;
  if name_value is null or student_number_value is null or goal_value is null then
    return jsonb_build_object('status','error','code','invalid_registration','message','Name, student number and goal are required.');
  end if;
  begin
    insert into public.students(id,name,student_number,email,goal,course,year_level,campus,section,semester_id,enrollment_option_id)
    values(identity_id,name_value,student_number_value,identity_email,goal_value,option_record.course,
      option_record.year_level,option_record.campus,option_record.section,semester_id_value,enrollment_option_id_value);
    -- Existing enrollment-history triggers run in this same transaction.
    update public.profiles set display_name=(select name from public.students where id=identity_id) where id=identity_id;
  exception when unique_violation then
    return jsonb_build_object('status','error','code','student_number_unavailable',
      'message','This student number is unavailable. Check it or contact your administrator.');
  end;
  return jsonb_build_object('status','completed');
end;
$$;
revoke all on function public.student_complete_registration(text,text,text,uuid,uuid) from public,anon;
grant execute on function public.student_complete_registration(text,text,text,uuid,uuid) to authenticated;

-- Column grants must be revoked too; table-only revocation leaves them intact.
revoke insert on public.students from authenticated;
revoke insert(id,student_number,name,email,course,year_level,section,campus,goal) on public.students from authenticated;
drop policy if exists "Students can insert their own information" on public.students;
commit;