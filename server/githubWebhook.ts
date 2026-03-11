import { Request, Response } from "express";
import crypto from "crypto";
import { exec } from "child_process";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../..");

function verifySignature(secret: string, payload: string, signature: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const digest = `sha256=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function handleGithubWebhook(req: Request, res: Response) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"] as string | undefined;

  // If a secret is configured, verify the HMAC signature
  if (secret) {
    if (!signature) {
      res.status(401).json({ error: "Missing signature" });
      return;
    }
    const rawBody = JSON.stringify(req.body);
    if (!verifySignature(secret, rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const event = req.headers["x-github-event"];
  if (event !== "push") {
    res.json({ ok: true, message: `Ignored event: ${event}` });
    return;
  }

  const ref = req.body?.ref as string | undefined;
  const branch = ref?.replace("refs/heads/", "");
  if (branch && branch !== "main") {
    res.json({ ok: true, message: `Ignored push to branch: ${branch}` });
    return;
  }

  console.log(`[Webhook] GitHub push received on ${branch || "unknown"} — pulling latest…`);

  // Respond immediately so GitHub doesn't time out
  res.json({ ok: true, message: "Pull triggered" });

  // Run git pull in the background
  exec(
    "git pull origin main --ff-only",
    { cwd: ROOT, timeout: 30_000 },
    (err, stdout, stderr) => {
      if (err) {
        console.error("[Webhook] git pull failed:", stderr || err.message);
        return;
      }
      console.log("[Webhook] git pull succeeded:", stdout.trim());

      // Run pnpm install in case dependencies changed
      exec(
        "pnpm install --frozen-lockfile",
        { cwd: ROOT, timeout: 60_000 },
        (installErr, installOut) => {
          if (installErr) {
            console.warn("[Webhook] pnpm install warning:", installErr.message);
          } else {
            console.log("[Webhook] pnpm install done:", installOut.trim());
          }
          // tsx watch will auto-restart when files change — no manual restart needed
        }
      );
    }
  );
}
