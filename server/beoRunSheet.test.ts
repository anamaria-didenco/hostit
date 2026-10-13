import { describe, expect, it } from "vitest";
import { renderRunSheetHtml, type RunSheetData } from "./beoRunSheet";

const base = (): RunSheetData => ({
  event: { name: "Kylie & Tom", dateLabel: "Sun 25 Oct", dateLong: "Sun 25 October 2026", time: "6:30 PM – 11:00 PM", room: "Restaurant", guests: "40" },
  notes: [],
  floor: { rows: [{ kind: "step", time: "6:30 PM", title: "Guests arrive" }], remember: [] },
  kitchen: { dietary: [], courses: [], notes: [] },
  bar: null,
  billing: null,
});
const sectionsOf = (html: string) => [...html.matchAll(/data-sec="([a-z]+)"/g)].map(m => m[1]);

describe("BEO run sheet (6a)", () => {
  it("prints the sections in order and leaves out empty ones", () => {
    const d = base();
    expect(sectionsOf(renderRunSheetHtml(d, { title: "t" }))).toEqual(["event", "floor"]);
    d.kitchen!.courses = [{ name: "Main", items: [{ qty: 40, name: "Porchetta" }] }];
    d.bar = { tab: "$2,400", pours: ["Aperol Spritz"] };
    d.billing = { client: { name: "Kylie" }, lines: [], howBilled: [] };
    expect(sectionsOf(renderRunSheetHtml(d, { title: "t" }))).toEqual(["event", "floor", "kitchen", "bar", "billing"]);
  });

  it("gives counted dishes their quantity and a shared course none", () => {
    const d = base();
    d.kitchen!.courses = [
      { name: "Canapés", items: [{ qty: 40, name: "Arancini", desc: "saffron" }] },
      { name: "Main", note: "To share", items: [{ name: "Porchetta", desc: "cannellini purée" }] },
    ];
    const html = renderRunSheetHtml(d, { title: "t" });
    expect(html).toContain(`<span class="qty">40&times;</span><b class="name">Arancini</b>`);
    expect(html).toContain(`<div class="dish"><b class="name">Porchetta</b>`);
    expect(html).toContain(`To share`);
  });

  it("writes a severe allergy in red and a changed dish with its old name", () => {
    const d = base();
    d.kitchen!.dietary = [{ qty: 1, label: "Nut allergy (severe)", detail: "Tom", severe: true }, { qty: 3, label: "Gluten free", severe: false }];
    d.kitchen!.courses = [{ name: "Entrée", items: [{ qty: 40, name: "Stracciatella", desc: "peperonata", was: "burrata" }] }];
    const html = renderRunSheetHtml(d, { title: "t" });
    expect(html).toContain(`<div class="tick-row severe"><span class="tick alert"></span>`);
    expect(html).toContain(`<div class="tick-row"><span class="tick"></span><span><b class="qty-inline">3&times;</b> <b>Gluten free</b>`);
    expect(html).toContain(`<span class="desc">peperonata <span class="was">was burrata</span></span>`);
  });

  it("keeps the client and the note when the money is hidden", () => {
    const d = base();
    d.billing = { client: { name: "Kylie", phone: "021 555 0101" }, lines: [], howBilled: [{ title: "Food", body: "Invoiced before the event.", status: "Paid" }], note: ["Thank you for choosing Bar Franco!"] };
    const html = renderRunSheetHtml(d, { title: "t" });
    expect(html).toContain(`<b>Kylie</b> <span class="muted">&middot; 021 555 0101</span>`);
    expect(html).toContain(`<div class="lbl">Note</div><div class="entry"><div>Thank you for choosing Bar Franco!</div>`);
    expect(html).not.toContain(`Breakdown`);
  });

  it("flags an unconfirmed event and shows step durations", () => {
    const d = base();
    d.event.notFinal = true;
    d.floor = { rows: [{ kind: "step", time: "12:30 PM", duration: "45 min", title: "Lunch service" }], remember: [] };
    const html = renderRunSheetHtml(d, { title: "t" });
    expect(html).toContain(`<b class="not-final">Not final</b>`);
    expect(html).toContain(`<div class="lbl-time">12:30 PM</div><div class="lbl-sub">45 min</div>`);
    expect(renderRunSheetHtml(base(), { title: "t" })).not.toContain(`class="not-final"`);
  });

  it("keeps the set-up step's duration and who is on it", () => {
    const d = base();
    d.floor = { rows: [{ kind: "setup", time: "3:30 PM", duration: "90 min", who: "Floor team", lines: [{ title: "Long tables" }] }], remember: [] };
    const html = renderRunSheetHtml(d, { title: "t" });
    expect(html).toContain(`<div class="lbl lbl-blue">Setup</div><div class="lbl-sub">90 min</div>`);
    expect(html).toContain(`<span class="who">Floor team</span>`);
  });

  it("escapes what people type, including into the page script", () => {
    const d = base();
    d.event.name = `Ana's <b>party</b></script><script>alert(1)</script>`;
    d.notes = ["<img src=x onerror=alert(1)>"];
    const html = renderRunSheetHtml(d, { title: "t" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("Ana&#39;s &lt;b&gt;party&lt;/b&gt;");
  });
});
