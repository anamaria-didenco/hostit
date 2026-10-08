/**
 * What happens when a client opens, accepts or declines a proposal on the
 * public proposal page — and making sure the venue hears about each one.
 *
 * Before this, opening a proposal silently flipped it to "viewed", a decline
 * told the client "the venue team has been notified" when nobody was, and an
 * accept marked the proposal accepted BEFORE checking it could become a
 * booking — so a failed check left an "accepted" proposal with no booking.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, getLeadById, addLeadActivity, updateLead } from "./db";
import { proposals, bookings, contracts, clientPortalTokens, type Proposal } from "../drizzle/schema";
import { notifyVenue, bookingLink } from "./notify";
import { buildVenueMailer, fmtNzd } from "./paymentsEmail";
import { escapeHtml } from "./sanitizeHtml";
import { publicBaseUrl } from "./publicUrl";

const NZ_TZ = "Pacific/Auckland";

/** A proposal whose expiry has passed can no longer be accepted or declined. */
export function isProposalExpired(p: { expiresAt: Date | string | null | undefined }, now = Date.now()): boolean {
  if (!p.expiresAt) return false;
  const t = new Date(p.expiresAt).getTime();
  return Number.isFinite(t) && t < now;
}

export function fmtNzDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-NZ", { timeZone: NZ_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function fmtNzDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-NZ", { timeZone: NZ_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

function personName(lead: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  const n = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ").trim();
  return n || "Your client";
}

/**
 * First open of a sent proposal: mark it viewed, log it on the enquiry and
 * alert the venue. The conditional update means only the very first open
 * counts, even if the page is loaded twice at once. Never throws.
 */
export async function recordProposalViewed(proposal: Proposal): Promise<boolean> {
  try {
    if (proposal.status !== "sent") return false;
    const db = await getDb();
    if (!db) return false;
    const now = new Date();
    const claimed = await db.update(proposals)
      .set({ status: "viewed", viewedAt: now })
      .where(and(eq(proposals.id, proposal.id), eq(proposals.status, "sent")))
      .returning({ id: proposals.id });
    if (claimed.length === 0) return false;
    const lead = await getLeadById(proposal.leadId, proposal.ownerId);
    const who = personName(lead);
    await addLeadActivity({
      leadId: proposal.leadId,
      ownerId: proposal.ownerId,
      type: "status_change",
      content: `${who} opened proposal "${proposal.title}"`,
    });
    await notifyVenue(proposal.ownerId, {
      kind: "proposal_viewed",
      title: `${who} opened your proposal`,
      body: `"${proposal.title}" was opened ${fmtNzDateTime(now)}.`,
      leadId: proposal.leadId,
      dedupeKey: `proposal_viewed:${proposal.id}`,
    });
    return true;
  } catch (err) {
    console.error("[proposals] recording view failed (non-fatal):", err);
    return false;
  }
}

// ─── Client confirmation email on accept ─────────────────────────────────────

export type AcceptEmailInput = {
  venueName: string;
  fromName: string;
  clientFirstName: string;
  proposalTitle: string;
  eventDate: Date | string | null;
  guestCount: number | null;
  spaceName: string | null;
  totalNzd: number;
  depositNzd: number;
  paymentInstructions: string | null;
  hasContract: boolean;
  proposalUrl: string;
  portalUrl: string | null;
};

/** The "you're booked in" email body. Pure, so the wording can be tested. */
export function buildAcceptConfirmationEmail(i: AcceptEmailInput): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const date = fmtNzDate(i.eventDate);
  const summary: [string, string][] = [];
  if (date) summary.push(["Date", date]);
  if (i.guestCount) summary.push(["Guests", String(i.guestCount)]);
  if (i.spaceName) summary.push(["Space", i.spaceName]);
  if (i.totalNzd > 0) summary.push(["Total (incl. GST)", fmtNzd(i.totalNzd)]);

  // Next steps: only what actually exists for this booking.
  const steps: string[] = [];
  if (i.depositNzd > 0) {
    steps.push(i.paymentInstructions
      ? `A deposit of ${fmtNzd(i.depositNzd)} secures your date. How to pay:\n${i.paymentInstructions}`
      : `A deposit of ${fmtNzd(i.depositNzd)} secures your date. We'll let you know how to pay it.`);
  }
  if (i.hasContract) steps.push("We'll send you your contract to read and sign online.");
  if (steps.length === 0) steps.push("There's nothing you need to do right now. We'll be in touch to go over the final details.");

  const subject = `You're booked in — ${i.proposalTitle}`;
  const rows = summary.map(([k, v]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;font-size:13px;vertical-align:top">${e(k)}</td><td style="padding:4px 0;font-size:14px;color:#1f2937">${e(v)}</td></tr>`).join("");
  const stepsHtml = steps.map(s => `<li style="margin:0 0 8px;white-space:pre-line">${e(s)}</li>`).join("");
  const links = [
    `<a href="${e(i.proposalUrl)}" style="color:#2d3a2e;font-weight:bold">View your proposal</a>`,
    i.portalUrl ? `<a href="${e(i.portalUrl)}" style="color:#2d3a2e;font-weight:bold">Your event page</a>` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const html = `<div style="font-family:sans-serif;max-width:560px;color:#1f2937;line-height:1.5">
<p>Hi ${e(i.clientFirstName)},</p>
<p>Thank you for accepting your proposal — we're delighted to be hosting your event at ${e(i.venueName)}.</p>
${rows ? `<table style="border-collapse:collapse;margin:8px 0 16px">${rows}</table>` : ""}
<p style="font-weight:bold;margin:16px 0 6px">What happens next</p>
<ul style="padding-left:20px;margin:0 0 16px">${stepsHtml}</ul>
<p>${links}</p>
<p>If anything's changed or you have a question, just reply to this email.</p>
<p>Warm regards,<br>${e(i.fromName)}</p>
</div>`;
  const text = [
    `Hi ${i.clientFirstName},`,
    "",
    `Thank you for accepting your proposal — we're delighted to be hosting your event at ${i.venueName}.`,
    "",
    ...summary.map(([k, v]) => `${k}: ${v}`),
    "",
    "What happens next",
    ...steps.map(s => `- ${s}`),
    "",
    `View your proposal: ${i.proposalUrl}`,
    ...(i.portalUrl ? [`Your event page: ${i.portalUrl}`] : []),
    "",
    "If anything's changed or you have a question, just reply to this email.",
    "",
    "Warm regards,",
    i.fromName,
  ].join("\n");
  return { subject, html, text };
}

async function sendAcceptConfirmation(proposal: Proposal, lead: { firstName: string; email: string; id: number }, bookingId: number): Promise<boolean> {
  try {
    const mailer = await buildVenueMailer(proposal.ownerId);
    if (!mailer || !lead.email) return false;
    if ((mailer.venue?.proposalAcceptEmailEnabled ?? 1) === 0) return false;
    const db = await getDb();
    if (!db) return false;
    const [contract] = await db.select({ id: contracts.id }).from(contracts)
      .where(and(eq(contracts.ownerId, proposal.ownerId), eq(contracts.leadId, proposal.leadId), ne(contracts.status, "signed")))
      .limit(1);
    const [portal] = await db.select({ token: clientPortalTokens.token }).from(clientPortalTokens)
      .where(and(eq(clientPortalTokens.ownerId, proposal.ownerId), eq(clientPortalTokens.leadId, proposal.leadId)))
      .limit(1);
    const base = publicBaseUrl();
    const mail = buildAcceptConfirmationEmail({
      venueName: mailer.venue?.name ?? mailer.fromName,
      fromName: mailer.fromName,
      clientFirstName: lead.firstName,
      proposalTitle: proposal.title,
      eventDate: proposal.eventDate,
      guestCount: proposal.guestCount,
      spaceName: proposal.spaceName,
      totalNzd: Number(proposal.totalNzd ?? 0),
      depositNzd: Number(proposal.depositNzd ?? 0),
      paymentInstructions: mailer.venue?.paymentInstructions?.trim() || null,
      hasContract: !!contract,
      proposalUrl: `${base}/proposal/${proposal.publicToken}`,
      portalUrl: portal ? `${base}/portal/${portal.token}` : null,
    });
    await mailer.transporter.sendMail({
      from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
      to: lead.email,
      ...(mailer.venue?.email ? { replyTo: mailer.venue.email } : {}),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    await addLeadActivity({ leadId: lead.id, ownerId: proposal.ownerId, type: "email", content: `Booking confirmation emailed to ${lead.email}` });
    return true;
  } catch (err) {
    console.error(`[proposals] accept confirmation for booking ${bookingId} failed (non-fatal):`, err);
    return false;
  }
}

// ─── Respond (accept / decline) ──────────────────────────────────────────────

export type RespondResult = { success: true; status: "accepted" | "declined"; confirmationEmailed: boolean };

export async function respondToProposal(input: {
  token: string;
  action: "accepted" | "declined";
  clientMessage?: string;
  declineReason?: string;
}): Promise<RespondResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong on our side. Please try again in a moment." });
  const [proposal] = await db.select().from(proposals).where(eq(proposals.publicToken, input.token)).limit(1);
  if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "We couldn't find this proposal." });

  const expiredMsg = "This proposal has expired. Please get in touch with the venue and they'll send you an updated one.";
  if (proposal.status === "expired") throw new TRPCError({ code: "BAD_REQUEST", message: expiredMsg });
  if (!["sent", "viewed"].includes(proposal.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This proposal has already been answered. Please contact the venue if anything has changed." });
  }
  if (isProposalExpired(proposal)) throw new TRPCError({ code: "BAD_REQUEST", message: expiredMsg });

  const lead = await getLeadById(proposal.leadId, proposal.ownerId);
  const who = personName(lead);
  const message = input.clientMessage?.trim() || null;

  if (input.action === "declined") {
    const reason = (input.declineReason ?? input.clientMessage)?.trim() || null;
    const claimed = await db.update(proposals)
      .set({ status: "declined", respondedAt: new Date(), declineReason: reason, clientMessage: message })
      .where(and(eq(proposals.id, proposal.id), inArray(proposals.status, ["sent", "viewed"])))
      .returning({ id: proposals.id });
    if (claimed.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This proposal has already been answered." });

    let movedToLost = false;
    if (lead) {
      // Don't undo a booking: if the lead is already booked (e.g. they accepted
      // a different proposal), a decline of this one leaves the status alone.
      const [otherAccepted] = await db.select({ id: proposals.id }).from(proposals)
        .where(and(eq(proposals.leadId, lead.id), eq(proposals.ownerId, proposal.ownerId), eq(proposals.status, "accepted")))
        .limit(1);
      if (lead.status !== "booked" && !otherAccepted) {
        // Lost with a reason (shows in Reports → lost reasons and Win back);
        // also ends any date hold. The activity entry is written below.
        const { markLeadLost } = await import("./db");
        await markLeadLost(proposal.ownerId, lead.id, "other",
          `Declined the proposal${reason ? `: ${reason}` : ""}`, { logActivity: false });
        movedToLost = true;
      }
      await addLeadActivity({
        leadId: lead.id,
        ownerId: proposal.ownerId,
        type: "status_change",
        content: `${who} declined proposal "${proposal.title}"${reason ? ` — reason: "${reason}"` : " (no reason given)"}${movedToLost ? ". Enquiry moved to Lost." : ""}`,
      });
    }
    await notifyVenue(proposal.ownerId, {
      kind: "proposal_declined",
      title: `${who} declined your proposal`,
      body: `"${proposal.title}"\n${reason ? `Reason: ${reason}` : "No reason given."}`,
      leadId: proposal.leadId,
      dedupeKey: `proposal_declined:${proposal.id}`,
    });
    return { success: true, status: "declined", confirmationEmailed: false };
  }

  // ── Accept: validate everything BEFORE marking it accepted ──
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "We couldn't find the enquiry for this proposal. Please contact the venue." });
  const resolvedSpace = (proposal.spaceName ?? lead.spaceName ?? "").trim();
  if (!resolvedSpace) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This proposal isn't quite ready to accept yet — the venue still needs to set the event space. Please contact them and they'll sort it out." });
  }

  const claimed = await db.update(proposals)
    .set({ status: "accepted", respondedAt: new Date(), clientMessage: message })
    .where(and(eq(proposals.id, proposal.id), inArray(proposals.status, ["sent", "viewed"])))
    .returning({ id: proposals.id });
  if (claimed.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This proposal has already been answered." });

  let bookingId: number;
  try {
    const [created] = await db.insert(bookings).values({
      ownerId: proposal.ownerId,
      leadId: proposal.leadId,
      proposalId: proposal.id,
      firstName: lead.firstName,
      lastName: lead.lastName ?? undefined,
      email: lead.email,
      eventType: lead.eventType ?? undefined,
      eventDate: proposal.eventDate ?? lead.eventDate ?? new Date(),
      eventEndDate: proposal.eventEndDate ?? undefined,
      guestCount: proposal.guestCount ?? lead.guestCount ?? undefined,
      spaceName: resolvedSpace,
      totalNzd: proposal.totalNzd as any,
      depositNzd: proposal.depositNzd as any,
      status: "confirmed",
    }).returning({ id: bookings.id });
    if (!created) throw new Error("booking insert returned no row");
    bookingId = created.id;
  } catch (err) {
    // Put the proposal back so it never says "accepted" without a booking.
    console.error(`[proposals] booking for proposal ${proposal.id} failed; reverting accept:`, err);
    await db.update(proposals).set({ status: proposal.status, respondedAt: null, clientMessage: proposal.clientMessage })
      .where(eq(proposals.id, proposal.id));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We couldn't confirm your booking just now. Please try again, or contact the venue." });
  }

  // Date clash → flag the booking + urgent venue alert; never blocks the
  // client (they accepted what the venue offered). Also ends any date hold.
  try {
    await (await import("./holds")).afterProposalAccepted(proposal.ownerId, bookingId, proposal.leadId);
  } catch (err) {
    console.error("[proposals] clash check after accept failed (non-fatal):", err);
  }

  // Push to NBI so accepted proposals appear in the NBI diary too.
  try {
    const { pushBookingToNbi } = await import("./nowbookit");
    await pushBookingToNbi(bookingId, proposal.ownerId, { source: "proposals.respond→accepted" });
  } catch (err) {
    console.error("[proposals] NBI push failed (non-fatal):", err);
  }
  // Turned off at the owner's request; a no-op unless re-enabled by env.
  const { sendDepositPromptEmail } = await import("./depositPrompt");
  await sendDepositPromptEmail(bookingId, proposal.ownerId, { source: "proposals.respond→accepted" });

  await updateLead(lead.id, proposal.ownerId, { status: "booked", updatedAt: new Date() });
  await addLeadActivity({
    leadId: proposal.leadId,
    ownerId: proposal.ownerId,
    type: "booking_created",
    content: `${who} accepted proposal "${proposal.title}" — booking confirmed${message ? `. Message: "${message}"` : ""}`,
  });
  const date = fmtNzDate(proposal.eventDate ?? lead.eventDate);
  await notifyVenue(proposal.ownerId, {
    kind: "proposal_accepted",
    title: `${who} accepted your proposal`,
    body: [
      `"${proposal.title}" — the booking is confirmed.`,
      [date, proposal.guestCount ? `${proposal.guestCount} guests` : "", resolvedSpace, Number(proposal.totalNzd ?? 0) > 0 ? fmtNzd(Number(proposal.totalNzd)) : ""].filter(Boolean).join(" · "),
      message ? `Message: ${message}` : "",
    ].filter(Boolean).join("\n"),
    leadId: proposal.leadId,
    bookingId,
    link: bookingLink(bookingId),
    dedupeKey: `proposal_accepted:${proposal.id}`,
  });
  // Venue's "when a booking is confirmed" task rules (server/automatedTasks.ts).
  const { fireTaskRules } = await import("./automatedTasks");
  await fireTaskRules(proposal.ownerId, { trigger: "on_booking_confirmed", leadId: proposal.leadId, bookingId });
  const confirmationEmailed = await sendAcceptConfirmation(proposal, lead, bookingId);
  return { success: true, status: "accepted", confirmationEmailed };
}
