/**
 * One-time: copy HostEvent -> HouseParty and legacy Table -> HostedTable (+ members).
 * Safe to re-run: skips rows whose target id already exists.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function mapHostEventStatus(s) {
  const x = String(s || '').toLowerCase();
  if (x === 'published') return 'PUBLISHED';
  if (x === 'cancelled') return 'CANCELLED';
  return 'DRAFT';
}

function mapTableStatus(s) {
  const x = String(s || '').toLowerCase();
  if (x === 'full') return 'FULL';
  if (x === 'closed') return 'CLOSED';
  return 'ACTIVE';
}

function extractMemberUserIds(members) {
  const list = Array.isArray(members) ? members : [];
  return [
    ...new Set(
      list
        .map((m) => {
          if (!m) return null;
          if (typeof m === 'string') return m;
          if (typeof m === 'object') return m.user_id || m.userId || null;
          return null;
        })
        .filter(Boolean),
    ),
  ];
}

async function main() {
  const heList = await prisma.hostEvent.findMany({ where: { deletedAt: null } });
  let hp = 0;
  for (const he of heList) {
    const exists = await prisma.houseParty.findUnique({ where: { id: he.id } });
    if (exists) continue;
    const start = new Date(he.date);
    const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
    const cap = he.capacity && he.capacity > 0 ? he.capacity : 50;
    const status = mapHostEventStatus(he.status);
    const hasFee = he.entryCost != null && he.entryCost > 0;
    await prisma.houseParty.create({
      data: {
        id: he.id,
        hostUserId: he.hostUserId,
        title: he.title,
        description: he.description || '',
        location: he.location || he.city || 'Unknown',
        latitude: null,
        longitude: null,
        coverImageUrl: he.coverImageUrl,
        startTime: start,
        endTime: end,
        hasEntranceFee: hasFee,
        entranceFeeAmount: hasFee ? Number(he.entryCost) : null,
        entranceFeeNote: null,
        freeEntryGroup: null,
        guestQuantity: cap,
        spotsRemaining: cap,
        status: status === 'PUBLISHED' ? 'PUBLISHED' : status === 'CANCELLED' ? 'CANCELLED' : 'DRAFT',
        publishedAt: status === 'PUBLISHED' ? he.createdAt : null,
      },
    });
    hp += 1;
  }
  console.log(`Migrated ${hp} host_events -> house_parties`);

  const tables = await prisma.table.findMany({
    where: { deletedAt: null },
    include: { event: { include: { venue: true } } },
  });
  let ht = 0;
  for (const t of tables) {
    const exists = await prisma.hostedTable.findUnique({ where: { id: t.id } });
    if (exists) continue;
    const venueName = t.event?.venue?.name || 'Venue';
    const eventDate = t.event?.date || new Date();
    const eventTime = t.event?.startTime || '21:00';
    const spotsRem = Math.max(0, t.maxGuests - (t.currentGuests || 0));
    await prisma.hostedTable.create({
      data: {
        id: t.id,
        hostUserId: t.hostUserId,
        tableType: 'IN_APP_EVENT',
        eventId: t.eventId,
        venueName,
        venueAddress: t.event?.venue?.city || null,
        eventDate,
        eventTime: String(eventTime),
        drinkPreferences: null,
        desiredCompany: null,
        guestQuantity: t.maxGuests,
        spotsRemaining: spotsRem,
        isPublic: true,
        status: mapTableStatus(t.status),
      },
    });
    const memberIds = extractMemberUserIds(t.members);
    for (const uid of memberIds) {
      const u = await prisma.user.findFirst({ where: { id: uid, deletedAt: null } });
      if (!u) continue;
      await prisma.hostedTableMember.upsert({
        where: {
          hostedTableId_userId: { hostedTableId: t.id, userId: uid },
        },
        create: {
          hostedTableId: t.id,
          userId: uid,
          status: 'GOING',
        },
        update: {},
      });
    }
    ht += 1;
  }
  console.log(`Migrated ${ht} tables -> hosted_tables`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
