/**
 * Getting the venue's own emails delivered: the "New Event Enquiry" email
 * (enquiry_emails) and every bell alert's email (venue_notifications).
 *
 * Both used to be one try. If the mail server refused or timed out at that
 * moment, the email was never sent, and nothing recorded that it hadn't
 * been. Now each email has a status, a count of tries, the time of the next
 * try and the last error, and a job retries it with growing gaps until it
 * goes or the policy gives up.
 *
 * Statuses, the same in both tables:
 *  - pending: wanted and not sent yet; due at its next-try time.
 *  - sending: one run has claimed it. The next-try time is then the end of
 *    that claim (EMAIL_SENDING_LEASE_MS): a run that died mid-send leaves it
 *    to be tried again after that, so a rare duplicate beats a lost email.
 *  - sent: the mail server accepted it.
 *  - failed: the policy gave up.
 *  - skipped: nothing to send (email not set up, alerts switched off, or no
 *    longer relevant).
 * Pure; tested in server/emailDelivery.test.ts.
 */

export type EmailDeliveryStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

export const EMAIL_DELIVERY_STATUSES: readonly EmailDeliveryStatus[] = ["pending", "sending", "sent", "failed", "skipped"];

/**
 * nodemailer timeouts for every venue mailer. Its defaults (2 minutes to
 * connect, 30 s for the greeting, 10 minutes of silence) kept SUBMIT waiting
 * a minute or more on a mail server that didn't answer.
 */
export const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 } as const;

export type EmailRetryPolicy = {
  /** Tries in all, the first included. */
  maxAttempts: number;
  /** No try starts later than this after the email was first queued. */
  retryForMs: number;
};

/** The venue's own emails: the New Event Enquiry email and bell alert emails. */
export const VENUE_EMAIL_RETRY: EmailRetryPolicy = { maxAttempts: 8, retryForMs: 2 * 3_600_000 };

/** The visitor's "we've got your enquiry" email: a few tries, then it's too late to be useful. */
export const AUTO_REPLY_RETRY: EmailRetryPolicy = { maxAttempts: 3, retryForMs: 30 * 60_000 };

/** The gap after each failed try: after the 1st, 1 minute; after the 2nd, 2 minutes; and so on. */
export const EMAIL_RETRY_BACKOFF_MS: readonly number[] = [1, 2, 5, 10, 20, 30, 30, 30].map(m => m * 60_000);

/** How long a "sending" claim lasts before another run may try the email again. */
export const EMAIL_SENDING_LEASE_MS = 10 * 60_000;

/** The longest lastError kept (both tables hold varchar(500)). */
export const EMAIL_ERROR_MAX = 500;

/**
 * When to try again after `attempts` tries have failed (attempts >= 1), or
 * null to give up: the policy's tries are used up, or the next try would
 * start more than retryForMs after the email was first queued.
 */
export function nextEmailAttemptAt(attempts: number, firstQueuedAt: Date, now: Date, policy: EmailRetryPolicy): Date | null {
  if (attempts >= policy.maxAttempts) return null;
  const gap = EMAIL_RETRY_BACKOFF_MS[Math.min(Math.max(attempts, 1), EMAIL_RETRY_BACKOFF_MS.length) - 1];
  const next = now.getTime() + gap;
  if (next - new Date(firstQueuedAt).getTime() > policy.retryForMs) return null;
  return new Date(next);
}

const ADDRESS = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g;

/**
 * One line about a failed send, for the server log and lastError: the SMTP
 * reply code, nodemailer's error code, the stage it failed at and the mail
 * server's own words, e.g. "421 ECONNECTION (CONN): 421 4.7.0 Try again
 * later, closing connection." Email addresses in it become "<address>", and
 * nothing from the email itself is ever included.
 */
export function describeSmtpError(err: unknown): string {
  const e = (err ?? {}) as { responseCode?: unknown; code?: unknown; command?: unknown; response?: unknown; message?: unknown };
  const head = [
    typeof e.responseCode === "number" ? String(e.responseCode) : "",
    typeof e.code === "string" ? e.code : "",
    typeof e.command === "string" && e.command ? `(${e.command.split(/\s+/)[0]})` : "",
  ].filter(Boolean).join(" ");
  const said = typeof e.response === "string" && e.response.trim()
    ? e.response
    : typeof e.message === "string" ? e.message : typeof err === "string" ? err : "";
  const text = [head, said.replace(ADDRESS, "<address>").replace(/\s+/g, " ").trim()].filter(Boolean).join(": ");
  return (text || "Unknown error").slice(0, EMAIL_ERROR_MAX);
}
