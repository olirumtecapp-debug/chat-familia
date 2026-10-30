import { COOKIE_NAME } from "@shared/const";
import { ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import {
  conversations,
  conversationMembers,
  messages,
  messageStatuses,
  messageDeletions,
  calls,
  callSignals,
  typingStates,
  users,
} from "../drizzle/schema";
import { callsRouter } from "./routers/calls";
import { groupsRouter } from "./routers/groups";
import { messagingRouter } from "./routers/messaging";
import { profileRouter } from "./routers/profile";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320),
      familyCode: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const user = await db.upsertLocalUser({ name: input.name, email: input.email });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { user, sessionToken };
    }),
    loginSimple: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320),
      statusMessage: z.string().optional(),
      avatarUrl: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const user = await db.upsertLocalUser({ name: input.name, email: input.email });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { user, token: sessionToken, sessionToken };
    }),
    resetAllData: publicProcedure.mutation(async () => {
      const dbInstance = await db.requireDatabase();
      try { await dbInstance.delete(callSignals); } catch {}
      try { await dbInstance.delete(calls); } catch {}
      try { await dbInstance.delete(typingStates); } catch {}
      try { await dbInstance.delete(messageStatuses); } catch {}
      try { await dbInstance.delete(messageDeletions); } catch {}
      try { await dbInstance.delete(messages); } catch {}
      try { await dbInstance.delete(conversationMembers); } catch {}
      try { await dbInstance.delete(conversations); } catch {}
      try { await dbInstance.delete(users); } catch {}
      return { success: true };
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
