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
  role: Role;
  managerId?: string;
  /** Rep: territory name. FLM: team/district. SLM: region. */
  territory?: string;
  active: boolean;
  createdAt: string;
}

export type AccountType = 'HCP' | 'HCO';
export type Tier = 'A' | 'B' | 'C';
export const TIERS: Tier[] = ['A', 'B', 'C'];

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

export interface Settings {
  companyName: string;
  /** A check-in within this many metres of the account counts as verified. */
  geofenceM: number;
  /** In-person calls cannot be submitted without a check-in. */
  requireCheckIn: boolean;
  /** Default calls per cycle by tier, used to suggest a plan. */
  tierFrequency: Record<Tier, number>;
}

export interface Snapshot {
  users: User[];
  accounts: Account[];
  calls: Call[];
  plans: CyclePlan[];
  cycles: Cycle[];
  products: Product[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  companyName: 'Ava Demo Pharma',
  geofenceM: 300,
  requireCheckIn: false,
  tierFrequency: { A: 6, B: 4, C: 2 },
};
