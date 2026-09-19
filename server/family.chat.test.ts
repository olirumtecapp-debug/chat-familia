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
});
