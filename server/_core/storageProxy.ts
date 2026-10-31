import type { Express } from "express";
import { getLocalMediaPath } from "../storage";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // 1. Check local media storage first
    try {
      const localPath = getLocalMediaPath(key);
      if (localPath) {
        res.sendFile(localPath);
        return;
      }
    } catch (err) {
      console.warn("[StorageProxy] local read error:", err);
    }

    // 2. Fallback to Forge S3 if available
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(404).send("File not found");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        res.status(404).send("File not found on storage");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(404).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
