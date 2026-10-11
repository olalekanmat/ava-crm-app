import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CalendarItem } from '@/data/calendarItems';
import { buildIcs } from '@/data/ics';
import { saveTextFile } from './files';

/** Browsers cannot write to the person's calendar; the web app offers a calendar file instead. */
export const calendarSyncSupported = false;

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

export async function listWritableCalendars(): Promise<WritableCalendar[]> {
  return [];
}

export async function syncCalendar(_calendarId: string, _items: CalendarItem[]): Promise<CalendarSyncResult> {
  return { created: 0, updated: 0, deleted: 0 };
}

export async function stopCalendarSync(): Promise<void> {}

/** Downloads a calendar file (.ics) to import into Outlook or Google Calendar. */
export async function downloadIcs(items: CalendarItem[]): Promise<void> {
  await saveTextFile('ava-crm-visits.ics', buildIcs(items), 'text/calendar');
}
