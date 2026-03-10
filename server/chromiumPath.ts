import { execSync } from "child_process";
import { existsSync } from "fs";

let _cachedPath: string | null = null;

export async function resolveChromiumPath(): Promise<string> {
  if (_cachedPath && existsSync(_cachedPath)) return _cachedPath;

  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/local/bin/chromium",
    "/usr/lib/chromium-browser/chromium-browser",
  ];
  for (const p of candidates) {
    if (existsSync(p)) { _cachedPath = p; return p; }
  }
  try {
    const found = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      { encoding: "utf8" }
    ).trim().split("\n")[0];
    if (found && existsSync(found)) { _cachedPath = found; return found; }
  } catch {}
  throw new Error("No Chromium/Chrome executable found.");
}
