import { describe, expect, it } from "vitest";
import { validateFamilyCode } from "./localAuth";

describe("local family authentication", () => {
  it("accepts the configured family code and rejects a wrong code", () => {
    expect(validateFamilyCode(process.env.CHATFORALL_FAMILY_CODE || "")).toBe(true);
    expect(validateFamilyCode("wrong-family-code")).toBe(false);
  });
});
