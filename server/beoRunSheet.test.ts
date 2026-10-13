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
