import { useState } from 'react';
import { studentIdentityPayload, validateStudentIdentity, type StudentIdentity } from '@/lib/student-validation';

export function useRegistrationForm({ owner, draft }: { owner: string; draft?: StudentIdentity | null }) {
  const initial = () => ({
    owner,
    student: draft ? studentIdentityPayload(draft) : { student_number: '', name: '' },
    submitted: false,
  });
  const [state, setState] = useState(initial);
  // A session change resets the form. Metadata refreshes preserve in-progress edits.
  const current = state.owner === owner ? state : initial();
  if (state.owner !== owner) setState(current);
  const errors = validateStudentIdentity(current.student);
  const change = (student: StudentIdentity) => setState({ ...current, student });
  const validate = () => {
    setState({ ...current, submitted: true });
    return Object.keys(errors).length ? null : studentIdentityPayload(current.student);
  };
  return { student: current.student, submitted: current.submitted, errors, change, validate };
}
