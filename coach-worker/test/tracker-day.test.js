import { test } from "node:test";
import assert from "node:assert/strict";
import { trackerDayDate, previousLocalDate } from "../src/reminders.js";

const CUT = 4;            // 4 AM cutoff -> 240 minutes
const CLOCK = "2026-06-23";   // the actual calendar date the clock shows

// The spec's boundary table (minutes-of-day for the actual clock):
test("11:59 PM -> tracker date is the current date", () => {
  assert.equal(trackerDayDate(CLOCK, 23 * 60 + 59, CUT), "2026-06-23");
});
test("12:01 AM -> tracker date is still the previous date", () => {
  assert.equal(trackerDayDate(CLOCK, 1, CUT), "2026-06-22");
});
test("2:00 AM -> tracker date is still the previous date", () => {
  assert.equal(trackerDayDate(CLOCK, 2 * 60, CUT), "2026-06-22");
});
test("3:59 AM -> tracker date is still the previous date", () => {
  assert.equal(trackerDayDate(CLOCK, 3 * 60 + 59, CUT), "2026-06-22");
});
test("4:00 AM -> tracker date becomes the current date", () => {
  assert.equal(trackerDayDate(CLOCK, 4 * 60, CUT), "2026-06-23");
});

test("previousLocalDate handles month/year boundaries", () => {
  assert.equal(previousLocalDate("2026-06-23"), "2026-06-22");
  assert.equal(previousLocalDate("2026-03-01"), "2026-02-28");   // non-leap
  assert.equal(previousLocalDate("2026-01-01"), "2025-12-31");   // year rollover
  assert.equal(previousLocalDate("2024-03-01"), "2024-02-29");   // leap year
});
