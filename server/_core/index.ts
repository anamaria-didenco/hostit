import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { handleProposalPdf } from "../proposalPdf";
import { handleBeoPdf, handleBeoPdfPublic } from "../beoPdf";
import { handleStaffSheetPdf } from "../staffSheetPdf";
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
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function runMigrations() {
  if (!process.env.DATABASE_URL) return;
  try {
    const db = drizzle(process.env.DATABASE_URL);
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("[DB] Migrations applied successfully");
  } catch (err) {
    console.error("[DB] Migration error (non-fatal):", err);
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

  // Local password login (for trial/dev use — no external OAuth needed)
  app.post("/api/auth/local-login", async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!checkLoginRate(ip)) {
        res.status(429).json({ error: "Too many login attempts. Please wait a few minutes and try again." });
        return;
      }
      const { password } = req.body ?? {};
      const adminPassword = ENV.adminPassword;

      if (!adminPassword) {
        res.status(503).json({ error: "Local login is not configured. Set the ADMIN_PASSWORD environment variable." });
        return;
      }

      if (!password || password !== adminPassword) {
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

  // Proposal PDF download (public — uses publicToken for auth)
  app.get("/api/proposal-pdf/:token", handleProposalPdf);

  // Floor Plan PDF download (public — share token acts as auth)
  app.get("/api/floor-plan-pdf/:token", handleFloorPlanPdf);

  // BEO PDF download (requires session auth)
  app.get("/api/beo/:bookingId", (req, res, next) => {
    createContext({ req: req as any, res: res as any, info: {} as any }).then(ctx => {
      (req as any).user = ctx.user;
      handleBeoPdf(req, res);
    }).catch(next);
  });

  // BEO Live Link — public, token-gated. Used as the customer-facing event pack.
  app.get("/api/beo/public/:token", handleBeoPdfPublic);

  // Staff Sheet PDF download (requires session auth)
  app.get("/api/staff-sheet/:runsheetId", (req, res, next) => {
    createContext({ req: req as any, res: res as any, info: {} as any }).then(ctx => {
      (req as any).user = ctx.user;
      handleStaffSheetPdf(req, res);
    }).catch(next);
  });

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
