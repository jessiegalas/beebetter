import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestCompletionAdapter } from './quest-completion';

/** Production IO; sequencing, cancellation and compensation live in the module. */
export function createQuestCompletionAdapter(client: Pick<SupabaseClient, 'storage' | 'rpc'>): QuestCompletionAdapter {
  return {
    async readProof(proof) {
      const response = await fetch(proof.uri);
      return response.arrayBuffer();
    },
    async uploadProof(path, bytes, mimeType) {
      const { error } = await client.storage.from('quest-proofs')
        .upload(path, bytes, { contentType: mimeType, upsert: false });
      if (error) throw error;
    },
    async complete(questId, proofPath, mimeType) {
      const { error } = await client.rpc('complete_quest', {
        quest_id_value: questId,
        proof_path_value: proofPath,
        proof_mime_type_value: mimeType,
      });
      if (error) throw error;
    },
    async removeProof(path) {
      // Returned removal errors were historically ignored; thrown failures are
      // swallowed by the coordinator so they cannot replace the mutation error.
      await client.storage.from('quest-proofs').remove([path]);
    },
  };
}
