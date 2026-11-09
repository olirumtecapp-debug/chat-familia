import { eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(crypto.scrypt);
const authAttempts = new Map<string, { count: number; until: number }>();
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
      mode: z.enum(["signup", "login"]),
      name: z.string().trim().max(120).optional(),
      email: z.string().trim().email().max(320),
      password: z.string().min(10).max(128),
      nickname: z.string().optional(),
      inviteBy: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const key = crypto.createHash("sha256").update(email + ":" + (ctx.req.ip || "")).digest("hex");
      const attempt = authAttempts.get(key);
      if (attempt && attempt.count >= 8 && attempt.until > Date.now()) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde 15 minutos." });
      }
      const database = await db.requireDatabase();
      if (!process.env.DATABASE_URL) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cadastro indisponível: banco persistente não configurado." });
      try {
        await database.execute(sql.raw("CREATE TABLE IF NOT EXISTS auth_credentials (email varchar(320) NOT NULL PRIMARY KEY, password_hash varchar(255) NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP)"));
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Serviço de autenticação indisponível." });
      }
      const records: any = await database.execute(sql`SELECT password_hash FROM auth_credentials WHERE email = ${email} LIMIT 1`);
      const rows: any[] = Array.isArray(records?.[0]) ? records[0] : (Array.isArray(records) ? records : []);
      const existingHash = rows[0]?.password_hash as string | undefined;
      const deny = () => {
        const old = authAttempts.get(key);
        authAttempts.set(key, { count: (old && old.until > Date.now() ? old.count : 0) + 1, until: Date.now() + 15 * 60_000 });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
      };
      if (input.mode === "signup") {
        if (!input.name?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe seu nome." });
        if (existingHash || await db.getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já possui cadastro. Procure o suporte para recuperar uma conta antiga." });
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await scrypt(input.password, salt, 64) as Buffer).toString("hex");
        const user = await db.upsertLocalUser({ name: input.name, email, nickname: input.nickname });
        await database.execute(sql`INSERT INTO auth_credentials (email, password_hash) VALUES (${email}, ${"scrypt:" + salt + ":" + hash})`);
        authAttempts.delete(key);
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: 24 * 60 * 60 * 1000 });
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: 24 * 60 * 60 * 1000 });
        return { user };
      }
      if (!existingHash) return deny();
      const parts = existingHash.split(":");
      if (parts.length !== 3 || parts[0] !== "scrypt") return deny();
      const hash = await scrypt(input.password, parts[1], 64) as Buffer;
      const expected = Buffer.from(parts[2], "hex");
      if (expected.length !== hash.length || !crypto.timingSafeEqual(hash, expected)) return deny();
      const user = await db.getUserByEmail(email);
      if (!user) return deny();
      authAttempts.delete(key);
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "Usuário", expiresInMs: 24 * 60 * 60 * 1000 });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: 24 * 60 * 60 * 1000 });
      return { user };
    }),
    loginSimple: publicProcedure.mutation(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: "Login antigo desativado. Utilize e-mail e senha." });
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
