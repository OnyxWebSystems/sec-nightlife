import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVenueTableBookableToday,
  scheduleEntryForWeekday,
  weekdayKeyFromDate,
} from './serviceSchedule.js';

describe('weekdayKeyFromDate (SAST)', () => {
  it('returns monday for Monday 02:07 SAST even when UTC is still Sunday', () => {
    const mondayEarlySast = new Date('2026-07-06T00:07:00+02:00');
    assert.equal(weekdayKeyFromDate(mondayEarlySast), 'monday');
  });

  it('returns sunday for Sunday 23:30 SAST', () => {
    const sundayLateSast = new Date('2026-07-05T23:30:00+02:00');
    assert.equal(weekdayKeyFromDate(sundayLateSast), 'sunday');
  });
});

describe('isVenueTableBookableToday', () => {
  const veldtVineTable = {
    serviceSchedule: [
      { day: 'monday', startTime: '00:00', endTime: '21:00' },
      { day: 'tuesday', startTime: '12:00', endTime: '23:00' },
    ],
  };

  it('includes Monday-only schedule on Monday morning SAST', () => {
    const mondayEarlySast = new Date('2026-07-06T02:07:00+02:00');
    assert.equal(isVenueTableBookableToday(veldtVineTable, mondayEarlySast), true);
    const entry = scheduleEntryForWeekday(veldtVineTable, weekdayKeyFromDate(mondayEarlySast));
    assert.equal(entry?.day, 'monday');
    assert.equal(entry?.startTime, '00:00');
    assert.equal(entry?.endTime, '21:00');
  });

  it('excludes Monday-only schedule on Sunday night SAST', () => {
    const sundayLateSast = new Date('2026-07-05T23:30:00+02:00');
    assert.equal(isVenueTableBookableToday(veldtVineTable, sundayLateSast), false);
  });
});
