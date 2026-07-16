import { HELP_FACTS as F } from '../facts';

export const minimumSpend = {
  id: 'minimum-spend',
  audience: 'both',
  category: 'tables',
  title: 'What minimum spend means',
  summary:
    'The ZAR amount guests must meet (via menu prepay or lump sum) before checkout can complete.',
  readMinutes: 5,
  keywords: ['minimum spend', 'min spend', 'menu', 'prepay', 'host minimum'],
  sections: [
    {
      type: 'p',
      text: 'Minimum spend is the amount a guest must commit to for a table (in ZAR). Venues set this on table tiers. Hosting and joining can use different amounts: join uses minimumSpend; hosting uses hostMinimumSpend (falling back to the join amount if unset).',
    },
    {
      type: 'heading',
      text: 'How you meet it',
    },
    {
      type: 'p',
      text: 'Depending on settlement mode, you either prepay menu items until the cart total reaches the minimum, or pay a lump “pay the min, order on site” amount (QR may be used as proof). Checkout is blocked until the requirement is met.',
    },
    {
      type: 'image',
      src: '/help/screenshots/min-spend-checkout.svg',
      alt: 'Checkout gated by minimum spend',
      caption: 'Checkout stays locked until your menu or lump total meets the minimum.',
      path: 'Table details → Checkout',
      illustrative: true,
    },
    {
      type: 'callout',
      title: 'Custom tables',
      text: 'Custom table requests can propose a minimum spend manually or from a menu total (minSpendMode: manual or menu).',
    },
    {
      type: 'related',
      ids: ['custom-tables-partygoer', 'custom-tables-venue', 'host-join-table', 'table-day-bookings'],
    },
  ],
};

export const automaticGroups = {
  id: 'automatic-groups',
  audience: 'both',
  category: 'tables',
  title: 'Automatic groups when hosting a table',
  summary:
    'Hosting creates a group chat; confirmed joiners are added automatically.',
  readMinutes: 4,
  keywords: ['group chat', 'automatic group', 'hosted table', 'messaging'],
  sections: [
    {
      type: 'p',
      text: 'When you successfully pay to host a venue table (or finish payment for an external hosted listing), SEC creates a Hosted Table group chat with you as the host member. Guests who join and reach Going status are added to that group automatically.',
    },
    {
      type: 'steps',
      items: [
        'Complete host checkout (or external listing payment).',
        'A group chat is created with you as host.',
        'Invite or accept joiners; when they are Going, they appear in the group.',
        'Open Messages / group chats to coordinate plans, dress code, and arrival.',
        'Leaving or certain refunds can remove membership from the chat.',
      ],
    },
    {
      type: 'image',
      src: '/help/screenshots/group-chat.svg',
      alt: 'Hosted table group chat',
      caption: 'Find your table group under Messages after hosting.',
      path: 'Messages → Group chats',
      illustrative: true,
    },
    {
      type: 'tip',
      title: 'Capacity note',
      text: 'The host counts toward capacity — spots remaining usually equal guest quantity minus one.',
    },
    {
      type: 'related',
      ids: ['host-join-table', 'after-purchase', 'host-create-event'],
    },
  ],
};

export const customTablesPartygoer = {
  id: 'custom-tables-partygoer',
  audience: 'partygoer',
  category: 'tables',
  title: 'Custom tables for party-goers',
  summary:
    'Request a tailor-made table when the venue allows custom requests, then pay after approval.',
  readMinutes: 6,
  keywords: ['custom table', 'request', 'pending review', 'special table'],
  sections: [
    {
      type: 'p',
      text: 'If a venue or event enables custom requests, you will see a Request Custom Table option. You propose guest count, preferred start/end times, minimum spend (manual amount or menu total), and notes. The venue reviews before you pay.',
    },
    {
      type: 'image',
      src: '/help/diagrams/custom-table-flow.svg',
      alt: 'Custom table status flow',
      caption: 'Pending review → Approved → Pending payment → Confirmed (after you pay).',
    },
    {
      type: 'steps',
      items: [
        'Open the event or day table listing and choose Request Custom Table.',
        'Enter guests, times, proposed minimum spend, and notes/menu.',
        'Submit — status becomes Pending venue review.',
        'If approved, complete payment (Pending payment → Confirmed).',
        'You become the host session for that custom booking; use Host Dashboard and tickets/QR as usual.',
      ],
    },
    {
      type: 'image',
      src: '/help/screenshots/custom-table-request.svg',
      alt: 'Custom table request modal',
      caption: 'Submit preferred times and spend for venue review.',
      path: 'Event / Table details → Request Custom Table',
      illustrative: true,
    },
    {
      type: 'warning',
      title: 'If declined',
      text: 'The venue may decline your request. You can adjust details and try again if custom requests remain enabled.',
    },
    {
      type: 'related',
      ids: ['custom-tables-venue', 'minimum-spend', 'host-join-table', 'remove-from-listings'],
    },
  ],
};

export const customTablesVenue = {
  id: 'custom-tables-venue',
  audience: 'venue',
  category: 'tables',
  title: 'Custom tables for venues',
  summary:
    'Enable custom requests, review guest proposals, and optionally hide standard tables to free capacity.',
  readMinutes: 6,
  keywords: ['custom requests', 'approve custom', 'allows_custom_requests'],
  sections: [
    {
      type: 'p',
      text: 'When you enable allows custom requests on a day or event hosting setup, SEC shows a special custom-request listing. Guests submit proposals; you approve or decline. After approval the guest pays and becomes the host for that session.',
    },
    {
      type: 'steps',
      items: [
        'In Business Venue Tables / event hosting config, enable custom requests.',
        'Watch Business Bookings / reservations for Pending venue review requests.',
        'Approve (guest can pay) or decline with a clear reason.',
        'If you need a physical floor table for that custom booking, use Remove from listings on a standard empty slot so others cannot book it (see Remove from listings).',
      ],
    },
    {
      type: 'callout',
      title: 'Important',
      text: 'You cannot Remove from listings the custom-request listing itself — only standard table slots. Hidden slots must be empty (not already in use).',
    },
    {
      type: 'related',
      ids: ['custom-tables-partygoer', 'remove-from-listings', 'table-day-bookings', 'minimum-spend'],
    },
  ],
};

export const hostJoinTable = {
  id: 'host-join-table',
  audience: 'partygoer',
  category: 'tables',
  title: 'Host a table, join a table, or join a host’s table',
  summary:
    'Three ways to sit: become the host, join an open hosted table, or join the host already on a venue slot.',
  readMinutes: 7,
  keywords: ['host table', 'join table', 'private table', 'joining fee', 'approval'],
  sections: [
    {
      type: 'image',
      src: '/help/diagrams/host-join-flow.svg',
      alt: 'Host vs join decision diagram',
      caption: 'Host a free slot, join a public hosted table, or request a private one.',
    },
    {
      type: 'heading',
      text: '1. Host a venue table',
    },
    {
      type: 'p',
      text: 'On an event or day listing, pick an available tier/slot, pay the host fee plus minimum spend / menu as required. That creates your Hosted Table, group chat, and QR. You manage invites and approvals from Host Dashboard.',
    },
    {
      type: 'heading',
      text: '2. Join a hosted table',
    },
    {
      type: 'p',
      text: `Find a public hosted table and join. You may pay a joining fee (minimum about R${F.joiningFeeMinZar} when enabled) plus optional menu. Private tables (not public) need the host’s approval before you are Going.`,
    },
    {
      type: 'heading',
      text: '3. Join a host already on a venue slot',
    },
    {
      type: 'p',
      text: 'If a venue slot is already hosted, joining from that listing redirects you to that Hosted Table instead of creating a second host session.',
    },
    {
      type: 'image',
      src: '/help/screenshots/table-details.svg',
      alt: 'Table details host and join options',
      caption: 'Table details shows Host vs Join depending on availability.',
      path: 'Tables / Event → Table details',
      illustrative: true,
    },
    {
      type: 'related',
      ids: ['automatic-groups', 'minimum-spend', 'after-purchase', 'host-list-external-table'],
    },
  ],
};
