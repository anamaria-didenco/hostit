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
