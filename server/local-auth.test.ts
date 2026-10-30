import { describe, expect, it } from "vitest";
import { validateFamilyCode } from "./localAuth";

describe("local family authentication", () => {
  it("accepts the configured family code and rejects a wrong code", () => {
    process.env.CHATFORALL_FAMILY_CODE = "familia2026";
    expect(validateFamilyCode("familia2026")).toBe(true);
    expect(validateFamilyCode("wrong-family-code")).toBe(false);
  });
});
