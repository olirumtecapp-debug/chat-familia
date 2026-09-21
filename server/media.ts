import { nanoid } from "nanoid";
import { storagePut } from "./storage";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const audioTypes = new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"]);
const documentTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "text/plain", "text/csv"]);

export type MediaKind = "avatar" | "image" | "audio" | "file";

export type UploadedMedia = {
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export function normalizeMimeType(rawMimeType: string) {
  return rawMimeType.toLowerCase().split(";", 1)[0] || rawMimeType;
}

export function parseMediaDataUrl(dataUrl: string) {
  const match = /^data:([^,]+),([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de arquivo inválido.");
  const [, metadata, base64] = match;
  if (!metadata.toLowerCase().split(";").includes("base64")) throw new Error("Formato de arquivo inválido.");
  const rawMimeType = metadata.split(";", 1)[0] || "application/octet-stream";
  return { mimeType: normalizeMimeType(rawMimeType), base64 };
}

function extensionFor(mimeType: string) {
  const mapped: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
  };
  return mapped[mimeType] ?? "bin";
}

/** Validates a browser data URI, constrains payload size, and stores opaque file names. */
export async function storeMedia(input: {
  userId: number;
  dataUrl: string;
  originalName?: string;
  kind: MediaKind;
}): Promise<UploadedMedia> {
  const { mimeType, base64 } = parseMediaDataUrl(input.dataUrl);
  const allowed = input.kind === "audio" ? audioTypes : input.kind === "file" ? documentTypes : imageTypes;
  const maxBytes = input.kind === "audio" ? MAX_AUDIO_BYTES : input.kind === "file" ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
  if (!allowed.has(mimeType)) throw new Error("Tipo de arquivo não permitido.");

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > maxBytes) {
    throw new Error(`O arquivo excede o limite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }

  const prefix = input.kind === "avatar" ? "avatars" : input.kind === "audio" ? "audio" : input.kind === "file" ? "documents" : "images";
  const safeName = `${nanoid(20)}.${extensionFor(mimeType)}`;
  const { key, url } = await storagePut(`chatforall/${prefix}/${input.userId}/${safeName}`, buffer, mimeType);

  return {
    key,
    url,
    fileName: (input.originalName || safeName).replace(/[\\/<>:"|?*\u0000-\u001F]/g, "_").slice(0, 120),
    mimeType,
    fileSize: buffer.length,
  };
}

export const mediaLimits = { MAX_IMAGE_BYTES, MAX_AUDIO_BYTES, MAX_DOCUMENT_BYTES };
