import { useCallback, useEffect, useRef, useState } from 'react';
import type { DomainId } from './forest-model';
import type { ProofNode, ProofSource } from './proof-roots-data';

type RootPageState = {
  nodes: ProofNode[];
  next: ProofNode | null;
  loading: boolean;
  error: boolean;
};

const initial: RootPageState = { nodes: [], next: null, loading: true, error: false };

export function useProofRoots(source: ProofSource | undefined, domain: DomainId | null) {
  const [result, setResult] = useState<{ domain: DomainId; source: ProofSource; page: RootPageState }>();
  const load = useRef<() => void>(() => {});

  useEffect(() => {
    if (!source || !domain) return;
    const controller = new AbortController();
    let page = initial;
    let pending = false;
    async function request(currentSource: ProofSource, currentDomain: DomainId) {
      if (pending || controller.signal.aborted) return;
      pending = true;
      page = { ...page, loading: true, error: false };
      setResult({ source: currentSource, domain: currentDomain, page });
      try {
        const incoming = await currentSource.page(currentDomain, page.next, controller.signal);
        if (controller.signal.aborted) return;
        page = { ...incoming, nodes: [...page.nodes, ...incoming.nodes], loading: false, error: false };
      } catch {
        if (controller.signal.aborted) return;
        page = { ...page, loading: false, error: true };
      } finally {
        pending = false;
      }
      setResult({ source: currentSource, domain: currentDomain, page });
    }
    const fetchPage = () => { void request(source, domain); };
    load.current = fetchPage;
    fetchPage();
    return () => controller.abort();
  }, [source, domain]);

  return {
    ...(result && result.source === source && result.domain === domain ? result.page : initial),
    load: () => load.current(),
  };
}

export function useProofUrl(source: ProofSource | undefined, node: ProofNode) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ source: ProofSource; node: ProofNode; attempt: number; url?: string; error: boolean }>();
  const current = result?.source === source && result?.node === node && result?.attempt === attempt ? result : undefined;

  useEffect(() => {
    if (!source) return;
    let live = true;
    void source.sign(node).then(
      url => { if (live) setResult({ source, node, attempt, url, error: false }); },
      () => { if (live) setResult({ source, node, attempt, error: true }); },
    );
    return () => { live = false; };
  }, [source, node, attempt]);

  const fail = useCallback(() => {
    setResult(previous => previous && previous.source === source && previous.node === node
      && previous.attempt === attempt ? { ...previous, url: undefined, error: true } : previous);
  }, [source, node, attempt]);

  return {
    url: current?.url,
    error: current?.error ?? false,
    retry: () => setAttempt(value => value + 1),
    fail,
  };
}
