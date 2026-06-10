/**
 * Weekly enquiry & pipeline report.
 *
 * Emails a summary of the week's enquiries and the current pipeline — new
 * enquiries (by source), events confirmed this week, open enquiries still
 * needing follow-up, upcoming events, and how many confirmed events still
 * need a deposit. Sent automatically every Monday ~8am NZ by an in-process
 * scheduler (startEnquiryReportScheduler), and on demand via reports.sendNow.
 *
 * Recipient: REPORT_EMAIL env var, else anamaria@barfranco.nz.
 * Schedule overridable with REPORT_WEEKDAY (default "Mon") + REPORT_HOUR (8).
 * Never throws — failures are logged so they can't crash the server loop.
 */
import { getDb } from "./db";
import { leads, bookings, venueSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const NZ_TZ = "Pacific/Auckland";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL = ["booked", "confirmed", "finished", "lost", "cancelled"];

function esc(s: any): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function titleCase(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function reportRecipient(): string {
  return (process.env.REPORT_EMAIL || "anamaria@barfranco.nz").trim();
}

/** Build the report data + rendered HTML/text for one venue, or null if no DB. */
async function buildReport(ownerId: number, vs: any) {
  const db = await getDb();
  if (!db) return null;
  const now = Date.now();
  const weekAgo = now - WEEK_MS;
  const in30 = now + 30 * 24 * 60 * 60 * 1000;

  const allLeads = await db.select().from(leads).where(eq(leads.ownerId, ownerId));
  const allBookings = await db.select().from(bookings).where(eq(bookings.ownerId, ownerId));
  const t = (d: any) => (d ? new Date(d).getTime() : 0);

  const newEnquiries = allLeads.filter(l => { const c = t(l.createdAt); return c >= weekAgo && c <= now; });
  const confirmedThisWeek = allBookings.filter(b => {
    const c = t((b as any).createdAt);
    return c >= weekAgo && c <= now && (b as any).status !== "cancelled";
  });
  const openEnquiries = allLeads.filter(l => !TERMINAL.includes(l.status));
  const upcoming = allBookings
    .filter(b => { const e = t(b.eventDate); return e >= now && e <= in30 && (b as any).status !== "cancelled"; })
    .sort((a, b) => t(a.eventDate) - t(b.eventDate));
  const depositsOutstanding = upcoming.filter(b => (b as any).depositRequired !== false && !(b as any).depositPaid);
  const upcomingGuests = upcoming.reduce((s, b) => s + (Number(b.guestCount) || 0), 0);

  const bySource: Record<string, number> = {};
  for (const l of newEnquiries) { const s = String(l.source || "other"); bySource[s] = (bySource[s] || 0) + 1; }

  const venueName = vs?.name || "Your venue";
  const fmtDate = (d: any) =>
    new Intl.DateTimeFormat("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: NZ_TZ }).format(new Date(d));
  const rangeLabel = `${new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", timeZone: NZ_TZ }).format(new Date(weekAgo))} – ${new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", timeZone: NZ_TZ }).format(new Date(now))}`;

  // ── Stat cards ──
  const stat = (n: number | string, label: string, color: string) =>
    `<td style="padding:6px"><div style="background:${color}10;border:1px solid ${color}33;border-radius:8px;padding:14px 10px;text-align:center">
      <div style="font-size:30px;font-weight:800;color:${color};line-height:1">${n}</div>
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px">${label}</div></div></td>`;
  const statsRow = `<table style="width:100%;border-collapse:separate;border-spacing:0;margin:4px -6px"><tr>
    ${stat(newEnquiries.length, "New enquiries", "#6b98e7")}
    ${stat(confirmedThisWeek.length, "Confirmed", "#16a34a")}
    ${stat(openEnquiries.length, "Open pipeline", "#d97706")}
  </tr></table>`;

  // ── Sources ──
  const sourceRows = Object.entries(bySource).sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `<tr><td style="padding:3px 0;font-size:13px;color:#374151">${esc(titleCase(s))}</td><td style="padding:3px 0;font-size:13px;font-weight:700;text-align:right">${n}</td></tr>`).join("");
  const sourcesBlock = sourceRows
    ? `<div style="margin-top:18px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:6px">Where this week's enquiries came from</div><table style="width:100%;border-collapse:collapse">${sourceRows}</table></div>`
    : "";

  // ── Upcoming events ──
  const upRows = upcoming.slice(0, 12).map(b => {
    const name = `${esc(b.firstName ?? "")}${b.lastName ? " " + esc(b.lastName) : ""}`.trim() || "—";
    const dep = ((b as any).depositRequired !== false && !(b as any).depositPaid)
      ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px">deposit due</span>`
      : `<span style="color:#16a34a;font-size:11px">✓ deposit</span>`;
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 8px;font-size:13px;white-space:nowrap">${esc(fmtDate(b.eventDate))}</td>
      <td style="padding:6px 8px;font-size:13px">${name}</td>
      <td style="padding:6px 8px;font-size:13px;color:#6b7280">${esc(b.eventType || "—")}</td>
      <td style="padding:6px 8px;font-size:13px;text-align:center">${b.guestCount ?? "—"}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:right">${dep}</td>
    </tr>`;
  }).join("");
  const upcomingBlock = upcoming.length
    ? `<div style="margin-top:22px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:6px">Upcoming events — next 30 days (${upcoming.length}${upcomingGuests ? `, ${upcomingGuests} guests` : ""})</div>
        <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f9fafb">
          <th style="padding:5px 8px;font-size:10px;text-align:left;color:#9ca3af;text-transform:uppercase">Date</th>
          <th style="padding:5px 8px;font-size:10px;text-align:left;color:#9ca3af;text-transform:uppercase">Client</th>
          <th style="padding:5px 8px;font-size:10px;text-align:left;color:#9ca3af;text-transform:uppercase">Type</th>
          <th style="padding:5px 8px;font-size:10px;text-align:center;color:#9ca3af;text-transform:uppercase">Pax</th>
          <th style="padding:5px 8px;font-size:10px;text-align:right;color:#9ca3af;text-transform:uppercase">Deposit</th>
        </tr></thead><tbody>${upRows}</tbody></table>
        ${upcoming.length > 12 ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">…and ${upcoming.length - 12} more</div>` : ""}
      </div>`
    : `<div style="margin-top:22px;font-size:13px;color:#9ca3af">No events in the next 30 days yet.</div>`;

  // ── Action callouts ──
  const callouts: string[] = [];
  if (depositsOutstanding.length) callouts.push(`💰 <strong>${depositsOutstanding.length}</strong> confirmed event${depositsOutstanding.length > 1 ? "s" : ""} still need a deposit sent.`);
  if (openEnquiries.length) callouts.push(`📨 <strong>${openEnquiries.length}</strong> open enquir${openEnquiries.length > 1 ? "ies" : "y"} awaiting a reply or follow-up.`);
  const calloutBlock = callouts.length
    ? `<div style="margin-top:18px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;font-size:13px;color:#78350f;line-height:1.7">${callouts.join("<br>")}</div>`
    : "";

  const base = (process.env.PUBLIC_BASE_URL || "https://venueflowhq.com").replace(/\/$/, "");
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#1f2937;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.7">${esc(venueName)} · Weekly Report</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">This week in your pipeline</div>
    <div style="font-size:13px;opacity:0.8;margin-top:2px">${rangeLabel}</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:18px 20px 22px;border-radius:0 0 8px 8px">
    ${statsRow}
    ${calloutBlock}
    ${sourcesBlock}
    ${upcomingBlock}
    <div style="margin-top:20px;text-align:center">
      <a href="${base}/dashboard" style="display:inline-block;background:#6b98e7;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px">Open dashboard</a>
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af">
      Automatic weekly summary from VenueFlowHQ.
    </div>
  </div>
</div>`;

  const text = `${venueName} — weekly report (${rangeLabel})\n\n`
    + `New enquiries: ${newEnquiries.length}\nConfirmed this week: ${confirmedThisWeek.length}\nOpen pipeline: ${openEnquiries.length}\n`
    + `Deposits still to send: ${depositsOutstanding.length}\nUpcoming events (next 30 days): ${upcoming.length}\n\n`
    + upcoming.slice(0, 12).map(b => `• ${fmtDate(b.eventDate)} — ${(b.firstName ?? "")} ${(b.lastName ?? "")} (${b.guestCount ?? "?"} pax)`).join("\n")
    + `\n\nOpen dashboard: ${base}/dashboard`;

  const subject = `📊 Weekly report — ${venueName}: ${newEnquiries.length} new enquir${newEnquiries.length === 1 ? "y" : "ies"}, ${confirmedThisWeek.length} confirmed`;
  return { html, text, subject };
}

/** Send the report for one venue. Returns whether it sent + why not. */
export async function sendEnquiryReport(
  ownerId: number,
  opts: { source: string } = { source: "manual" }
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const db = await getDb();
    if (!db) return { sent: false, reason: "db_unavailable" };
    const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
    if (!vs?.smtpHost || !vs?.smtpUser || !vs?.smtpPass) {
      console.log(`[EnquiryReport:${opts.source}] owner ${ownerId} — SMTP not configured, skip`);
      return { sent: false, reason: "smtp_not_configured" };
    }
    const built = await buildReport(ownerId, vs);
    if (!built) return { sent: false, reason: "no_data" };

    const nodemailer = await import("nodemailer");
    const port = vs.smtpPort ?? 587;
    const secure = (vs.smtpSecure ?? 0) === 1 || port === 465;
    const transporter = nodemailer.default.createTransport({
      host: vs.smtpHost, port, secure,
      auth: { user: vs.smtpUser, pass: vs.smtpPass },
      tls: { rejectUnauthorized: false },
    } as any);
    const fromName = vs.smtpFromName ?? vs.name ?? "VenueFlowHQ";
    const fromEmail = vs.smtpFromEmail ?? vs.smtpUser;
    const recipients = reportRecipient().split(/[,;]+/).map(s => s.trim()).filter(Boolean);

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: recipients,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
    console.log(`[EnquiryReport:${opts.source}] owner ${ownerId} — sent to ${recipients.join(", ")}`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[EnquiryReport:${opts.source}] owner ${ownerId} failed:`, err?.message ?? err);
    return { sent: false, reason: "exception" };
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────────
// In-process timer; fires the report for every venue with SMTP configured on
// the configured weekday/hour (NZ time). A per-(owner,date) guard prevents the
// hourly window from sending more than once. Requires an always-on deployment
// (Replit Reserved VM); on a sleep-to-zero deployment, use reports.sendNow or
// an external cron hitting that mutation instead.
const sentGuard = new Set<string>();

function nzNow(): { weekday: string; hour: number; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TZ, weekday: "short", hour: "2-digit", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { weekday: g("weekday"), hour: Number(g("hour")), ymd: `${g("year")}-${g("month")}-${g("day")}` };
}

async function runDueReports() {
  try {
    const targetWeekday = (process.env.REPORT_WEEKDAY || "Mon").slice(0, 3).toLowerCase();
    const targetHour = Number(process.env.REPORT_HOUR ?? 8);
    const { weekday, hour, ymd } = nzNow();
    if (weekday.toLowerCase() !== targetWeekday || hour !== targetHour) return;

    const db = await getDb();
    if (!db) return;
    const venues = await db.select().from(venueSettings);
    for (const vs of venues) {
      if (!vs.smtpHost || !vs.smtpUser || !vs.smtpPass) continue;
      const key = `${vs.ownerId}:${ymd}`;
      if (sentGuard.has(key)) continue;
      sentGuard.add(key);
      await sendEnquiryReport(vs.ownerId, { source: "scheduler" });
    }
  } catch (err: any) {
    console.error("[EnquiryReport scheduler] error:", err?.message ?? err);
  }
}

export function startEnquiryReportScheduler() {
  // Check every 15 minutes so we reliably catch the target hour even if a tick
  // drifts; the per-day guard keeps it to one send per venue per week.
  setInterval(() => { void runDueReports(); }, 15 * 60 * 1000);
  // Also check shortly after boot in case the server starts inside the window.
  setTimeout(() => { void runDueReports(); }, 20 * 1000);
  console.log("[EnquiryReport] weekly scheduler started");
}
