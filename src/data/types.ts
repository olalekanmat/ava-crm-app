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
}

export type CallChannel = 'In person' | 'Phone' | 'Video' | 'Email';
export type CallStatus = 'Planned' | 'Saved' | 'Submitted';
export const CHANNELS: CallChannel[] = ['In person', 'Phone', 'Video', 'Email'];

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
}

export const DEFAULT_SETTINGS: Settings = {
  geofenceM: 300,
  requireCheckIn: false,
  tiers: DEFAULT_TIERS,
  teamTiers: {},
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
});
