import fs from "fs";
import path from "path";
import { ENV } from "./_core/env";

const IS_VERCEL = !!process.env.VERCEL;
const MEDIA_DIR = IS_VERCEL ? "/tmp/media" : path.resolve(process.cwd(), "server", "data", "media");

export function saveLocalMedia(key: string, buffer: Buffer): void {
  const filePath = path.join(MEDIA_DIR, key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

export function getLocalMediaPath(key: string): string | null {
  const filePath = path.join(MEDIA_DIR, key);
  if (fs.existsSync(filePath)) return filePath;
  return null;
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);

  // Always save locally first as reliable cache/storage
  try {
    saveLocalMedia(key, buffer);
  } catch (err) {
    console.warn("[storage] Failed to save local media:", err);
  }

  // If Forge is configured, also attempt uploading to S3
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    try {
      const { forgeUrl, forgeKey } = getForgeConfig();
      const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
      presignUrl.searchParams.set("path", key);

      const presignResp = await fetch(presignUrl, {
        headers: { Authorization: `Bearer ${forgeKey}` },
      });

      if (presignResp.ok) {
        const { url: s3Url } = (await presignResp.json()) as { url: string };
        if (s3Url) {
          const blob = new Blob([buffer], { type: contentType });
          await fetch(s3Url, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: blob,
          });
        }
      } else {
        console.warn("[storage] Forge presign skipped:", presignResp.status);
      }
    } catch (err) {
      console.warn("[storage] Remote upload skipped, using local media:", err);
    }
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
