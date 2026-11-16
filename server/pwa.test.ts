import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The installable-app files. If one of these breaks, the phone silently stops offering "install"
// (or, worse, a service worker starts caching live data), and nothing else in the suite notices.
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

describe("index.html", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../client/index.html"), "utf8");
  it("links the manifest and an iPhone home-screen icon that exists", () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    const m = html.match(/<link rel="apple-touch-icon" href="\/([^"]+)"/);
    expect(m).toBeTruthy();
    expect(pngSize(m![1])).toEqual({ w: 180, h: 180 });
  });
});

describe("service worker", () => {
  const sw = read("sw.js");
  it("never touches the API, uploads or non-GET requests", () => {
    expect(sw).toMatch(/request\.method !== "GET"\) return/);
    expect(sw).toMatch(/\^\\\/\(api\|mcp\|uploads\|healthz\)/);
  });
  it("only caches the offline page, its logo and hashed build files", () => {
    expect(sw).toMatch(/SHELL_URLS = \[OFFLINE_URL, "\/icon-192\.png"\]/);
    expect(sw).toMatch(/startsWith\("\/assets\/"\)/);
    // no other cache.put / addAll targets
    expect((sw.match(/cache\.put\(/g) ?? []).length).toBe(1);
    expect((sw.match(/addAll\(/g) ?? []).length).toBe(1);
  });
  it("the offline page exists and its files are cached by the worker", () => {
    expect(fs.existsSync(path.join(PUBLIC, "offline.html"))).toBe(true);
    expect(read("offline.html")).toContain("/icon-192.png");
  });
});
