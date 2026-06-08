import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { sendAdminDashboardAlertEmail } from './email.js';

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

/**
 * ADMIN + SUPER_ADMIN users and active Admin Dashboard delegates.
 * @returns {Promise<string[]>}
 */
export async function getAdminRecipientEmails() {
  const [adminUsers, delegates] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        deletedAt: null,
        suspendedAt: null,
        email: { not: '' },
      },
      select: { email: true },
    }),
    prisma.adminDashboardDelegate.findMany({
      where: { isActive: true },
      select: { email: true },
    }).catch((err) => {
      const msg = String(err?.message || '');
      if (msg.includes('admin_dashboard_delegates') || msg.includes('does not exist')) {
        return [];
      }
      throw err;
    }),
  ]);

  const emails = new Set();
  for (const u of adminUsers) {
    const e = normalizeEmail(u.email);
    if (e) emails.add(e);
  }
  for (const d of delegates) {
    const e = normalizeEmail(d.email);
    if (e) emails.add(e);
  }
  return [...emails];
}

/**
 * @param {object} params
 * @param {string} params.subject
 * @param {string} params.body
 * @param {string} [params.dashboardTab] — AdminDashboard tab query e.g. `users`
 * @param {string} [params.ctaLabel]
 * @param {string} [params.excludeEmail] — skip this address (e.g. acting admin)
 */
export async function notifyAdmins({
  subject,
  body,
  dashboardTab = 'overview',
  ctaLabel = 'Open Admin Dashboard',
  excludeEmail = null,
}) {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('adminNotify: RESEND_API_KEY missing — skipping admin emails', { subject });
    return;
  }

  try {
    const exclude = excludeEmail ? normalizeEmail(excludeEmail) : null;
    const recipients = (await getAdminRecipientEmails()).filter((e) => e !== exclude);
    if (recipients.length === 0) {
      logger.warn('adminNotify: no admin recipients', { subject });
      return;
    }

    const dashboardPath = `/AdminDashboard?tab=${encodeURIComponent(dashboardTab)}`;
    await Promise.all(
      recipients.map((to) =>
        sendAdminDashboardAlertEmail({
          to,
          subject,
          body,
          ctaLabel,
          dashboardPath,
        }).catch((err) => {
          logger.error('adminNotify: email failed', { to, subject, message: err?.message });
        })
      )
    );
  } catch (err) {
    logger.error('adminNotify: failed', { subject, message: err?.message });
  }
}
