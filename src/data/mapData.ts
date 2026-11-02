import { lengthOfCycle, scaleFrequency } from './cycles';
import { approvedLeave, cycleElapsed, spanDays } from './metrics';
import { tierFrequency, tiersFor } from './tiers';
import type { Account, Cycle, Snapshot } from './types';

export interface VisitStatus {
  overdue: boolean;
  /** Why it is overdue, e.g. "1 of 4 planned calls, 2 expected by now". */
  reason?: string;
  lastVisit?: string;
}

/**
 * Which accounts are overdue (2.9, for the map): behind the pace of this cycle's plan, or, when the
 * account is not in a plan, not seen for longer than its tier's frequency allows (e.g. a tier with 6
 * calls a quarter is overdue after about 15 days without a visit).
 */
export function visitStatus(s: Snapshot, cycle: Cycle | undefined, now = new Date()): Map<string, VisitStatus> {
  const last = new Map<string, string>();
  for (const c of s.calls) if (c.status === 'Submitted' && (last.get(c.accountId) ?? '') < c.datetime) last.set(c.accountId, c.datetime);
  const out = new Map<string, VisitStatus>();
  if (!cycle) {
    for (const a of s.accounts) out.set(a.id, { overdue: false, lastVisit: last.get(a.id) });
    return out;
  }
  const done = new Map<string, number>();
  for (const c of s.calls) {
    if (c.status !== 'Submitted') continue;
    const d = c.datetime.slice(0, 10);
    if (d >= cycle.start && d <= cycle.end) done.set(c.accountId, (done.get(c.accountId) ?? 0) + 1);
  }
  const planned = new Map<string, { n: number; owner: string }>();
  for (const p of s.plans) if (p.cycleId === cycle.id && p.status !== 'Rejected') for (const t of p.targets) planned.set(t.accountId, { n: t.planned, owner: p.ownerId });
  const elapsedBy = new Map<string, number>();
  const elapsedFor = (owner: string) => {
    if (!elapsedBy.has(owner)) elapsedBy.set(owner, cycleElapsed(cycle, now, approvedLeave(s, owner)));
    return elapsedBy.get(owner)!;
  };
  const days = spanDays(cycle.start, cycle.end);
  const length = lengthOfCycle(cycle);
  for (const a of s.accounts) {
    const lastVisit = last.get(a.id);
    const target = planned.get(a.id);
    if (target) {
      const expected = Math.floor(target.n * elapsedFor(target.owner));
      const n = done.get(a.id) ?? 0;
      out.set(a.id, n < expected ? { overdue: true, reason: `${n} of ${target.n} planned calls, ${expected} expected by now`, lastVisit } : { overdue: false, lastVisit });
      continue;
    }
    const freq = scaleFrequency(tierFrequency(tiersFor(s.settings, s.users, a.ownerId), a.tier), length);
    if (freq <= 0) {
      out.set(a.id, { overdue: false, lastVisit });
      continue;
    }
    const gap = Math.ceil(days / freq);
    const since = lastVisit ? Math.floor((now.getTime() - Date.parse(lastVisit)) / 864e5) : undefined;
    out.set(a.id, since === undefined || since > gap ? { overdue: true, reason: since === undefined ? 'Never visited' : `Last visit ${since} days ago; tier ${a.tier} is about every ${gap} days`, lastVisit } : { overdue: false, lastVisit });
  }
  return out;
}

// ----- Web Mercator, for the map tiles -----
export const TILE = 256;
export function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const size = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size };
}
export function unproject(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const size = TILE * 2 ** zoom;
  const lng = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng };
}

/** The centre and the largest zoom (3 to 16) that shows every point in a `w` × `h` view. */
export function fitBounds(points: Pick<Account, 'lat' | 'lng'>[], w: number, h: number): { lat: number; lng: number; zoom: number } {
  const pts = points.filter((p): p is { lat: number; lng: number } => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (!pts.length) return { lat: 9.07, lng: 7.4, zoom: 5 }; // Nigeria
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const box = { n: Math.max(...lats), s: Math.min(...lats), e: Math.max(...lngs), w: Math.min(...lngs) };
  for (let z = 16; z >= 3; z--) {
    const a = project(box.n, box.w, z);
    const b = project(box.s, box.e, z);
    if (b.x - a.x <= w - 60 && b.y - a.y <= h - 60) {
      const c = unproject((a.x + b.x) / 2, (a.y + b.y) / 2, z);
      return { ...c, zoom: z };
    }
  }
  return { lat: (box.n + box.s) / 2, lng: (box.e + box.w) / 2, zoom: 3 };
}

/**
 * Where the map pictures come from (2.12.1). Set on the website in AvaCRM/app-config.json as "mapTiles2"
 * (2.12.2+; phones send the site as Referer, which keys limited to avahealthcareltd.com need) or "mapTiles".
 */
export interface TileSource {
  /** https URL with {z}, {x} and {y}, e.g. a provider's 256-pixel PNG tiles with its key in the query. */
  url: string;
  attribution: string;
  /** OpenStreetMap's own servers ask apps to say who they are (phones send a User-Agent). */
  osm: boolean;
}
export const OSM_TILES: TileSource = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', osm: true };

/** The tile source in the website's app settings, or OpenStreetMap when none is set or it looks wrong. */
export function parseTileSource(config: unknown): TileSource {
  const c = config as { mapTiles?: { url?: unknown; attribution?: unknown }; mapTiles2?: { url?: unknown; attribution?: unknown } } | null;
  const t = c?.mapTiles2 ?? c?.mapTiles;
  const url = typeof t?.url === 'string' ? t.url.trim() : '';
  if (!/^https:\/\/[^\s]+$/.test(url) || !['{z}', '{x}', '{y}'].every((k) => url.includes(k))) return OSM_TILES;
  const attribution = typeof t?.attribution === 'string' && t.attribution.trim() ? t.attribution.trim().slice(0, 120) : '© OpenStreetMap contributors';
  return { url, attribution, osm: /^https:\/\/tile\.openstreetmap\.org\//.test(url) };
}

export const tileAddress = (src: TileSource, z: number, x: number, y: number) =>
  src.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
