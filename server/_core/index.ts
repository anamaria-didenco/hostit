import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { handleProposalPdf } from "../proposalPdf";
import { handleBeoPdf } from "../beoPdf";
import { handleStaffSheetPdf } from "../staffSheetPdf";
import { handleFloorPlanPdf } from "../floorPlanPdf";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { storagePut } from "../storage";
import { sdk } from "./sdk";
import { upsertUser } from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { handleGithubWebhook } from "../githubWebhook";

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
  const app = express();
  const server = createServer(app);
  // GitHub webhook — must capture raw body BEFORE json middleware for HMAC verification
  app.post("/api/webhook/github", express.raw({ type: "application/json" }), (req, res) => {
    try { req.body = JSON.parse((req.body as Buffer).toString()); } catch { req.body = {}; }
    handleGithubWebhook(req, res);
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Local password login (for trial/dev use — no external OAuth needed)
  app.post("/api/auth/local-login", async (req, res) => {
    try {
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
      // Skip DB write — create JWT directly so login works even if DB is unavailable
      // The authenticateRequest method handles local- prefixed accounts without DB lookup
      const token = await sdk.createSessionToken(openId, { name: "Admin" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[LocalLogin] Error:", e);
      res.status(500).json({ error: "Login failed." });
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

  // Staff Sheet PDF download (requires session auth)
  app.get("/api/staff-sheet/:runsheetId", (req, res, next) => {
    createContext({ req: req as any, res: res as any, info: {} as any }).then(ctx => {
      (req as any).user = ctx.user;
      handleStaffSheetPdf(req, res);
    }).catch(next);
  });

  // Image upload endpoint (for floor plan backgrounds, venue banners, etc.)
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/upload-image", upload.single("file"), async (req, res) => {
    try {
      const multerReq = req as express.Request & { file?: Express.Multer.File };
      if (!multerReq.file) { res.status(400).json({ error: "No file" }); return; }
      const ext = multerReq.file.originalname.split(".").pop() ?? "jpg";
      const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { url } = await storagePut(key, multerReq.file.buffer, multerReq.file.mimetype);
      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
