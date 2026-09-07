import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalOrderReference,
  inferOrderKind,
  isServeableOrder,
  normalizeGuestSearch,
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
