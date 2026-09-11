-- Add optional proof requirements and private proof storage for quests.
alter table public.quests
  add column if not exists requires_proof boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists proof_path text,
  add column if not exists proof_mime_type text,
  add column if not exists proof_submitted_at timestamptz;

insert into storage.buckets (id, name, public)
values ('quest-proofs', 'quest-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can upload their own quest proofs" on storage.objects;
create policy "Users can upload their own quest proofs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'quest-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view their own quest proofs" on storage.objects;
create policy "Users can view their own quest proofs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'quest-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own quest proofs" on storage.objects;
create policy "Users can delete their own quest proofs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'quest-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
