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

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.avacrm.app&showAllReviews=true';
export const FEEDBACK_EMAIL = 'hello@avahealthcareltd.com';

/** A mailto link for "Send feedback", with the version and platform filled in so replies can help. */
export function feedbackMail(version: string, platform: string): string {
  const subject = `Ava CRM feedback (${version}, ${platform})`;
  const body = 'Tell us what you like, what is missing or what went wrong:\n\n';
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
