import { LIMITS, type EnrollmentOption, type RegistrationEnrollmentOption } from './student-validation';

export type EnrollmentKind = 'registration' | 'profile';
export class CatalogueError extends Error {
  constructor(readonly code: 'invalid_response' | 'timeout' | 'cancelled') { super(code); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readEnrollmentOptions(data: unknown, kind: 'registration'): RegistrationEnrollmentOption[];
export function readEnrollmentOptions(data: unknown, kind: 'profile'): EnrollmentOption[];
export function readEnrollmentOptions(data: unknown, kind: EnrollmentKind): RegistrationEnrollmentOption[] | EnrollmentOption[];
export function readEnrollmentOptions(data: unknown, kind: EnrollmentKind): RegistrationEnrollmentOption[] | EnrollmentOption[] {
  if (!Array.isArray(data)) throw new CatalogueError('invalid_response');
  const ids = new Set<string>();
  let semester: string | undefined;
  return data.map(value => {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !uuid.test(value.id) || ids.has(value.id)) throw new CatalogueError('invalid_response');
    ids.add(value.id);
    for (const field of ['course', 'year_level', 'campus', 'section'] as const) {
      if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > (field === 'year_level' ? 30 : LIMITS[field])) throw new CatalogueError('invalid_response');
    }
    const option: EnrollmentOption = { id: value.id, course: value.course, year_level: value.year_level, campus: value.campus, section: value.section };
    if (kind === 'profile') return option;
    if (typeof value.semester_id !== 'string' || !uuid.test(value.semester_id)
      || (semester !== undefined && semester !== value.semester_id)
      || typeof value.academic_year !== 'string' || !value.academic_year.trim()
      || typeof value.term !== 'string' || !value.term.trim()) throw new CatalogueError('invalid_response');
    semester = value.semester_id;
    return { ...option, semester_id: value.semester_id, academic_year: value.academic_year, term: value.term };
  });
}

// Bound both transport and caller wait, even when a transport ignores abort.
export async function requestEnrollmentCatalogue<T>(request: (signal: AbortSignal) => PromiseLike<T>,
  { signal, timeoutMs = 20_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        cancel = () => { reject(new CatalogueError('cancelled')); controller.abort(); };
        if (signal?.aborted) { cancel(); return; }
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => { reject(new CatalogueError('timeout')); controller.abort(); }, timeoutMs);
      }),
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new CatalogueError('cancelled');
        return request(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
