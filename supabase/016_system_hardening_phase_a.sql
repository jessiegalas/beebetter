-- Phase A: protect progression/completion state and enforce active-student writes.
-- Apply after 015_osas_analytics_dashboard.sql. This migration is additive.
begin;

create or replace function public.is_active_student(target_user_id uuid default auth.uid())
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.students where id = target_user_id and status = 'Active');
$$;
revoke all on function public.is_active_student(uuid) from public;
grant execute on function public.is_active_student(uuid) to authenticated;

create or replace function public.set_client_record_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_client_record_updated_at();
drop trigger if exists set_students_updated_at on public.students;
create trigger set_students_updated_at before update on public.students for each row execute function public.set_client_record_updated_at();
drop trigger if exists set_quests_updated_at on public.quests;
create trigger set_quests_updated_at before update on public.quests for each row execute function public.set_client_record_updated_at();

-- Owner RLS does not protect individual columns. Expose only client-editable columns.
revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, update on public.students from authenticated;
grant insert (id, student_number, name, email, course, year_level, section, campus, goal) on public.students to authenticated;
grant update (student_number, name, email, course, year_level, section, campus, goal) on public.students to authenticated;
revoke insert, update on public.quests from authenticated;
grant insert (owner_id, title, description, category, xp, is_nearby, location_id, requires_proof,
  scheduled_at, preferred_time, deadline_at, importance, prerequisite_quest_id) on public.quests to authenticated;
grant update (title, description, category, xp, is_nearby, location_id, requires_proof,
  scheduled_at, preferred_time, deadline_at, importance, prerequisite_quest_id) on public.quests to authenticated;

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert to authenticated
with check (auth.uid() = id and public.is_active_student());
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated
using (auth.uid() = id and public.is_active_student()) with check (auth.uid() = id and public.is_active_student());
drop policy if exists "Students can insert their own information" on public.students;
create policy "Students can insert their own information" on public.students for insert to authenticated
with check (auth.uid() = id and status = 'Active');
drop policy if exists "Students can update their own information" on public.students;
create policy "Students can update their own information" on public.students for update to authenticated
using (auth.uid() = id and status = 'Active') with check (auth.uid() = id and status = 'Active');
drop policy if exists "Users can create their own quests" on public.quests;
create policy "Users can create their own quests" on public.quests for insert to authenticated
with check (auth.uid() = owner_id and public.is_active_student());
drop policy if exists "Users can update their own quests" on public.quests;
create policy "Users can update their own quests" on public.quests for update to authenticated
using (auth.uid() = owner_id and public.is_active_student()) with check (auth.uid() = owner_id and public.is_active_student());
drop policy if exists "Users can delete their own quests" on public.quests;
create policy "Users can delete their own quests" on public.quests for delete to authenticated
using (auth.uid() = owner_id and public.is_active_student());

drop policy if exists "Users can create their own locations" on public.user_locations;
create policy "Users can create their own locations" on public.user_locations for insert to authenticated
with check (auth.uid() = owner_id and public.is_active_student());
drop policy if exists "Users can update their own locations" on public.user_locations;
create policy "Users can update their own locations" on public.user_locations for update to authenticated
using (auth.uid() = owner_id and public.is_active_student()) with check (auth.uid() = owner_id and public.is_active_student());
drop policy if exists "Users can delete their own locations" on public.user_locations;
create policy "Users can delete their own locations" on public.user_locations for delete to authenticated
using (auth.uid() = owner_id and public.is_active_student());
drop policy if exists "Create own categories" on public.quest_categories;
create policy "Create own categories" on public.quest_categories for insert to authenticated
with check (owner_id = auth.uid() and public.is_active_student());

drop policy if exists "Students manage their own check-ins" on public.student_check_ins;
create policy "Students read their own check-ins" on public.student_check_ins for select to authenticated using (student_id = auth.uid());
create policy "Active students create their own check-ins" on public.student_check_ins for insert to authenticated
with check (student_id = auth.uid() and public.is_active_student());
create policy "Active students update their own check-ins" on public.student_check_ins for update to authenticated
using (student_id = auth.uid() and public.is_active_student()) with check (student_id = auth.uid() and public.is_active_student());
create policy "Active students delete their own check-ins" on public.student_check_ins for delete to authenticated
using (student_id = auth.uid() and public.is_active_student());
drop policy if exists "Students manage their own reflections" on public.self_management_reflections;
create policy "Students read their own reflections" on public.self_management_reflections for select to authenticated using (student_id = auth.uid());
create policy "Active students create their own reflections" on public.self_management_reflections for insert to authenticated
with check (student_id = auth.uid() and public.is_active_student());
create policy "Active students update their own reflections" on public.self_management_reflections for update to authenticated
using (student_id = auth.uid() and public.is_active_student()) with check (student_id = auth.uid() and public.is_active_student());
create policy "Active students delete their own reflections" on public.self_management_reflections for delete to authenticated
using (student_id = auth.uid() and public.is_active_student());
drop policy if exists "Students create their own support requests" on public.support_requests;
create policy "Students create their own support requests" on public.support_requests for insert to authenticated
with check (student_id = auth.uid() and public.is_active_student() and status = 'submitted'
  and assigned_to is null and resolution_note is null and resolved_at is null);
drop policy if exists "Users can upload their own quest proofs" on storage.objects;
create policy "Users can upload their own quest proofs" on storage.objects for insert to authenticated
with check (bucket_id = 'quest-proofs' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_student());

create or replace function public.validate_reflection_quest_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.quest_id is not null and not exists (
    select 1 from public.quests q where q.id = new.quest_id and q.owner_id = new.student_id
  ) then raise exception 'Reflection quest must belong to the student'; end if;
  return new;
end;
$$;
drop trigger if exists validate_reflection_quest_owner on public.self_management_reflections;
create trigger validate_reflection_quest_owner before insert or update of student_id, quest_id
on public.self_management_reflections for each row execute function public.validate_reflection_quest_owner();

create or replace function public.validate_wellbeing_record_dates()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'student_check_ins' then
    if new.check_in_date > current_date then raise exception 'Check-in date cannot be in the future'; end if;
  else
    if new.period_start > new.period_end then raise exception 'Reflection start date must not be after its end date'; end if;
    if new.period_end > current_date then raise exception 'Reflection period cannot end in the future'; end if;
    if new.period_end - new.period_start > 366 then raise exception 'Reflection period cannot exceed 366 days'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_student_check_in_dates on public.student_check_ins;
create trigger validate_student_check_in_dates before insert or update of check_in_date
on public.student_check_ins for each row execute function public.validate_wellbeing_record_dates();
drop trigger if exists validate_reflection_dates on public.self_management_reflections;
create trigger validate_reflection_dates before insert or update of period_start, period_end
on public.self_management_reflections for each row execute function public.validate_wellbeing_record_dates();

create or replace function public.complete_quest(
  quest_id_value uuid, proof_path_value text default null, proof_mime_type_value text default null
) returns void language plpgsql security definer set search_path = public, storage as $$
declare target public.quests%rowtype;
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  select * into target from public.quests where id = quest_id_value and owner_id = auth.uid() for update;
  if not found then raise exception 'Quest not found'; end if;
  if target.status = 'completed' then return; end if;
  if target.status <> 'active' then raise exception 'Only active quests can be completed'; end if;
  if target.prerequisite_quest_id is not null and not exists (
    select 1 from public.quests where id = target.prerequisite_quest_id and owner_id = target.owner_id and status = 'completed'
  ) then raise exception 'Complete the prerequisite quest first'; end if;
  if target.requires_proof and proof_path_value is null then raise exception 'Attach proof before completing this quest'; end if;
  if proof_path_value is not null and (
    proof_path_value not like auth.uid()::text || '/' || target.id::text || '/%' or
    not exists(select 1 from storage.objects where bucket_id = 'quest-proofs' and name = proof_path_value)
  ) then raise exception 'Quest proof was not uploaded for this quest'; end if;
  update public.quests set status = 'completed', proof_path = proof_path_value,
    proof_mime_type = proof_mime_type_value,
    proof_submitted_at = case when proof_path_value is null then null else now() end
  where id = target.id;
  insert into public.profiles(id, total_xp, level) values(target.owner_id, target.xp, target.xp / 100 + 1)
  on conflict(id) do update set total_xp = profiles.total_xp + target.xp,
    level = (profiles.total_xp + target.xp) / 100 + 1;
end;
$$;
revoke all on function public.complete_quest(uuid, text, text) from public;
grant execute on function public.complete_quest(uuid, text, text) to authenticated;

create or replace function public.student_withdraw_support_request(request_id uuid)
returns public.support_requests language plpgsql security definer set search_path = public as $$
declare saved_request public.support_requests;
begin
  if not public.is_active_student() then raise exception 'Student account is inactive'; end if;
  update public.support_requests set status = 'withdrawn', assigned_to = null, resolution_note = null, resolved_at = null
  where id = request_id and student_id = auth.uid() and status in ('submitted', 'acknowledged', 'in_progress')
  returning * into saved_request;
  if saved_request.id is null then raise exception 'Support request cannot be withdrawn'; end if;
  return saved_request;
end;
$$;
revoke all on function public.student_withdraw_support_request(uuid) from public;
grant execute on function public.student_withdraw_support_request(uuid) to authenticated;

drop policy if exists "Users can delete their own quest proofs" on storage.objects;
create policy "Users can delete their own quest proofs" on storage.objects for delete to authenticated
using (bucket_id = 'quest-proofs' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_student());

commit;
