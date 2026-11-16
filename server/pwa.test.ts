import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { serveStatic } from "./_core/staticFiles";
import { isPublicClientPath } from "../shared/pwaScope";

// The installable-app files. If one of these breaks, the phone silently stops offering "install"
// (or, worse, the service worker starts caching live data or serving an error page as a script),
// and nothing else in the suite would notice.
const PUBLIC = path.resolve(__dirname, "../client/public");
const read = (f: string) => fs.readFileSync(path.join(PUBLIC, f), "utf8");
const pngSize = (f: string) => {
  const b = fs.readFileSync(path.join(PUBLIC, f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

describe("web app manifest", () => {
  const m = JSON.parse(read("manifest.webmanifest"));

  it("has what browsers need to offer installation", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    expect(m.scope).toBe("/");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("lists a 192 and a 512 icon plus a maskable one, each file really that size", () => {
    const sizes = m.icons.map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons.some((i: any) => i.purpose === "maskable")).toBe(true);
    for (const icon of m.icons) {
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(icon.src.replace(/^\//, ""))).toEqual({ w, h });
    }
  });

  it("only points shortcuts at the app's own screens", () => {
    for (const s of m.shortcuts) expect(s.url).toMatch(/^\/dashboard\?tab=[a-z]+$/);
  });
});

describe("index.html and startup", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../client/index.html"), "utf8");
  const main = fs.readFileSync(path.resolve(__dirname, "../client/src/main.tsx"), "utf8");

  it("has an iPhone home-screen icon that exists at 180px", () => {
    const m = html.match(/<link rel="apple-touch-icon" href="\/([^"]+)"/);
    expect(m).toBeTruthy();
    expect(pngSize(m![1])).toEqual({ w: 180, h: 180 });
  });

  it("links the manifest from main.tsx on staff screens only, not statically for every page", () => {
    expect(html).not.toMatch(/<link rel="manifest"/);
    expect(main).toMatch(/if \(!isPublicClientPath\(window\.location\.pathname\)\)/);
    expect(main).toContain("/manifest.webmanifest");
  });

  it("the offline page exists and uses a file the worker caches", () => {
    expect(fs.existsSync(path.join(PUBLIC, "offline.html"))).toBe(true);
    expect(read("offline.html")).toContain("/icon-192.png");
  });
});

describe("isPublicClientPath", () => {
  it("is true for pages clients and token-link staff open", () => {
    for (const p of [
      "/enquire", "/enquire/bar-franco", "/proposal/abc123", "/portal/tok", "/staff/tok", "/staff-checklist/tok",
      "/daily/tok", "/shift/tok", "/wedding-checklist/tok", "/floor-plan/share/tok", "/embed-docs", "/book", "/enquire/",
    ]) expect(isPublicClientPath(p), p).toBe(true);
  });
  it("is false for the staff app, including look-alike prefixes", () => {
    for (const p of [
      "/", "/dashboard", "/login", "/signup", "/event/12", "/runsheet", "/floor-plan", "/payments", "/checklist",
      "/staff-links", "/daily-checklists", "/proposals/new", "/enquirer", "/bookings",
    ]) expect(isPublicClientPath(p), p).toBe(false);
  });
});

// ── The real client/public/sw.js, run in a sandbox with a fake network and cache ────────────────────
const ORIGIN = "https://venue.test";
const basic = (body: string, init: ResponseInit & { type?: string } = {}) => {
  const res = new Response(body, init);
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
};
const js = (body = "export {}") => basic(body, { status: 200, headers: { "content-type": "application/javascript" } });
const html = (body = "<!doctype html><title>app</title>") => basic(body, { status: 200, headers: { "content-type": "text/html; charset=UTF-8" } });
const keyOf = (r: any) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);

function loadWorker(opts: { fetch: (url: string) => Promise<Response>; putThrows?: boolean }) {
  const handlers: Record<string, (e: any) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const makeCache = (name: string) => {
    const m = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, m);
    return {
      match: async (r: any) => m.get(keyOf(r))?.clone(),
      put: async (r: any, res: Response) => {
        if (opts.putThrows) throw new TypeError("Partial response (status code 206) is unsupported");
        m.set(keyOf(r), res);
      },
      delete: async (r: any) => m.delete(keyOf(r)),
      keys: async () => [...m.keys()].map(url => ({ url })),
      addAll: async (urls: string[]) => { for (const u of urls) m.set(keyOf(u), await opts.fetch(keyOf(u))); },
    };
  };
  const sandbox: any = {
    self: {
      addEventListener: (type: string, fn: (e: any) => void) => { handlers[type] = fn; },
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
      location: { origin: ORIGIN },
    },
    caches: {
      open: async (n: string) => makeCache(n),
      match: async (r: any) => { for (const m of stores.values()) { const v = m.get(keyOf(r)); if (v) return v.clone(); } return undefined; },
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
    },
    fetch: async (input: any) => { const u = keyOf(input); fetched.push(u); return opts.fetch(u); },
    Response, URL, console, Promise,
  };
  vm.runInNewContext(read("sw.js"), sandbox);

  async function fire(req: { method?: string; url: string; mode?: string }) {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({
      request: { method: "GET", mode: "no-cors", ...req },
      respondWith: (p: Promise<Response>) => { responded = Promise.resolve(p); },
      waitUntil: (p: Promise<unknown>) => { waits.push(Promise.resolve(p)); },
    });
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return { handled: responded !== undefined, res };
  }
  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(Promise.resolve(p)) });
    await Promise.all(waits);
  }
  const cached = (name: string) => [...(stores.get(name)?.keys() ?? [])].map(u => new URL(u).pathname);
  return { fire, lifecycle, stores, fetched, cached };
}

const shellFetch = async (url: string) => {
  if (url.endsWith("/offline.html")) return html("<h1>You're offline</h1>");
  if (url.endsWith("/icon-192.png")) return basic("png", { status: 200, headers: { "content-type": "image/png" } });
  throw new Error("unexpected fetch " + url);
};

describe("service worker (real sw.js in a sandbox)", () => {
  it("installs the offline page and its logo into the shell cache", async () => {
    const sw = loadWorker({ fetch: shellFetch });
    await sw.lifecycle("install");
    expect(sw.cached("vf-shell-v1").sort()).toEqual(["/icon-192.png", "/offline.html"]);
  });

  it("on activate deletes caches from other versions and keeps its own", async () => {
    const sw = loadWorker({ fetch: shellFetch });
    await sw.lifecycle("install");
    sw.stores.set("vf-shell-v0", new Map());
    sw.stores.set("something-else", new Map());
    await sw.lifecycle("activate");
    expect([...sw.stores.keys()]).toEqual(["vf-shell-v1"]);
  });

  it("never touches non-GET requests, other origins, or the API / MCP / uploads / health endpoints", async () => {
    const sw = loadWorker({ fetch: async () => { throw new Error("must not be fetched by the worker"); } });
    for (const req of [
      { method: "POST", url: ORIGIN + "/dashboard", mode: "navigate" },
      { method: "POST", url: ORIGIN + "/assets/a.js" },
      { url: "https://other.example/assets/a.js" },
      { url: ORIGIN + "/api/trpc/leads.list" },
      { url: ORIGIN + "/api/beo/12", mode: "navigate" },
      { url: ORIGIN + "/api/oauth/xero/callback?code=1", mode: "navigate" },
      { url: ORIGIN + "/mcp" },
      { url: ORIGIN + "/uploads/menu.pdf", mode: "navigate" },
      { url: ORIGIN + "/healthz" },
      { url: ORIGIN + "/something-else.json" },
    ]) {
      const { handled } = await sw.fire(req);
      expect(handled, `${req.method ?? "GET"} ${req.url}`).toBe(false);
    }
    expect(sw.fetched).toEqual([]);
  });

  it("a page load goes to the network and is returned untouched; when the network fails the offline page is shown", async () => {
    let online = true;
    const sw = loadWorker({ fetch: async (u) => { if (u.endsWith("/offline.html") || u.endsWith("/icon-192.png")) return shellFetch(u); if (!online) throw new TypeError("Failed to fetch"); return html("<h1>dashboard</h1>"); } });
    await sw.lifecycle("install");
    const ok = await sw.fire({ url: ORIGIN + "/dashboard", mode: "navigate" });
    expect(await ok.res!.text()).toContain("dashboard");
    online = false;
    const off = await sw.fire({ url: ORIGIN + "/dashboard", mode: "navigate" });
    expect(await off.res!.text()).toContain("You're offline");
  });

  it("with the network down AND an empty cache it still answers (503 text), never an undefined response", async () => {
    const sw = loadWorker({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
    const { res } = await sw.fire({ url: ORIGIN + "/dashboard", mode: "navigate" });
    expect(res!.status).toBe(503);
    expect(await res!.text()).toContain("offline");
  });

  it("a server error on a page load is passed through, not replaced by the offline page", async () => {
    const sw = loadWorker({ fetch: async () => basic("boom", { status: 500 }) });
    const { res } = await sw.fire({ url: ORIGIN + "/dashboard", mode: "navigate" });
    expect(res!.status).toBe(500);
  });

  it("refreshes the offline page once per start-up, so an edited one reaches installed phones", async () => {
    let version = 1;
    const sw = loadWorker({ fetch: async (u) => (u.endsWith("/offline.html") ? html("offline v" + version) : u.endsWith("/icon-192.png") ? shellFetch(u) : html("page")) });
    await sw.lifecycle("install");
    version = 2;
    await sw.fire({ url: ORIGIN + "/dashboard", mode: "navigate" });
    await sw.fire({ url: ORIGIN + "/login", mode: "navigate" });
    expect(sw.fetched.filter(u => u.endsWith("/offline.html")).length).toBe(1);
    const cachedPage = await sw.stores.get("vf-shell-v1")!.get(ORIGIN + "/offline.html")!.text();
    expect(cachedPage).toBe("offline v2");
  });

  it("caches a real build file and then serves it without asking the network again", async () => {
    const sw = loadWorker({ fetch: async () => js("console.log(1)") });
    const first = await sw.fire({ url: ORIGIN + "/assets/index-abc123.js" });
    expect(await first.res!.text()).toBe("console.log(1)");
    expect(sw.cached("vf-assets-v1")).toEqual(["/assets/index-abc123.js"]);
    const before = sw.fetched.length;
    const second = await sw.fire({ url: ORIGIN + "/assets/index-abc123.js" });
    expect(await second.res!.text()).toBe("console.log(1)");
    expect(sw.fetched.length).toBe(before);
  });

  it("does NOT cache the app's HTML page served with a 200 for a missing build file", async () => {
    const sw = loadWorker({ fetch: async () => html() });
    const { res } = await sw.fire({ url: ORIGIN + "/assets/vendor-gone-ZZZ.js" });
    expect(res!.status).toBe(200); // passed through as the network gave it
    expect(sw.cached("vf-assets-v1")).toEqual([]);
  });

  it("does NOT cache a 404 or 500 for a build file", async () => {
    for (const status of [404, 500]) {
      const sw = loadWorker({ fetch: async () => basic("nope", { status, headers: { "content-type": "text/plain" } }) });
      const { res } = await sw.fire({ url: ORIGIN + "/assets/missing.js" });
      expect(res!.status).toBe(status);
      expect(sw.cached("vf-assets-v1")).toEqual([]);
    }
  });

  it("ignores and replaces a cached HTML copy of a build file (e.g. one poisoned by an older worker)", async () => {
    const sw = loadWorker({ fetch: async () => js("real") });
    const cache = sw.stores.get("vf-assets-v1") ?? new Map();
    sw.stores.set("vf-assets-v1", cache);
    cache.set(ORIGIN + "/assets/a.js", html());
    const { res } = await sw.fire({ url: ORIGIN + "/assets/a.js" });
    expect(await res!.text()).toBe("real");
    expect(await cache.get(ORIGIN + "/assets/a.js")!.text()).toBe("real");
  });

  it("a failing cache write (quota, 206 partial) never fails the file the network served", async () => {
    const sw = loadWorker({ fetch: async () => js("served"), putThrows: true });
    const { res } = await sw.fire({ url: ORIGIN + "/assets/index-abc123.js" });
    expect(await res!.text()).toBe("served");
  });

  it("keeps at most 80 build files, dropping the oldest", async () => {
    const sw = loadWorker({ fetch: async () => js() });
    for (let i = 0; i < 85; i++) await sw.fire({ url: ORIGIN + `/assets/chunk-${i}.js` });
    const kept = sw.cached("vf-assets-v1");
    expect(kept.length).toBe(80);
    expect(kept).not.toContain("/assets/chunk-0.js");
    expect(kept).toContain("/assets/chunk-84.js");
  });
});

// ── The real static-file server, pointed at a temp build folder ────────────────────────────────────
describe("serveStatic", () => {
  let server: Server;
  let base = "";
  let dir = "";
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-static-"));
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>app</title>");
    fs.writeFileSync(path.join(dir, "sw.js"), "// sw");
    fs.writeFileSync(path.join(dir, "manifest.webmanifest"), "{}");
    fs.writeFileSync(path.join(dir, "offline.html"), "<p>offline</p>");
    fs.writeFileSync(path.join(dir, "assets", "app-abc123.js"), "export {}");
    const app = express();
    serveStatic(app, dir);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("sends the service worker, manifest and offline page with no-cache", async () => {
    for (const f of ["/sw.js", "/manifest.webmanifest", "/offline.html"]) {
      const res = await fetch(base + f);
      expect(res.status, f).toBe(200);
      expect(res.headers.get("cache-control"), f).toBe("no-cache");
    }
  });

  it("serves real build files normally (not forced to no-cache)", async () => {
    const res = await fetch(base + "/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    expect(res.headers.get("cache-control")).not.toBe("no-cache");
  });

  it("answers a missing build file with a real 404, not the app's HTML with a 200", async () => {
    const res = await fetch(base + "/assets/vendor-gone-ZZZ.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") ?? "").not.toMatch(/html/);
  });

  it("still falls back to index.html for app routes", async () => {
    for (const p of ["/dashboard", "/event/12", "/some/deep/route"]) {
      const res = await fetch(base + p);
      expect(res.status, p).toBe(200);
      expect(await res.text()).toContain("<title>app</title>");
    }
  });
});
