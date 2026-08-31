import { createInAppNotification } from './inAppNotifications.js';
import { logger } from './logger.js';

/**
 * Human-readable account suspension error for API clients.
 * @param {{ suspendedReason?: string|null }} user
 */
export function accountSuspendedError(user) {
  const reason = typeof user?.suspendedReason === 'string' ? user.suspendedReason.trim() : '';
  if (reason) {
    return {
      error: `Account suspended: ${reason}`,
      code: 'ACCOUNT_SUSPENDED',
      suspendedReason: reason,
    };
  }
  return {
    error: 'Account suspended. Contact support@secnightlife.com for help.',
    code: 'ACCOUNT_SUSPENDED',
  };
}

/**
 * Notify a user they were suspended. Call before revoking sessions when possible.
 */
export async function notifyUserSuspended(userId, reason) {
  const body = reason?.trim()
    ? `Your SEC Nightlife account has been suspended. Reason: ${reason.trim()}`
    : 'Your SEC Nightlife account has been suspended. Contact support@secnightlife.com if you have questions.';
  try {
    await createInAppNotification({
      userId,
      type: 'ACCOUNT_SUSPENDED',
      title: 'Account suspended',
      body,
      referenceId: '/HelpCenter',
      referenceType: 'ROUTE',
    });
  } catch (err) {
    logger.warn('notifyUserSuspended failed', { userId, err: err?.message });
  }
}

export async function notifyUserUnsuspended(userId, note) {
  const body = note?.trim()
    ? `Your SEC Nightlife account access has been restored. ${note.trim()}`
    : 'Your SEC Nightlife account access has been restored. You can sign in again.';
  try {
    await createInAppNotification({
      userId,
      type: 'ACCOUNT_UNSUSPENDED',
      title: 'Account unsuspended',
      body,
      referenceId: '/Home',
      referenceType: 'ROUTE',
    });
  } catch (err) {
    logger.warn('notifyUserUnsuspended failed', { userId, err: err?.message });
  }
}

/**
 * Feedback to the person who reported/blocked about what admins did.
 */
export async function notifyReporterSafetyUpdate(reporterId, {
  title = 'Update on your safety report',
  body,
  reportId,
} = {}) {
  if (!reporterId || !body?.trim()) return;
  try {
    await createInAppNotification({
      userId: reporterId,
      type: 'SAFETY_REPORT_UPDATE',
      title,
      body: body.trim(),
      referenceId: reportId || '/Notifications',
      referenceType: reportId ? 'report' : 'ROUTE',
    });
  } catch (err) {
    logger.warn('notifyReporterSafetyUpdate failed', { reporterId, err: err?.message });
  }
}
