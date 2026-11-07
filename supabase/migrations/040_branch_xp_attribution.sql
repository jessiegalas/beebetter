-- Branch XP attribution from immutable completion lifecycle snapshots.
-- Apply after 039_recommendation_attribution_view.sql. This migration is additive.
begin;

-- Completion events are already unique per quest. This partial index keeps the
-- authenticated per-student category aggregation bounded to completed events.
create index if not exists quest_lifecycle_completed_owner_category_idx
on public.quest_lifecycle_events(owner_id, category)
where event_type = 'completed';

create or replace function public.student_branch_progress()
returns table(category text, xp bigint, completed bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query
    select e.category, coalesce(sum(e.xp), 0)::bigint, count(*)::bigint
    from public.quest_lifecycle_events e
    where e.owner_id = auth.uid() and e.event_type = 'completed'
    group by e.category
    order by e.category;
end;
$$;
revoke all on function public.student_branch_progress() from public;
grant execute on function public.student_branch_progress() to authenticated;

comment on function public.student_branch_progress() is
'Authenticated student branch XP totals derived from immutable completed quest lifecycle snapshots. Overall XP remains profiles.total_xp; legacy completions without a lifecycle snapshot cannot be attributed to a category.';

commit;
