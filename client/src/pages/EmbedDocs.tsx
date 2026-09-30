import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

// Public documentation for the website embed. Covers the one-line loader, every
// data-* option, the postMessage events, and a live preview that rewrites the
// snippet as you change options. No auth — it's meant to be linked to the
// developers who embed the form.

type Opt = { name: string; value: string; desc: string };

const OPTIONS: Opt[] = [
  { name: "data-venue", value: "your-slug", desc: "Required. The venue's form address (set in Settings › Contact Form)." },
  { name: "data-mount", value: "#selector", desc: "CSS selector of the element to mount into. Omit to drop the form right after the script tag." },
  { name: "data-layout", value: "compact", desc: 'One scrolling form instead of the 3-step wizard. Best on mobile landing pages.' },
  { name: "data-placement", value: "floating", desc: "A corner bubble that opens the form in a panel (a bottom sheet on narrow screens)." },
  { name: "data-height", value: "640", desc: "Initial iframe height in px. The frame then auto-resizes to its content." },
  { name: "data-accent", value: "2f5488", desc: "Accent / button colour (hex, no #)." },
  { name: "data-bg", value: "ffffff | transparent", desc: "Form background: a hex colour, or transparent to show the host page through it." },
  { name: "data-text", value: "1a1a1e", desc: "Body text colour (hex, no #)." },
  { name: "data-label", value: "6b7078", desc: "Field-label colour (hex, no #)." },
  { name: "data-border", value: "8b8f98", desc: "Input border colour (hex, no #)." },
  { name: "data-font", value: "inherit | Lora", desc: "inherit uses a neutral system font (a true cross-iframe match isn't possible — pass a Google Font name to match your site exactly)." },
  { name: "data-radius", value: "8", desc: "Corner radius in px (0–40), including 0 for square corners." },
  { name: "data-shadow", value: "off", desc: "Removes the card shadow." },
  { name: "data-button", value: "outline", desc: "outline / ghost render the submit button unfilled instead of solid." },
  { name: "data-event-type", value: "Wedding", desc: "Preselect the event type." },
  { name: "data-date", value: "2026-12-05", desc: "Preselect the event date (YYYY-MM-DD)." },
  { name: "data-guests", value: "120", desc: "Preselect the guest count." },
  { name: "data-format", value: "seated", desc: "Preselect the event format." },
  { name: "data-prefill", value: '{"company":"Acme"}', desc: "Preselect any field by id, as JSON (keeps exact camelCase ids)." },
  { name: "data-gads-label", value: "AW-123/abc", desc: "Google Ads conversion label, fired on a completed enquiry." },
  { name: "data-frame-id", value: "weddings", desc: "A stable id for this frame, echoed on every message. Auto-generated if omitted." },
];

type Msg = { name: string; when: string; payload: string };

const MESSAGES: Msg[] = [
  { name: "vf-embed-height", when: "On load, every step change, submit, and resize.", payload: "{ height }" },
  { name: "vf-step-changed", when: "When the wizard step changes (mount and each NEXT).", payload: "{ step }" },
  { name: "vf-partial-captured", when: "After a name + email are captured in step 1.", payload: "{}" },
  { name: "vf-enquiry-submitted", when: "On a completed enquiry.", payload: "{ eventType, guestCount, budgetRange, eventFormat, source }" },
  { name: "vf-walkthrough-booked", when: "When a post-submit walkthrough slot is picked.", payload: "{ slot }" },
  { name: "vf-close-widget", when: "Floating placement only — the card's × button.", payload: "{}" },
];

const CHANGELOG: { date: string; note: string }[] = [
  { date: "2026-09-30", note: "Styling API (bg/transparent, text/label/border colours, font inherit, radius, shadow, button style); data-prefill for any field; vf-step-changed; frame ids on every message; documented, origin-pinned messages." },
  { date: "earlier", note: "One-line loader, auto-resize, floating placement, accent/font, UTM & click-id capture, conversion events." },
];

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-semibold text-gray-700 px-3 py-2 border-b border-gray-200 align-top">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 border-b border-gray-100 align-top text-gray-700">{children}</td>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[13px] bg-gray-100 text-gray-800 rounded px-1.5 py-0.5">{children}</code>;
}

export default function EmbedDocs() {
  const { data: venueDefault } = trpc.venue.getDefault.useQuery();
  const slug = (venueDefault as any)?.slug || "your-venue";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://venueflowhq.com";

  useEffect(() => { document.title = "Embed the enquiry form — VenueFlowHQ"; }, []);

  // Live preview controls.
  const [accent, setAccent] = useState("2f5488");
  const [bg, setBg] = useState("");
  const [text, setText] = useState("");
  const [border, setBorder] = useState("");
  const [radius, setRadius] = useState("");
  const [shadowOff, setShadowOff] = useState(false);
  const [fontInherit, setFontInherit] = useState(false);
  const [compact, setCompact] = useState(true);
  const [copied, setCopied] = useState(false);

  const attrs = useMemo(() => {
    const a: string[] = [`data-venue="${slug}"`];
    if (accent) a.push(`data-accent="${accent}"`);
    if (bg) a.push(`data-bg="${bg}"`);
    if (text) a.push(`data-text="${text}"`);
    if (border) a.push(`data-border="${border}"`);
    if (radius) a.push(`data-radius="${radius}"`);
    if (shadowOff) a.push(`data-shadow="off"`);
    if (fontInherit) a.push(`data-font="inherit"`);
    if (compact) a.push(`data-layout="compact"`);
    return a;
  }, [slug, accent, bg, text, border, radius, shadowOff, fontInherit, compact]);

  const snippet = `<script src="${origin}/embed.js"\n  ${attrs.join("\n  ")}></script>`;

  const previewSrc = useMemo(() => {
    const p = new URLSearchParams({ embed: "1" });
    if (accent) p.set("accent", accent);
    if (bg) p.set("bg", bg);
    if (text) p.set("text", text);
    if (border) p.set("border", border);
    if (radius) p.set("radius", radius);
    if (shadowOff) p.set("shadow", "off");
    if (fontInherit) p.set("font", "inherit");
    if (compact) p.set("layout", "compact");
    return `${origin}/enquire/${encodeURIComponent(slug)}?${p.toString()}`;
  }, [origin, slug, accent, bg, text, border, radius, shadowOff, fontInherit, compact]);

  // Demonstrate the resize message: size the preview iframe to the form.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      const d = e.data;
      if (d && d.type === "vf-embed-height" && d.height && iframeRef.current) {
        iframeRef.current.style.height = d.height + "px";
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [origin]);

  const hexInput = (label: string, val: string, set: (v: string) => void, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <input value={val} onChange={e => set(e.target.value.replace(/^#/, "").trim())} placeholder={placeholder}
        aria-label={label}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono w-full focus:outline-none focus:border-gray-500" />
    </label>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <header className="mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-[#2f5488] mb-1">VenueFlowHQ</div>
          <h1 className="text-3xl font-bold tracking-tight">Embed the enquiry form</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">Add the enquiry form to any website with one script tag. It auto-resizes, captures ad attribution, and posts events your analytics can track. Everything below is optional — the defaults look like the standalone form.</p>
        </header>

        {/* Quick start */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">Quick start</h2>
          <p className="text-sm text-gray-600 mb-3">Paste this where you want the form to appear. Replace the slug with your venue's form address from Settings › Contact Form.</p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-[13px] overflow-x-auto"><code>{`<script src="${origin}/embed.js"\n  data-venue="${slug}"></script>`}</code></pre>
        </section>

        {/* Live preview */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">Live preview</h2>
          <div className="grid md:grid-cols-2 gap-6 items-start">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                {hexInput("Accent", accent, setAccent, "2f5488")}
                {hexInput("Background", bg, setBg, "transparent")}
                {hexInput("Text", text, setText, "1a1a1e")}
                {hexInput("Border", border, setBorder, "8b8f98")}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">Corner radius (px)</span>
                  <input value={radius} onChange={e => setRadius(e.target.value.replace(/[^0-9]/g, ""))} placeholder="8"
                    aria-label="Corner radius in pixels"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono w-full focus:outline-none focus:border-gray-500" />
                </label>
                <div className="flex flex-col gap-2 justify-end text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={shadowOff} onChange={e => setShadowOff(e.target.checked)} /> No shadow</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={fontInherit} onChange={e => setFontInherit(e.target.checked)} /> Inherit host font</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} /> Compact layout</label>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">Your embed code</span>
                  <button onClick={() => { navigator.clipboard?.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="text-xs font-semibold text-[#2f5488] hover:underline">{copied ? "Copied!" : "Copy"}</button>
                </div>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-[12px] overflow-x-auto"><code>{snippet}</code></pre>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">Preview{slug === "your-venue" ? " (set a form address to load a real venue)" : ""}</div>
              <iframe ref={iframeRef} title="Enquiry form preview" src={previewSrc}
                style={{ width: "100%", maxWidth: 520, height: 640, border: "none", display: "block" }} />
            </div>
          </div>
        </section>

        {/* Options */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">Options</h2>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
            <table className="w-full text-sm border-collapse">
              <thead><tr><Th>Attribute</Th><Th>Example</Th><Th>What it does</Th></tr></thead>
              <tbody>
                {OPTIONS.map(o => (
                  <tr key={o.name}><Td><Code>{o.name}</Code></Td><Td><span className="font-mono text-[13px] text-gray-500">{o.value}</span></Td><Td>{o.desc}</Td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Messages */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-2">Messages</h2>
          <p className="text-sm text-gray-600 mb-3">
            The form posts these to the host page with <Code>window.postMessage</Code>, always from <Code>{origin}</Code>. Verify <Code>event.origin</Code> before trusting a message. Every message also carries a <Code>frameId</Code> so a page with more than one form can tell them apart. <Code>embed.js</Code> already validates the origin and pushes matching <Code>dataLayer</Code> events.
          </p>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
            <table className="w-full text-sm border-collapse">
              <thead><tr><Th>type</Th><Th>When</Th><Th>Payload</Th></tr></thead>
              <tbody>
                {MESSAGES.map(m => (
                  <tr key={m.name}><Td><Code>{m.name}</Code></Td><Td>{m.when}</Td><Td><span className="font-mono text-[13px] text-gray-500">{m.payload}</span></Td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tracking */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-2">Attribution &amp; tracking</h2>
          <p className="text-sm text-gray-600">
            <Code>embed.js</Code> reads <Code>gclid</Code>, <Code>gbraid</Code>, <Code>wbraid</Code>, <Code>fbclid</Code> and the <Code>utm_*</Code> params off the host page's URL and stores them on the enquiry — shown in the CRM and the notification email. On a completed enquiry it pushes a <Code>vf_enquiry_submitted</Code> <Code>dataLayer</Code> event, calls <Code>gtag('event','generate_lead')</Code>, and fires <Code>data-gads-label</Code> as a conversion if set. Define <Code>window.VenueFlow.onSubmit</Code> to run your own code on submit.
          </p>
        </section>

        {/* Changelog */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">Changelog</h2>
          <ul className="space-y-2">
            {CHANGELOG.map((c, i) => (
              <li key={i} className="text-sm text-gray-700"><span className="font-mono text-xs text-gray-500 mr-2">{c.date}</span>{c.note}</li>
            ))}
          </ul>
        </section>

        <footer className="text-xs text-gray-400 border-t border-gray-200 pt-6">© {new Date().getFullYear()} VenueFlowHQ</footer>
      </div>
    </div>
  );
}
