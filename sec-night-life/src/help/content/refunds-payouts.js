import { HELP_FACTS as F } from '../facts';

export const refundsPartygoer = {
  id: 'refunds-partygoer',
  audience: 'partygoer',
  category: 'payments',
  title: 'How refunds work for party-goers',
  summary:
    'When you can request a refund, what gets paid back, and how venues process your request.',
  readMinutes: 6,
  keywords: ['refund', 'money back', 'tickets', 'table', 'cancel', 'eligible'],
  sections: [
    {
      type: 'p',
      text: `SEC does not pay refunds out of platform funds. When a refund is approved, the venue pays you directly (usually via your Sec Wallet details). SEC keeps the platform fee (${F.platformFeePercent}% on most bookings; ${F.ticketFeePercent}% on ticket tiers).`,
    },
    {
      type: 'image',
      src: '/help/diagrams/refund-flow.svg',
      alt: 'Diagram of refund money flow between guest, venue, and SEC',
      caption: 'Approved refunds: venue pays your share; SEC keeps the platform fee.',
    },
    {
      type: 'heading',
      text: 'What can be refunded',
    },
    {
      type: 'p',
      text: 'Eligible payments typically include table checkout (hosting a venue table), joining a venue table with a menu/prepaid portion, and event tickets (including ticket + menu add-ons when stored). For hosted tables, the menu/prepaid portion may be refundable — the joining fee itself is not.',
    },
    {
      type: 'warning',
      title: 'Never refundable',
      text: 'Host listing fees, feed boosts, promotions, house-party publish/boost fees, external listing fees (R200), and joining fees without a refundable menu portion cannot be refunded.',
    },
    {
      type: 'heading',
      text: 'How to request a refund',
    },
    {
      type: 'steps',
      items: [
        'Open Profile and go to the Tickets tab.',
        'Find the payment or booking that is eligible for a refund.',
        'Tap Request refund and choose a reason.',
        'Submit the request and wait for the venue to approve or decline.',
        'If approved, the venue pays you off-app using your Sec Wallet code. Keep your payout details up to date.',
      ],
    },
    {
      type: 'image',
      src: '/help/screenshots/profile-tickets.svg',
      alt: 'Profile Tickets tab with refund entry',
      caption: 'Request refunds from Profile → Tickets.',
      path: 'Profile → Tickets',
      illustrative: true,
    },
    {
      type: 'heading',
      text: 'What happens after approval',
    },
    {
      type: 'p',
      text: 'When a venue approves: your QR codes / tickets for that booking are invalidated, capacity is restored on the listing, and the venue marks the refund as paid once they have transferred your share. Status moves from Pending → Approved → Paid by venue (or Rejected if declined).',
    },
    {
      type: 'tip',
      title: 'Tip',
      text: 'Have your Sec Wallet payout details set before you need a refund — venues look up your wallet code to pay you.',
    },
    {
      type: 'related',
      ids: ['sec-wallet-partygoer', 'payouts', 'tickets-qr', 'after-purchase'],
    },
  ],
};

export const refundsVenue = {
  id: 'refunds-venue',
  audience: 'venue',
  category: 'payments',
  title: 'How refunds work for venues',
  summary:
    'Review guest refund requests, approve or decline, and pay guests using Sec Wallet lookup.',
  readMinutes: 7,
  keywords: ['refund', 'approve', 'decline', 'wallet lookup', 'BusinessRefundRequests'],
  sections: [
    {
      type: 'p',
      text: `Guests request refunds for eligible table and ticket payments. You review them in Refund requests. SEC does not fund refunds — when you approve, you pay the guest’s share (${F.recipientSharePercent}%) off-app. SEC keeps the platform fee (${F.platformFeePercent}% on most bookings; ticket tiers use ${F.ticketFeePercent}%).`,
    },
    {
      type: 'image',
      src: '/help/diagrams/refund-flow.svg',
      alt: 'Refund money flow diagram',
      caption: 'You pay the guest share; platform fee stays with SEC.',
    },
    {
      type: 'heading',
      text: 'Where to manage requests',
    },
    {
      type: 'steps',
      items: [
        'Open Business Dashboard → Refund requests (staff need the refund_requests permission).',
        'Open a pending request to see the booking, amount, and guest reason.',
        'Approve to invalidate QR/tickets and restore capacity, or decline with a template reason (outside policy, no-show, QR already used, etc.).',
        'After approving, look up the guest by Sec Wallet code and pay them off-app.',
        'Mark the request as Paid by venue when the transfer is done.',
      ],
    },
    {
      type: 'image',
      src: '/help/screenshots/venue-refunds.svg',
      alt: 'Venue refund requests list',
      caption: 'Business Dashboard → Refund requests.',
      path: 'Business Dashboard → Refund requests',
      illustrative: true,
    },
    {
      type: 'callout',
      title: 'Important',
      text: 'Boosts, promotions, listing fees, and similar platform products are not refundable to guests through this flow.',
    },
    {
      type: 'related',
      ids: ['payouts', 'tickets-qr', 'venue-staff-permissions'],
    },
  ],
};

export const payouts = {
  id: 'payouts',
  audience: 'both',
  category: 'payments',
  title: 'How to receive payouts',
  summary:
    'Connect Paystack payout details so your share of bookings reaches your bank account.',
  readMinutes: 5,
  keywords: ['payout', 'paystack', 'bank', 'wallet', 'pending', '85%', '96%'],
  sections: [
    {
      type: 'p',
      text: `After successful payments, SEC records a ledger entry and can transfer your recipient share automatically when payout details are set. Default split: ${F.platformFeePercent}% SEC / ${F.recipientSharePercent}% recipient. Ticket tiers: ${F.ticketFeePercent}% SEC / ${F.ticketVenueSharePercent}% venue. Boosts, promotions, and listing fees are 100% platform revenue (no recipient transfer).`,
    },
    {
      type: 'heading',
      text: 'Set up payouts (party-goers)',
    },
    {
      type: 'steps',
      items: [
        'Open your Sec Wallet from Profile / wallet screens.',
        'Add payout recipient details (bank account via Paystack).',
        'Save and confirm the recipient is active.',
        'Host joining fees and other eligible earnings can then transfer to you.',
      ],
    },
    {
      type: 'heading',
      text: 'Set up payouts (venues)',
    },
    {
      type: 'steps',
      items: [
        'Open Venue Sec Wallet from your business profile / wallet area.',
        'Add the venue’s Paystack transfer recipient.',
        'Keep details current so table and ticket payouts do not stay pending.',
      ],
    },
    {
      type: 'image',
      src: '/help/screenshots/wallet-payout.svg',
      alt: 'Wallet payout setup screen',
      caption: 'Connect a bank recipient so payouts can leave Pending.',
      path: 'Profile / Venue wallet → Payout setup',
      illustrative: true,
    },
    {
      type: 'warning',
      title: 'Pending payouts',
      text: 'If payout details are missing or invalid, transfers stay pending until you complete setup. Fix this before busy weekends.',
    },
    {
      type: 'related',
      ids: ['sec-wallet-partygoer', 'refunds-partygoer', 'refunds-venue'],
    },
  ],
};
