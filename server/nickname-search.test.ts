import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("Nickname and Search Universal Resolution", () => {
  it("checkNickname returns available=true for an unused nickname", async () => {
    const caller = appRouter.createCaller({
      user: null as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    const res = await caller.auth.checkNickname({ nickname: "usuario_novo_2026" });
    expect(res.available).toBe(true);
    expect(res.nickname).toBe("@usuario_novo_2026");
    expect(res.suggestions).toEqual([]);
  });

  it("checkNickname returns available=false and smart suggestions for existing nickname", async () => {
    const caller = appRouter.createCaller({
      user: null as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    // @olirumpai or @olirumfilho is in the store
    const res = await caller.auth.checkNickname({ nickname: "olirumpai" });
    expect(res.available).toBe(false);
    expect(res.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(res.suggestions[0]).toContain("olirumpai");
  });

  it("checkNickname returns available=true if currentUserId owns the nickname", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    const res = await caller.auth.checkNickname({ nickname: "olirumpai", currentUserId: 1 });
    expect(res.available).toBe(true);
  });

  it("profile.search finds user by nickname with or without @", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    // Search without @
    const results1 = await caller.profile.search({ query: "olirumfilho" });
    expect(results1.some((u: any) => u.name === "Filho Silva" || u.email === "filho@gmail.com")).toBe(true);

    // Search with @
    const results2 = await caller.profile.search({ query: "@olirumfilho" });
    expect(results2.some((u: any) => u.name === "Filho Silva" || u.email === "filho@gmail.com")).toBe(true);

    // Search by partial email
    const results3 = await caller.profile.search({ query: "esposa@gmail.com" });
    expect(results3.some((u: any) => u.name === "Esposa Silva")).toBe(true);
  });
});
