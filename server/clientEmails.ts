/**
 * Wording of the client emails that are sent from routers.ts: the enquiry
 * auto-reply, the proposal email, the deposit request, payment receipts and
 * the one-tap follow-up. Pure (no DB, no SMTP), so the wording can be tested
 * and previewed; the procedures decide when each one is sent.
 *
 * Every value that comes from a person or the database goes through
 * escapeHtml in the HTML. The plain text says the same thing as the HTML.
 */
import { escapeHtml as esc } from "./sanitizeHtml";
import { fmtNzd } from "./paymentsEmail";
import { DEFAULT_AUTO_REPLY_INTRO, copyEventType } from "@shared/enquiryCopy";
import { DEFAULT_VENUE_TZ } from "@shared/eventDate";

export type ClientEmail = { subject: string; html: string; text: string };

/** "or reach us on 03 555 0142 · events@venue" — phone only when there is one. */
const reachUs = (bits: string) => (bits ? ` or reach us on ${bits}` : "");

// ─── Enquiry auto-reply ──────────────────────────────────────────────────────

export type AutoReplyInput = {
  venueName: string;
  brand: { accent: string; onAccent: string; sans: string; serif: string };
  /** The header logo, already built and escaped (or ""). */
  logoHtml: string;
  firstName: string;
  /** The venue's own opening line from Settings, used instead of the default when set. */
  introOverride?: string | null;
  eventType?: string | null;
  /** The event date, already formatted ("Saturday, 13 March 2027"). */
  dateLabel: string | null;
  dateFlexible?: boolean | null;
  guestCount?: number | null;
  phone?: string | null;
  fromEmail: string;
};

export function buildEnquiryAutoReplyEmail(i: AutoReplyInput): ClientEmail {
  const { brand } = i;
  const intro = i.introOverride?.trim() || DEFAULT_AUTO_REPLY_INTRO;
  const flexible = i.dateFlexible ? " (flexible)" : "";
  const details = [
    i.eventType && `<tr><td style="padding:3px 0;color:#6b7280;font-size:14px;width:120px">Event</td><td style="padding:3px 0;font-size:14px">${esc(i.eventType)}</td></tr>`,
    i.dateLabel && `<tr><td style="padding:3px 0;color:#6b7280;font-size:14px">Date</td><td style="padding:3px 0;font-size:14px;font-weight:600">${esc(i.dateLabel)}${flexible}</td></tr>`,
    i.guestCount && `<tr><td style="padding:3px 0;color:#6b7280;font-size:14px">Guests</td><td style="padding:3px 0;font-size:14px">${esc(i.guestCount)}</td></tr>`,
  ].filter(Boolean).join("");
  const contactHtml = [i.phone && esc(i.phone), esc(i.fromEmail)].filter(Boolean).join(" · ");
  const contactText = [i.phone, i.fromEmail].filter(Boolean).join(" · ");
  const replyLine = (bits: string) => `If anything changes in the meantime, just reply to this email${reachUs(bits)}.`;
  const html = `<div style="font-family:${brand.sans};max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${brand.accent};color:${brand.onAccent};padding:22px 26px;border-radius:10px 10px 0 0">
    ${i.logoHtml}
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;font-family:${brand.sans}">${esc(i.venueName)}</div>
    <div style="font-size:23px;font-weight:bold;margin-top:4px;font-family:${brand.serif}">Good to hear from you</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px;border-radius:0 0 10px 10px">
    <p style="font-size:16px;margin:0 0 12px;font-family:${brand.serif}">Hi ${esc(i.firstName)},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 ${details ? "16px" : "18px"}">${esc(intro)}</p>
    ${details ? `<table style="width:100%;border-collapse:collapse;background:#f7f2e9;border-radius:8px;padding:6px 12px"><tbody>${details}</tbody></table>` : ""}
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:18px 0 0">${replyLine(contactHtml)}</p>
    <p style="font-size:15px;margin:16px 0 0;font-family:${brand.serif}">Speak soon,<br/><strong>${esc(i.venueName)}</strong></p>
  </div>
</div>`;
  const detailLines = [
    i.eventType && `Event: ${i.eventType}`,
    i.dateLabel && `Date: ${i.dateLabel}${flexible}`,
    i.guestCount && `Guests: ${i.guestCount}`,
  ].filter(Boolean).join("\n");
  const text = [
    `Hi ${i.firstName},`,
    intro,
    ...(detailLines ? [detailLines] : []),
    replyLine(contactText),
    `Speak soon,\n${i.venueName}`,
  ].join("\n\n");
  return { subject: `Your enquiry is with us — ${i.venueName}`, html, text };
}

// ─── Proposal email ──────────────────────────────────────────────────────────

export function buildProposalSentEmail(i: {
  firstName: string; fromName: string; proposalUrl: string; proposalTitle: string;
}): ClientEmail {
  const intro = "Here's what we've put together for you. It sets out the details, pricing and terms for your event.";
  const closing = "If you'd like to change anything or have a question, just reply to this email and we'll talk it through.";
  const url = esc(i.proposalUrl);
  const html = `<p>Hi ${esc(i.firstName)},</p>`
    + `<p>${esc(intro)}</p>`
    + `<p><a href="${url}" style="background:#4f7942;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View your proposal</a></p>`
    + `<p>Or copy this link: <a href="${url}">${url}</a></p>`
    + `<p>${esc(closing)}</p>`
    + `<p>Speak soon,<br>${esc(i.fromName)}</p>`;
  const text = [
    `Hi ${i.firstName},`,
    intro,
    `View your proposal: ${i.proposalUrl}`,
    closing,
    `Speak soon,\n${i.fromName}`,
  ].join("\n\n");
  return { subject: `Your proposal is ready — ${i.proposalTitle}`, html, text };
}

// ─── Deposit request ─────────────────────────────────────────────────────────

export function buildDepositRequestEmail(i: {
  firstName: string | null; eventType: string | null; depositNzd: number;
  paymentInstructions: string; portalUrl: string | null; fromName: string;
}): ClientEmail {
  const first = i.firstName ?? "there";
  // The type is a label on the booking ("your Corporate booking"), never the
  // thing being hosted: the booking editor offers "Corporate", "Birthday" and
  // the like, which don't read as "hosting your Corporate".
  const type = copyEventType(i.eventType);
  const opener = "We're looking forward to hosting you.";
  const amount = fmtNzd(i.depositNzd);
  const moneyLine = (t: string, a: string) => `To secure your ${t ? `${t} booking` : "booking"}, we ask for a deposit of ${a}.`;
  const instr = i.paymentInstructions.trim();
  const portalLead = "You can see your balance and confirm your payment any time on your event page:";
  const closing = "Any questions, just reply to this email.";
  const html = `<p>Hi ${esc(first)},</p>`
    + `<p>${esc(opener)}</p>`
    + `<p>${moneyLine(type ? esc(type) : "", `<strong>${amount}</strong>`)}</p>`
    + (instr ? `<p><strong>How to pay</strong><br>${esc(instr).replace(/\n/g, "<br>")}</p>` : "")
    + (i.portalUrl ? `<p>${portalLead}<br><a href="${esc(i.portalUrl)}">${esc(i.portalUrl)}</a></p>` : "")
    + `<p>${closing}</p>`
    + `<p>Speak soon,<br>${esc(i.fromName)}</p>`;
  const text = [
    `Hi ${first},`,
    opener,
    moneyLine(type ?? "", amount),
    ...(instr ? [`How to pay:\n${instr}`] : []),
    ...(i.portalUrl ? [`${portalLead}\n${i.portalUrl}`] : []),
    closing,
    `Speak soon,\n${i.fromName}`,
  ].join("\n\n");
  return { subject: `Deposit details for your booking — ${i.fromName}`, html, text };
}

// ─── Payment receipt / refund ────────────────────────────────────────────────

const PAYMENT_KIND: Record<string, string> = { deposit: "deposit", partial: "payment", final: "final payment", refund: "refund", other: "payment" };

export function buildPaymentReceiptEmail(i: {
  firstName: string | null; type: string; amount: number; paidAt: Date | string;
  /** The booking total; 0 means no total is set, so no balance line. */
  total: number; outstanding: number; portalUrl: string | null; fromName: string;
  /** The booking is cancelled: no balance line, as nothing more is owed. */
  cancelled?: boolean;
}): ClientEmail {
  const first = i.firstName ?? "there";
  const refund = i.type === "refund";
  const showBalance = i.total > 0 && !i.cancelled;
  const kind = PAYMENT_KIND[i.type] ?? "payment";
  const paidOn = new Date(i.paidAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: DEFAULT_VENUE_TZ });
  const amount = fmtNzd(i.amount);
  const amountLine = (b: (s: string) => string) => refund
    ? `We've refunded ${b(amount)} to you on ${paidOn}.`
    : `Thank you for your ${kind} of ${b(amount)}, received on ${paidOn}.`;
  const balanceLine = (b: (s: string) => string) =>
    `Your remaining balance is ${b(fmtNzd(i.outstanding))}${i.outstanding <= 0 ? ", so you're all paid up" : ""}.`;
  const strong = (s: string) => `<strong>${s}</strong>`;
  const plain = (s: string) => s;
  const portalLead = "Full details are on your event page:";
  const closing = "Any questions, just reply to this email.";
  // A cancelled booking may not hear from the venue again; any other booking
  // still has its event ahead.
  const signOff = i.cancelled ? "All the best," : "Speak soon,";
  const html = `<p>Hi ${esc(first)},</p>`
    + `<p>${amountLine(strong)}</p>`
    + (showBalance ? `<p>${balanceLine(strong)}</p>` : "")
    + (i.portalUrl ? `<p>${portalLead}<br><a href="${esc(i.portalUrl)}">${esc(i.portalUrl)}</a></p>` : "")
    + `<p>${closing}</p>`
    + `<p>${signOff}<br>${esc(i.fromName)}</p>`;
  const text = [
    `Hi ${first},`,
    amountLine(plain),
    ...(showBalance ? [balanceLine(plain)] : []),
    ...(i.portalUrl ? [`${portalLead}\n${i.portalUrl}`] : []),
    closing,
    `${signOff}\n${i.fromName}`,
  ].join("\n\n");
  const subject = refund ? `Confirming your refund — ${i.fromName}` : `We've received your ${kind} — ${i.fromName}`;
  return { subject, html, text };
}

// ─── One-tap follow-up ───────────────────────────────────────────────────────

export function buildOneTapFollowUpEmail(i: {
  firstName: string | null; venueName: string; accent: string;
  /** The lead's status: "proposal_sent" follows up the proposal, anything else the enquiry. */
  status: string;
  /** Staff's own message, used instead of the default wording. */
  message?: string | null;
}): ClientEmail {
  const first = i.firstName ?? "there";
  const quoted = i.status === "proposal_sent";
  const custom = i.message?.trim();
  // No event type here: a lead's type is free text ("Corporate"), which
  // doesn't read as "your Corporate".
  const body = custom
    ? custom
    : quoted
      ? "We wanted to check in on the proposal we sent. If you'd like to change anything or have a question, just reply to this email and we'll talk it through."
      : "We wanted to see how your plans are coming along. If there's anything we can help with, or anything you'd like to talk through, just reply to this email.";
  const subject = quoted ? `Following up on your proposal — ${i.venueName}` : `Following up on your enquiry — ${i.venueName}`;
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${i.accent};color:#fff;padding:22px 26px;border-radius:10px 10px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;font-family:Arial,sans-serif">${esc(i.venueName)}</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">Here when you're ready</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px;border-radius:0 0 10px 10px">
    <p style="font-size:16px;margin:0 0 12px">Hi ${esc(first)},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${esc(body).replace(/\n/g, "<br>")}</p>
    <p style="font-size:15px;margin:16px 0 0">Speak soon,<br/><strong>${esc(i.venueName)}</strong></p>
  </div>
</div>`;
  const text = `Hi ${first},\n\n${body}\n\nSpeak soon,\n${i.venueName}`;
  return { subject, html, text };
}
