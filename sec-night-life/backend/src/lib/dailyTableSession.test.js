import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bumpDailySessionNumber,
  resolveDailySessionNumber,
  stampDailySessionOnHost,
} from './dailyTableSession.js';

const monday = new Date('2026-07-06T10:00:00+02:00');
const tuesday = new Date('2026-07-07T10:00:00+02:00');

describe('resolveDailySessionNumber', () => {
  it('returns 1 when session date is from a previous day', () => {
    const vt = { tableSessionNumber: 5, tableSessionDate: new Date('2026-07-05T00:00:00+02:00') };
    assert.equal(resolveDailySessionNumber(vt, monday), 1);
  });

  it('returns stored number when session date is today', () => {
    const vt = { tableSessionNumber: 3, tableSessionDate: new Date('2026-07-06T00:00:00+02:00') };
    assert.equal(resolveDailySessionNumber(vt, monday), 3);
  });
});

describe('bumpDailySessionNumber', () => {
  it('starts at session 2 on first bump of a new day', () => {
    const vt = { tableSessionNumber: 5, tableSessionDate: new Date('2026-07-05T00:00:00+02:00') };
    const bumped = bumpDailySessionNumber(vt, monday);
    assert.equal(bumped.tableSessionNumber, 2);
  });

  it('increments within the same SAST day', () => {
    const vt = { tableSessionNumber: 3, tableSessionDate: new Date('2026-07-06T00:00:00+02:00') };
    const bumped = bumpDailySessionNumber(vt, monday);
    assert.equal(bumped.tableSessionNumber, 4);
  });
});

describe('stampDailySessionOnHost', () => {
  it('does not bump on host start', () => {
    const vt = { tableSessionNumber: 5, tableSessionDate: new Date('2026-07-05T00:00:00+02:00') };
    const stamped = stampDailySessionOnHost(vt, tuesday);
    assert.equal(stamped.tableSessionNumber, 1);
    assert.ok(stamped.tableSessionDate);
  });
});
