import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

// client/public/embed.js runs on venues' own websites. Its floating bubble +
// panel must behave as a dialog for keyboard and screen-reader visitors: named,
// focus into the form on open, Escape closes, focus back on the bubble. Run the
// real file against a tiny stand-in DOM (no browser needed).

type Listener = (e: any) => void;

class FakeEl {
  tagName: string;
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  listeners: Record<string, Listener[]> = {};
  innerHTML = "";
  type = "";
  title = "";
  src = "";
  id = "";
  contentWindow: { focusCalls: number; focus(): void } | undefined;
  style: any;
  constructor(tag: string, private doc: FakeDoc) {
    this.tagName = tag.toUpperCase();
    const style: any = { display: "" };
    Object.defineProperty(style, "cssText", {
      set(v: string) {
        const m = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(v);
        style.display = m ? m[1].trim() : "";
      },
    });
    this.style = style;
    // The frame's own window: on a venue's site it is another origin, and
    // only focusing it (not the <iframe> element) gives the form focus.
    if (this.tagName === "IFRAME") this.contentWindow = { focusCalls: 0, focus() { this.focusCalls++; } };
  }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k: string) { return k in this.attrs; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  appendChild(c: FakeEl) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c: FakeEl) { return this.appendChild(c); }
  contains(other: FakeEl | null): boolean {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  addEventListener(t: string, fn: Listener) { (this.listeners[t] ??= []).push(fn); }
  dispatch(t: string, e: any = {}) { for (const fn of this.listeners[t] ?? []) fn(e); }
  /** Hidden (display:none here or above) elements can't take focus, as in a browser. */
  focus() {
    for (let n: FakeEl | null = this; n; n = n.parentNode) if (n.style.display === "none") return;
    this.doc.activeElement = this;
  }
}

class FakeDoc {
  readyState = "complete";
  listeners: Record<string, Listener[]> = {};
  body = new FakeEl("body", this);
  activeElement: FakeEl = this.body;
  script: FakeEl;
  constructor() {
    this.script = new FakeEl("script", this);
    this.script.src = "https://venueflowhq.com/embed.js";
    this.script.setAttribute("data-venue", "harbour-room");
    this.script.setAttribute("data-placement", "floating");
    this.script.setAttribute("data-frame-id", "vf-test");
  }
  createElement(tag: string) { return new FakeEl(tag, this); }
  querySelectorAll(sel: string) { return sel === "script[data-venue]" ? [this.script] : []; }
  querySelector() { return null; }
  addEventListener(t: string, fn: Listener) { (this.listeners[t] ??= []).push(fn); }
  removeEventListener() {}
  keydown(key: string) { for (const fn of this.listeners.keydown ?? []) fn({ key, defaultPrevented: false }); }
}

function load({ narrow = false } = {}) {
  const document = new FakeDoc();
  // The venue's own page: a link, and a part it had already made inert.
  const hostLink = document.body.appendChild(document.createElement("a"));
  const hostInert = document.body.appendChild(document.createElement("div"));
  hostInert.setAttribute("inert", "");
  const winListeners: Record<string, Listener[]> = {};
  const window: any = {
    location: { href: "https://harbour-room.example/contact", search: "", origin: "https://harbour-room.example", pathname: "/contact" },
    matchMedia: () => ({ matches: narrow }),
    addEventListener: (t: string, fn: Listener) => { (winListeners[t] ??= []).push(fn); },
  };
  const code = readFileSync(path.resolve(import.meta.dirname, "../client/public/embed.js"), "utf8");
  vm.runInNewContext(code, { window, document, console, URL, URLSearchParams });
  const [backdrop, panel, bubble] = document.body.children.slice(2);
  const iframe = panel.children[0];
  const message = (data: any) => {
    for (const fn of winListeners.message ?? []) fn({ source: iframe.contentWindow, origin: "https://venueflowhq.com", data });
  };
  return { document, backdrop, panel, bubble, iframe, message, hostLink, hostInert };
}

describe("embed.js floating widget as a dialog", () => {
  it("names the panel as a dialog and links the bubble to it", () => {
    const { panel, bubble } = load();
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-label")).toBe("Event enquiry form");
    expect(bubble.getAttribute("aria-expanded")).toBe("false");
    expect(bubble.getAttribute("aria-haspopup")).toBe("dialog");
    expect(bubble.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.id).toBe("vf-test-panel");
  });

  it("opening moves focus into the form instead of losing it", () => {
    const { document, panel, bubble, iframe } = load();
    bubble.focus();
    bubble.dispatch("click");
    expect(panel.style.display).toBe("block");
    expect(bubble.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(iframe);
  });

  it("focuses the form's own window too, on open and again once it has loaded", () => {
    // Cross-origin, iframe.focus() leaves the form page unfocused (Tab goes
    // back to the host page); contentWindow.focus() is what puts focus in it.
    const { bubble, iframe } = load();
    bubble.focus();
    bubble.dispatch("click");
    expect(iframe.contentWindow!.focusCalls).toBe(1);
    // The <iframe> already has focus by the time the form finishes loading.
    iframe.dispatch("load");
    expect(iframe.contentWindow!.focusCalls).toBe(2);
  });

  it("does not pull focus back into the form when it reloads while closed", () => {
    const { document, bubble, iframe } = load();
    bubble.dispatch("click");
    document.keydown("Escape");
    const before = iframe.contentWindow!.focusCalls;
    iframe.dispatch("load");
    expect(iframe.contentWindow!.focusCalls).toBe(before);
    expect(document.activeElement).toBe(bubble);
  });

  it("Escape closes it and puts focus back on the bubble", () => {
    const { document, panel, bubble } = load();
    bubble.focus();
    bubble.dispatch("click");
    document.keydown("Escape");
    expect(panel.style.display).toBe("none");
    expect(bubble.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(bubble);
  });

  it("Escape inside the form (it posts vf-close-widget) and its × button do the same", () => {
    const { document, panel, bubble, message } = load();
    bubble.dispatch("click");
    message({ type: "vf-close-widget" });
    expect(panel.style.display).toBe("none");
    expect(document.activeElement).toBe(bubble);
  });

  it("Escape does nothing while closed", () => {
    const { document, panel, bubble } = load();
    document.keydown("Escape");
    expect(panel.style.display).toBe("none");
    expect(bubble.style.display).toBe("flex");
  });

  it("is modal only as the phone bottom sheet with a backdrop", () => {
    const desk = load();
    desk.bubble.dispatch("click");
    expect(desk.panel.getAttribute("aria-modal")).toBeNull();
    const phone = load({ narrow: true });
    phone.bubble.dispatch("click");
    expect(phone.backdrop.style.display).toBe("block");
    expect(phone.panel.getAttribute("aria-modal")).toBe("true");
  });

  it("as the bottom sheet, makes the page behind inert until it closes", () => {
    // aria-modal alone left Tab free to walk onto links under the backdrop.
    const { document, backdrop, panel, bubble, hostLink, hostInert, message } = load({ narrow: true });
    bubble.dispatch("click");
    expect(hostLink.hasAttribute("inert")).toBe(true);
    expect(hostInert.hasAttribute("inert")).toBe(true);
    for (const own of [backdrop, panel, bubble]) expect(own.hasAttribute("inert")).toBe(false);
    document.keydown("Escape");
    expect(hostLink.hasAttribute("inert")).toBe(false);
    // What the venue had made inert itself stays that way.
    expect(hostInert.hasAttribute("inert")).toBe(true);
    // The same when the form closes itself (its × or Escape inside it).
    bubble.dispatch("click");
    expect(hostLink.hasAttribute("inert")).toBe(true);
    message({ type: "vf-close-widget" });
    expect(hostLink.hasAttribute("inert")).toBe(false);
    expect(hostInert.hasAttribute("inert")).toBe(true);
  });

  it("as the corner panel, leaves the page behind usable", () => {
    const { bubble, hostLink } = load();
    bubble.dispatch("click");
    expect(hostLink.hasAttribute("inert")).toBe(false);
  });
});
