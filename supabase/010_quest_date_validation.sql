-- Reject newly assigned past dates using server time. Existing overdue quests
-- must remain completable; unrelated updates do not revalidate unchanged dates.
begin;
create or replace function public.validate_quest_dates() returns trigger
language plpgsql set search_path = public as $$
declare
  check_start boolean := true;
  check_deadline boolean := true;
  current_minute timestamptz := date_trunc('minute', statement_timestamp());
begin
  if TG_OP = 'UPDATE' then
    check_start := new.scheduled_at is distinct from old.scheduled_at;
    check_deadline := new.deadline_at is distinct from old.deadline_at;
  end if;
  if check_start and new.scheduled_at is not null and (not isfinite(new.scheduled_at) or new.scheduled_at < current_minute) then
    raise exception 'Scheduled start cannot be in the past or invalid. Choose today or a future date and time.';
  end if;
  if check_deadline and new.deadline_at is not null and (not isfinite(new.deadline_at) or new.deadline_at < current_minute) then
    raise exception 'Deadline cannot be in the past or invalid. Choose today or a future date and time.';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_quest_dates on public.quests;
create trigger validate_quest_dates before insert or update of scheduled_at, deadline_at on public.quests for each row execute function public.validate_quest_dates();
commit;
