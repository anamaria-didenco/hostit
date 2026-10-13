/**
 * BEO run sheet, design 6a: one A4 sheet for the whole team, in five
 * sections (Event & Notes → Floor → Kitchen → Bar → Billing). A section is
 * never split: if it doesn't fit on the page it moves whole to the next one.
 * The script at the bottom measures the sections (after web fonts load),
 * allocates them to pages and grows the notes lines into page 1's leftover
 * space. The PDF renderer waits for `window.__vfRunSheetReady`.
 *
 * Pure render-from-data: `beoPdf.ts` gathers the booking, runsheet, menu and
 * billing data and passes it in the shape below. Measurements, colours and
 * copy follow the design handoff (design_handoff_beo_run_sheet, 6a).
 */

export type RunSheetFloorRow =
  | { kind: "step" | "check"; time?: string; title: string; detail?: string; who?: string }
  | { kind: "setup"; time?: string; lines: { title?: string; detail?: string }[]; writeLines?: number };

export type RunSheetDish = {
  /** Omitted for shared menus: food for the table has no per-dish count. */
  qty?: number;
  name: string;
  desc?: string;
  /** Set-amount package value, e.g. "$1,000 table". */
  pkg?: string;
  /** Previous dish name when the dish was changed. */
  was?: string;
};

export type RunSheetData = {
  event: { name: string; dateLabel: string; dateLong: string; time: string; room: string; guests: string };
  /** Typed notes and set-up, printed above the ruled write-in lines. */
  notes: string[];
  floor: { rows: RunSheetFloorRow[]; remember: { title: string; detail?: string }[] } | null;
  kitchen: {
    dietary: { qty: number; label: string; detail?: string; severe: boolean }[];
    /** e.g. "Shared to the table · for 15 guests" */
    serviceNote?: string;
    courses: { name: string; time?: string; note?: string; items: RunSheetDish[] }[];
    notes: string[];
  } | null;
  bar: { tab?: string; tabDetail?: string; pours: string[] } | null;
  billing: {
    client: { name: string; phone?: string; email?: string };
    lines: { label: string; detail?: string; amount: string }[];
    total?: string;
    totalNote?: string;
    deposit?: { label: string; amount: string };
    balance?: { label: string; amount: string };
    /** How the event is billed: one line per step, plain text. */
    howBilled: { title: string; body: string; status?: string }[];
  } | null;
};

export type RunSheetOptions = {
  title: string;
  /** Brand accent (white-label); defaults to VenueFlow deep blue. */
  accent?: string;
  serif?: string;
  sans?: string;
  fontLink?: string;
};

const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const tick = (alert = false) => `<span class="tick${alert ? " alert" : ""}"></span>`;
const lead = (title?: string, detail?: string) =>
  [title ? `<b>${esc(title)}</b>` : "", detail ? `<span class="muted">${esc(detail)}</span>` : ""].filter(Boolean).join(" ");

function floorSection(floor: NonNullable<RunSheetData["floor"]>): string {
  const rows = floor.rows.map(r => {
    if (r.kind === "setup") {
      const lines = r.lines.map(l => `<div>${lead(l.title, l.detail)}</div>`).join("");
      const write = Array.from({ length: r.writeLines ?? 1 }, () => `<div class="write-line"></div>`).join("");
      return `<div class="row top"><div>${r.time ? `<div class="lbl-time">${esc(r.time)}</div>` : ""}<div class="lbl lbl-blue">Setup</div></div><div class="entry">${lines}${write}</div></div>`;
    }
    const who = r.who ? ` <span class="who">${esc(r.who)}</span>` : "";
    const timeCell = r.time ? `<div class="lbl-time">${esc(r.time)}</div>` : `<div></div>`;
    if (r.kind === "check") {
      return `<div class="row center">${timeCell}<div class="entry tick-row">${tick()}<span>${lead(r.title, r.detail)}${who}</span></div></div>`;
    }
    return `<div class="row">${timeCell}<div class="entry">${lead(r.title, r.detail)}${who}</div></div>`;
  });
  if (floor.remember.length) {
    rows.push(`<div class="row center"><div class="lbl">Remember</div><div class="entry remember">${floor.remember
      .map(m => `<div class="tick-row">${tick()}<span><b>${esc(m.title)}</b>${m.detail ? ` ${esc(m.detail)}` : ""}</span></div>`).join("")}</div></div>`);
  }
  return band("floor", "Floor", rows.join(""));
}

function dishLine(d: RunSheetDish, withQty: boolean): string {
  return `<div class="dish">${withQty ? `<span class="qty">${d.qty && d.qty > 0 ? `${esc(d.qty)}&times;` : ""}</span>` : ""}`
    + `<b class="name">${esc(d.name)}</b>`
    + (d.pkg ? `<span class="pkg">${esc(d.pkg)}</span>` : "")
    // The change flag rides inline after the description, so a long one
    // wraps with the text instead of squeezing it into a narrow column.
    + (d.desc || d.was ? `<span class="desc">${d.desc ? esc(d.desc) : ""}${d.was ? `${d.desc ? " " : ""}<span class="was">was ${esc(d.was)}</span>` : ""}</span>` : "")
    + `</div>`;
}

function kitchenSection(k: NonNullable<RunSheetData["kitchen"]>): string {
  const rows: string[] = [];
  if (k.dietary.length) {
    const lines = k.dietary.map(d => `<div class="tick-row${d.severe ? " severe" : ""}">${tick(d.severe)}<span><b class="qty-inline">${esc(d.qty)}&times;</b> <b>${esc(d.label)}</b>${d.detail ? (d.severe ? ` &middot; ${esc(d.detail)}` : ` <span class="muted">${esc(d.detail)}</span>`) : ""}</span></div>`).join("");
    rows.push(`<div class="row top"><div><div class="lbl lbl-kitchen">Dietary</div><div class="lbl-note">Chef confirms before service</div></div><div class="entry">${lines}</div></div>`);
  }
  if (k.serviceNote) {
    rows.push(`<div class="row"><div class="lbl">Service</div><div class="entry"><b>${esc(k.serviceNote)}</b></div></div>`);
  }
  for (const c of k.courses) {
    // A course with no counts at all (a shared menu) drops the count column
    // rather than leaving an empty indent.
    const withQty = c.items.some(d => d.qty && d.qty > 0);
    const sub = [c.time, c.note].filter(Boolean).map(esc).join(" &middot; ");
    rows.push(`<div class="row top"><div><div class="lbl-course">${esc(c.name)}</div>${sub ? `<div class="lbl-sub">${sub}</div>` : ""}</div><div>${c.items.map(d => dishLine(d, withQty)).join("")}</div></div>`);
  }
  if (k.notes.length) {
    rows.push(`<div class="row top"><div class="lbl">Notes</div><div class="entry">${k.notes.map(n => `<div>${esc(n)}</div>`).join("")}</div></div>`);
  }
  return band("kitchen", "Kitchen", rows.join(""));
}

function barSection(b: NonNullable<RunSheetData["bar"]>): string {
  const rows: string[] = [];
  if (b.tab || b.tabDetail) {
    rows.push(`<div class="row"><div class="lbl">Tab</div><div class="entry">${b.tab ? `<b class="qty-inline">${esc(b.tab)}</b> ` : ""}${b.tabDetail ? `<span class="muted">${esc(b.tabDetail)}</span>` : ""}</div></div>`);
  }
  if (b.pours.length) {
    rows.push(`<div class="row"><div class="lbl">Pours</div><div class="pours">${b.pours.map(p => `<div>${esc(p)}</div>`).join("")}</div></div>`);
  }
  return band("bar", "Bar", rows.join(""));
}

function billingSection(b: NonNullable<RunSheetData["billing"]>): string {
  const rows: string[] = [];
  const contact = [b.client.phone, b.client.email].filter(Boolean).map(esc).join(" &middot; ");
  rows.push(`<div class="row"><div class="lbl">Client</div><div class="entry"><b>${esc(b.client.name)}</b>${contact ? ` <span class="muted">&middot; ${contact}</span>` : ""}</div></div>`);
  if (b.howBilled.length) {
    rows.push(`<div class="row top"><div class="lbl" style="padding-top:3px">Billed</div><div class="entry">${b.howBilled
      .map(s => `<div><b>${esc(s.title)}</b> <span class="muted">${esc(s.body)}</span>${s.status ? ` <span class="status">${esc(s.status)}</span>` : ""}</div>`).join("")}</div></div>`);
  }
  const hasSummary = b.total || b.deposit || b.balance;
  if (b.lines.length || hasSummary) {
    const left = b.lines.map(l => `<div class="bill-line"><b>${esc(l.label)}</b><span class="d">${esc(l.detail ?? "")}</span><b class="amt">${esc(l.amount)}</b></div>`).join("");
    const sum = [
      b.total ? `<div class="sum-row"><span>Total${b.totalNote ? ` <small>${esc(b.totalNote)}</small>` : ""}</span><b>${esc(b.total)}</b></div>` : "",
      b.deposit ? `<div class="sum-row"><span>${esc(b.deposit.label)}</span><b>${esc(b.deposit.amount)}</b></div>` : "",
      b.balance ? `<div class="balance"><span>${esc(b.balance.label)}</span><b>${esc(b.balance.amount)}</b></div>` : "",
    ].join("");
    rows.push(`<div class="row top"><div class="lbl" style="padding-top:3px">Breakdown</div><div class="billing"><div>${left}</div><div class="sum">${sum}</div></div></div>`);
  }
  return band("billing", "Billing", rows.join(""), true);
}

function band(key: string, label: string, body: string, small = false): string {
  return `<section class="sec band" data-sec="${key}" style="--role:var(--role-${key})"><div class="rail${small ? " sm" : ""}"><span>${label}</span></div><div class="band-body">${body}</div></section>`;
}

export function renderRunSheetHtml(data: RunSheetData, opts: RunSheetOptions): string {
  const accent = opts.accent || "#2f5488";
  const serif = opts.serif || "'Spectral', Georgia, 'Times New Roman', serif";
  const sans = opts.sans || "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  const fontLink = opts.fontLink || "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap";
  const e = data.event;
  const facts: [string, string, boolean][] = ([
    ["Date", e.dateLabel, false],
    ["Time", e.time, false],
    ["Room", e.room, false],
    ["Guests", e.guests, true],
  ] as [string, string, boolean][]).filter(([, v]) => v);
  const factsHtml = facts.map(([l, v, fig], i) =>
    `<div class="fact${i === facts.length - 1 ? " last" : ""}"><div class="fact-lbl">${l}</div><div class="fact-val${fig ? " fig" : ""}">${esc(v)}</div></div>`).join("");
  const notesText = data.notes.length ? `<div class="notes-text">${data.notes.map(n => `<div>${esc(n)}</div>`).join("")}</div>` : "";
  const sections = [
    `<section class="sec event" data-sec="event"><div class="event-head"><div class="event-name"><span>${esc(e.name)}</span></div>${factsHtml}</div><div class="notes-row"><div class="lbl">Notes &amp; set up</div><div>${notesText}<div class="notes-lines" id="notesLines"></div></div></div></section>`,
    data.floor && (data.floor.rows.length || data.floor.remember.length) ? floorSection(data.floor) : "",
    data.kitchen && (data.kitchen.dietary.length || data.kitchen.courses.length || data.kitchen.notes.length) ? kitchenSection(data.kitchen) : "",
    data.bar && (data.bar.tab || data.bar.tabDetail || data.bar.pours.length) ? barSection(data.bar) : "",
    data.billing ? billingSection(data.billing) : "",
  ].filter(Boolean).join("\n");
  const chrome = JSON.stringify({ name: e.name, dateLabel: e.dateLabel, dateLong: e.dateLong, guests: e.guests })
    .replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${esc(fontLink)}" rel="stylesheet">
<style>
:root{
  --vf-cream:#fffdf9; --vf-ink:#16140f; --vf-ink-2:#211d18;
  --vf-blue-deep:${accent}; --vf-red:#c0392b; --vf-green:#3f7350;
  --vf-gray:#6a6256; --vf-line:#e3ddd0; --vf-line-2:#e6dccb; --vf-hair:#eee6d8; --vf-fill:#f4efe6;
  --role-floor:${accent}; --role-kitchen:#8a5d12; --role-bar:#7a2420; --role-billing:#6a6256;
  --font-display:${serif}; --font-sans:${sans};
  --shadow-paper:0 8px 40px rgba(0,0,0,.16);
}
html,body{margin:0;background:var(--vf-fill);font-family:var(--font-sans);color:var(--vf-ink-2);-webkit-font-smoothing:antialiased}
.stage{padding:32px 0}
/* On screen, a pane narrower than A4 (the dashboard side panel) shrinks the
   sheets to fit instead of scrolling sideways: a pure visual scale, so the
   pages keep exactly the layout they print with. Never in print. */
.stage{transform-origin:top left}
#fitbox{overflow:hidden}
.sheet{position:relative;width:794px;height:1123px;margin:0 auto 32px;background:var(--vf-cream);box-shadow:var(--shadow-paper);overflow:hidden}
.content{position:absolute;left:36px;width:722px;display:flex;flex-direction:column;gap:8px}
#measure{position:absolute;left:-9999px;top:0;width:722px;visibility:hidden}
.sec{border:1px solid var(--vf-line-2);border-radius:6px;overflow:hidden;background:#fff;break-inside:avoid;page-break-inside:avoid}
.event{padding:2px 14px 6px}
.event-head{display:flex;align-items:stretch;padding:8px 0 7px;border-bottom:2px solid var(--vf-blue-deep)}
.event-name{flex:1;min-width:0;display:flex;align-items:center;padding-right:14px}
.event-name span{font-family:var(--font-display);font-size:22px;font-weight:600;color:var(--vf-blue-deep);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fact{flex:none;padding:0 12px;border-left:1px solid var(--vf-line-2)}
.fact.last{padding:0 0 0 12px}
.fact-lbl{font-size:11px;letter-spacing:.14em;font-weight:800;color:var(--vf-green);text-transform:uppercase;line-height:1.3}
.fact-val{font-size:13.5px;font-weight:600;color:var(--vf-ink);white-space:nowrap;line-height:1.4;margin-top:1px}
.fact-val.fig{font-family:var(--font-display);font-size:17px;line-height:1.15}
.notes-row{display:grid;grid-template-columns:128px 1fr;gap:14px;padding-top:2px}
.notes-row .lbl{padding-top:8px}
.notes-text{font-size:13px;line-height:24px;color:var(--vf-ink-2);padding-top:2px}
.notes-lines{height:48px;background:repeating-linear-gradient(to bottom,transparent 0 23px,var(--vf-line-2) 23px 24px)}
.band{display:grid;grid-template-columns:40px 1fr}
.rail{background:var(--role);color:#fff;display:flex;align-items:center;justify-content:center}
.rail span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:13px;letter-spacing:.24em;font-weight:800;text-transform:uppercase}
.rail.sm span{font-size:12px;letter-spacing:.16em}
.band-body{padding:2px 14px 4px;min-width:0}
.row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:14px;padding:5px 0;border-bottom:1px solid var(--vf-hair);align-items:baseline}
.row:last-child{border-bottom:0}
.row.center{align-items:center}
.row.top{align-items:start}
.lbl{font-size:11px;letter-spacing:.16em;font-weight:800;color:var(--vf-gray);text-transform:uppercase}
.lbl-blue{color:var(--vf-blue-deep);margin-top:2px}
.lbl-kitchen{color:var(--role-kitchen);padding-top:3px}
.lbl-note{font-size:11px;color:var(--vf-gray);font-weight:600;line-height:1.3;margin-top:3px}
.lbl-time{font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--vf-ink);line-height:1.3}
.lbl-course{font-family:var(--font-display);font-style:italic;font-size:15px;font-weight:500;color:var(--vf-blue-deep);line-height:1.3}
.lbl-sub{font-size:12px;font-weight:700;color:var(--vf-gray)}
.entry{font-size:13px;line-height:1.5}
.entry b{color:var(--vf-ink)}
.muted{color:var(--vf-gray)}
.who{font-size:12px;font-weight:700;color:var(--vf-blue-deep)}
.status{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--vf-blue-deep);white-space:nowrap}
.tick-row{display:flex;gap:8px;align-items:flex-start}
.tick{width:13px;height:13px;box-sizing:border-box;border:1.5px solid var(--vf-ink);border-radius:3px;flex:none;margin-top:3px}
.tick.alert{border-color:var(--vf-red)}
.severe,.severe b{color:var(--vf-red)}
.qty-inline{font-family:var(--font-display);font-size:14.5px;font-weight:700}
.remember{display:flex;flex-wrap:wrap;gap:4px 24px}
.write-line{height:24px;border-bottom:1px solid var(--vf-line-2)}
/* One line per dish. A long description wraps under itself (hanging, never
   under the name) rather than being cut off: the "— or eggplant involtini"
   swap at the end is the part the kitchen must not lose. */
.dish{display:flex;align-items:baseline;gap:7px;font-size:13px;line-height:1.5;min-width:0}
.dish .qty{font-family:var(--font-display);font-size:14.5px;font-weight:700;color:var(--vf-ink);width:36px;text-align:right;flex:none;white-space:nowrap}
.dish .name{font-weight:700;color:var(--vf-ink);flex:none;white-space:nowrap}
.dish .desc{color:var(--vf-gray);min-width:0;flex:0 1 auto}
.dish .pkg{flex:none;font-family:var(--font-display);font-size:13.5px;font-weight:700;color:var(--vf-blue-deep);border:1px solid var(--vf-blue-deep);border-radius:3px;padding:0 6px;line-height:1.35;white-space:nowrap}
.dish .was{font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--vf-red);text-transform:uppercase;margin-left:3px}
.pours{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 14px;font-size:13px;line-height:1.5;font-weight:600;color:var(--vf-ink)}
.pours div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.billing{display:grid;grid-template-columns:1.35fr 1fr;gap:22px;align-items:start}
.bill-line{display:flex;align-items:baseline;gap:7px;white-space:nowrap;border-bottom:1px dotted var(--vf-line-2);font-size:13px;line-height:1.5}
.bill-line b{color:var(--vf-ink);flex:none}
.bill-line .d{color:var(--vf-gray);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.bill-line .amt{font-family:var(--font-display);font-size:14px}
.sum{display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:1.5}
.sum-row{display:flex;justify-content:space-between;align-items:baseline;color:var(--vf-gray)}
.sum-row small{font-size:11px}
.sum-row b{font-family:var(--font-display);font-size:15px;color:var(--vf-ink)}
.balance{display:flex;justify-content:space-between;align-items:baseline;background:var(--vf-blue-deep);color:#fff;padding:4px 10px;border-radius:3px;font-weight:700;margin-top:2px;white-space:nowrap}
.balance b{font-family:var(--font-display);font-size:16px}
.cont-head{position:absolute;left:36px;right:36px;top:30px;display:flex;justify-content:space-between;align-items:baseline;border-bottom:2.5px solid var(--vf-blue-deep);padding-bottom:6px}
.cont-head .n{font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--vf-ink)}
.cont-head .m{font-size:12px;font-weight:600;color:var(--vf-gray)}
.foot{position:absolute;left:36px;right:36px;bottom:22px;display:flex;justify-content:space-between;font-size:11px;color:var(--vf-gray);font-weight:600;padding-top:7px;border-top:1px solid var(--vf-line)}
/* A section taller than a page on its own breaks between its rows. */
.sec.tall .row{break-inside:avoid;page-break-inside:avoid}
@page{size:A4;margin:0}
@media print{
  html,body{background:none}.stage{padding:0;transform:none!important;width:auto!important;margin-left:0!important}
  #fitbox{height:auto!important;overflow:visible!important}
  .sheet{width:210mm;height:297mm;margin:0;box-shadow:none;break-after:page}
  .sheet:last-child{break-after:auto}
  .sheet.tall{height:auto;min-height:297mm;overflow:visible}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div id="fitbox"><div class="stage" id="stage"></div></div>
<div id="measure">
${sections}
</div>
<script>
(function () {
  var H = 1123, PAD_T = 30, PAD_B_SINGLE = 24, PAD_B_MULTI = 56, CONT = 44, GAP = 8, LINES_MIN = 48;
  var EVENT = ${chrome};
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function paginate() {
    var measure = document.getElementById('measure'), stage = document.getElementById('stage');
    var secs = Array.prototype.slice.call(measure.querySelectorAll('.sec'));
    var notes = document.getElementById('notesLines');
    notes.style.height = LINES_MIN + 'px';
    var hs = secs.map(function (s) { return s.getBoundingClientRect().height; });
    var cap = function (p, padB) { return H - PAD_T - padB - (p > 0 ? CONT : 0); };
    var allocate = function (padB) {
      var pages = [{ items: [], used: 0 }];
      secs.forEach(function (s, i) {
        var pg = pages[pages.length - 1];
        var need = (pg.items.length ? GAP : 0) + hs[i];
        if (pg.items.length && pg.used + need > cap(pages.length - 1, padB)) { pg = { items: [], used: 0 }; pages.push(pg); }
        pg.used += (pg.items.length ? GAP : 0) + hs[i]; pg.items.push(s);
      });
      return pages;
    };
    var padB = PAD_B_SINGLE, pages = allocate(padB);
    if (pages.length > 1) { padB = PAD_B_MULTI; pages = allocate(padB); }
    var leftover = Math.max(0, Math.floor(cap(0, padB) - pages[0].used));
    if (pages[0].items.indexOf(notes.closest('.sec')) !== -1) notes.style.height = (LINES_MIN + leftover) + 'px';
    stage.innerHTML = '';
    pages.forEach(function (pg, p) {
      var sheet = el('div', 'sheet'), content = el('div', 'content');
      content.style.top = (PAD_T + (p > 0 ? CONT : 0)) + 'px';
      pg.items.forEach(function (s) { content.appendChild(s); });
      // Edge case: one section taller than a page. Let that sheet grow and
      // break between rows instead of clipping.
      if (pg.used > cap(p, padB)) { sheet.className += ' tall'; sheet.style.height = 'auto'; content.style.position = 'relative'; pg.items.forEach(function (s) { s.className += ' tall'; }); }
      sheet.appendChild(content);
      if (pages.length > 1) {
        if (p > 0) {
          var head = el('div', 'cont-head');
          head.appendChild(el('span', 'n', EVENT.name));
          head.appendChild(el('span', 'm', EVENT.dateLabel + ' \\u00b7 continued'));
          sheet.appendChild(head);
        }
        var foot = el('div', 'foot');
        foot.appendChild(el('span', null, [EVENT.name, EVENT.dateLong, EVENT.guests ? EVENT.guests + ' guests' : ''].filter(Boolean).join(' \\u00b7 ')));
        foot.appendChild(el('span', null, 'Page ' + (p + 1) + ' of ' + pages.length));
        sheet.appendChild(foot);
      }
      stage.appendChild(sheet);
    });
    fit();
    window.__vfRunSheetReady = true;
  }
  function fit() {
    var stage = document.getElementById('stage'), box = document.getElementById('fitbox');
    var w = document.documentElement.clientWidth || 794;
    var z = Math.min(1, (w - 16) / 794);
    if (z < 1) {
      stage.style.width = '794px';
      stage.style.marginLeft = ((w - 794 * z) / 2) + 'px';
      stage.style.transform = 'scale(' + z + ')';
      box.style.height = (stage.offsetHeight * z) + 'px';
    } else {
      stage.style.width = stage.style.marginLeft = stage.style.transform = box.style.height = '';
    }
  }
  window.addEventListener('resize', fit);
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  // Fonts that never arrive (offline print) must not leave the sheet blank.
  Promise.race([ready, new Promise(function (r) { setTimeout(r, 4000); })]).then(paginate);
})();
</script>
</body>
</html>`;
}
