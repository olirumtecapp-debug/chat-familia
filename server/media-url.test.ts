import { describe, expect, it } from "vitest";
import { resolveMediaUrl } from "../shared/media";

describe("stored media URLs", () => {
  it("falls back to the persisted storage key when URL is missing", () => {
    expect(resolveMediaUrl(null, "chatforall/images/1/photo.png")).toBe("/manus-storage/chatforall/images/1/photo.png");
    expect(resolveMediaUrl("/manus-storage/direct.png", "ignored")).toBe("/manus-storage/direct.png");
  });
});
