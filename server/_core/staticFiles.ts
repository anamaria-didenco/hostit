import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/** The built client: dist/public next to the bundled server (dist/index.js). */
export function defaultDistPath(): string {
  return process.env.NODE_ENV === "development"
    ? path.resolve(import.meta.dirname, "../..", "dist", "public")
    : path.resolve(import.meta.dirname, "public");
}

/** Serve the built client. `distPath` is overridable so tests can point at a temp folder. */
export function serveStatic(app: Express, distPath: string = defaultDistPath()) {
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath, {
    // The service worker, manifest and offline page must never be served from a stale
    // cache, or a fix to them would not reach phones that already have the app.
    setHeaders: (res, filePath) => {
      if (/[\\/](sw\.js|manifest\.webmanifest|offline\.html)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  // A build file that doesn't exist is a real 404. Without this the catch-all below answers
  // it with index.html and a 200, which (a) turns a stale tab's missing script into a baffling
  // "text/html is not a JavaScript module" error and (b) let the service worker cache that
  // HTML under the script's own URL.
  app.use("/assets", (_req, res) => {
    res.status(404).type("text/plain").send("Not found");
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
