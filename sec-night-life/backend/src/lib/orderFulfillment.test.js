import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalOrderReference,
  hydrateMenuLines,
  inferOrderKind,
  isServeableOrder,
  mergeMenuLineSources,
  normalizeGuestSearch,
  orderMatchesListFilters,
  parseMenuItemLines,
} from './orderFulfillment.js';
import { ticketTierAllowsMenuAddons as checkoutTierAllows } from './ticketCheckout.js';

describe('order fulfillment helpers', () => {
  it('strips ticket quantity suffixes and payout component suffixes', () => {
    assert.equal(canonicalOrderReference('abc123-2'), 'abc123');
    assert.equal(canonicalOrderReference('abc123:menu'), 'abc123');
  });

  it('treats prepaid menu lines and min spend as serveable', () => {
    assert.equal(isServeableOrder({ menuItems: [{ quantity: 1, name: 'Beer' }] }), true);
    assert.equal(isServeableOrder({ menuZar: 80 }), true);
    assert.equal(isServeableOrder({ settlementMode: 'PREPAY_LUMP', minimumSpendZar: 500 }), true);
    assert.equal(isServeableOrder({ settlementMode: 'PAY_ON_ARRIVAL' }), false);
  });

  it('parses menu snapshots with mixed key names', () => {
    const lines = parseMenuItemLines([{ name: 'Gin', qty: 2, unitPrice: 50 }]);
    assert.equal(lines[0].quantity, 2);
    assert.equal(lines[0].lineTotal, 100);
  });

  it('parses JSON strings and id-only Paystack snapshots', () => {
    const fromJson = parseMenuItemLines('[{"menuItemId":"m1","quantity":3}]');
    assert.equal(fromJson[0].menuItemId, 'm1');
    assert.equal(fromJson[0].quantity, 3);
    assert.equal(fromJson[0].name, '');
    const fromSnake = parseMenuItemLines([{ menu_item_id: 'm2', quantity: 1 }]);
    assert.equal(fromSnake[0].menuItemId, 'm2');
  });

  it('merges unnamed id lines with named snapshots', () => {
    const merged = mergeMenuLineSources(
      [{ menuItemId: 'm1', quantity: 1 }],
      [{ menuItemId: 'm1', quantity: 1, name: 'Beef Burger', unitPrice: 120 }],
    );
    assert.equal(merged[0].name, 'Beef Burger');
    assert.equal(merged[0].lineTotal, 120);
  });

  it('hydrates id-only menu lines from the venue catalog', async () => {
    const db = {
      venueMenuItem: {
        findMany: async () => [{ id: 'm1', name: 'Corona Extra', price: 70, venueId: 'v1' }],
      },
    };
    const lines = parseMenuItemLines([{ menuItemId: 'm1', quantity: 2 }]);
    const hydrated = await hydrateMenuLines(db, lines, 'v1');
    assert.equal(hydrated[0].name, 'Corona Extra');
    assert.equal(hydrated[0].lineTotal, 140);
  });

  it('filters orders by date, event, and day booking source', () => {
    const day = {
      source: 'day',
      eventId: null,
      bookingDate: '2026-09-07',
      createdAt: '2026-09-07T18:00:00+02:00',
    };
    const eventOrder = {
      source: 'event_table',
      eventId: 'evt-1',
      eventDate: '2026-09-08',
    };
    assert.equal(orderMatchesListFilters(day, { source: 'day' }), true);
    assert.equal(orderMatchesListFilters(eventOrder, { source: 'day' }), false);
    assert.equal(orderMatchesListFilters(eventOrder, { eventId: 'evt-1' }), true);
    assert.equal(orderMatchesListFilters(eventOrder, { eventId: 'evt-2' }), false);
    assert.equal(orderMatchesListFilters(day, { dateYmd: '2026-09-07' }), true);
    assert.equal(orderMatchesListFilters(eventOrder, { dateYmd: '2026-09-08' }), true);
  });

  it('infers ticket vs min-spend kinds', () => {
    assert.equal(inferOrderKind({ paymentType: 'ticket', menuZar: 20 }), 'TICKET_MENU');
    assert.equal(inferOrderKind({ ticketKind: 'EVENT_ENTRANCE', menuZar: 10 }), 'ENTRANCE_MENU');
    assert.equal(inferOrderKind({ settlementMode: 'PREPAY_LUMP' }), 'MIN_SPEND');
  });

  it('normalizes @username search', () => {
    assert.equal(normalizeGuestSearch('@Chika'), 'chika');
  });
});

describe('ticket tier menu add-ons', () => {
  it('requires the selected tier when the flag is set per tier', () => {
    assert.equal(checkoutTierAllows({ allows_menu_addons: true }), true);
    assert.equal(checkoutTierAllows({ allows_menu_addons: false }, { allowsTicketMenuAddons: true }), false);
    assert.equal(checkoutTierAllows({}, { allowsTicketMenuAddons: true }), true);
  });
});
