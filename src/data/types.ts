export type AccountType = 'HCP' | 'HCO';
export type Tier = 'A' | 'B' | 'C';

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
  createdAt: string;
}

export type CallChannel = 'In person' | 'Phone' | 'Video' | 'Email';
export type CallStatus = 'Planned' | 'Saved' | 'Submitted';

export interface ProductDetail {
  product: string;
  /** 1 = first product presented in the call. */
  priority: number;
}

export interface Call {
  id: string;
  accountId: string;
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
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export const CHANNELS: CallChannel[] = ['In person', 'Phone', 'Video', 'Email'];

/** Product catalogue. In production this comes from the back office, per territory. */
export const PRODUCTS = ['Cardiovex', 'Glucara XR', 'Respira Inhaler', 'Neurolin'] as const;

export const KEY_MESSAGES: Record<string, string[]> = {
  Cardiovex: ['Efficacy vs. standard of care', 'Once-daily dosing', 'Safety profile'],
  'Glucara XR': ['HbA1c reduction', 'Weight-neutral', 'Patient support programme'],
  'Respira Inhaler': ['Inhaler technique', 'Exacerbation reduction', 'Formulary status'],
  Neurolin: ['Onset of action', 'Tolerability', 'New indication'],
};
