import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { subscribeRealtime } from "../realtime";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/calls/ice", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const sharedSecret = process.env.TURN_SHARED_SECRET;
      const turnServer = process.env.TURN_SERVER;
      if (!sharedSecret || !turnServer) {
        res.json({ servers: [{ urls: process.env.STUN_SERVER || "stun:stun.l.google.com:19302" }] });
        return;
      }
      const ttl = Math.min(Math.max(Number(process.env.TURN_CREDENTIAL_TTL || 3600), 300), 86_400);
      const expires = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expires}:${user.id}`;
      const credential = crypto.createHmac("sha1", sharedSecret).update(username).digest("base64");
      res.json({ servers: [
        { urls: process.env.STUN_SERVER || "stun:stun.l.google.com:19302" },
        { urls: turnServer, username, credential },
      ], expiresAt: expires * 1000 });
    } catch {
      res.status(401).json({ error: "unauthorized" });
    }
  });
  app.get("/api/realtime", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: "connected", at: Date.now() })}\n\n`);
      const unsubscribe = subscribeRealtime(user.id, event => res.write(`data: ${JSON.stringify(event)}\n\n`));
      const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15_000);
      req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
    } catch {
      res.status(401).json({ error: "unauthorized" });
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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
