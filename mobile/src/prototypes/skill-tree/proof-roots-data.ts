import type { SupabaseClient } from '@supabase/supabase-js';
import { DOMAINS, type DomainId } from './forest-model';

export const PROOF_PAGE_SIZE = 20;
const proofTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

export type ProofNode = {
  id: string;
  title: string;
  completed_at: string | null;
  proof_path: string;
  proof_mime_type: string;
};

export type ProofPage = { nodes: ProofNode[]; next: ProofNode | null };
export type ProofSource = {
  page: (domain: DomainId, after: ProofNode | null, signal: AbortSignal) => Promise<ProofPage>;
  sign: (node: ProofNode) => Promise<string>;
};

export function withProofNote(notes: ReadonlyMap<string, string>, id: string, text: string) {
  const next = new Map(notes);
  const note = text.trim();
  if (note) next.set(id, note);
  else next.delete(id);
  return next;
}

export function createProofSource(client: Pick<SupabaseClient, 'from' | 'storage'>, owner: string): ProofSource {
  const ownsPath = (node: ProofNode) => node.proof_path.startsWith(owner + '/' + node.id + '/');
  return {
    async page(domain, after, signal) {
      const category = DOMAINS.find(item => item.id === domain)?.name;
      if (!category) throw new Error('Unknown category');
      let query = client.from('quests').select('id,title,completed_at,proof_path,proof_mime_type')
        .eq('owner_id', owner).eq('status', 'completed').ilike('category', category)
        .not('proof_path', 'is', null).in('proof_mime_type', proofTypes)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false }).limit(PROOF_PAGE_SIZE + 1);

      if (after?.completed_at) {
        const { completed_at: date, id } = after;
        query = query.or(`completed_at.lt.${date},and(completed_at.eq.${date},id.lt.${id}),completed_at.is.null`);
      } else if (after) {
        query = query.is('completed_at', null).lt('id', after.id);
      }

      const { data, error } = await query.abortSignal(signal);
      if (error) throw error;
      const page = (data ?? []) as ProofNode[];
      const consumed = page.slice(0, PROOF_PAGE_SIZE);
      return {
        nodes: consumed.filter(ownsPath),
        next: page.length > PROOF_PAGE_SIZE ? consumed[PROOF_PAGE_SIZE - 1] : null,
      };
    },
    async sign(node) {
      if (!ownsPath(node) || !proofTypes.includes(node.proof_mime_type)) throw new Error('Invalid proof');
      const { data, error } = await client.storage.from('quest-proofs').createSignedUrl(node.proof_path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error('Proof unavailable');
      return data.signedUrl;
    },
  };
}
