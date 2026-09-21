import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { storeMedia } from "./media";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function authenticatedContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 991,
    openId: "isolated-unit-test-subject",
    name: "Unit Test",
    email: "unit-test@invalid.example",
    loginMethod: "test",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ChatForAll API safeguards", () => {
  it("rejects profile reads without an authenticated session", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.profile.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects profile data that does not satisfy the public profile contract", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.profile.update({ name: "A", email: "not-an-email" })).rejects.toBeDefined();
  });

  it("prevents a user from creating a direct conversation with themself", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.messaging.createDirect({ userId: 991 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unsupported media message types before any storage action", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.messaging.send({ conversationId: 1, media: { kind: "video" as never, dataUrl: "data:video/mp4;base64,AAAA" } })).rejects.toBeDefined();
  });

  it("rejects document payloads with an unapproved MIME type", async () => {
    await expect(storeMedia({ userId: 991, kind: "file", dataUrl: "data:application/x-executable;base64,AAAA", originalName: "malware.exe" })).rejects.toThrow("Tipo de arquivo não permitido");
  });

  it("rejects group creation without a real group title", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.groups.create({ title: "A", memberIds: [992] })).rejects.toBeDefined();
  });
});
