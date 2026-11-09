import { eq } from "drizzle-orm";
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
    checkNickname: publicProcedure
      .input(z.object({ nickname: z.string().trim(), currentUserId: z.number().optional() }))
      .mutation(async ({ input }) => {
        const clean = input.nickname.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!clean || clean.length < 2) {
          return { available: false, message: "O apelido deve ter pelo menos 2 caracteres.", suggestions: [] };
        }
        const withAt = `@${clean}`;
        const dbInstance = await db.requireDatabase();
        const existing = await dbInstance
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.nickname as any, withAt))
          .limit(1);

        if (existing && existing.length > 0) {
          if (input.currentUserId && existing[0].id === input.currentUserId) {
            return {
              available: true,
              nickname: withAt,
              message: `Este já é o seu apelido atual.`,
              suggestions: [],
            };
          }
          const suggestions = [
            `@${clean}1`,
            `@${clean}2026`,
            `@${clean}_`,
            `@${clean}_real`,
          ];
          return {
            available: false,
            message: `O apelido ${withAt} já está em uso.`,
            suggestions,
          };
        }

        return {
          available: true,
          nickname: withAt,
          message: `Apelido ${withAt} disponível!`,
          suggestions: [],
        };
      }),
    localLogin: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320),
      familyCode: z.string().optional(),
      password: z.string().optional(),
      nickname: z.string().optional(),
      inviteBy: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      let formattedNick: string | undefined = undefined;

      if (input.nickname) {
        const clean = input.nickname.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (clean) {
          formattedNick = `@${clean}`;
          const dbInstance = await db.requireDatabase();
          const existing = await dbInstance
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(eq(users.nickname as any, formattedNick))
            .limit(1);

          if (existing[0] && existing[0].email?.toLowerCase() !== email) {
            const suggestions = [`${formattedNick}1`, `${formattedNick}2026`, `${formattedNick}_`];
            throw new TRPCError({
              code: "CONFLICT",
              message: `O apelido ${formattedNick} já está em uso! Que tal ${suggestions.join(" ou ")}?`,
            });
          }
        }
      }

      const user = await db.upsertLocalUser({ name: input.name, email, nickname: formattedNick });
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
