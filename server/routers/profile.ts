import { and, desc, eq, like, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users } from "../../drizzle/schema";
import { requireDatabase } from "../db";
import { storeMedia } from "../media";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

const profileInput = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(120),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(320),
  status: z.string().trim().max(280).optional(),
});

function isOnline(lastSeen: Date) {
  return Date.now() - lastSeen.getTime() < 70_000;
}

export const profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const result = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const profile = result[0];
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return { ...profile, online: isOnline(profile.lastSeen), isComplete: Boolean(profile.name && profile.email) };
  }),

  update: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    try {
      await db.update(users).set({ ...input, lastSeen: new Date() }).where(eq(users.id, ctx.user.id));
    } catch (error) {
      const message = error instanceof Error && /duplicate|unique/i.test(error.message) ? "Este e-mail já está em uso." : "Não foi possível salvar o perfil.";
      throw new TRPCError({ code: "CONFLICT", message });
    }
    return { success: true };
  }),

  updateAvatar: protectedProcedure
    .input(z.object({ dataUrl: z.string().max(12_000_000), name: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const uploaded = await storeMedia({ userId: ctx.user.id, dataUrl: input.dataUrl, originalName: input.name, kind: "avatar" });
      const db = await requireDatabase();
      await db.update(users).set({ avatarKey: uploaded.key, avatarUrl: uploaded.url, lastSeen: new Date() }).where(eq(users.id, ctx.user.id));
      return uploaded;
    }),

  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDatabase();
    await db.update(users).set({ avatarKey: null, avatarUrl: null }).where(eq(users.id, ctx.user.id));
    return { success: true };
  }),

  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDatabase();
    await db.update(users).set({ lastSeen: new Date() }).where(eq(users.id, ctx.user.id));
    return { success: true };
  }),

  search: protectedProcedure.input(z.object({ query: z.string().trim().min(1).max(120) })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const term = `%${input.query.replace(/[%_\\]/g, "\\$&")}%`;
    const results = await db
      .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, status: users.status, lastSeen: users.lastSeen })
      .from(users)
      .where(and(ne(users.id, ctx.user.id), or(like(users.name, term), like(users.email, term))))
      .orderBy(desc(users.lastSeen))
      .limit(20);
    return results.map(user => ({ ...user, online: isOnline(user.lastSeen) }));
  }),
});
