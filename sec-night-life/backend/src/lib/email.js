import { Resend } from 'resend';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEC_EMAIL_LOGO_CID = 'sec-email-logo';
const SEC_EMAIL_LOGO_PRIMARY_PATH = path.resolve(__dirname, '../../public/Logo/sec-email-logo.png');
const SEC_EMAIL_LOGO_FALLBACK_PATH = path.resolve(__dirname, '../../public/Logo/sec-logo.png');

function getFromAddress() {
  return process.env.EMAIL_FROM || 'noreply@secnightlife.com';
}

function createResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function getSecEmailLogoAttachment() {
  const logoPath = fs.existsSync(SEC_EMAIL_LOGO_PRIMARY_PATH)
    ? SEC_EMAIL_LOGO_PRIMARY_PATH
    : SEC_EMAIL_LOGO_FALLBACK_PATH;
  if (!fs.existsSync(logoPath)) return null;

  return {
    filename: path.basename(logoPath),
    content: fs.readFileSync(logoPath),
    contentId: SEC_EMAIL_LOGO_CID,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTextAsHtml(text = '') {
  return String(text)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function withSecEmailBranding(innerHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f1011;color:#e9ecef;border:1px solid #232528;border-radius:16px;overflow:hidden;">
      <div style="padding:20px 20px 14px;border-bottom:1px solid #232528;background:#0b0c0d;">
        <div style="display:inline-block;width:64px;height:64px;border-radius:999px;overflow:hidden;background:#0b0c0d;vertical-align:middle;">
          <img src="cid:${SEC_EMAIL_LOGO_CID}" alt="SEC logo" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:999px;border:0;outline:0;" />
        </div>
        <div style="display:inline-block;vertical-align:middle;margin-left:12px;">
          <div style="font-size:18px;font-weight:700;line-height:1.2;color:#ffffff;">SEC Nightlife</div>
          <div style="font-size:12px;line-height:1.4;color:#9aa0a6;">Your night. Simplified.</div>
        </div>
      </div>
      <div style="padding:20px;background:#111315;color:#e9ecef;">
        ${innerHtml}
      </div>
    </div>
  `;
}

function prepareEmailPayload({ html, text, attachments }) {
  const bodyHtml = html || formatTextAsHtml(text || '');
  const brandedHtml = bodyHtml ? withSecEmailBranding(bodyHtml) : undefined;

  const nextAttachments = Array.isArray(attachments) ? [...attachments] : [];
  const hasLogoCid = nextAttachments.some((a) => a?.contentId === SEC_EMAIL_LOGO_CID);
  if (!hasLogoCid) {
    const secLogoAttachment = getSecEmailLogoAttachment();
    if (secLogoAttachment) nextAttachments.push(secLogoAttachment);
  }

  return {
    html: brandedHtml,
    text,
    attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
  };
}

/**
 * @param {object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} [params.html]
 * @param {string} [params.text]
 * @param {Array<{ filename: string, content: string | Buffer, contentId?: string }>} [params.attachments] Inline images: set contentId → HTML uses src="cid:contentId" (Resend: inlineContentId)
 */
export async function sendEmail({ to, subject, html, text, attachments }) {
  const resend = createResendClient();
  const from = getFromAddress();
  const prepared = prepareEmailPayload({ html, text, attachments });
  const payload = { from, to, subject, html: prepared.html, text: prepared.text };
  if (prepared.attachments?.length) {
    payload.attachments = prepared.attachments.map((a) => {
      const content =
        typeof a.content === 'string'
          ? a.content
          : Buffer.isBuffer(a.content)
            ? a.content
            : Buffer.from(String(a.content), 'base64');
      const row = { filename: a.filename, content };
      if (a.contentId) row.inlineContentId = a.contentId;
      return row;
    });
  }
  await resend.emails.send(payload);
  logger.info('Email sent via Resend', { to, subject });
}

export async function sendBulkEmails(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  await Promise.all(messages.map((m) => sendEmail(m)));
}

export async function sendVerificationEmail(to, token) {
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: 'Verify your SEC Nightlife account',
    text: `Welcome to SEC Nightlife!\n\nVerify your email by clicking the link below:\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#fff;background:#111;padding:24px;margin:0;">SEC Nightlife</h2>
        <div style="padding:24px;background:#1a1a1a;color:#e0e0e0;">
          <h3>Verify your email address</h3>
          <p>Click the button below to verify your account. This link expires in <strong>24 hours</strong>.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#fff;color:#000;font-weight:700;border-radius:6px;text-decoration:none;margin:16px 0;">
            Verify Email
          </a>
          <p style="font-size:12px;color:#888;">Or copy this link: ${link}</p>
          <p style="font-size:12px;color:#666;">If you did not create an account, ignore this email.</p>
        </div>
      </div>
    `
  });
}

export async function sendPasswordResetEmail(to, token) {
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: 'Reset your SEC Nightlife password',
    text: `Reset your password by clicking the link below:\n${link}\n\nThis link expires in 1 hour.\n\nIf you did not request a password reset, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#fff;background:#111;padding:24px;margin:0;">SEC Nightlife</h2>
        <div style="padding:24px;background:#1a1a1a;color:#e0e0e0;">
          <h3>Reset your password</h3>
          <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#fff;color:#000;font-weight:700;border-radius:6px;text-decoration:none;margin:16px 0;">
            Reset Password
          </a>
          <p style="font-size:12px;color:#888;">Or copy this link: ${link}</p>
          <p style="font-size:12px;color:#666;">If you did not request this, ignore this email.</p>
        </div>
      </div>
    `
  });
}

export async function sendIdVerificationApprovedEmail(to, fullName) {
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${baseUrl}/EditProfile`;
  const name = (fullName || '').trim() || 'there';
  await sendEmail({
    to,
    subject: 'Your SEC ID verification was approved',
    text: `Hi ${name},\n\nGreat news — your ID verification has been approved. You can now access verified-only actions in SEC Nightlife.\n\nOpen your profile settings here: ${link}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#fff;background:#111;padding:24px;margin:0;">SEC Nightlife</h2>
        <div style="padding:24px;background:#1a1a1a;color:#e0e0e0;">
          <h3>ID verification approved</h3>
          <p>Hi <strong>${name}</strong>,</p>
          <p>Your identity document has been approved. You now have access to verified features.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#fff;color:#000;font-weight:700;border-radius:6px;text-decoration:none;margin:16px 0;">
            Open Edit Profile
          </a>
          <p style="font-size:12px;color:#888;">Or copy this link: ${link}</p>
        </div>
      </div>
    `
  });
}
