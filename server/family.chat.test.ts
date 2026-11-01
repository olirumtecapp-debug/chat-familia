import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(user: any = null): { ctx: TrpcContext; cookiesSet: any[] } {
  const cookiesSet: any[] = [];
  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as any,
    res: {
      cookie: (name: string, val: string, opts: any) => {
        cookiesSet.push({ name, val, opts });
      },
      clearCookie: () => {},
    } as any,
  };
  return { ctx, cookiesSet };
}

describe("auth.loginSimple and session creation", () => {
  it("authenticates a simple family member with email and name", async () => {
    const { ctx, cookiesSet } = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.loginSimple({
      name: "Tio Carlos",
      email: "carlos.familia@teste.com",
      statusMessage: "Bora para o churrasco!",
    });

    expect(result.user).toBeDefined();
    expect(result.user.name).toBe("Tio Carlos");
    expect(result.user.email).toBe("carlos.familia@teste.com");
    expect(result.token).toBeDefined();
    expect(cookiesSet.length).toBeGreaterThan(0);
  });

  it("reuses the same account when email casing changes", async () => {
    const { ctx: firstContext } = createMockContext(null);
    const first = await appRouter.createCaller(firstContext).auth.loginSimple({
      name: "Pessoa da Família",
      email: "Pessoa@Familia.Test",
    });

    const { ctx: secondContext } = createMockContext(null);
    const second = await appRouter.createCaller(secondContext).auth.loginSimple({
      name: "Pessoa da Família",
      email: "pessoa@familia.test",
    });

    expect(second.user.id).toBe(first.user.id);
    expect(second.user.openId).toBe(first.user.openId);
  });
});
