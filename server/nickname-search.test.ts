import { describe, expect, it, beforeAll } from "vitest";
import { seedTestUsers } from "./mockDb";
import { appRouter } from "./routers";

describe("Nickname and Search Universal Resolution", () => {
  beforeAll(() => {
    seedTestUsers();
  });
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
      user: { id: 1, openId: "local_test_admin", name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    const res = await caller.auth.checkNickname({ nickname: "olirumpai", currentUserId: 1 });
    expect(res.available).toBe(true);
  });

  it("profile.search finds users by nickname (with or without @), email and case-insensitively", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    const byNickname = await caller.profile.search({ query: "olirumfilho" });
    expect(byNickname.some((u: any) => u.email === "filho@gmail.com")).toBe(true);

    const byNicknameWithAt = await caller.profile.search({ query: "@olirumfilho" });
    expect(byNicknameWithAt.some((u: any) => u.email === "filho@gmail.com")).toBe(true);

    const byEmail = await caller.profile.search({ query: "ESPOSA@GMAIL.COM" });
    expect(byEmail.some((u: any) => u.email === "esposa@gmail.com")).toBe(true);

    const byName = await caller.profile.search({ query: "FILHO" });
    expect(byName.some((u: any) => u.email === "filho@gmail.com")).toBe(true);
  });
});
