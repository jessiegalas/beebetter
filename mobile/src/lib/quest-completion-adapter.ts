import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_PROOF_BYTES, type QuestCompletionAdapter } from './quest-completion';

export function createQuestCompletionAdapter(client: Pick<SupabaseClient, 'storage' | 'rpc'>): QuestCompletionAdapter {
  return {
    async readProof(proof) {
      const response = await fetch(proof.uri);
      const size = response.headers?.get('content-length');
      if (size && Number(size) > MAX_PROOF_BYTES) throw new Error('Choose a proof file no larger than 10 MB.');
      return response.arrayBuffer();
    },
    async uploadProof(path, bytes, mimeType) {
      const { error } = await client.storage.from('quest-proofs')
        .upload(path, bytes, { contentType: mimeType, upsert: false });
      if (error) throw error;
    },
    async complete(questId, proofPath, mimeType) {
      const { data, error } = await client.rpc('complete_quest_v2', {
        quest_id_value: questId,
        proof_path_value: proofPath,
        proof_mime_type_value: mimeType,
      });
      if (error) throw error;
      if (data?.status === 'already_completed') return { status: 'already_completed' };
      if (data?.status !== 'completed' || typeof data.title !== 'string' ||
          !Number.isInteger(data.awarded_xp) || data.awarded_xp < 0 ||
          !Number.isInteger(data.total_xp) || data.total_xp < data.awarded_xp) {
        throw new Error('Could not verify the completion receipt. Refresh or try again.');
      }
      return { status: 'completed', title: data.title, awarded_xp: data.awarded_xp, total_xp: data.total_xp };
    },
    async removeProof(path) {
      await client.storage.from('quest-proofs').remove([path]);
    },
  };
}
