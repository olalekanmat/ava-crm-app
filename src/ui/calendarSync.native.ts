import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import type { CalendarItem } from '@/data/calendarItems';
import { buildIcs } from '@/data/ics';
import { saveTextFile } from './files';

/** Phones can write to a calendar on the device (which the Outlook or Google app keeps in step). */
export const calendarSyncSupported = true;

export interface CalendarSyncSettings {
  enabled: boolean;
  calendarId?: string;
  /** ISO time of the last successful sync. */
  lastSynced?: string;
}

export interface WritableCalendar {
  id: string;
  title: string;
  /** The account the calendar belongs to, e.g. an Outlook or Gmail address. */
  account: string;
  isPrimary: boolean;
}

export interface CalendarSyncResult {
  created: number;
  updated: number;
  deleted: number;
}

const SETTINGS_KEY = 'ava:calendar-sync';
const MAP_KEY = 'ava:calendar-map';

/** Which device event Ava made for each visit or event, with a fingerprint to skip unchanged ones. */
interface CalendarMap {
  calendarId: string;
  events: Record<string, { id: string; hash: string }>;
}

export async function loadCalendarSync(): Promise<CalendarSyncSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<CalendarSyncSettings>) : {};
    return { enabled: v.enabled === true, calendarId: typeof v.calendarId === 'string' ? v.calendarId : undefined, lastSynced: typeof v.lastSynced === 'string' ? v.lastSynced : undefined };
  } catch {
    return { enabled: false };
  }
}

export async function saveCalendarSync(s: CalendarSyncSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

async function loadMap(): Promise<CalendarMap | null> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    const v = raw ? (JSON.parse(raw) as CalendarMap) : null;
    return v && typeof v.calendarId === 'string' && v.events && typeof v.events === 'object' ? v : null;
  } catch {
    return null;
  }
}

class CalendarPermissionError extends Error {}

async function ensurePermission(): Promise<void> {
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return;
  if (!current.canAskAgain) throw new CalendarPermissionError('Ava CRM is not allowed to use your calendar. Turn on calendar access for Ava CRM in your phone’s settings.');
  const asked = await Calendar.requestCalendarPermissions();
  if (!asked.granted) throw new CalendarPermissionError('Calendar access was not allowed, so visits cannot be added.');
}

/** Calendars on this phone that Ava can add events to, the main one first. Asks for calendar access. */
export async function listWritableCalendars(): Promise<WritableCalendar[]> {
  await ensurePermission();
  const all = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return all
    .filter((c) => c.allowsModifications)
    .map((c) => ({ id: c.id, title: c.title || 'Calendar', account: c.source?.name || c.ownerAccount || '', isPrimary: !!c.isPrimary }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.account.localeCompare(b.account) || a.title.localeCompare(b.title));
}

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const fingerprint = (it: CalendarItem) => JSON.stringify([it.title, it.start.getTime(), it.end.getTime(), it.location ?? '', it.notes ?? '']);

const details = (it: CalendarItem) => ({
  title: it.title,
  startDate: it.start,
  endDate: it.end,
  location: it.location ?? '',
  notes: it.notes ?? '',
  timeZone: timeZone(),
});

async function deleteEvent(id: string): Promise<void> {
  try {
    const ev = await Calendar.ExpoCalendarEvent.get(id);
    await ev.delete();
  } catch {
    // Already gone (the person deleted it, or the calendar was removed).
  }
}

/**
 * Makes the chosen calendar match `items`: adds new visits and events, updates changed ones and
 * removes those no longer planned. Only events Ava created (kept in `ava:calendar-map`) are touched.
 */
export function syncCalendar(calendarId: string, items: CalendarItem[]): Promise<CalendarSyncResult> {
  // One run at a time (the settings card and the background keeper can both ask), so no event is added twice.
  const run = queue.then(() => syncOnce(calendarId, items));
  queue = run.catch(() => undefined);
  return run;
}

let queue: Promise<unknown> = Promise.resolve();

async function syncOnce(calendarId: string, items: CalendarItem[]): Promise<CalendarSyncResult> {
  await ensurePermission();
  const result: CalendarSyncResult = { created: 0, updated: 0, deleted: 0 };
  let map = await loadMap();
  // Moved to another calendar: take Ava's events out of the old one first.
  if (map && map.calendarId !== calendarId) {
    for (const e of Object.values(map.events)) await deleteEvent(e.id);
    map = null;
  }
  const events: CalendarMap['events'] = { ...(map?.events ?? {}) };
  const save = () => AsyncStorage.setItem(MAP_KEY, JSON.stringify({ calendarId, events } satisfies CalendarMap));
  let calendar: Calendar.ExpoCalendar | undefined;
  const target = async () => (calendar ??= await Calendar.ExpoCalendar.get(calendarId));

  try {
    const want = new Map(items.map((it) => [it.key, it]));
    for (const [key, e] of Object.entries(events)) {
      if (want.has(key)) continue;
      await deleteEvent(e.id);
      delete events[key];
      result.deleted++;
    }
    for (const it of items) {
      const hash = fingerprint(it);
      const known = events[it.key];
      if (known?.hash === hash) continue;
      if (known) {
        try {
          const ev = await Calendar.ExpoCalendarEvent.get(known.id);
          await ev.update(details(it));
          events[it.key] = { id: known.id, hash };
          result.updated++;
          continue;
        } catch {
          // The person deleted it from their calendar: add it again below.
        }
      }
      const ev = await (await target()).createEvent(details(it));
      events[it.key] = { id: ev.id, hash };
      result.created++;
    }
  } finally {
    // Keep what was done even when one event failed, so the next sync does not add copies.
    await save();
  }
  return result;
}

/** Removes every event Ava added and forgets them. */
export async function stopCalendarSync(): Promise<void> {
  const map = await loadMap();
  if (map) {
    try {
      const perm = await Calendar.getCalendarPermissions();
      if (perm.granted) for (const e of Object.values(map.events)) await deleteEvent(e.id);
    } catch {
      // Nothing more to do without calendar access.
    }
  }
  await AsyncStorage.removeItem(MAP_KEY);
}

/** A calendar file to import into Outlook or Google Calendar, shared from the phone. */
export async function downloadIcs(items: CalendarItem[]): Promise<void> {
  await saveTextFile('ava-crm-visits.ics', buildIcs(items), 'text/calendar');
}
