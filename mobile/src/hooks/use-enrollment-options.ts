import { useEffect, useState } from 'react';
import { supabase } from '@/supabase';
import type { EnrollmentOption } from '@/lib/student-validation';
export function useEnrollmentOptions() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; options: EnrollmentOption[]; error: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = await supabase.from('student_enrollment_options').select('id,course,year_level,campus,section').order('campus').order('section').abortSignal(controller.signal);
        if (!controller.signal.aborted) setResult({ attempt, options: error ? [] : data ?? [], error: error ? 'Student options could not be loaded. Please try again.' : null });
      } catch { if (!controller.signal.aborted) setResult({ attempt, options: [], error: 'Student options could not be loaded. Please try again.' }); }
    })();
    return () => controller.abort();
  }, [attempt]);
  const current = result?.attempt === attempt ? result : null;
  return { options: current?.options ?? [], loading: !current, error: current?.error ?? null, retry: () => setAttempt(n => n + 1) };
}
