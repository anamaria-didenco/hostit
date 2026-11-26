import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { isHashedAsset, serveStatic } from "./_core/staticFiles";

/**
 * The embedded enquiry form loads the app's bundles on every reload the
 * venue's page makes. Files whose names carry Vite's content hash never
 * change, so browsers may keep them a year without asking again; the page
 * itself and the service-worker files are always checked, or a deploy
 * wouldn't reach anyone.
 */
describe("caching of the built client", () => {
  let server: Server;
  let base = "";
  let dir = "";
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-cache-"));
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>app</title>");
    fs.writeFileSync(path.join(dir, "sw.js"), "// sw");
    fs.writeFileSync(path.join(dir, "manifest.webmanifest"), "{}");
    fs.writeFileSync(path.join(dir, "offline.html"), "<p>offline</p>");
    fs.writeFileSync(path.join(dir, "embed.js"), "// embed");
    fs.writeFileSync(path.join(dir, "assets", "index-Ba-O4ySP.js"), "export {}");
    fs.writeFileSync(path.join(dir, "assets", "index-JFddT-gT.css"), "body{}");
    fs.writeFileSync(path.join(dir, "assets", "pdf.worker.min-iDqQPrd3.mjs"), "export {}");
    fs.writeFileSync(path.join(dir, "assets", "logo.svg"), "<svg/>");
    const app = express();
    serveStatic(app, dir);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps content-hashed bundles for a year, without asking again", async () => {
    for (const f of ["/assets/index-Ba-O4ySP.js", "/assets/index-JFddT-gT.css", "/assets/pdf.worker.min-iDqQPrd3.mjs"]) {
      const res = await fetch(base + f);
      expect(res.status, f).toBe(200);
      expect(res.headers.get("cache-control"), f).toBe("public, max-age=31536000, immutable");
    }
  });

  it("never marks a file without a hash immutable", async () => {
    for (const f of ["/assets/logo.svg", "/embed.js"]) {
      const res = await fetch(base + f);
      expect(res.status, f).toBe(200);
      expect(res.headers.get("cache-control") ?? "", f).not.toMatch(/immutable/);
    }
  });

  it("always checks the page, the app routes and the service-worker files", async () => {
    for (const f of ["/", "/index.html", "/enquire/bar-franco?embed=1", "/dashboard", "/sw.js", "/manifest.webmanifest", "/offline.html"]) {
      const res = await fetch(base + f);
      expect(res.status, f).toBe(200);
      expect(res.headers.get("cache-control"), f).toBe("no-cache");
    }
  });

  it("still answers a missing bundle with a 404 that isn't cached for a year", async () => {
    const res = await fetch(base + "/assets/index-ZZZZZZZZ.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control") ?? "").not.toMatch(/immutable/);
  });

  it("tells hashed names from plain ones", () => {
    expect(isHashedAsset("/srv/dist/public/assets/vendor-charts-Gvgrcgw9.js")).toBe(true);
    expect(isHashedAsset("C:\\dist\\public\\assets\\vendor-dnd-D0FI_Wik.js")).toBe(true);
    expect(isHashedAsset("/srv/dist/public/assets/app-abc123.js")).toBe(false);
    expect(isHashedAsset("/srv/dist/public/index-Ba-O4ySP.js")).toBe(false);
    expect(isHashedAsset("/srv/dist/public/assets/logo.svg")).toBe(false);
  });
});
