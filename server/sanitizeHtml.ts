/**
 * Rich-text sanitisation for HTML that originates from operator/guest input
 * (runsheet notes, venue setup, footer notes, proposal copy) and is later
 * rendered as HTML — either in the browser (public Staff Portal) or in
 * server-side Puppeteer (BEO / proposal PDFs, which run with --no-sandbox and
 * must never execute injected script → XSS/SSRF).
 *
 * `cleanRichHtml` keeps the safe formatting a WYSIWYG editor produces (bold,
 * lists, links, headings) and strips everything dangerous: <script>/<style>,
 * event handlers, javascript:/data: URLs, <iframe>/<object>, etc.
 */
import sanitizeHtml from "sanitize-html";

const RICH_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "strike",
    "ul", "ol", "li", "blockquote", "a", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "sub", "sup", "small", "mark",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    span: ["style"],
    p: ["style"],
    div: ["style"],
  },
  // Only allow colour/weight styling — never url()/position/behaviour tricks.
  allowedStyles: {
    "*": {
      color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^[a-z-]+$/i],
      "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^[a-z-]+$/i],
      "font-weight": [/^(bold|bolder|lighter|normal|\d{3})$/i],
      "font-style": [/^(italic|normal)$/i],
      "text-decoration": [/^(underline|line-through|none)$/i],
      "text-align": [/^(left|right|center|justify)$/i],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
  disallowedTagsMode: "discard",
  // Force safe link behaviour on anything that survives.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

export function cleanRichHtml(input: string | null | undefined): string {
  if (!input) return "";
  return sanitizeHtml(String(input), RICH_OPTS);
}

// ─── Branded proposal template HTML ──────────────────────────────────────────
// A far more permissive profile than cleanRichHtml, for the per-venue custom
// proposal template (Settings → Brand Pack). It must allow real page layout —
// tables, images, structural elements and inline layout/typography styles — so
// a venue can paste a branded design, while still being safe to render in the
// client's browser AND in server-side Puppeteer (--no-sandbox) for the PDF.
//
// Still stripped: <script>/<style>/<link>/<iframe>/<object>/<form>/<svg>, event
// handlers, javascript:/vbscript: URLs, and any CSS url()/expression() (so a
// style can't fetch or exfiltrate — an SSRF vector under Puppeteer). Images are
// limited to http(s) and data: URLs. Templates use INLINE styles only (no
// <style> block), which is the HTML-email-safe convention.

// A CSS value that carries no url()/expression()/javascript and no angle
// brackets. Covers colours, lengths, shorthands, rgb()/rgba()/hsl()/calc()/
// linear-gradient() and font stacks, while blocking the exfiltration vectors.
const SAFE_CSS_VALUE = /^(?!.*(url\(|expression|javascript:|vbscript:|@import|<|>))[-0-9a-z%.,#'"()/ \t]+$/i;

const LAYOUT_STYLE_PROPS = [
  "color", "background", "background-color", "opacity",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-width", "border-style", "border-radius",
  "border-collapse", "border-spacing",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "width", "max-width", "min-width", "height", "max-height", "min-height",
  "display", "box-sizing", "overflow", "overflow-x", "overflow-y",
  "flex", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "gap", "row-gap", "column-gap", "order",
  "align-items", "align-content", "align-self",
  "justify-content", "justify-items", "justify-self",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
  "position", "top", "right", "bottom", "left", "z-index", "float", "clear",
  "font", "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "line-height", "letter-spacing", "word-spacing", "text-align", "text-transform",
  "text-decoration", "text-indent", "white-space", "word-break", "overflow-wrap",
  "text-wrap", "vertical-align", "list-style", "list-style-type", "list-style-position",
  "object-fit", "object-position", "box-shadow", "table-layout", "caption-side",
] as const;

const PROPOSAL_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
    "caption", "cite", "code", "col", "colgroup", "dd", "div", "dl", "dt",
    "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hr", "i", "img", "li", "main", "mark", "nav", "ol", "p", "pre",
    "s", "section", "small", "span", "strong", "sub", "sup", "table", "tbody",
    "td", "tfoot", "th", "thead", "time", "tr", "u", "ul",
  ],
  allowedAttributes: {
    "*": ["style", "class", "id", "title", "dir", "align", "valign"],
    a: ["href", "target", "rel", "style", "class", "title"],
    img: ["src", "alt", "width", "height", "style", "class", "title"],
    table: ["style", "class", "width", "cellpadding", "cellspacing", "border", "align"],
    td: ["style", "class", "colspan", "rowspan", "width", "height", "align", "valign"],
    th: ["style", "class", "colspan", "rowspan", "width", "height", "align", "valign"],
    col: ["span", "width", "style", "class"],
    colgroup: ["span", "width", "style", "class"],
    time: ["datetime"],
  },
  allowedStyles: {
    "*": Object.fromEntries(LAYOUT_STYLE_PROPS.map((p) => [p, [SAFE_CSS_VALUE]])),
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"], img: ["http", "https", "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  disallowedTagsMode: "discard",
  // Keep layout classes/ids harmless and force safe link behaviour.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

/** Sanitise a branded proposal template (operator-authored HTML) for rendering
 *  in the client's browser and in Puppeteer. See PROPOSAL_OPTS. */
export function cleanProposalHtml(input: string | null | undefined): string {
  if (!input) return "";
  return sanitizeHtml(String(input), PROPOSAL_OPTS);
}

/** Plain-text escape for values that must never carry markup (names, emails,
 *  titles). Mirrors the escHtml already used in beoPdf. */
export function escapeHtml(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
