/**
 * When to show the store's own rating sheet (2.11.2). Only after a good moment (a submitted call or
 * an approved plan), never before 5 of them on this device, and at most once every 120 days.
 * The stores add their own limits on top and may show nothing.
 */
export interface ReviewState {
  wins: number;
  askedAt?: string;
}

export const REVIEW_MIN_WINS = 5;
export const REVIEW_GAP_DAYS = 120;

export function shouldAskForReview(s: ReviewState, now: Date): boolean {
  if (s.wins < REVIEW_MIN_WINS) return false;
  if (!s.askedAt) return true;
  const last = Date.parse(s.askedAt);
  return !Number.isFinite(last) || now.getTime() - last >= REVIEW_GAP_DAYS * 86_400_000;
}
