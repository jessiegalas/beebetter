export const PROGRAMS = ['BSCS', 'BSIT', 'BSHM', 'BSCrim'] as const;
export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'] as const;
export const LIMITS = { name: 30, student_number: 9, email: 254, password: 72, course: 60, campus: 80, section: 30, goal: 200 } as const;
export type StudentFields = { name: string; student_number: string; course: string; year_level: string; section: string; campus: string; goal: string };
export type EnrollmentOption = { id: string; course: string; year_level: string; campus: string; section: string };
export type StudentErrors = Partial<Record<keyof StudentFields, string>>;
export const cleanName = (value: string) => value.normalize('NFC').replace(/[^\p{L}\p{M} .'\u2019-]/gu, '').slice(0, LIMITS.name);
export const cleanStudentNumber = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 9);
export const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ');
export function normalizeProgram(value: string): string {
  const normalized = normalizeText(value);
  const aliases: Record<string, string> = { 'bs computer science': 'BSCS', 'bs information technology': 'BSIT', 'bs hospitality management': 'BSHM', 'bs criminology': 'BSCrim' };
  return PROGRAMS.find(p => p.toLowerCase() === normalized.toLowerCase()) ?? (Object.hasOwn(aliases, normalized.toLowerCase()) ? aliases[normalized.toLowerCase()] : normalized);
}
export function normalizeYear(value: string): string {
  const text = value.trim();
  const match = /^([1-5])(?:(?:st|nd|rd|th))?(?: year)?$/i.exec(text);
  return match ? YEARS[Number(match[1]) - 1] : text;
}
export function normalizeStudent(value: StudentFields): StudentFields {
  return { name: normalizeText(value.name.normalize('NFC')), student_number: value.student_number.trim(), course: normalizeProgram(value.course), year_level: normalizeYear(value.year_level), campus: normalizeText(value.campus), section: normalizeText(value.section), goal: value.goal.trim() };
}
export function emailError(value: string): string | undefined {
  if (!value.trim()) return 'Enter your email address.';
  if (value.trim().length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address (up to 254 characters).';
}
export function passwordError(value: string): string | undefined {
  if (value.length < 6) return 'Use at least 6 characters.';
  const bytes = Array.from(value).reduce((sum, char) => { const code = char.codePointAt(0)!; return sum + (code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4); }, 0);
  if (value.length > LIMITS.password || bytes > 72) return 'Password is too long. Use a shorter password (maximum 72 characters; fewer with special characters).';
}
export function validateStudent(value: StudentFields, options: EnrollmentOption[], original?: StudentFields): StudentErrors {
  const data = normalizeStudent(value), errors: StudentErrors = {};
  const changed = (key: keyof StudentFields) => !original || value[key] !== original[key];
  if (changed('name') && (!/\p{L}/u.test(data.name) || !/^[\p{L}\p{M} .'\u2019-]+$/u.test(data.name) || data.name.length > LIMITS.name)) errors.name = 'Use up to 30 characters: letters, spaces, hyphens, apostrophes or periods.';
  if (changed('student_number') && !/^[0-9]{9}$/.test(data.student_number)) errors.student_number = 'Enter exactly 9 digits, e.g. 202311197.';
  if (changed('goal') && (!data.goal || data.goal.length > LIMITS.goal)) errors.goal = 'Enter your goal using 1 to 200 characters.';
  const cohortChanged = (['course', 'year_level', 'campus', 'section'] as const).some(changed);
  if (cohortChanged) {
    if (!data.course || data.course.length > LIMITS.course || data.course.toLowerCase() === 'others') errors.course = 'Choose a program or specify your program (up to 60 characters).';
    if (!(YEARS as readonly string[]).includes(data.year_level)) errors.year_level = 'Choose your year level.';
    if (!options.some(o => o.campus === data.campus)) errors.campus = 'Choose an available campus.';
    if (!options.some(o => o.campus === data.campus && o.course === data.course && o.year_level === data.year_level && o.section === data.section)) errors.section = 'Choose an available section for your campus, program and year.';
  }
  return errors;
}
export function studentPayload(value: StudentFields, original?: StudentFields): StudentFields {
  const normalized = normalizeStudent(value);
  // Do not rewrite legacy fields while saving an unrelated edit.
  if (original) for (const key of Object.keys(normalized) as (keyof StudentFields)[]) if (value[key] === original[key]) normalized[key] = original[key];
  return normalized;
}
