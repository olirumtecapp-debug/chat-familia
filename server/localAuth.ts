import crypto from "crypto";

export function validateFamilyCode(candidate: string) {
  const configured = process.env.CHATFORALL_FAMILY_CODE || "";
  if (!configured || !candidate) return false;
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(candidate, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
