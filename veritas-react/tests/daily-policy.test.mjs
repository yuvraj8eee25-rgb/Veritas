import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utcDay, nextUtcReset, dailyRewardAvailable, completedDailyDate } from '../src/lib/daily-policy.ts';
test('the daily boundary is UTC regardless of the device timezone', () => {
  const timestamp = Date.parse('2026-11-25T02:00:00+05:30');
  assert.equal(utcDay(timestamp), '2026-11-24');
  assert.equal(new Date(nextUtcReset(timestamp)).toISOString(), '2026-11-25T00:00:00.000Z');
});
test('a late completion belongs to its starting day and cannot overwrite a newer completion', () => {
  assert.equal(completedDailyDate(null, '2026-11-24'), '2026-11-24');
  assert.equal(completedDailyDate('2026-11-25', '2026-11-24'), '2026-11-25');
  assert.equal(dailyRewardAvailable('2026-11-24', '2026-11-24'), false);
  assert.equal(dailyRewardAvailable('2026-11-25', '2026-11-24'), false);
  assert.equal(dailyRewardAvailable('2026-11-24', '2026-11-25'), true);
});
