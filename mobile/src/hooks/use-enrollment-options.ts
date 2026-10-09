import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/supabase';
import { CatalogueError, readEnrollmentOptions, requestEnrollmentCatalogue, type EnrollmentKind } from '@/lib/enrollment-catalogue';
import type { EnrollmentOption, RegistrationEnrollmentOption } from '@/lib/student-validation';

export type EnrollmentStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export type EnrollmentCatalogue<T extends EnrollmentOption> = {
  status: EnrollmentStatus; options: T[]; isRefreshing: boolean;
  loading: boolean; error: string | null; retry: () => void;
};
type Settings = { kind: EnrollmentKind; context: string; enabled?: boolean };
export function useEnrollmentOptions(settings: Settings & { kind: 'registration' }): EnrollmentCatalogue<RegistrationEnrollmentOption>;
export function useEnrollmentOptions(settings: Settings & { kind: 'profile' }): EnrollmentCatalogue<EnrollmentOption>;
export function useEnrollmentOptions({ kind, context, enabled = true }: Settings): EnrollmentCatalogue<EnrollmentOption> {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const [result, setResult] = useState<{
    key: string; attempt: number; options: EnrollmentOption[]; hasData: boolean; error: string | null;
  } | null>(null);
  const key = JSON.stringify([kind, context]);
  if (!enabled && result !== null) setResult(null);
  useEffect(() => {
    if (!enabled) return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active' && previous !== 'active') retry();
      previous = next;
    });
    return () => subscription.remove();
  }, [enabled, retry]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const started = Date.now();
    void (async () => {
      try {
        const { data, error } = await requestEnrollmentCatalogue(signal => supabase.rpc(
          kind === 'registration' ? 'registration_enrollment_options_v2' : 'registration_enrollment_options',
        ).abortSignal(signal), { signal: controller.signal });
        if (error) throw error;
        const options = readEnrollmentOptions(data, kind);
        if (controller.signal.aborted) return;
        setResult({ key, attempt, options, hasData: true, error: null });
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('Enrollment catalogue', { kind, status: options.length ? 'ready' : 'empty', count: options.length, durationMs: Date.now() - started });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof CatalogueError && error.code === 'timeout'
          ? 'Student options took too long to load. Check your connection and try again.'
          : 'Student options could not be loaded. Please try again.';
        setResult(previous => ({ key, attempt, options: previous?.key === key ? previous.options : [],
          hasData: previous?.key === key && previous.hasData, error: message }));
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('Enrollment catalogue', { kind, status: 'error', category: error instanceof CatalogueError ? error.code : 'request_failed', durationMs: Date.now() - started });
      }
    })();
    return () => controller.abort();
  }, [attempt, key, kind, enabled]);
  const cached = enabled && result?.key === key ? result : null;
  const pending = enabled && cached?.attempt !== attempt;
  const error = !pending ? cached?.error ?? null : null;
  const options = cached?.options ?? [];
  const status: EnrollmentStatus = !enabled ? 'idle' : error ? 'error' : !cached?.hasData ? 'loading' : options.length ? 'ready' : 'empty';
  return { status, options, loading: enabled && !cached?.hasData && pending,
    isRefreshing: !!cached?.hasData && pending, error, retry };
}
