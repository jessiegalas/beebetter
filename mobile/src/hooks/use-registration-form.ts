import { useState } from 'react';
import type { EnrollmentLabels, EnrollmentSelection, RegistrationDraft } from '@/lib/auth-flow';
import { normalizeText, type RegistrationEnrollmentOption } from '@/lib/student-validation';

export const enrollmentFields = ['course', 'year_level', 'campus', 'section'] as const;
export type EnrollmentField = typeof enrollmentFields[number];
const emptyChoices: EnrollmentLabels = { course: '', year_level: '', campus: '', section: '' };
const emptyName = { first: '', middle: '', last: '', suffix: '' };
type NamePart = keyof typeof emptyName;

function readSavedName(value: string) {
  const savedName = normalizeText(value);
  const words = savedName ? savedName.split(' ') : [];
  const hasSuffix = words.length > 2 && /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i.test(words[words.length - 1]);
  const suffix = hasSuffix ? words.pop() ?? '' : '';
  // A saved string cannot tell us where a multiword given or family name starts.
  if (words.length > 2) return { parts: emptyName, reference: savedName };
  return { parts: { ...emptyName, first: words[0] ?? '', last: words[1] ?? '', suffix }, reference: '' };
}

export function useRegistrationForm(draft: RegistrationDraft | null, options: RegistrationEnrollmentOption[]) {
  const [studentNumber, setStudentNumber] = useState(draft?.student_number ?? '');
  const [{ parts: nameParts, reference: savedNameForReview }, setStudentName] = useState(() => readSavedName(draft?.name ?? ''));
  const name = Object.values(nameParts).map(normalizeText).filter(Boolean).join(' ');
  const setNamePart = (part: NamePart, value: string) => setStudentName(previous => ({
    ...previous, parts: { ...previous.parts, [part]: value },
  }));
  const [goal, setGoal] = useState(draft?.goal ?? '');
  const [choice, setChoice] = useState<{ labels: EnrollmentLabels; selection: EnrollmentSelection | null } | null>(null);
  const selection = choice ? choice.selection : draft?.enrollment;
  const selected = options.find(option => option.id === selection?.enrollmentOptionId && option.semester_id === selection.semesterId
    && (!choice || enrollmentFields.every(field => option[field] === choice.labels[field])));
  const labels = choice?.labels ?? (selected ? enrollmentLabels(selected) : emptyChoices);

  const choicesFor = (field: EnrollmentField) => {
    const parents = enrollmentFields.slice(0, enrollmentFields.indexOf(field));
    return Array.from(new Set(options.filter(option => parents.every(parent => option[parent] === labels[parent]))
      .map(option => option[field]))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };
  const change = (field: EnrollmentField, value: string) => {
    const next = { ...labels, [field]: value };
    for (const dependent of enrollmentFields.slice(enrollmentFields.indexOf(field) + 1)) next[dependent] = '';
    const option = options.find(row => enrollmentFields.every(key => row[key] === next[key]));
    setChoice({ labels: next, selection: option ? { semesterId: option.semester_id, enrollmentOptionId: option.id } : null });
  };
  const clearSelection = () => change('section', '');
  return {
    studentNumber, setStudentNumber, name, nameParts, setNamePart, savedNameForReview, goal, setGoal,
    selection: selected && selection ? { ...selection, labels: enrollmentLabels(selected) } : null,
    selectionChanged: !!selection && !selected,
    labels: { ...labels, section: selected ? labels.section : '' }, choicesFor, change, clearSelection,
  };
}

function enrollmentLabels({ course, year_level, campus, section }: RegistrationEnrollmentOption): EnrollmentLabels {
  return { course, year_level, campus, section };
}
