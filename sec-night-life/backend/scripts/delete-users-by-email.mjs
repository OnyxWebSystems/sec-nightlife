/**
 * Hard-delete every user row matching an email (all roles: USER, VENUE, etc.).
 *
 * Run from the backend folder with DATABASE_URL set (e.g. in .env):
 *   node scripts/delete-users-by-email.mjs onyxwebsystems@gmail.com
 *
 * Or:
 *   npx dotenv -e .env -- node scripts/delete-users-by-email.mjs onyxwebsystems@gmail.com
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const { prisma } = await import('../src/lib/prisma.js');

async function deleteUserOrphans(tx, userId) {
  await tx.accountRole.deleteMany({ where: { userId } });
  await tx.friendRequest.deleteMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] }
  });
  await tx.hostEvent.deleteMany({ where: { hostUserId: userId } });
  await tx.eventAttendance.deleteMany({ where: { userId } });
  await tx.venueBlockedUser.deleteMany({ where: { userId } });
  await tx.serviceRating.deleteMany({
    where: { OR: [{ raterUserId: userId }, { rateeUserId: userId }] }
  });
  await tx.promotionImpression.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.transaction.deleteMany({ where: { userId } });
  await tx.payment.deleteMany({ where: { userId } });
  await tx.message.deleteMany({ where: { senderId: userId } });
  await tx.profileView.deleteMany({
    where: { OR: [{ viewerId: userId }, { viewedId: userId }] }
  });
  await tx.reputationScore.deleteMany({ where: { userId } });
  await tx.analyticsEvent.deleteMany({ where: { userId } });

  const bookings = await tx.tableBooking.findMany({
    where: { organizerUserId: userId },
    select: { id: true }
  });
  for (const b of bookings) {
    await tx.tableBookingSplit.deleteMany({ where: { bookingId: b.id } });
  }
  await tx.tableBooking.deleteMany({ where: { organizerUserId: userId } });
  await tx.tableBookingSplit.deleteMany({ where: { userId } });

  await tx.partyGroup.deleteMany({ where: { createdBy: userId } });
  await tx.partyGroupMember.deleteMany({ where: { userId } });
  await tx.partyGroupInvitation.deleteMany({
    where: { OR: [{ inviterId: userId }, { inviteeId: userId }] }
  });
}

/** Neon + many deleteMany calls can exceed Prisma’s default 5s interactive transaction limit. */
const TX_OPTIONS = { maxWait: 20000, timeout: 120000 };

async function hardDeleteUser(userId) {
  await prisma.$transaction(
    async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await deleteUserOrphans(tx, userId);
      await tx.user.delete({ where: { id: userId } });
    },
    TX_OPTIONS
  );
}

const rawEmail = process.argv[2]?.trim();
if (!rawEmail) {
  console.error('Usage: node scripts/delete-users-by-email.mjs <email>');
  process.exit(1);
}

const email = rawEmail.toLowerCase();

async function main() {
  const users = await prisma.user.findMany({
    where: { email },
    select: { id: true, email: true, role: true, username: true, deletedAt: true }
  });

  if (users.length === 0) {
    console.log(`No users found for email: ${email}`);
    process.exit(0);
  }

  console.log(`Found ${users.length} row(s):`);
  for (const u of users) {
    console.log(`  - ${u.id}  role=${u.role}  username=${u.username}  deletedAt=${u.deletedAt ?? 'null'}`);
  }

  for (const u of users) {
    console.log(`Deleting ${u.id} (${u.role})…`);
    await hardDeleteUser(u.id);
    console.log(`  done.`);
  }

  console.log('All matching accounts removed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
