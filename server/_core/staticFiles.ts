import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/** The built client: dist/public next to the bundled server (dist/index.js). */
export function defaultDistPath(): string {
  return process.env.NODE_ENV === "development"
    ? path.resolve(import.meta.dirname, "../..", "dist", "public")
    : path.resolve(import.meta.dirname, "public");
}

/**
 * A build file whose name carries Vite's content hash ("assets/index-Ba-O4ySP.js"):
 * a new build gives changed content a new name, so the file under this name
 * never changes.
 */
export function isHashedAsset(filePath: string): boolean {
  return /[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/.test(filePath);
}

const NO_CACHE = "no-cache";
// A year, and no revalidation: each reload of the embedded form used to ask
// the server about every bundle again (max-age=0) before it could show.
const IMMUTABLE = "public, max-age=31536000, immutable";

/** Serve the built client. `distPath` is overridable so tests can point at a temp folder. */
export function serveStatic(app: Express, distPath: string = defaultDistPath()) {
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      // The page itself, the service worker, manifest and offline page must never be
      // served from a stale cache, or a deploy (or a fix to them) would not reach phones
      // that already have the app.
      if (/[\\/](index\.html|sw\.js|manifest\.webmanifest|offline\.html)$/.test(filePath)) {
        res.setHeader("Cache-Control", NO_CACHE);
      } else if (isHashedAsset(filePath)) {
        res.setHeader("Cache-Control", IMMUTABLE);
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
    res.setHeader("Cache-Control", NO_CACHE);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
