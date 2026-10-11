import type { Call, CallObjective, Settings } from './types';
import { DEFAULT_OBJECTIVES } from './types';

/** The objectives reps can pick from: the company's own list, or the defaults. */
export const objectiveChoices = (settings: Pick<Settings, 'objectives'>): string[] => (settings.objectives?.length ? settings.objectives : DEFAULT_OBJECTIVES);

/** Objectives tidied for saving: trimmed, no blanks or repeats, at most five. A planned call carries no results. */
export function cleanObjectives(list: CallObjective[], planned: boolean): CallObjective[] | undefined {
  const seen = new Set<string>();
  const out: CallObjective[] = [];
  for (const o of list) {
    const text = o.text.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(planned || o.achieved === undefined ? { text } : { text, achieved: o.achieved });
  }
  return out.length ? out.slice(0, 5) : undefined;
}

export interface ObjectiveStats {
  /** Objectives on submitted calls. */
  set: number;
  achieved: number;
  /** Marked as not achieved. */
  missed: number;
  /** achieved / (achieved + missed), 0..1; undefined when none were marked. */
  rate?: number;
  /** Submitted calls with at least one objective, as a share of submitted calls. */
  callsWithObjectives: number;
}

export function objectiveStats(calls: Call[]): ObjectiveStats {
  let set = 0;
  let achieved = 0;
  let missed = 0;
  let withObj = 0;
  let submitted = 0;
  for (const c of calls) {
    if (c.status !== 'Submitted') continue;
    submitted++;
    if (c.objectives?.length) withObj++;
    for (const o of c.objectives ?? []) {
      set++;
      if (o.achieved === true) achieved++;
      if (o.achieved === false) missed++;
    }
  }
  return { set, achieved, missed, rate: achieved + missed ? achieved / (achieved + missed) : undefined, callsWithObjectives: submitted ? withObj / submitted : 0 };
}

/** Objectives the last recorded visit to an account did not achieve: what to work on next time. */
export function openObjectives(accountCalls: Call[]): { text: string; from: Call }[] {
  const last = accountCalls.filter((c) => c.status === 'Submitted').sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
  return (last?.objectives ?? []).filter((o) => o.achieved === false).map((o) => ({ text: o.text, from: last }));
}
