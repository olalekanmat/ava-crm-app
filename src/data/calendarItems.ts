import { parseLocal } from './dates';
import type { Snapshot } from './types';

/** One entry Ava keeps in the person's own (Outlook or Google) calendar. `key` stays the same while the visit or event exists. */
export interface CalendarItem {
  key: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  notes?: string;
}

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
/** How far ahead visits and events go into the calendar. */
export const CALENDAR_DAYS_AHEAD = 60;

const place = (...parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(', ') || undefined;

/**
 * The person's planned calls (30 minutes each) and the planned events they organise (2 hours),
 * from the start of today to 60 days ahead, soonest first.
 */
export function calendarItems(s: Pick<Snapshot, 'calls' | 'accounts' | 'events'>, userId: string, now: Date): CalendarItem[] {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = from.getTime() + (CALENDAR_DAYS_AHEAD + 1) * DAY;
  const inRange = (d: Date) => d.getTime() >= from.getTime() && d.getTime() < to;
  const accounts = new Map(s.accounts.filter((a) => !a.deletedAt).map((a) => [a.id, a]));
  const out: CalendarItem[] = [];

  for (const c of s.calls) {
    if (c.ownerId !== userId || c.status !== 'Planned') continue;
    const a = accounts.get(c.accountId);
    const start = new Date(c.datetime);
    if (!a || Number.isNaN(start.getTime()) || !inRange(start)) continue;
    const objectives = (c.objectives ?? []).map((o) => o.text.trim()).filter(Boolean);
    out.push({
      key: `call:${c.id}`,
      title: `Visit: ${a.name}`,
      start,
      end: new Date(start.getTime() + 30 * MIN),
      location: place(a.address, a.city),
      notes: objectives.length ? `Objectives:\n${objectives.map((o) => `- ${o}`).join('\n')}` : undefined,
    });
  }

  for (const e of s.events ?? []) {
    if (e.ownerId !== userId || e.status !== 'Planned') continue;
    const start = parseLocal(e.date, e.time || '09:00');
    if (!start || !inRange(start)) continue;
    out.push({
      key: `event:${e.id}`,
      title: `${e.kind}: ${e.title}`,
      start,
      end: new Date(start.getTime() + 120 * MIN),
      location: place(e.venue, e.city),
      notes: e.notes?.trim() || undefined,
    });
  }

  return out.sort((x, y) => x.start.getTime() - y.start.getTime() || x.key.localeCompare(y.key));
}
