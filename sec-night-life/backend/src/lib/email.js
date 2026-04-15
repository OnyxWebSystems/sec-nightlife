import { Resend } from 'resend';
import { logger } from './logger.js';

function getFromAddress() {
  return process.env.EMAIL_FROM || 'noreply@secnightlife.com';
}

function createResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html, text }) {
  const resend = createResendClient();
  const from = getFromAddress();
  await resend.emails.send({ from, to, subject, html, text });
  logger.info('Email sent via Resend', { to, subject });
}

export async function sendBulkEmails(messages) {
  const resend = createResendClient();
  const from = getFromAddress();
  if (!Array.isArray(messages) || messages.length === 0) return;

  const payload = messages.map((m) => ({
    from,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: m.text
  }));

  const batchSend = resend.batch?.send?.bind(resend.batch);
  if (typeof batchSend === 'function') {
    await batchSend(payload);
  } else {
    await Promise.all(payload.map((m) => resend.emails.send(m)));
  }
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
    text: `Hi ${name},\n\nGreat news — your ID verification has been approved. You can now access verified-only actions in SEC Nightlife.\n\nImportant: open Edit Profile and press Save to ensure your profile is fully updated.\n\nOpen your profile settings here: ${link}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#fff;background:#111;padding:24px;margin:0;">SEC Nightlife</h2>
        <div style="padding:24px;background:#1a1a1a;color:#e0e0e0;">
          <h3>ID verification approved</h3>
          <p>Hi <strong>${name}</strong>,</p>
          <p>Your identity document has been approved. You now have access to verified features.</p>
          <p><strong>Important:</strong> please open Edit Profile and press <strong>Save</strong> to ensure your profile is fully updated.</p>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#fff;color:#000;font-weight:700;border-radius:6px;text-decoration:none;margin:16px 0;">
            Open Edit Profile
          </a>
          <p style="font-size:12px;color:#888;">Or copy this link: ${link}</p>
        </div>
      </div>
    `
  });
}
