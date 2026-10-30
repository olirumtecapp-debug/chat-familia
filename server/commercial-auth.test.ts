import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/trpc";
import { COOKIE_NAME } from "../shared/const";

function createMockContext() {
  const setCookies: Array<{ name: string; value: string; options: any }> = [];
  const req = {
    protocol: "https",
    headers: { host: "chat.creativeam.com.br" },
    cookies: {},
  } as any;
  const res = {
    cookie: (name: string, value: string, options: any) => {
      setCookies.push({ name, value, options });
    },
    clearCookie: () => {},
  } as any;

  const ctx: TrpcContext = {
    req,
    res,
    user: null,
  };
  return { ctx, setCookies };
}

describe("Commercial Auth End-to-End", () => {
  it("registers Murilo Silva with email and nickname without database errors", async () => {
    const { ctx, setCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.localLogin({
      name: "Murilo Silva",
      email: "olirumtecapp@gmail.com",
      nickname: "@olirumpai",
      password: "secretpassword123",
    });

    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.user.name).toBe("Murilo Silva");
    expect(result.user.email).toBe("olirumtecapp@gmail.com");
    expect(result.sessionToken).toBeDefined();
    expect(setCookies.length).toBeGreaterThan(0);
    expect(setCookies[0].name).toBe(COOKIE_NAME);
  });

  it("allows wife and son to register with invite code", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Wife registers
    const wife = await caller.auth.localLogin({
      name: "Esposa Silva",
      email: "esposa@gmail.com",
      nickname: "@esposasilva",
      password: "wifepassword123",
      inviteBy: "@olirumpai",
    });

    expect(wife.user.name).toBe("Esposa Silva");
    expect(wife.user.email).toBe("esposa@gmail.com");

    // Son registers
    const son = await caller.auth.localLogin({
      name: "Filho Silva",
      email: "filho@gmail.com",
      nickname: "@olirumfilho",
      password: "sonpassword123",
      inviteBy: "@olirumpai",
    });

    expect(son.user.name).toBe("Filho Silva");
    expect(son.user.email).toBe("filho@gmail.com");
  });
});
