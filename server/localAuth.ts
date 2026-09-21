import crypto from "crypto";

export function validateFamilyCode(candidate: string) {
  const configured = (process.env.CHATFORALL_FAMILY_CODE || "").trim();
  const clean = (candidate || "").trim();
  if (!configured || !clean) return false;
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(clean, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
