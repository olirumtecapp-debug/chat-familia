import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { conversationMembers, conversations, users } from "../../drizzle/schema";
import { requireDatabase } from "../db";
import { publishRealtime } from "../realtime";
import { protectedProcedure, router } from "../_core/trpc";

async function membership(conversationId: number, userId: number) {
  const db = await requireDatabase();
  const result = await db.select({ role: conversationMembers.memberRole }).from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))).limit(1);
  if (!result[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Você não participa deste grupo." });
  return { db, role: result[0].role };
}

export const groupsRouter = router({
  create: protectedProcedure.input(z.object({ title: z.string().trim().min(2).max(160), memberIds: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const uniqueIds = Array.from(new Set([ctx.user.id, ...input.memberIds])).filter(id => id !== ctx.user.id);
    const people = await db.select({ id: users.id }).from(users).where(inArray(users.id, uniqueIds));
    if (people.length !== uniqueIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais pessoas não foram encontradas." });
    const created = await db.insert(conversations).values({ type: "group", title: input.title, groupOwnerId: ctx.user.id });
    const conversationId = Number(created[0].insertId);
    await db.insert(conversationMembers).values([
      { conversationId, userId: ctx.user.id, memberRole: "admin", lastReadAt: new Date() },
      ...uniqueIds.map(userId => ({ conversationId, userId, memberRole: "member" as const })),
    ]);
    publishRealtime([ctx.user.id, ...uniqueIds], { type: "conversation", conversationId });
    return { conversationId };
  }),

  members: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { db } = await membership(input.conversationId, ctx.user.id);
    return db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, status: users.status, role: conversationMembers.memberRole, joinedAt: conversationMembers.joinedAt })
      .from(conversationMembers).innerJoin(users, eq(conversationMembers.userId, users.id)).where(eq(conversationMembers.conversationId, input.conversationId)).orderBy(asc(conversationMembers.joinedAt));
  }),

  addMembers: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), userIds: z.array(z.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const { db, role } = await membership(input.conversationId, ctx.user.id);
    if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem adicionar pessoas." });
    const existing = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, input.conversationId));
    const existingIds = new Set(existing.map(row => row.userId));
    const candidates = Array.from(new Set(input.userIds)).filter(id => !existingIds.has(id));
    if (!candidates.length) return { added: 0 };
    const people = await db.select({ id: users.id }).from(users).where(inArray(users.id, candidates));
    if (people.length !== candidates.length) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais pessoas não foram encontradas." });
    await db.insert(conversationMembers).values(candidates.map(userId => ({ conversationId: input.conversationId, userId, memberRole: "member" as const })));
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
    publishRealtime([ctx.user.id, ...candidates], { type: "conversation", conversationId: input.conversationId });
    return { added: candidates.length };
  }),

  removeMember: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, role } = await membership(input.conversationId, ctx.user.id);
    if (role !== "admin" && input.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem remover membros." });
    const group = await db.select({ type: conversations.type, groupOwnerId: conversations.groupOwnerId }).from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
    if (!group[0] || group[0].type !== "group") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta conversa não é um grupo." });
    if (group[0].groupOwnerId === input.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "O administrador principal não pode sair sem transferir a administração." });
    await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, input.userId)));
    return { success: true };
  }),

  rename: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), title: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    const { db, role } = await membership(input.conversationId, ctx.user.id);
    if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem renomear o grupo." });
    await db.update(conversations).set({ title: input.title, updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
    return { success: true };
  }),
});
