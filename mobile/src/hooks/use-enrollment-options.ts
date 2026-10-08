import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/supabase';
import type { EnrollmentOption } from '@/lib/student-validation';
export function useEnrollmentOptions<T extends EnrollmentOption = EnrollmentOption>(context = '', registration = false, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const [result, setResult] = useState<{ context: string; attempt: number; options: T[]; error: string | null } | null>(null);
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
    if (!enabled) { setResult(null); return; }
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc(registration ? 'registration_enrollment_options_v2' : 'registration_enrollment_options').abortSignal(controller.signal);
        if (!controller.signal.aborted) setResult({ context, attempt, options: error ? [] : data ?? [], error: error ? 'Student options could not be loaded. Please try again.' : null });
      } catch { if (!controller.signal.aborted) setResult({ context, attempt, options: [], error: 'Student options could not be loaded. Please try again.' }); }
    })();
    return () => controller.abort();
  }, [attempt, context, registration, enabled]);
  const current = result?.attempt === attempt && result.context === context ? result : null;
  return { options: enabled ? current?.options ?? [] : [], loading: enabled && !current, error: enabled ? current?.error ?? null : null, retry };
}
