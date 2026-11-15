export const QUEST_PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime'];
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export type ProofFile = { uri: string; name: string; mimeType: string; size?: number };
export type CompletionReceipt =
  | { status: 'completed'; title: string; awarded_xp: number; total_xp: number }
  | { status: 'already_completed' };
export type CompleteQuestOutcome =
  | { success: true; receipt: CompletionReceipt }
  | { success: false; error: string };

const PROOF_MIME_BY_EXTENSION: Partial<Record<string, string>> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime',
};

export function questProofMimeType(name: string | null | undefined, mimeType: string | null | undefined) {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  return PROOF_MIME_BY_EXTENSION[name?.split('.').at(-1)?.toLowerCase() ?? ''] ?? '';
}

export function validateQuestProof(mimeType: string, size?: number) {
  if (!QUEST_PROOF_MIME_TYPES.includes(mimeType)) {
    throw new Error('Choose a JPEG, PNG, WebP, PDF, MP4, or QuickTime file.');
  }
  if (size !== undefined && (!Number.isFinite(size) || size <= 0 || size > MAX_PROOF_BYTES)) {
    throw new Error('Choose a nonempty proof file no larger than 10 MB.');
  }
}

export type QuestCompletionAdapter = {
  readProof: (proof: ProofFile) => Promise<ArrayBuffer>;
  uploadProof: (path: string, bytes: ArrayBuffer, mimeType: string) => Promise<void>;
  complete: (questId: string, proofPath: string | null, mimeType: string | null) => Promise<CompletionReceipt>;
  removeProof: (path: string) => Promise<void>;
};

type QuestCompletionResult =
  | CompletionReceipt
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export function createQuestCompletion(adapter: QuestCompletionAdapter, now: () => number = Date.now) {
  return {
    async run({ ownerId, questId, proof, isCurrent }: {
      ownerId: string; questId: string; proof?: ProofFile; isCurrent: () => boolean;
    }): Promise<QuestCompletionResult> {
      if (!isCurrent()) return { status: 'cancelled' };
      let proofPath: string | null = null;
      try {
        if (proof) {
          validateQuestProof(proof.mimeType, proof.size);
          const bytes = await adapter.readProof(proof);
          if (!isCurrent()) return { status: 'cancelled' };
          validateQuestProof(proof.mimeType, bytes.byteLength);
          const extension = proof.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
          // Each attempt must own its upload, even across clients.
          proofPath = `${ownerId}/${questId}/${now()}-${Math.random().toString(36).slice(2)}.${extension}`;
          await adapter.uploadProof(proofPath, bytes, proof.mimeType);
        }
        if (!isCurrent()) return { status: 'cancelled' };
        const receipt = await adapter.complete(questId, proofPath, proof?.mimeType ?? null);
        // The server explicitly declined this attempt's unique proof object.
        if (receipt.status === 'already_completed' && proofPath && isCurrent()) {
          try { await adapter.removeProof(proofPath); } catch { /* Retention can recover it. */ }
        }
        return isCurrent() ? receipt : { status: 'cancelled' };
      } catch (error) {
        // A failed or malformed response can follow a committed mutation.
        // Retention handles abandoned uploads without risking committed proof.
        const failure = error as { code?: string; message?: string };
        return { status: 'failed', message: failure?.code === 'PGRST202'
          ? 'Quest completion is unavailable until the server update is installed.'
          : failure?.message || 'Failed to complete quest.' };
      }
    },
  };
}
