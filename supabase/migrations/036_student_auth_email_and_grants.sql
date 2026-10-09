-- Auth remains the email authority. Older clients may still include email in updates.
-- Prepared from repository definitions; verify hosted functions/grants before rollout.
begin;
create function public.canonical_student_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare identity_email text;
begin
  select lower(trim(email)) into identity_email from auth.users where id=new.id;
  if identity_email is not null and char_length(identity_email)<=254
    and identity_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    new.email:=identity_email;
  end if;
  return new;
end;
$$;
revoke all on function public.canonical_student_email() from public,anon,authenticated;
-- BEFORE triggers run by name: canonicalization must precede validation.
create trigger aa_students_auth_email before insert or update of email on public.students
for each row execute function public.canonical_student_email();

create function public.sync_student_auth_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare identity_email text:=lower(trim(new.email));
begin
  if identity_email is not null and char_length(identity_email)<=254
    and identity_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    update public.students set email=identity_email
    where id=new.id and email is distinct from identity_email;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_student_auth_email() from public,anon,authenticated;
create trigger sync_student_auth_email after update of email on auth.users
for each row when (new.email is distinct from old.email)
execute function public.sync_student_auth_email();

-- Update the current email projection only; enrollment/history facts are untouched.
do $$
declare reconciled bigint; exceptional bigint;
begin
  update public.students s set email=lower(trim(u.email))
  from auth.users u where s.id=u.id and u.email is not null
    and char_length(trim(u.email))<=254
    and trim(u.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and s.email is distinct from lower(trim(u.email));
  get diagnostics reconciled = row_count;
  select count(*) into exceptional from public.students s join auth.users u on u.id=s.id
  where u.email is null or char_length(trim(u.email))>254
    or trim(u.email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  raise notice 'Student email projections reconciled: %, exceptional identities unchanged: %',reconciled,exceptional;
end;
$$;

-- Bound this change to registration tables. Preserve all existing self-update column
-- grants (including legacy email), catalogue reads, Auth-hook and service-role grants.
revoke all on public.students,public.profiles from public,anon;
revoke delete,truncate,references,trigger on public.students,public.profiles from authenticated;
revoke insert,update,delete,truncate,references,trigger
  on public.student_enrollment_options,public.academic_semesters,public.student_enrollment_history
  from public,anon,authenticated;
do $$
begin
  if current_setting('server_version_num')::integer>=170000 then
    execute 'revoke maintain on public.students,public.profiles,public.student_enrollment_options,public.academic_semesters,public.student_enrollment_history from public,anon,authenticated';
  end if;
end;
$$;
commit;
