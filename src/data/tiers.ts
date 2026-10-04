import type { Settings, TierDef, User } from './types';

/** The FLM whose team a user belongs to (the FLM themselves, or a rep's manager). */
export function teamOf(users: User[], userId: string): string | undefined {
  const u = users.find((x) => x.id === userId);
  if (!u) return undefined;
  if (u.role === 'FLM') return u.id;
  if (u.role === 'Rep') return u.managerId;
  return undefined;
}

/** The tiering scheme that applies to accounts owned by `ownerId`. */
export function tiersFor(settings: Settings, users: User[], ownerId: string | undefined): TierDef[] {
  const team = ownerId ? teamOf(users, ownerId) : undefined;
  return (team && settings.teamTiers[team]) || settings.tiers;
}

/** Every tier name in use across the company, in scheme order, for filters and reports. */
export function allTierNames(settings: Settings): string[] {
  const out: string[] = [];
  for (const scheme of [settings.tiers, ...Object.values(settings.teamTiers)]) {
    for (const t of scheme) if (!out.includes(t.name)) out.push(t.name);
  }
  return out;
}

export function tierFrequency(scheme: TierDef[], tier: string): number {
  return scheme.find((t) => t.name === tier)?.frequency ?? 0;
}

/** Position of a tier in its scheme (0 = top tier), used for colour and sorting; unknown tiers sort last. */
export function tierRank(scheme: TierDef[], tier: string): number {
  const i = scheme.findIndex((t) => t.name === tier);
  return i < 0 ? scheme.length : i;
}

/** Checks a scheme an admin entered. Returns an error message or undefined. */
export function tierSchemeProblem(scheme: TierDef[]): string | undefined {
  if (scheme.length < 1 || scheme.length > 8) return 'Use between 1 and 8 tiers.';
  const seen = new Set<string>();
  for (const t of scheme) {
    const name = t.name.trim();
    if (!/^[\p{L}\p{N} +_-]{1,12}$/u.test(name)) return `"${t.name}" is not a valid tier name (up to 12 letters or digits).`;
    if (seen.has(name.toLowerCase())) return `Tier "${name}" is listed twice.`;
    seen.add(name.toLowerCase());
    if (!Number.isInteger(t.frequency) || t.frequency < 0 || t.frequency > 50) return `Calls per cycle for ${name} must be 0 to 50.`;
  }
  return undefined;
}

/** Rank of a tier name in the first scheme that has it (company default first). */
export function tierRankIn(settings: Settings, tier: string): number {
  for (const scheme of [settings.tiers, ...Object.values(settings.teamTiers)]) {
    const i = scheme.findIndex((t) => t.name === tier);
    if (i >= 0) return i;
  }
  return 9;
}
