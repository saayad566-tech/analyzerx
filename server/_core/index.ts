import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { existsSync } from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getNewsTrackerStatus, pollNewsNow, startNewsTracker } from "../news-tracker";
import { getNseSchedulerStatus, pollNseSourcesNow, startNseScheduler } from "../nse-scheduler";
import { getSecSchedulerStatus, pollSecSourcesNow, startSecScheduler } from "../sec-scheduler";
import { isDatabaseQueryable } from "../db";
import { isScheduledCallbackAuthorized } from "./scheduled-auth";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
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

  // Restrict browser access to configured first-party origins. Never reflect arbitrary origins with credentials.
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "http://localhost:8081,http://localhost:3000")
      .split(",")
      .map((origin: string) => origin.trim())
      .filter(Boolean),
  );
  const isTrustedOrigin = (origin: string | undefined) => Boolean(origin && (allowedOrigins.has(origin) || /^https:\/\/([a-z0-9-]+\.)*manus\.(computer|space)$/.test(origin)));
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isTrustedOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Requested-With");
    res.header("Referrer-Policy", "strict-origin-when-cross-origin");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("X-Frame-Options", "DENY");
    res.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.method === "OPTIONS") {
      if (origin && !isTrustedOrigin(origin)) {
        res.sendStatus(403);
        return;
      }
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", async (_req, res) => {
    const databaseAvailable = await isDatabaseQueryable();
    res.json({ ok: true, timestamp: Date.now(), databaseAvailable, newsTracker: getNewsTrackerStatus(), nseCollectors: getNseSchedulerStatus(), secEdgar: getSecSchedulerStatus() });
  });

  app.post("/api/scheduled/nse-collectors", async (req, res) => {
    const expectedToken = process.env.NSE_COLLECTOR_CALLBACK_TOKEN ?? process.env.NEWS_TRACKER_CALLBACK_TOKEN;
    if (!isScheduledCallbackAuthorized(expectedToken, typeof req.headers["x-nse-collector-token"] === "string" ? req.headers["x-nse-collector-token"] : undefined, process.env.NODE_ENV === "production")) {
      res.status(expectedToken ? 401 : 503).json({ ok: false, error: expectedToken ? "Unauthorized NSE collector callback" : "NSE collector callback token is not configured" });
      return;
    }
    const result = await pollNseSourcesNow();
    res.json({ ok: true, result, status: getNseSchedulerStatus() });
  });

  app.post("/api/scheduled/sec-edgar", async (req, res) => {
    const expectedToken = process.env.SEC_EDGAR_CALLBACK_TOKEN ?? process.env.NEWS_TRACKER_CALLBACK_TOKEN;
    if (!isScheduledCallbackAuthorized(expectedToken, typeof req.headers["x-sec-edgar-token"] === "string" ? req.headers["x-sec-edgar-token"] : undefined, process.env.NODE_ENV === "production")) {
      res.status(expectedToken ? 401 : 503).json({ ok: false, error: expectedToken ? "Unauthorized SEC EDGAR callback" : "SEC EDGAR callback token is not configured" });
      return;
    }
    const result = await pollSecSourcesNow();
    res.json({ ok: true, result, status: getSecSchedulerStatus() });
  });

  app.post("/api/scheduled/news-tracker", async (req, res) => {
    const expectedToken = process.env.NEWS_TRACKER_CALLBACK_TOKEN;
    if (!isScheduledCallbackAuthorized(expectedToken, typeof req.headers["x-news-tracker-token"] === "string" ? req.headers["x-news-tracker-token"] : undefined, process.env.NODE_ENV === "production")) {
      res.status(expectedToken ? 401 : 503).json({ ok: false, error: expectedToken ? "Unauthorized scheduled callback" : "News tracker callback token is not configured" });
      return;
    }
    const result = await pollNewsNow();
    res.json({ ok: !("error" in result), result, status: getNewsTrackerStatus() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Production deployments serve the Expo web export from the same origin as the API.
  // Keep this after API routes so `/api/*` never falls through to the SPA shell.
  const webDist = path.resolve(process.cwd(), "web-dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: "index.html" }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
    startNewsTracker();
    startNseScheduler();
    startSecScheduler();
  });
}

startServer().catch(console.error);
