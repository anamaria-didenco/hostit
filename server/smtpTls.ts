/**
 * Shared nodemailer TLS options.
 *
 * Previously every SMTP transport hard-coded `rejectUnauthorized: false`,
 * which silently accepts any certificate → a MITM can intercept outbound
 * mail (enquiry replies, deposit prompts, weekly reports). We now VERIFY the
 * SMTP server's certificate by default. Mainstream providers (Gmail,
 * Outlook/365, SendGrid, Mailgun, most hosts) all present valid certs, so
 * this is transparent for them.
 *
 * Escape hatch: if a venue's SMTP genuinely uses a self-signed / invalid
 * certificate and mail stops sending after this change, set
 * `SMTP_ALLOW_INVALID_CERT=true` to restore the old lenient behaviour while
 * the certificate is fixed properly.
 */
export function smtpTls(): { rejectUnauthorized: boolean } {
  return { rejectUnauthorized: process.env.SMTP_ALLOW_INVALID_CERT !== "true" };
}
