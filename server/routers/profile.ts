import { and, desc, eq, like, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { blockedUsers, conversationMembers, conversations, hiddenContacts, users } from "../../drizzle/schema";
import { requireDatabase } from "../db";
import { storeMedia } from "../media";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

const profileInput = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(120),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(320),
  status: z.string().trim().max(280).optional(),
  nickname: z.string().trim().optional(),
});

function isOnline(lastSeen?: Date | string | null): boolean {
  if (!lastSeen) return false;
  const time = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time < 70_000;
}

export const profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const result = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const profile = result[0];
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return { ...profile, online: isOnline(profile.lastSeen), isComplete: Boolean((profile.name || profile.nickname) && profile.email) };
  }),

  update: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    let formattedNick: string | undefined = undefined;

    if (input.nickname !== undefined) {
      const clean = input.nickname.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean) {
        formattedNick = `@${clean}`;
        const existing = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(eq(users.nickname as any, formattedNick))
          .limit(1);

        if (existing[0] && existing[0].id !== ctx.user.id) {
          const suggestions = [`${formattedNick}1`, `${formattedNick}2026`, `${formattedNick}_`];
          throw new TRPCError({
            code: "CONFLICT",
            message: `O apelido ${formattedNick} já está em uso! Que tal ${suggestions.join(" ou ")}?`,
          });
        }
      }
    }

    try {
      const updateData: any = {
        name: input.name,
        email: input.email,
        status: input.status,
        lastSeen: new Date(),
      };
      if (formattedNick !== undefined) {
        updateData.nickname = formattedNick;
      }
      await db.update(users).set(updateData).where(eq(users.id, ctx.user.id));
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const message = error instanceof Error && /duplicate|unique/i.test(error.message) ? "Este e-mail ou apelido já está em uso." : "Não foi possível salvar o perfil.";
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

  deleteContact: protectedProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      // Hide contact for this user
      await db.insert(hiddenContacts).values({
        userId: ctx.user.id,
        targetUserId: input.contactId,
      }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });

      // If there is a direct conversation, leave/delete it for this user
      const directKey = [ctx.user.id, input.contactId].sort((a, b) => a - b).join(":");
      const conv = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
      if (conv[0]) {
        await db.delete(conversationMembers).where(
          and(eq(conversationMembers.conversationId, conv[0].id), eq(conversationMembers.userId, ctx.user.id))
        );
      }

      return { success: true };
    }),

  blockContact: protectedProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.insert(blockedUsers).values({
        userId: ctx.user.id,
        blockedUserId: input.contactId,
      }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
      return { success: true };
    }),

  unblockContact: protectedProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.delete(blockedUsers).where(
        and(eq(blockedUsers.userId, ctx.user.id), eq(blockedUsers.blockedUserId, input.contactId))
      );
      return { success: true };
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string().trim().max(120).optional().default("") }))
    .query(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const rawQuery = (input.query || "").trim();
      // Busca por nome, apelido (com ou sem @) ou e-mail, sem diferenciar maiúsculas.
      const cleanTerm = rawQuery.replace(/^@/, "").toLowerCase();
      const term = `%${cleanTerm}%`;
      const whereClause: any = rawQuery
        ? and(
            ne(users.id, ctx.user.id),
            or(
              like(sql`LOWER(${users.name})`, term),
              like(sql`LOWER(${users.email})`, term),
              like(sql`LOWER(${users.nickname})`, term)
            )
          )
        : ne(users.id, ctx.user.id);
      const results = await db
        .select({
          id: users.id,
          name: users.name,
          nickname: users.nickname,
          email: users.email,
          avatarUrl: users.avatarUrl,
          status: users.status,
          lastSeen: users.lastSeen,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.lastSeen))
        .limit(50);

      const hidden = await db
        .select({ targetUserId: hiddenContacts.targetUserId })
        .from(hiddenContacts)
        .where(eq(hiddenContacts.userId, ctx.user.id));
      const hiddenIds = new Set(hidden.map(h => h.targetUserId));

      const blocked = await db
        .select({ blockedUserId: blockedUsers.blockedUserId })
        .from(blockedUsers)
        .where(eq(blockedUsers.userId, ctx.user.id));
      const blockedIds = new Set(blocked.map(b => b.blockedUserId));

      // Hard deduplication by nickname or email
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const user of results) {
        if (hiddenIds.has(user.id)) continue;
        const key = (user.nickname || user.email || String(user.id)).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push({
            ...user,
            online: isOnline(user.lastSeen),
            isBlocked: blockedIds.has(user.id),
          });
        }
      }

      return deduped;
    }),
});
