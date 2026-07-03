/**
 * @deprecated Demo seeding removed — use capture-marketing-manual.mjs with your real accounts.
 * Creates Party-Goer + Business Owner test accounts and sample venue/event data.
 * Writes credentials + IDs to marketing-kit/scripts/.marketing-credentials.json
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const TS = Date.now();
const PASSWORD = process.env.MARKETING_PASSWORD || 'MarketingKit2026!';
const PARTY_EMAIL = process.env.PARTY_GOER_EMAIL || `marketing.party.${TS}@secnightlife.test`;
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || `marketing.business.${TS}@secnightlife.test`;
const CREDS_PATH = join(__dirname, '.marketing-credentials.json');

const PLACEHOLDER_EVENT = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80';
const PLACEHOLDER_VENUE = 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&q=80';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function register({ email, username, role, full_name }) {
  try {
    return await api('/api/auth/register', {
      method: 'POST',
      body: { email, password: PASSWORD, username, role, full_name },
    });
  } catch (err) {
    if (String(err.message).includes('409')) {
      return api('/api/auth/login', {
        method: 'POST',
        body: { email, password: PASSWORD, role },
      });
    }
    throw err;
  }
}

async function acceptAgeDeclaration(token) {
  await api('/api/legal/acceptances', {
    method: 'POST',
    token,
    body: { document_key: 'age_verification_declaration', version: '1.0' },
  });
}

async function completePartyOnboarding(token) {
  await acceptAgeDeclaration(token);
  await api('/api/users/profile', {
    method: 'PATCH',
    token,
    body: {
      bio: 'Nightlife enthusiast exploring SEC.',
      city: 'Johannesburg',
      favorite_drink: 'Cocktails',
      gender: 'other',
      date_of_birth: '1998-06-15',
      payment_setup_complete: true,
      onboarding_complete: true,
    },
  });
}

async function createVenue(token) {
  return api('/api/venues', {
    method: 'POST',
    token,
    body: {
      name: 'SEC Demo Club',
      venue_type: 'nightclub',
      city: 'Johannesburg',
      address: '123 Sandton Drive, Sandton',
      suburb: 'Sandton',
      province: 'Gauteng',
      bio: 'Premium demo venue for SEC marketing — tables, events, and VIP experiences.',
      phone: '+27 11 555 0100',
      logo_url: PLACEHOLDER_VENUE,
      cover_image_url: PLACEHOLDER_EVENT,
      capacity: 500,
      age_limit: 18,
    },
  });
}

async function addMenuItem(token, venueId) {
  await api(`/api/business/venues/${venueId}/menu-items`, {
    method: 'POST',
    token,
    body: {
      name: 'Premium Bottle Service',
      category: 'Drinks',
      price: 2500,
      is_available: true,
    },
  });
}

async function completeBusinessOnboarding(token, venueId) {
  await addMenuItem(token, venueId);
  await api('/api/users/profile', {
    method: 'PATCH',
    token,
    body: { onboarding_complete: true },
  });
}

async function createEvent(token, venueId) {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  start.setHours(21, 0, 0, 0);
  const end = new Date(start);
  end.setHours(3, 0, 0, 0);
  end.setDate(end.getDate() + 1);

  return api('/api/events', {
    method: 'POST',
    token,
    body: {
      venue_id: venueId,
      title: 'Saturday Night Live',
      description: 'The hottest Saturday party in Johannesburg. VIP tables, premium sound, and unforgettable vibes.',
      date: start.toISOString().split('T')[0],
      start_time: '21:00',
      ends_at: end.toISOString(),
      city: 'Johannesburg',
      location_city: 'Johannesburg',
      location_address: '123 Sandton Drive, Sandton',
      status: 'published',
      cover_image_url: PLACEHOLDER_EVENT,
      event_format: 'TABLE_HOSTING',
      has_entrance_fee: false,
    },
  });
}

async function main() {
  console.log('Seeding marketing test data…');
  console.log(`API: ${API_URL}`);

  const party = await register({
    email: PARTY_EMAIL,
    username: `mkparty${String(TS).slice(-6)}`,
    role: 'USER',
    full_name: 'Alex Party',
  });
  await completePartyOnboarding(party.accessToken);
  console.log('Party-Goer ready:', PARTY_EMAIL);

  const business = await register({
    email: BUSINESS_EMAIL,
    username: `mkbiz${String(TS).slice(-6)}`,
    role: 'VENUE',
    full_name: 'Jordan Venue',
  });

  const venue = await createVenue(business.accessToken);
  await completeBusinessOnboarding(business.accessToken, venue.id);
  console.log('Venue created:', venue.name, venue.id);

  let event = null;
  try {
    event = await createEvent(business.accessToken, venue.id);
    console.log('Event created:', event.title || event.id);
  } catch (err) {
    console.warn('Event creation skipped:', err.message);
  }

  const creds = {
    apiUrl: API_URL,
    password: PASSWORD,
    partyGoer: { email: PARTY_EMAIL, role: 'USER' },
    businessOwner: { email: BUSINESS_EMAIL, role: 'VENUE' },
    venueId: venue.id,
    eventId: event?.id || null,
    createdAt: new Date().toISOString(),
  };

  mkdirSync(dirname(CREDS_PATH), { recursive: true });
  writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
  console.log(`Credentials saved to ${CREDS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
