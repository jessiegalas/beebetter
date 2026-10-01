-- Optional motivation context for private, student-owned daily check-ins.
-- Apply after 012_wellbeing_and_osas_foundation.sql. This migration is additive.
begin;

alter table public.student_check_ins
  add column if not exists motivation_level smallint
  check (motivation_level is null or motivation_level between 1 and 5);

commit;
