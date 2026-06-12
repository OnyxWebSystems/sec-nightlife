import QRCode from 'qrcode';
import { sendEmail } from './email.js';
import { createInAppNotification } from './inAppNotifications.js';
import {
  generateQrToken,
  visibleUntilFromEventStartsAt,
  holderDisplayNameFromUser,
  hideSupersededHostedTableGuestTickets,
  hideSupersededVenueTableGuestTickets,
} from './ticketHelpers.js';
import { buildTicketDoorContext } from './ticketDoorContext.js';
import { buildTicketVerifyUrlWithHints, ticketVerifyPublicOrigin } from './ticketVerifyUrl.js';
import { logger } from './logger.js';

function notificationCopyForTicketKind(kind, title) {
  switch (kind) {
    case 'EVENT_TICKET':
      return {
        legacyTitle: 'Your ticket is ready',
        legacyBody: `${title} — open Profile → Tickets to view your QR code.`,
        inAppTitle: 'Ticket confirmed',
        inAppBody: `${title}. View it under Profile → Tickets.`,
        inAppType: 'EVENT_JOINED',
      };
    case 'HOSTED_TABLE_JOIN':
    case 'VENUE_TABLE_JOIN':
    case 'TABLE_JOIN':
      return {
        legacyTitle: 'Table pass ready',
        legacyBody: `${title} — open Profile → Tickets for your table QR code.`,
        inAppTitle: 'Table join confirmed',
        inAppBody: `${title}. Your table pass is in Profile → Tickets.`,
        inAppType: 'TABLE_JOINED',
      };
    case 'TABLE_HOST_FEE':
      return {
        legacyTitle: 'Host pass ready',
        legacyBody: `${title} — open Profile → Tickets for your host QR code.`,
        inAppTitle: 'Hosting confirmed',
        inAppBody: `${title}. Your host pass is in Profile → Tickets.`,
        inAppType: 'TABLE_JOINED',
      };
    case 'HOUSE_PARTY':
      return {
        legacyTitle: 'Party pass ready',
        legacyBody: `${title} — open Profile → Tickets to view your QR code.`,
        inAppTitle: 'Party pass confirmed',
        inAppBody: `${title}. View it under Profile → Tickets.`,
        inAppType: 'EVENT_JOINED',
      };
    default:
      return {
        legacyTitle: 'Pass ready',
        legacyBody: `${title} — open Profile → Tickets to view your QR code.`,
        inAppTitle: 'Pass confirmed',
        inAppBody: `${title}. View it under Profile → Tickets.`,
        inAppType: 'TABLE_JOINED',
      };
  }
}

/**
 * Create a ticket row once per Paystack reference and notify the user.
 * @param {import('@prisma/client').Prisma.TransactionClient | typeof import('./prisma.js').prisma} db
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
    holderDisplayName: holderParam = null,
    tableSpecsSummary = null,
    eventStartsAt: eventStartsAtParam = null,
    eventEndsAt: eventEndsAtParam = null,
    promoterUserId = null,
    skipEmail = false,
  } = params;

  const existing = await db.ticket.findUnique({
    where: { paystackReference },
  });
  if (existing) return existing;

  if (hostedTableId && kind === 'HOSTED_TABLE_JOIN') {
    await hideSupersededHostedTableGuestTickets(db, { userId, hostedTableId });
  } else if (venueTableId && kind === 'VENUE_TABLE_JOIN') {
    await hideSupersededVenueTableGuestTickets(db, { userId, venueTableId });
  }

  let holderDisplayName = holderParam;
  if (holderDisplayName == null || holderDisplayName === '') {
    const u = await db.user.findUnique({
      where: { id: String(userId) },
      select: { fullName: true, username: true, userProfile: { select: { username: true } } },
    });
    holderDisplayName = holderDisplayNameFromUser(u);
  }

  const eventStartsAt =
    eventStartsAtParam != null
      ? eventStartsAtParam instanceof Date
        ? eventStartsAtParam
        : new Date(eventStartsAtParam)
      : null;

  const eventEndsAt =
    eventEndsAtParam != null
      ? eventEndsAtParam instanceof Date
        ? eventEndsAtParam
        : new Date(eventEndsAtParam)
      : null;

  const effectiveVisibleUntil = eventEndsAt
    ? eventEndsAt
    : eventStartsAt
      ? visibleUntilFromEventStartsAt(eventStartsAt)
      : visibleUntil;

  const qrToken = generateQrToken();

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
      visibleUntil: effectiveVisibleUntil,
      holderDisplayName,
      tableSpecsSummary: tableSpecsSummary ?? null,
      eventStartsAt,
      promoterUserId: promoterUserId || null,
    },
  });

  const door = await buildTicketDoorContext(db, ticket);
  const base = ticketVerifyPublicOrigin();
  const qrContent = buildTicketVerifyUrlWithHints(base, qrToken, {
    venueName: door.venue_name,
    eventStartsAt: ticket.eventStartsAt,
  });

  const QR_CID = 'sec-ticket-qr';
  let qrPngBuffer = null;
  try {
    qrPngBuffer = await QRCode.toBuffer(qrContent, { type: 'png', width: 220, margin: 1, errorCorrectionLevel: 'M' });
  } catch (e) {
    logger.warn('QR generation failed', { err: e?.message });
  }

  const baseUrl = base;
  const profileUrl = baseUrl ? `${baseUrl}/Profile` : '/Profile';
  const verifyUrl = qrContent.startsWith('http') ? qrContent : baseUrl ? `${baseUrl}${qrContent}` : qrContent;

  const notice = notificationCopyForTicketKind(kind, title);

  await createInAppNotification({
    userId,
    type: notice.inAppType,
    title: notice.inAppTitle,
    body: notice.inAppBody,
    referenceId: ticket.id,
    referenceType: 'TICKET',
  });

  if (email && !skipEmail) {
    sendEmail({
      to: email,
      subject: `Your SEC ticket — ${title}`,
      text: `Your ticket for "${title}" is confirmed.\n\nScan link (door check): ${verifyUrl}\nProfile (Tickets tab): ${profileUrl}\n\nThe QR in the HTML email is embedded so it usually works offline in your mail app after download. Open the link once online if you want the ticket saved in the SEC app for offline use.\n\nReference: ${paystackReference}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#111;color:#eee;padding:24px;">
          <h2 style="margin:0 0 12px;">Ticket confirmed</h2>
          <p style="margin:0 0 8px;"><strong>${title}</strong></p>
          ${subtitle ? `<p style="color:#aaa;margin:0 0 16px;">${subtitle}</p>` : ''}
          <p style="margin:0 0 16px;">Open <a href="${profileUrl}" style="color:#8cf;">Profile → Tickets</a> in the SEC app to show your QR code at the door.</p>
          <p style="margin:0 0 12px;font-size:12px;color:#9aa0a6;line-height:1.5;">Tip: the QR image below is embedded in this email — in most mail apps it stays visible <strong style="color:#e9ecef;">offline</strong> after the message has downloaded. You can also open the link once online so your phone can save the ticket for offline door checks.</p>
          <p style="margin:0 0 16px;font-size:13px;">Staff can scan: <a href="${verifyUrl}" style="color:#8cf;word-break:break-all;">${verifyUrl}</a></p>
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

/**
 * Send one email with multiple ticket QRs (multi-ticket purchases).
 */
export async function sendConsolidatedEventTicketsEmail({
  to,
  eventTitle,
  tierName,
  tickets = [],
}) {
  if (!to || !tickets.length) return;

  const base = ticketVerifyPublicOrigin();
  const profileUrl = base ? `${base}/Profile` : '/Profile';

  const qrSections = [];
  const attachments = [];

  for (let i = 0; i < tickets.length; i += 1) {
    const t = tickets[i];
    const door = t.door || {};
    const qrContent = buildTicketVerifyUrlWithHints(base, t.qrToken, {
      venueName: door.venue_name,
      eventStartsAt: t.eventStartsAt,
    });
    const verifyUrl = qrContent.startsWith('http') ? qrContent : base ? `${base}${qrContent}` : qrContent;
    const cid = `sec-ticket-qr-${i + 1}`;
    let qrPngBuffer = null;
    try {
      qrPngBuffer = await QRCode.toBuffer(qrContent, { type: 'png', width: 200, margin: 1, errorCorrectionLevel: 'M' });
    } catch (e) {
      logger.warn('QR generation failed', { err: e?.message });
    }
    if (qrPngBuffer) {
      attachments.push({ filename: `ticket-${i + 1}.png`, content: qrPngBuffer, contentId: cid });
    }
    qrSections.push(`
      <div style="margin:20px 0;padding:16px;border:1px solid #333;border-radius:10px;">
        <p style="margin:0 0 8px;font-weight:600;">${t.holderLabel || `Guest ${i + 1}`}</p>
        ${qrPngBuffer ? `<img src="cid:${cid}" alt="QR ${i + 1}" width="180" height="180" style="display:block;border-radius:8px;" />` : ''}
        <p style="margin:8px 0 0;font-size:12px;"><a href="${verifyUrl}" style="color:#8cf;word-break:break-all;">${verifyUrl}</a></p>
        <p style="font-size:11px;color:#666;margin:4px 0 0;">Ref: ${t.paystackReference}</p>
      </div>
    `);
  }

  sendEmail({
    to,
    subject: `Your SEC tickets — ${eventTitle}`,
    text: `Your ${tickets.length} ticket(s) for "${eventTitle}" (${tierName}) are confirmed.\n\nOpen Profile → Tickets: ${profileUrl}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#111;color:#eee;padding:24px;">
        <h2 style="margin:0 0 12px;">Tickets confirmed</h2>
        <p style="margin:0 0 8px;"><strong>${eventTitle}</strong></p>
        <p style="color:#aaa;margin:0 0 16px;">${tierName} · ${tickets.length} ticket${tickets.length > 1 ? 's' : ''}</p>
        <p style="margin:0 0 16px;">Open <a href="${profileUrl}" style="color:#8cf;">Profile → Tickets</a> in the SEC app.</p>
        ${qrSections.join('')}
      </div>
    `,
    attachments: attachments.length ? attachments : undefined,
  }).catch((e) => logger.warn('consolidated ticket email failed', { err: e?.message }));
}
