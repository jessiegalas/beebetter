-- Final integration fix: retain proof objects while quest records reference them.
-- Apply after 023_recommendation_quality.sql. This migration is additive.
begin;

create or replace function public.can_delete_quest_proof(
  object_name text, target_user_id uuid default auth.uid()
) returns boolean
language sql security definer set search_path = public stable as $$
  select target_user_id = auth.uid()
    and public.is_active_student(target_user_id)
    and (storage.foldername(object_name))[1] = target_user_id::text
    and not exists (
      select 1 from public.quests q
      where q.owner_id = target_user_id and q.proof_path = object_name
    );
$$;
revoke all on function public.can_delete_quest_proof(text, uuid) from public;
grant execute on function public.can_delete_quest_proof(text, uuid) to authenticated;

drop policy if exists "Users can delete their own quest proofs" on storage.objects;
create policy "Users can delete their own unreferenced quest proofs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'quest-proofs'
  and public.can_delete_quest_proof(name)
);

commit;
