import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTimelineSegments, selectTimelineTicks } from './dayBookingSlotUtils.js';

describe('selectTimelineTicks', () => {
  const venueWindow = { startTime: '00:00', endTime: '21:00' };
  const mondayMorning = new Date('2026-07-06T03:00:00+02:00');

  it('returns 5 unique mobile ticks for a 21-hour window', () => {
    const { ticks, total } = buildTimelineSegments(venueWindow, [], null, '20:00', mondayMorning);
    const mobile = selectTimelineTicks(ticks, { isMobile: true, totalMinutes: total });
    assert.equal(mobile.length, 5);
    const times = mobile.map((t) => t.time);
    assert.equal(new Set(times).size, 5);
    assert.equal(times[0], '00:00');
    assert.equal(times[times.length - 1], '20:00');
  });

  it('returns all ticks on desktop for short windows', () => {
    const shortWindow = { startTime: '19:00', endTime: '23:00' };
    const { ticks, total } = buildTimelineSegments(shortWindow, [], null, '22:00', mondayMorning);
    const desktop = selectTimelineTicks(ticks, { isMobile: false, totalMinutes: total });
    assert.ok(desktop.length >= ticks.length - 1);
  });
});
