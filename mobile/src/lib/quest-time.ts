/** Dates entered on the device are local; persisted instants are UTC ISO strings. */
export function parseLocalDateTime(value: string): string | null {
  if (!value.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error('Use YYYY-MM-DD HH:mm for dates and times.');
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d ||
      date.getHours() !== h || date.getMinutes() !== min) {
    throw new Error('Enter a valid local date and time.');
  }
  return date.toISOString();
}

export function formatLocalDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parsePreferredTime(value: string): string | null {
  if (!value.trim()) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    throw new Error('Use HH:mm (24-hour time) for a preferred time.');
  }
  return value.trim();
}

export function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
