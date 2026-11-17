import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { RegistrationEnrollmentOption } from '@/lib/student-validation';
import { supabase } from '@/supabase';

export function useEnrollmentOptions({ enabled = true }: { enabled?: boolean } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; options: RegistrationEnrollmentOption[]; error: string | null }>();
  const retry = useCallback(() => setAttempt(previous => previous + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') retry(); });
    return () => subscription.remove();
  }, [enabled, retry]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const fail = (error: string) => setResult(previous => ({ attempt, options: previous?.options ?? [], error }));
    const timeout = setTimeout(() => {
      controller.abort();
      fail('Enrollment choices took too long to load. Please try again.');
    }, 20_000);

    void (async () => {
      try {
        const { data, error } = await supabase.rpc('registration_enrollment_options_v2').abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error || !Array.isArray(data)) throw new Error('Catalogue unavailable');
        setResult({ attempt, options: data, error: null });
      } catch {
        if (!controller.signal.aborted) fail('Could not load enrollment choices. Please try again.');
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [enabled, attempt]);

  const loading = enabled && result?.attempt !== attempt;
  const error = loading ? null : result?.error ?? null;
  const options = result?.options ?? [];
  return { options, loading, error, retry, ready: enabled && !loading && !error && options.length > 0 };
}
