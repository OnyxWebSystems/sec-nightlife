import { createInAppNotification } from './inAppNotifications.js';
import { sendEmail } from './email.js';

/**
 * Notify payer in legacy + in-app notifications and email after a successful payment.
 */
export async function notifyPaymentSuccess({
  userId,
  email,
  title,
  body,
  actionUrl = null,
  referenceId = null,
  referenceType = null,
  emailSubject = null,
}) {
  if (!userId) return;
  await createInAppNotification({
    userId,
    type: 'TABLE_JOINED',
    title,
    body,
    referenceId,
    referenceType,
  });
  if (email) {
    const appBase = process.env.APP_URL || 'https://secnightlife.com';
    const link = actionUrl ? `${appBase.replace(/\/$/, '')}${actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`}` : null;
    sendEmail({
      to: email,
      subject: emailSubject || title,
      text: link ? `${body}\n\nOpen in SEC: ${link}` : body,
      html: link
        ? `<p>${body}</p><p><a href="${link}">Open in SEC</a></p>`
        : `<p>${body}</p>`,
    }).catch(() => {});
  }
}

/**
 * Legacy + in-app (+ optional email) for table join requests and approvals.
 */
export async function notifyUserAlert({
  userId,
  email,
  type,
  inAppType,
  title,
  body,
  actionUrl = null,
  referenceId = null,
  referenceType = null,
  emailSubject = null,
  emailHtml = null,
}) {
  if (!userId) return;
  await createInAppNotification({
    userId,
    type: inAppType || 'TABLE_JOINED',
    title,
    body,
    referenceId,
    referenceType,
  });
  if (email) {
    sendEmail({
      to: email,
      subject: emailSubject || title,
      text: body,
      html: emailHtml || undefined,
    }).catch(() => {});
  }
}
