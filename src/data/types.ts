export type Role = 'Rep' | 'FLM' | 'SLM' | 'Admin';
export const ROLES: Role[] = ['Rep', 'FLM', 'SLM', 'Admin'];
export const ROLE_LABEL: Record<Role, string> = {
  Rep: 'Sales rep',
  FLM: 'First-line manager',
  SLM: 'Second-line manager',
  Admin: 'Administrator',
};

/** A person who signs in. Reps report to an FLM, FLMs to an SLM. */
export interface User {
  id: string;
  name: string;
  email: string;
  /** The person's line role. A Rep, FLM or SLM can also be an administrator (`admin`). */
  role: Role;
  /** Also has administrator rights (dual role), e.g. an SLM who runs the company's setup. */
  admin?: boolean;
  /** The company's own ID for this person, e.g. an employee number. Unique when set. */
  employeeId?: string;
  managerId?: string;
  /** Rep: territory name. FLM: team/district. SLM: region. */
  territory?: string;
  /** The company's code for the territory, team or region, e.g. "LAG-IKJ-01". */
  territoryId?: string;
  /** Profile picture: a small square JPEG data URI. */
  photo?: string;
  active: boolean;
  createdAt: string;
  /** Set when an administrator deleted the person. They are hidden everywhere and cannot sign in; submitted calls keep their name. */
  deletedAt?: string;
  /** Set when the person deleted their own account in the app (2.4). They are inactive until an administrator reassigns their work and deletes or restores them. */
  leftAt?: string;
}

export type AccountType = 'HCP' | 'HCO';
/** A tier name from the account owner's team scheme, e.g. "ST" or "T1". */
export type Tier = string;

/** One level in a team's tiering scheme. */
export interface TierDef {
  name: string;
  /** Default calls per cycle for accounts in this tier, used to suggest a plan. */
  frequency: number;
}

export const DEFAULT_TIERS: TierDef[] = [
  { name: 'ST', frequency: 8 },
  { name: 'T1', frequency: 6 },
  { name: 'T2', frequency: 4 },
  { name: 'T3', frequency: 2 },
];

/** A healthcare professional (doctor, pharmacist) or organization (hospital, clinic, pharmacy). */
export interface Account {
  id: string;
  type: AccountType;
  name: string;
  /** HCP: medical specialty. HCO: organization kind, e.g. "Teaching hospital". */
  specialty: string;
  /** HCP only: the HCO they mainly practise at. */
  affiliation?: string;
  tier: Tier;
  address: string;
  city: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** The rep whose territory this account belongs to. */
  ownerId: string;
  /** Account location, used to verify call check-ins. */
  lat?: number;
  lng?: number;
  createdAt: string;
  /** Set when an administrator deleted the account. It is hidden everywhere; submitted calls keep its name. */
  deletedAt?: string;
  // ----- profiling (2.5); a change that leaves these out keeps the current values -----
  /** Key opinion leader: influences other prescribers, so is seen more often. */
  kol?: boolean;
  /** Prescribing potential. */
  potential?: Potential;
  /** The company's own segment name, e.g. "Early adopter" or "Hospital decision maker". */
  segment?: string;
}

export type Potential = 'High' | 'Medium' | 'Low';
export const POTENTIALS: Potential[] = ['High', 'Medium', 'Low'];

export type CallChannel = 'In person' | 'Phone' | 'Video' | 'Email' | 'WhatsApp';
export type CallStatus = 'Planned' | 'Saved' | 'Submitted';
export const CHANNELS: CallChannel[] = ['In person', 'Phone', 'Video', 'Email', 'WhatsApp'];

export interface ProductDetail {
  product: string;
  /** 1 = first product presented in the call. */
  priority: number;
}

/** Where the device was when the rep checked in to a call. */
export interface GeoTag {
  lat: number;
  lng: number;
  /** Reported accuracy radius in metres. */
  accuracy?: number;
  at: string;
  /** Distance to the account's location at check-in, when the account has one. */
  distanceM?: number;
}

export interface Call {
  id: string;
  accountId: string;
  /** The rep who owns the call. */
  ownerId: string;
  /** ISO date-time of the visit. */
  datetime: string;
  channel: CallChannel;
  status: CallStatus;
  products: ProductDetail[];
  keyMessages: string[];
  attendees?: string;
  notes?: string;
  nextStep?: string;
  /** ISO date (YYYY-MM-DD) of the planned follow-up, if any. */
  followUpDate?: string;
  checkIn?: GeoTag;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  /** Samples handed over in the call (2.5). */
  samples?: SampleGiven[];
  /** A manager who joined the call to coach the rep (2.5). */
  coachId?: string;
  /** The manager's scorecard for a coached call; set with call.coach only. */
  coaching?: Coaching;
}

export interface SampleGiven {
  product: string;
  qty: number;
  batch?: string;
}

/** Skills a manager scores on a coached call, 1 (needs work) to 5 (excellent). */
export const COACHING_SKILLS = ['Opening', 'Needs discovery', 'Product knowledge', 'Objection handling', 'Closing', 'Compliance'] as const;
export type CoachingSkill = (typeof COACHING_SKILLS)[number];

export interface Coaching {
  by: string;
  at: string;
  scores: Partial<Record<CoachingSkill, number>>;
  strengths?: string;
  improve?: string;
}

// ----- leave (2.5) -----

export type LeaveKind = 'Annual' | 'Sick' | 'Training' | 'Conference' | 'Other';
export const LEAVE_KINDS: LeaveKind[] = ['Annual', 'Sick', 'Training', 'Conference', 'Other'];
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

/** Time out of the field. Approved leave lowers how many calls the person is expected to have made by now. */
export interface Leave {
  id: string;
  userId: string;
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
  kind: LeaveKind;
  note?: string;
  status: LeaveStatus;
  reviewerId?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
}

// ----- tasks (2.5) -----

/** A to-do with a due date, often the follow-up from a call. Reminders are scheduled on the owner's devices. */
export interface Task {
  id: string;
  ownerId: string;
  title: string;
  /** YYYY-MM-DD. */
  due: string;
  /** HH:MM local time for the reminder; absent means no reminder. */
  remindAt?: string;
  accountId?: string;
  callId?: string;
  /** A manager who set the task for the person. */
  assignedBy?: string;
  doneAt?: string;
  createdAt: string;
}

// ----- samples (2.5) -----

/** Samples a manager hands to a rep (positive) or takes back or writes off (negative). */
export interface SampleIssue {
  id: string;
  repId: string;
  product: string;
  qty: number;
  batch?: string;
  note?: string;
  byId: string;
  at: string;
}

/** A planning period, e.g. an 8-week promotional cycle. Dates are YYYY-MM-DD, inclusive. */
export interface Cycle {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface PlanTarget {
  accountId: string;
  /** Calls the rep commits to for this account during the cycle. */
  planned: number;
}

export type PlanStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected';

/** A rep's cycle plan: which accounts to see and how often, approved by their manager. */
export interface CyclePlan {
  id: string;
  ownerId: string;
  cycleId: string;
  status: PlanStatus;
  targets: PlanTarget[];
  submittedAt?: string;
  reviewedAt?: string;
  reviewerId?: string;
  reviewNote?: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  keyMessages: string[];
  active: boolean;
  /** A web link to the product's approved brochure, for sharing with doctors (2.5). */
  brochureUrl?: string;
}

/** The company using Ava CRM, set up by its administrator. */
export interface Company {
  name: string;
  /** Logo as a small data URI (PNG or JPEG), shown at the top left of every page. */
  logo?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  /** Business or regulatory registration number. */
  registrationNo?: string;
}

export interface Settings {
  /** A check-in within this many metres of the account counts as verified. */
  geofenceM: number;
  /** In-person calls cannot be submitted without a check-in. */
  requireCheckIn: boolean;
  /** Company-wide tiering scheme. */
  tiers: TierDef[];
  /** Per-team schemes, keyed by the FLM's user id. Teams without one use `tiers`. */
  teamTiers: Record<string, TierDef[]>;
  /** AI features (dictation clean-up, plan suggestions, briefs, Ask Ava). Absent means on. */
  aiEnabled?: boolean;
  /** How long a planning cycle is, chosen by an administrator. Absent means quarterly. */
  cycleLength?: CycleLength;
  /** Report definitions saved by administrators and shared with the company (up to 50). */
  reports?: ReportDef[];
}

// ----- planning cycle length -----

/** Calendar quarters (q2026-4) or calendar months (m2026-10). */
export type CycleLength = 'quarter' | 'month';

// ----- reports -----

export type ReportDataset = 'calls' | 'accounts' | 'plans' | 'activity';
export const REPORT_DATASETS: ReportDataset[] = ['calls', 'accounts', 'plans', 'activity'];
export type ReportDatePreset = 'thisCycle' | 'lastCycle' | 'thisMonth' | 'lastMonth' | 'custom' | 'all';
export const REPORT_DATE_PRESETS: ReportDatePreset[] = ['thisCycle', 'lastCycle', 'thisMonth', 'lastMonth', 'custom', 'all'];
export type ReportGroupBy = 'none' | 'rep' | 'team' | 'account' | 'tier' | 'product' | 'week' | 'month';
export const REPORT_GROUPS: ReportGroupBy[] = ['none', 'rep', 'team', 'account', 'tier', 'product', 'week', 'month'];
export type ReportMetric = 'count' | 'plannedDone' | 'attainment' | 'reach' | 'geoVerified';
export const REPORT_METRICS: ReportMetric[] = ['count', 'plannedDone', 'attainment', 'reach', 'geoVerified'];
export type ReportGeo = 'Verified' | 'Off-site' | 'Unverified' | 'Missing' | 'Remote';

export interface ReportFilters {
  date?: ReportDatePreset;
  /** YYYY-MM-DD, inclusive, for `custom`. */
  from?: string;
  to?: string;
  /** The FLM whose team to include. */
  teamId?: string;
  repId?: string;
  product?: string;
  /** Call status (calls) or plan status (plans). */
  status?: string;
  tier?: string;
  channel?: CallChannel;
  geo?: ReportGeo;
  /** Accounts: only those without a submitted call in this many days. */
  notVisitedDays?: number;
}

/** A saved report: what to show, filtered, grouped and sorted. */
export interface ReportDef {
  id: string;
  name: string;
  dataset: ReportDataset;
  /** Column keys of the dataset, for ungrouped reports. */
  columns: string[];
  filters: ReportFilters;
  groupBy: ReportGroupBy;
  metrics: ReportMetric[];
  sort?: { key: string; dir: 'asc' | 'desc' };
  createdBy?: string;
  updatedAt?: string;
}

export interface Snapshot {
  company: Company;
  users: User[];
  accounts: Account[];
  calls: Call[];
  plans: CyclePlan[];
  cycles: Cycle[];
  products: Product[];
  settings: Settings;
  // 2.5; absent in data saved by older versions.
  leaves?: Leave[];
  tasks?: Task[];
  samples?: SampleIssue[];
}

export const DEFAULT_SETTINGS: Settings = {
  geofenceM: 300,
  requireCheckIn: false,
  tiers: DEFAULT_TIERS,
  teamTiers: {},
  cycleLength: 'quarter',
  reports: [],
};

export const emptySnapshot = (company: Company = { name: '' }): Snapshot => ({
  company,
  users: [],
  accounts: [],
  calls: [],
  plans: [],
  cycles: [],
  products: [],
  settings: DEFAULT_SETTINGS,
  leaves: [],
  tasks: [],
  samples: [],
});
