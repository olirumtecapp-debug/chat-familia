export function resolveMediaUrl(url?: string | null, fileKey?: string | null) {
  return url || (fileKey ? `/manus-storage/${fileKey}` : "");
}
