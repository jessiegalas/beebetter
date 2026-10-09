import { useCallback, useRef, useState } from 'react';
import { emptyStudentFields, registrationInput, type RegistrationDraft } from '@/lib/auth-flow';
import { studentPayload, validateStudent, type StudentFields, type StudentErrors, type RegistrationEnrollmentOption } from '@/lib/student-validation';
import type { EnrollmentCatalogue } from './use-enrollment-options';

type FocusHandle = { focus: () => void };
type FormState = { owner: string; student: StudentFields; selection: { option: string; semester: string } | null };
const initial = (owner: string, draft?: RegistrationDraft | null): FormState => ({ owner,
  student: draft ? studentPayload(draft.student) : emptyStudentFields(),
  selection: draft ? { option: draft.enrollmentOptionId, semester: draft.semesterId } : null,
});

export function useRegistrationForm({ owner, draft, enrollment }: {
  owner: string; draft?: RegistrationDraft | null; enrollment: EnrollmentCatalogue<RegistrationEnrollmentOption>;
}) {
  const [state, setState] = useState(() => initial(owner, draft));
  const [touched, setTouched] = useState<Partial<Record<keyof StudentFields, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const inputs = useRef<Partial<Record<keyof StudentFields, { owner: string; handle: FocusHandle | null }>>>({});
  // Reset at ownership changes; metadata refreshes never replace edits.
  const current = state.owner === owner ? state : initial(owner, draft);
  if (state.owner !== owner) { setState(current); setTouched({}); setSubmitted(false); }
  const selected = enrollment.options.find(option => option.id === current.selection?.option && option.semester_id === current.selection?.semester);
  const errors: StudentErrors = validateStudent(current.student, enrollment.options);
  const ready = enrollment.status === 'ready' && !enrollment.isRefreshing;
  const valid = ready && !!selected && Object.keys(errors).length === 0;
  const touch = useCallback((field: keyof StudentFields) => setTouched(previous => ({ ...previous, [field]: true })), []);
  const change = (next: StudentFields, field?: keyof StudentFields) => {
    const cleared = field === 'course' ? { year_level: '', campus: '', section: '' }
      : field === 'year_level' ? { campus: '', section: '' } : field === 'campus' ? { section: '' } : {};
    const student = { ...next, ...cleared };
    const option = enrollment.options.find(option => option.course === student.course && option.year_level === student.year_level
      && option.campus === student.campus && option.section === student.section);
    const cohortChanged = field && ['course', 'year_level', 'campus', 'section'].includes(field);
    setState({ owner, student, selection: cohortChanged ? (option ? { option: option.id, semester: option.semester_id } : null) : current.selection });
    if (field) touch(field);
  };
  const registerInput = useCallback((field: keyof StudentFields, handle: FocusHandle | null) => {
    inputs.current[field] = { owner, handle };
  }, [owner]);
  const invalidateSelection = () => setState(previous => ({ ...previous, selection: null }));
  const validate = (): RegistrationDraft | null => {
    setSubmitted(true);
    if (!valid || !selected) {
      const first = (['name', 'student_number', 'course', 'year_level', 'campus', 'section', 'goal'] as const).find(field => errors[field]);
      if (first && inputs.current[first]?.owner === owner) inputs.current[first]?.handle?.focus();
      return null;
    }
    return { version: 1, student: studentPayload(current.student), semesterId: selected.semester_id, enrollmentOptionId: selected.id };
  };
  return { student: current.student, selection: current.selection, selected, errors, touched, submitted, valid, ready,
    change, touch, validate, input: registrationInput, invalidateSelection, registerInput,
    selectionChanged: !!current.selection && !selected && ready };
}
