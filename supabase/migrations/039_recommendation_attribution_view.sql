-- Canonical observational attribution includes accepted exposures delivered after completion.
begin;
create view public.recommendation_completion_attributions_v2
with (security_invoker = true) as
select h.id as completion_history_id, h.owner_id, h.quest_id, h.completed_at,
  e.id as exposure_event_id, e.impression_id, e.session_id, e.surface,
  e.recommendation_group, e.rank_position, e.recommendation_version,
  e.reason_codes, e.occurred_at as exposed_at
from public.quest_completion_history h
left join lateral (
  select v.* from public.recommendation_events_v2 v
  where h.quest_id is not null and v.student_id = h.owner_id and v.quest_id = h.quest_id
    and v.event_type = 'exposure'
    and v.occurred_at between h.completed_at - interval '30 days' and h.completed_at
  order by v.occurred_at desc, v.id desc
  limit 1
) e on true;
revoke all on public.recommendation_completion_attributions_v2 from public, anon, authenticated;
grant select on public.recommendation_completion_attributions_v2 to service_role;
comment on view public.recommendation_completion_attributions_v2 is
  'Authoritative rules-v2 observational completion attribution at query time. Late accepted exposures may revise results; record extraction time. Do not add ingestion-time completion events or legacy metrics to these counts.';
commit;
