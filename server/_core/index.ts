import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { handleProposalPdf } from "../proposalPdf";
import { handleBeoPdf, handleBeoPdfPublic } from "../beoPdf";
import { handleFloorPlanPdf } from "../floorPlanPdf";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import path from "path";
import fs from "fs";
import { sdk } from "./sdk";
import { upsertUser } from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { handleGithubWebhook } from "../githubWebhook";
import { handleNbiWebhook } from "../nbiWebhook";
// Custom migration runner. The stock drizzle migrator runs all journal
// entries in one go and aborts the whole loop on the first error — even
// a benign "object already exists" duplicate. That's catastrophic on a
// DB that was provisioned out-of-band (or where the
// drizzle.__drizzle_migrations tracking table got reset), because the
// very first CREATE TYPE trips and every later migration is silently
// skipped forever. We saw this in prod: a fresh deploy reported
// "Migration skipped (migration 0000_oval_argent...)" on every boot,
// while migrations 39/40 (which added genuinely new columns the BEO
// renderer queries) never applied, breaking the PDF endpoint.
//
// This implementation runs each journal entry's SQL statement-by-
// statement, swallows duplicate-object errors on a per-statement basis,
// then records the migration's hash in drizzle.__drizzle_migrations
// using the same format Drizzle uses, so subsequent boots are no-ops
// and a future return to drizzle's own migrate() would also Just Work.
async function runMigrations() {
  if (!process.env.DATABASE_URL) return;
  const { Pool } = await import('pg');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    const journalRaw = await fs.readFile(path.resolve('drizzle/meta/_journal.json'), 'utf8');
    const journal = JSON.parse(journalRaw) as { entries: Array<{ idx: number; tag: string; when: number }> };
    const applied = await pool.query(`SELECT hash FROM drizzle.__drizzle_migrations`);
    const appliedHashes = new Set<string>(applied.rows.map((r: any) => r.hash));
    // 42P07 duplicate_table, 42710 duplicate_object, 42701 duplicate_column
    const benignCodes = new Set(['42P07', '42710', '42701']);
    for (const entry of journal.entries) {
      const sqlPath = path.resolve(`drizzle/${entry.tag}.sql`);
      let sql: string;
      try {
        sql = await fs.readFile(sqlPath, 'utf8');
      } catch {
        console.warn(`[DB] journal references missing SQL file ${entry.tag}.sql — skipping`);
        continue;
      }
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      if (appliedHashes.has(hash)) continue;
      const statements = sql
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(Boolean);
      let success = true;
      for (const stmt of statements) {
        try {
          await pool.query(stmt);
        } catch (err: any) {
          const code = err?.code;
          if (code && benignCodes.has(code)) {
            // Object already exists from an earlier out-of-band schema
            // creation — safe to treat as no-op and continue.
            console.log(`[DB] ${entry.tag}: object already exists, skipping statement (code ${code})`);
          } else {
            success = false;
            console.error(`[DB] migration ${entry.tag} FAILED on statement:`, stmt.slice(0, 120), err?.message);
            break;
          }
        }
      }
      if (success) {
        await pool.query(
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
          [hash, entry.when],
        );
        console.log(`[DB] applied migration ${entry.tag}`);
      }
    }
  } catch (err) {
    console.error('[DB] migration runner crashed (non-fatal):', err);
  } finally {
    await pool.end();
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  await runMigrations();
  const app = express();
  // Trust the first proxy hop (Replit's edge) so req.ip reflects the real
  // client and X-Forwarded-For cannot be spoofed by random clients.
  app.set("trust proxy", 1);

  // Baseline security response headers. We deliberately stop short of a full
  // Content-Security-Policy here because the app loads Google Fonts, inline
  // styles from Tailwind v4, and a handful of third-party scripts that need
  // their own audited allow-list before CSP can be turned on without breakage.
  // Routes that are deliberately designed to be embedded in a customer's
  // own website via <iframe> (the public enquiry form is the main one).
  // Keep this list narrow — every entry weakens clickjacking protection on
  // that specific URL.
  const EMBEDDABLE_PATH_PREFIXES = [
    "/enquire",     // /enquire and /enquire/:slug — public lead form
  ];
  function isEmbeddablePath(pathname: string): boolean {
    return EMBEDDABLE_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
  }

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // SAMEORIGIN by default to defeat clickjacking, but omit on routes that
    // are intentionally embeddable (e.g. the enquiry form embedded in a
    // venue's marketing site like barfranco.nz). Browsers treat an absent
    // X-Frame-Options as "framing allowed".
    if (!isEmbeddablePath(req.path)) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  const server = createServer(app);
  // GitHub webhook — must capture raw body BEFORE json middleware for HMAC verification
  app.post("/api/webhook/github", express.raw({ type: "application/json" }), (req, res) => {
    try { req.body = JSON.parse((req.body as Buffer).toString()); } catch { req.body = {}; }
    handleGithubWebhook(req, res);
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // NowBookIt inbound webhook — auth via per-venue secret in the URL path.
  // Mounted after json middleware so req.body is parsed.
  app.post("/api/webhook/nowbookit/:secret", (req, res) => {
    handleNbiWebhook(req, res).catch(err => {
      console.error("[NBI Webhook] Unhandled error:", err);
      res.status(500).json({ ok: false, error: "internal_error" });
    });
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Tiny in-memory rate limiter (per IP) for the public login endpoint to slow
  // down brute-force attempts against ADMIN_PASSWORD. 10 attempts / 5 min window.
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const LOGIN_WINDOW_MS = 5 * 60 * 1000;
  const LOGIN_MAX = 10;
  function getClientIp(req: express.Request): string {
    // With `trust proxy` configured above, Express resolves req.ip from the
    // first hop in X-Forwarded-For — safe from client-side spoofing.
    return req.ip || "unknown";
  }
  function checkLoginRate(ip: string): boolean {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || entry.resetAt < now) {
      loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= LOGIN_MAX;
  }

  // Local password login. Two modes:
  //   1. { password }            → original single-admin ADMIN_PASSWORD flow
  //   2. { email, password }     → per-user login via users.passwordHash
  //                                (created by an admin in Settings → Team)
  // In mode 2 the session is issued for the WORKSPACE OWNER, not the
  // credential user — that way every existing data query (all scoped by
  // ctx.user.id) just keeps working without any per-row plumbing.
  app.post("/api/auth/local-login", async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!checkLoginRate(ip)) {
        res.status(429).json({ error: "Too many login attempts. Please wait a few minutes and try again." });
        return;
      }
      const { password, email } = req.body ?? {};
      if (!password || typeof password !== "string") {
        res.status(400).json({ error: "Password is required." });
        return;
      }

      // Mode 2: email + password lookup against users table.
      if (email && typeof email === "string") {
        const bcrypt = await import("bcryptjs");
        const { getDb } = await import("../db");
        const { users: usersTable } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) {
          res.status(503).json({ error: "Database not available." });
          return;
        }
        const normalizedEmail = email.trim().toLowerCase();
        const rows = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
        const credUser = rows[0];
        // Use a constant-ish branch so timing doesn't leak whether the email exists.
        const hash = credUser?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
        const ok = await bcrypt.compare(password, hash);
        if (!credUser || !credUser.passwordHash || !ok) {
          res.status(401).json({ error: "Incorrect email or password." });
          return;
        }
        // Resolve which workspace this login belongs to.
        let sessionUser = credUser;
        if (credUser.workspaceOwnerId) {
          const ownerRows = await db.select().from(usersTable).where(eq(usersTable.id, credUser.workspaceOwnerId)).limit(1);
          if (ownerRows[0]) sessionUser = ownerRows[0];
        }
        // Stamp last login on the credential row (helps the admin see who's active).
        await db.update(usersTable).set({ lastSignedIn: new Date() }).where(eq(usersTable.id, credUser.id));
        const token = await sdk.createSessionToken(sessionUser.openId, { name: sessionUser.name ?? "Admin" });
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        res.json({ success: true });
        return;
      }

      // Mode 1: shared ADMIN_PASSWORD (bootstrap / owner).
      const adminPassword = ENV.adminPassword;
      if (!adminPassword) {
        res.status(503).json({ error: "Local login is not configured. Set the ADMIN_PASSWORD environment variable." });
        return;
      }
      if (password !== adminPassword) {
        res.status(401).json({ error: "Incorrect password." });
        return;
      }

      const openId = "local-admin";
      await upsertUser({
        openId,
        name: "Admin",
        email: null,
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const token = await sdk.createSessionToken(openId, { name: "Admin" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[LocalLogin] Error:", e);
      res.status(500).json({ error: "Login failed." });
    }
  });

  // Team member login via access token
  app.get("/api/team-login/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { getDb } = await import('../db');
      const { teamMembers, users } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) { res.status(500).json({ error: 'DB unavailable' }); return; }
      const [member] = await db.select().from(teamMembers)
        .where(and(eq(teamMembers.accessToken, token), eq(teamMembers.isActive, true)))
        .limit(1);
      if (!member) { res.status(404).send('<h2>Invalid or revoked link</h2><p>Ask your venue manager for a new link.</p>'); return; }
      const [owner] = await db.select().from(users).where(eq(users.id, member.ownerId)).limit(1);
      if (!owner) { res.status(404).send('<h2>Account not found</h2>'); return; }
      await db.update(teamMembers).set({ lastAccessedAt: Date.now() }).where(eq(teamMembers.id, member.id));
      const sessionToken = await sdk.signSession(
        { openId: owner.openId, appId: (await import('./env')).ENV.appId, name: member.name, isTeamMember: true },
        { expiresInMs: 30 * 24 * 60 * 60 * 1000 }
      );
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.redirect('/dashboard');
    } catch (e: any) {
      console.error('[TeamLogin] Error:', e);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // PDF endpoints are expensive (puppeteer/pdfkit + DB fan-out) and the
  // public ones are auth'd only by an unguessable token in the URL. Rate-
  // limit per IP to blunt brute-force token guessing and runaway-cost abuse.
  const { expressRateLimit } = await import("./rateLimit");
  const pdfPublicLimit = expressRateLimit("pdf:public", 30, 60_000);
  const pdfAuthLimit = expressRateLimit("pdf:auth", 60, 60_000);

  // Proposal PDF download (public — uses publicToken for auth)
  app.get("/api/proposal-pdf/:token", pdfPublicLimit, handleProposalPdf);

  // Floor Plan PDF download (public — share token acts as auth)
  app.get("/api/floor-plan-pdf/:token", pdfPublicLimit, handleFloorPlanPdf);

  // BEO PDF download (requires session auth)
  app.get("/api/beo/:bookingId", pdfAuthLimit, (req, res, next) => {
    createContext({ req: req as any, res: res as any, info: {} as any }).then(ctx => {
      (req as any).user = ctx.user;
      handleBeoPdf(req, res);
    }).catch(next);
  });

  // BEO Live Link — public, token-gated. Used as the customer-facing event pack.
  app.get("/api/beo/public/:token", pdfPublicLimit, handleBeoPdfPublic);

  // NOTE: The old /api/staff-sheet/:runsheetId route and staffSheetPdf.ts
  // have been removed. The BEO (handleBeoPdf above) is now the single
  // staff-facing document — used by the runsheet "BEO PDF" header
  // button, the staff briefing email attachment, and the booking
  // download. Don't reintroduce a second staff PDF.

  // Serve uploaded files statically
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  // Image upload endpoint — requires authenticated session and restricts file types.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  // NB: SVG is intentionally excluded — uploads are served from /uploads on the
  // same origin, and SVG can embed <script> resulting in stored XSS.
  const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
  app.post("/api/upload-image", upload.single("file"), async (req, res) => {
    try {
      // Require an authenticated session — without this, anyone on the public internet
      // can write 10MB files to the server filesystem under /uploads.
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const multerReq = req as express.Request & { file?: Express.Multer.File };
      if (!multerReq.file) { res.status(400).json({ error: "No file" }); return; }
      // Whitelist by mime AND extension to block scripts/HTML uploads being served from /uploads.
      const mime = multerReq.file.mimetype || "";
      const rawExt = (multerReq.file.originalname.split(".").pop() ?? "").toLowerCase();
      const ext = ALLOWED_IMAGE_EXTS.has(rawExt) ? rawExt : "";
      if (!mime.startsWith("image/") || !ext) {
        res.status(400).json({ error: "Only image files are allowed" });
        return;
      }
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, multerReq.file.buffer);
      const url = `/uploads/${filename}`;
      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PDF upload endpoint — used by runsheet attachments (drinks menus, etc).
  // Authenticated. Whitelisted to application/pdf to keep /uploads safe.
  app.post("/api/upload-pdf", upload.single("file"), async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const multerReq = req as express.Request & { file?: Express.Multer.File };
      if (!multerReq.file) { res.status(400).json({ error: "No file" }); return; }
      const mime = multerReq.file.mimetype || "";
      const rawExt = (multerReq.file.originalname.split(".").pop() ?? "").toLowerCase();
      if (mime !== "application/pdf" || rawExt !== "pdf") {
        res.status(400).json({ error: "Only PDF files are allowed" });
        return;
      }
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, multerReq.file.buffer);
      res.json({
        url: `/uploads/${filename}`,
        name: multerReq.file.originalname,
        size: multerReq.file.size,
        contentType: "application/pdf",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // MCP (Model Context Protocol) endpoint — for Claude / external AI integrations.
  // Token auth via `Authorization: Bearer vfk_...`. See server/mcp.ts.
  app.post("/mcp", (req, res) => {
    import("../mcp").then(({ handleMcp }) => handleMcp(req, res)).catch(err => {
      console.error("[MCP] mount error:", err);
      if (!res.headersSent) res.status(500).json({ error: "mcp_unavailable" });
    });
  });
  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Use POST for MCP requests" });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "5000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
