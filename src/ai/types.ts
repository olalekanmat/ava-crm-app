/**
 * Contracts for POST /api/ai/run on the Ava CRM server: body {task, input}, reply {result}.
 * The server holds the model key; the app never talks to a model directly.
 */

export interface CallNoteInput {
  transcript: string;
  accountName: string;
  products: { name: string; keyMessages: string[] }[];
  /** YYYY-MM-DD */
  today: string;
}
export interface CallNoteResult {
  notes: string;
  productsDiscussed: string[];
  keyMessages: { product: string; message: string }[];
  nextStep: string;
  followUpDate: string | null;
  attendees: string;
}

export interface ScheduleInput {
  transcript: string;
  today: string;
  /** HH:MM */
  now: string;
  weekdayToday: string;
  accounts: { id: string; name: string; city: string }[];
}
export interface ScheduleVisit {
  accountId: string;
  date: string;
  time: string;
  note: string;
}
export interface ScheduleResult {
  visits: ScheduleVisit[];
  unmatched: string[];
  message: string;
}

export interface PlanAccountInput {
  id: string;
  name: string;
  tier: string;
  specialty: string;
  type: string;
  callsLastCycle: number;
  lastCallDate: string | null;
  planned: number | null;
}
export interface PlanInput {
  cycle: { name: string; start: string; end: string };
  tiers: { name: string; callsPerCycle: number }[];
  /** Roughly how many calls the rep can make in the cycle. */
  capacity: number;
  accounts: PlanAccountInput[];
}
export interface PlanSuggestion {
  accountId: string;
  planned: number;
  reason: string;
}
export interface PlanResult {
  targets: PlanSuggestion[];
  summary: string;
}

export interface BriefInput {
  account: Record<string, unknown>;
  calls: Record<string, unknown>[];
  today: string;
}
export interface BriefResult {
  summary: string;
  talkingPoints: string[];
  watchOuts: string[];
}

export type AskActionType = 'open_account' | 'plan_visit' | 'open_report';
export interface AskAction {
  type: AskActionType;
  accountId?: string;
  label: string;
}
export interface AskInput {
  question: string;
  role: string;
  /** JSON summary of what the user may see, at most 60k characters. */
  context: string;
  today: string;
}
export interface AskResult {
  answer: string;
  actions: AskAction[];
}

export interface AiTasks {
  call_note: { input: CallNoteInput; result: CallNoteResult };
  schedule: { input: ScheduleInput; result: ScheduleResult };
  plan: { input: PlanInput; result: PlanResult };
  brief: { input: BriefInput; result: BriefResult };
  ask: { input: AskInput; result: AskResult };
}
export type AiTask = keyof AiTasks;
