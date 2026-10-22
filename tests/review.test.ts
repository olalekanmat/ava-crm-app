import assert from 'node:assert/strict';
import { test } from 'node:test';
import { feedbackMail, REVIEW_GAP_DAYS, REVIEW_MIN_WINS, shouldAskForReview } from '../src/data/reviewPrompt';

const now = new Date('2026-10-22T09:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

test('review prompt waits for enough good moments', () => {
  assert.equal(shouldAskForReview({ wins: REVIEW_MIN_WINS - 1 }, now), false);
  assert.equal(shouldAskForReview({ wins: REVIEW_MIN_WINS }, now), true);
});

test('review prompt is not shown again too soon', () => {
  assert.equal(shouldAskForReview({ wins: 50, askedAt: daysAgo(REVIEW_GAP_DAYS - 1) }, now), false);
  assert.equal(shouldAskForReview({ wins: 50, askedAt: daysAgo(REVIEW_GAP_DAYS) }, now), true);
  assert.equal(shouldAskForReview({ wins: 50, askedAt: 'garbage' }, now), true);
});

test('feedback email carries the version and platform', () => {
  const url = feedbackMail('2.11.2', 'android');
  assert.ok(url.startsWith('mailto:hello@avahealthcareltd.com?subject='));
  assert.ok(decodeURIComponent(url).includes('Ava CRM feedback (2.11.2, android)'));
});
