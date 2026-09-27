'use strict';

const nodemailer = require('nodemailer');
const { config } = require('../config');
const { logger } = require('./logger');

/**
 * Transactional email (currently: password-reset links only).
 *
 * Transport selection is lazy and env-driven:
 *   - If SMTP_HOST is configured, we send over real SMTP (Gmail, Brevo,
 *     Mailgun, SendGrid — any provider).
 *   - Otherwise we fall back to nodemailer's jsonTransport, which serializes
 *     the message WITHOUT touching the network. This keeps local dev and the
 *     test suite fully offline, and means a production box with no SMTP
 *     configured degrades gracefully (the reset endpoint still succeeds
 *     uniformly; the mail is simply logged, never sent) instead of throwing.
 *
 * Security: the raw reset token only ever leaves the server inside the email
 * body. We never log or return it in production. In dev/test we capture sent
 * messages in an in-memory `outbox` so integration tests can read the link.
 */

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (config.email.smtpHost) {
    transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpSecure, // true for 465, false for 587/STARTTLS
      auth: config.email.smtpUser
        ? { user: config.email.smtpUser, pass: config.email.smtpPass }
        : undefined,
    });
  } else {
    // No SMTP configured: serialize only, never hit the network.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

// Dev/test capture of sent mail so tests can extract the reset link. Never
// populated in production.
const outbox = [];
function clearOutbox() { outbox.length = 0; }

function isEmailConfigured() {
  return Boolean(config.email.smtpHost);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function sendPasswordResetEmail({ to, username, resetUrl }) {
  const safeName = escapeHtml(username || 'there');
  const safeUrl = encodeURI(resetUrl);
  const subject = 'Reset your Bingo Arena password';
  const text = [
    `Hi ${username || 'there'},`,
    '',
    'We received a request to reset your Bingo Arena password.',
    'Open the link below to choose a new one. It expires in 1 hour and can be used once:',
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your password will not change.",
    '',
    '— Bingo Arena',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#111">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your <strong>Bingo Arena</strong> password.
         This link expires in 1 hour and can be used once.</p>
      <p style="margin:24px 0">
        <a href="${safeUrl}" style="background:#5b6cff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Choose a new password</a>
      </p>
      <p style="font-size:13px;color:#555">Or paste this link into your browser:<br>
        <span style="word-break:break-all">${safeUrl}</span></p>
      <p style="font-size:13px;color:#555">If you didn't request this, you can safely ignore this email — your password will not change.</p>
    </div>`;

  const info = await getTransporter().sendMail({
    from: config.email.from,
    to,
    subject,
    text,
    html,
  });

  if (config.env !== 'production') {
    outbox.push({ to, username, resetUrl });
    logger.info(`[mailer] password-reset link for ${to}: ${resetUrl}`);
  }
  return info;
}

module.exports = { sendPasswordResetEmail, isEmailConfigured, outbox, clearOutbox };
