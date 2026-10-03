const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Parses "YYYY-MM-DD" and "HH:MM" as local time. Returns null when invalid. */
export function parseLocal(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  if (d.getMonth() !== +dm[2] - 1 || +tm[1] > 23 || +tm[2] > 59) return null;
  return d;
}

export function timeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${timeKey(d)}`;
}
