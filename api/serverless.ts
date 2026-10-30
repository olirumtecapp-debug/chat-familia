import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";
import { subscribeRealtime } from "../server/realtime";
import { createContext } from "../server/_core/context";
import { sdk } from "../server/_core/sdk";
import { ENV } from "../server/_core/env";

const app = express();
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
    const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:${user.id}`;
    const credential = crypto.createHmac("sha1", sharedSecret).update(username).digest("base64");
    res.json({
      servers: [
        { urls: process.env.STUN_SERVER || "stun:stun.l.google.com:19302" },
        { urls: `turn:${turnServer}`, username, credential },
      ],
    });
  } catch (error) {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/api/realtime/stream", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    (res as any).flushHeaders?.();

    const unsubscribe = subscribeRealtime(user.id, data => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default app;
