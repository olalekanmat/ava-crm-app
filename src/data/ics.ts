import type { CalendarItem } from './calendarItems';

/** Escapes TEXT values (RFC 5545 §3.3.11): backslash, semicolon, comma and line breaks. */
export function icsEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** UTC date-time in the basic format, e.g. 20261012T080000Z. */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Folds a content line at 75 octets (RFC 5545 §3.1), never splitting a character. */
export function icsFold(line: string): string {
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0)!;
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    // The first line holds 75 octets; continuation lines start with a space, so they hold 74 more.
    if (bytes + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/**
 * A calendar file (RFC 5545) with one event per item, for importing into Outlook or Google
 * Calendar. Times are UTC; each event's UID comes from its key, so importing a newer file
 * updates the same events instead of adding copies.
 */
export function buildIcs(items: CalendarItem[], now = new Date(), name = 'Ava CRM visits'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ava Healthcare//Ava CRM//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(name)}`];
  for (const it of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.key.replace(/[^A-Za-z0-9_.:-]/g, '-')}@ava-crm`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(it.start)}`,
      `DTEND:${icsDate(it.end)}`,
      `SUMMARY:${icsEscape(it.title)}`,
    );
    if (it.location) lines.push(`LOCATION:${icsEscape(it.location)}`);
    if (it.notes) lines.push(`DESCRIPTION:${icsEscape(it.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
