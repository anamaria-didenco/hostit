import DOMPurify from "dompurify";

/**
 * Browser-side twin of server/sanitizeHtml.ts `cleanRichHtml`.
 *
 * Every rich-text field (runsheet notes, venue set-up, footer, contract body)
 * can hold text that started outside the venue — an enquiry's message is
 * copied into the runsheet notes — so it must never reach innerHTML or
 * dangerouslySetInnerHTML unsanitised. Keeps the formatting the editor makes
 * (bold, italic, lists, links, the highlight and alert marks) and drops
 * scripts, event handlers, iframes and javascript: links.
 */
const ALLOWED_TAGS = [
  "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "strike",
  "ul", "ol", "li", "blockquote", "a", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "sub", "sup", "small", "mark",
  // execCommand('foreColor') writes <font color> in some browsers.
  "font",
];
const ALLOWED_ATTR = ["href", "title", "style", "color", "target", "rel"];

// Same style allow-list as the server: colour, weight and alignment only.
const ALLOWED_STYLES: Record<string, RegExp> = {
  "color": /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z-]+)$/i,
  "background-color": /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z-]+)$/i,
  "font-weight": /^(bold|bolder|lighter|normal|\d{3})$/i,
  "font-style": /^(italic|normal)$/i,
  "text-decoration": /^(underline|line-through|none)$/i,
  "text-decoration-line": /^(underline|line-through|none)$/i,
  "text-align": /^(left|right|center|justify)$/i,
};

function cleanStyle(style: string): string {
  return style
    .split(";")
    .map(d => d.trim())
    .filter(Boolean)
    .filter(d => {
      const i = d.indexOf(":");
      if (i < 0) return false;
      const prop = d.slice(0, i).trim().toLowerCase();
      const value = d.slice(i + 1).trim();
      return ALLOWED_STYLES[prop]?.test(value) ?? false;
    })
    .join("; ");
}

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style") {
      data.attrValue = cleanStyle(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", node => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

/** Sanitised rich HTML, safe for innerHTML / dangerouslySetInnerHTML. */
export function safeHtml(input: string | null | undefined): string {
  if (!input) return "";
  ensureHooks();
  return DOMPurify.sanitize(String(input), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  });
}

/** Plain text (an enquiry message, a note typed in a form) as safe HTML:
 *  escaped, with line breaks kept. */
export function textToHtml(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br>");
}
