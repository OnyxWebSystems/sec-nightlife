import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { logger } from './logger.js';

const isProd = process.env.NODE_ENV === 'production';
const hasResend = !!process.env.RESEND_API_KEY;
const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function getFromAddress() {
  return process.env.EMAIL_FROM || 'noreply@secnightlife.com';
}

function createSmtpTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function createResendClient() {
  if (!hasResend) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Send an email using the configured provider.
 * Priority:
 *  1. Resend when RESEND_API_KEY is set
 *  2. SMTP when SMTP_* variables are present
 *  3. Dev-only console fallback (never in production)
 */
async function sendMail({ to, subject, html, text }) {
  const from = getFromAddress();

  if (hasResend) {
    try {
      const resend = createResendClient();
      await resend.emails.send({
        from,
        to,
        subject,
        html,
        text
      });
      logger.info('Email sent via Resend', { to, subject });
      return;
    } catch (err) {
      logger.error('Failed to send email via Resend', {
        to,
        subject,
        error: err?.message || String(err)
      });
      if (isProd && !hasSmtp) {
        // In production with only Resend configured, treat this as a soft failure
        return;
      }
      // Otherwise fall through to SMTP/dev fallback
    }
  }

  if (hasSmtp) {
    try {
      const transporter = createSmtpTransport();
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text
      });
      logger.info('Email sent via SMTP', { to, subject });
      return;
    } catch (err) {
      logger.error('Failed to send email via SMTP', {
        to,
        subject,
        error: err?.message || String(err)
      });
      if (isProd && !hasResend) {
        // In production with only SMTP configured, treat this as a soft failure
        return;
      }
    }
  }

  if (!isProd) {
    // Dev fallback — print email to stdout so developers can click the link
    logger.info('[DEV EMAIL — not sent via provider]', { to, subject });
    process.stdout.write('─'.repeat(60) + '\n');
    process.stdout.write(`TO: ${to}\n`);
    process.stdout.write(`SUBJECT: ${subject}\n`);
    process.stdout.write((text || '') + '\n');
    process.stdout.write('─'.repeat(60) + '\n');
  } else {
    // Production without any working provider — log error but do not crash the process
    logger.error('No email provider configured or all providers failed. Email not sent.', {
      to,
      subject
    });
  }
}

export async function sendVerificationEmail(to, token) {
  const baseUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail({
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
  await sendMail({
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
