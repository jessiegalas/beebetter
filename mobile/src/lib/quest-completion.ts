export type ProofFile = { uri: string; name: string; mimeType: string };

export type QuestCompletionAdapter = {
  readProof: (proof: ProofFile) => Promise<ArrayBuffer>;
  uploadProof: (path: string, bytes: ArrayBuffer, mimeType: string) => Promise<void>;
  complete: (questId: string, proofPath: string | null, mimeType: string | null) => Promise<void>;
  removeProof: (path: string) => Promise<void>;
};

export type QuestCompletionResult =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/** Upload and dispatch only while the captured admitted session is current.
 * Cancellation stops later phases; it cannot undo an in-flight server mutation.
 * Failure cleanup is best effort and intentionally limited to the current session.
 */
export function createQuestCompletion(adapter: QuestCompletionAdapter, now: () => number = Date.now) {
  return {
    async run({ ownerId, questId, proof, isCurrent }: {
      ownerId: string; questId: string; proof?: ProofFile; isCurrent: () => boolean;
    }): Promise<QuestCompletionResult> {
      if (!isCurrent()) return { status: 'cancelled' };
      let proofPath: string | null = null;
      try {
        if (proof) {
          const extension = proof.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
          proofPath = `${ownerId}/${questId}/${now()}.${extension}`;
          const bytes = await adapter.readProof(proof);
          if (!isCurrent()) return { status: 'cancelled' };
          await adapter.uploadProof(proofPath, bytes, proof.mimeType);
        }
        if (!isCurrent()) return { status: 'cancelled' };
        await adapter.complete(questId, proofPath, proof?.mimeType ?? null).catch(error => {
          if ((error as { code?: string })?.code === 'PGRST202') {
            throw new Error('Quest completion needs the context-aware database update (008).');
          }
          throw error;
        });
        return isCurrent() ? { status: 'completed' } : { status: 'cancelled' };
      } catch (error) {
        // Preserve existing behavior: even a failed read/upload attempts removal.
        // Guard cancellation returns above deliberately do not remove an upload.
        if (proofPath && isCurrent()) {
          try { await adapter.removeProof(proofPath); } catch { /* Keep the original failure. */ }
        }
        return {
          status: 'failed',
          message: error instanceof Error ? error.message : (error as { message?: string })?.message || 'Failed to complete quest.',
        };
      }
    },
  };
}
