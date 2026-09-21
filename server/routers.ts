import { COOKIE_NAME } from "@shared/const";
import { ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { validateFamilyCode } from "./localAuth";
import { callsRouter } from "./routers/calls";
import { groupsRouter } from "./routers/groups";
import { messagingRouter } from "./routers/messaging";
import { profileRouter } from "./routers/profile";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(320), familyCode: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      if (!validateFamilyCode(input.familyCode)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Código privado da família inválido." });
      const user = await db.upsertLocalUser({ name: input.name, email: input.email });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profile: profileRouter,
  groups: groupsRouter,
  messaging: messagingRouter,
  calls: callsRouter,
});

export type AppRouter = typeof appRouter;
