import { describe, expect, it } from "vitest";
import { normalizeMimeType, parseMediaDataUrl } from "./media";

describe("media MIME normalization", () => {
  it("accepts codec-qualified browser audio MIME values", () => {
    expect(normalizeMimeType("Audio/WebM;codecs=opus")).toBe("audio/webm");
    expect(normalizeMimeType("audio/ogg; codecs=opus")).toBe("audio/ogg");
  });

  it("parses codec-qualified base64 data URLs", () => {
    expect(parseMediaDataUrl("data:audio/webm;codecs=opus;base64,AAAA")).toEqual({ mimeType: "audio/webm", base64: "AAAA" });
  });
});
