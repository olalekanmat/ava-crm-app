import type { CallStatus, ProductDetail } from './types';

export interface CallDraft {
  accountId?: string;
  when: Date | null;
  products: ProductDetail[];
}

/** Rules a call must pass before it can be saved with the given status. Returns field -> message. */
export function validateCall(d: CallDraft, status: CallStatus, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.accountId) errors.account = 'Choose an account.';
  if (!d.when) errors.when = 'Use date YYYY-MM-DD and time HH:MM.';
  if (status === 'Submitted') {
    if (d.when && d.when.getTime() > now.getTime()) errors.when = 'A future call cannot be submitted. Save it as planned.';
    if (d.products.length === 0) errors.products = 'Add at least one product discussed before submitting.';
  }
  if (status === 'Planned' && d.when && d.when.getTime() < now.getTime() - 24 * 3600 * 1000) {
    errors.when = 'Planned calls should be today or later.';
  }
  return errors;
}
