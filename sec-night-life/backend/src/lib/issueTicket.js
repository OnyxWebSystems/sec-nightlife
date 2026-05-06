import QRCode from 'qrcode';
import { prisma } from './prisma.js';
import { sendEmail } from './email.js';
import { createNotification } from './notifications.js';
import { createInAppNotification } from './inAppNotifications.js';
import { generateQrToken } from './ticketHelpers.js';
import { logger } from './logger.js';

/**
 * Create a ticket row once per Paystack reference and notify the user.
 * @param {import('@prisma/client').Prisma.TransactionClient | typeof prisma} db
 */
export async function issueTicketAndNotify(db, params) {
  const {
    userId,
    email,
    paystackReference,
    kind,
    title,
    subtitle,
    visibleUntil,
    housePartyId = null,
    tableId = null,
    hostedTableId = null,
    eventId = null,
    venueTableId = null,
    quantity = 1,
  } = params;

  const existing = await db.ticket.findUnique({
    where: { paystackReference },
  });
  if (existing) return existing;

  const qrToken = generateQrToken();
  const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const verifyPath = `/api/tickets/qr?token=${encodeURIComponent(qrToken)}`;
  const qrContent = baseUrl ? `${baseUrl}${verifyPath}` : verifyPath;

  const ticket = await db.ticket.create({
    data: {
      userId,
      kind,
      title,
      subtitle: subtitle ?? null,
      paystackReference,
      qrToken,
      housePartyId,
      tableId,
      hostedTableId,
      eventId,
      venueTableId,
      quantity,
      visibleUntil,
    },
  });

  const QR_CID = 'sec-ticket-qr';
  let qrPngBuffer = null;
  try {
    qrPngBuffer = await QRCode.toBuffer(qrContent, { type: 'png', width: 200, margin: 1 });
  } catch (e) {
    logger.warn('QR generation failed', { err: e?.message });
  }

  const profileUrl = baseUrl ? `${baseUrl}/Profile` : '/Profile';

  await createNotification({
    userId,
    type: 'payment',
    title: 'Your ticket is ready',
    body: `${title} — open Profile → Tickets to view your QR code.`,
    actionUrl: `/Profile`,
  });

  await createInAppNotification({
    userId,
    type: 'EVENT_JOINED',
    title: 'Ticket confirmed',
    body: `${title}. View it under Profile → Tickets.`,
    referenceId: ticket.id,
    referenceType: 'TICKET',
  });

  if (email) {
    sendEmail({
      to: email,
      subject: `Your SEC ticket — ${title}`,
      text: `Your ticket for "${title}" is confirmed.\n\nView your QR code: ${profileUrl} (Tickets tab)\n\nReference: ${paystackReference}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#111;color:#eee;padding:24px;">
          <h2 style="margin:0 0 12px;">Ticket confirmed</h2>
          <p style="margin:0 0 8px;"><strong>${title}</strong></p>
          ${subtitle ? `<p style="color:#aaa;margin:0 0 16px;">${subtitle}</p>` : ''}
          <p style="margin:0 0 16px;">Open <a href="${profileUrl}" style="color:#8cf;">Profile → Tickets</a> in the SEC app to show your QR code at the door.</p>
          ${qrPngBuffer ? `<p style="margin:16px 0;"><img src="cid:${QR_CID}" alt="Ticket QR" width="200" height="200" style="display:block;border-radius:8px;" /></p>` : ''}
          <p style="font-size:12px;color:#666;">Reference: ${paystackReference}</p>
        </div>
      `,
      attachments: qrPngBuffer
        ? [{ filename: 'ticket-qr.png', content: qrPngBuffer, contentId: QR_CID }]
        : undefined,
    }).catch((e) => logger.warn('ticket email failed', { err: e?.message }));
  }

  return ticket;
}
