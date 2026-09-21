import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { conversationMembers, conversations, messageDeletions, messages, messageStatuses, typingStates, users } from "../../drizzle/schema";
import { requireDatabase } from "../db";
import { storeMedia } from "../media";
import { publishRealtime } from "../realtime";
import { protectedProcedure, router } from "../_core/trpc";

const pageInput = z.object({ conversationId: z.number().int().positive(), cursor: z.coerce.date().optional() });
const mediaInput = z.object({
  kind: z.enum(["image", "audio", "file"]),
  dataUrl: z.string().max(18_000_000),
  name: z.string().max(120).optional(),
  duration: z.number().int().min(0).max(60 * 60).optional(),
});

async function assertMember(conversationId: number, userId: number) {
  const db = await requireDatabase();
  const result = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!result[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta conversa." });
  return db;
}

async function recipientIds(conversationId: number, userId: number) {
  const db = await requireDatabase();
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, userId)))
  if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A conversa precisa ter outro participante." });
  return rows.map(row => row.userId);
}

function online(lastSeen: Date) {
  return Date.now() - lastSeen.getTime() < 70_000;
}

export const messagingRouter = router({
  createDirect: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha outra pessoa para conversar." });
    const db = await requireDatabase();
    const other = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!other[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa não encontrada." });

    const directKey = [ctx.user.id, input.userId].sort((a, b) => a - b).join(":");

    // Upsert atômico — evita falha no TiDB serverless com conexões instáveis
    await db.insert(conversations)
      .values({ type: "direct", directKey })
      .onDuplicateKeyUpdate({ set: { type: "direct" } });

    const conv = await db.select({ id: conversations.id })
      .from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
    if (!conv[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar conversa." });
    const conversationId = conv[0].id;

    await db.insert(conversationMembers)
      .values([
        { conversationId, userId: ctx.user.id, lastReadAt: new Date() },
        { conversationId, userId: input.userId },
      ])
      .onDuplicateKeyUpdate({ set: { joinedAt: conversationMembers.joinedAt } });

    return { conversationId, created: true };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const memberships = await db
      .select({ id: conversations.id, type: conversations.type, title: conversations.title, updatedAt: conversations.updatedAt, lastReadAt: conversationMembers.lastReadAt })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
      .where(eq(conversationMembers.userId, ctx.user.id))
      .orderBy(desc(conversations.updatedAt));

    return Promise.all(memberships.map(async conversation => {
      const partner = await db
        .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, status: users.status, lastSeen: users.lastSeen })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(and(eq(conversationMembers.conversationId, conversation.id), ne(users.id, ctx.user.id)))
        .limit(1);
      const latest = await db
        .select({ id: messages.id, content: messages.content, messageType: messages.messageType, createdAt: messages.createdAt, senderId: messages.senderId, deletedAt: messages.deletedAt })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const unread = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(
          eq(messages.conversationId, conversation.id),
          ne(messages.senderId, ctx.user.id),
          isNull(messages.deletedAt),
          conversation.lastReadAt ? gt(messages.createdAt, conversation.lastReadAt) : sql`1 = 1`,
        ));
      const person = partner[0];
      return {
        ...conversation,
        participant: person ? { ...person, online: online(person.lastSeen) } : null,
        latestMessage: latest[0] ?? null,
        unreadCount: Number(unread[0]?.count ?? 0),
      };
    }));
  }),

  history: protectedProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const recipients = await recipientIds(input.conversationId, ctx.user.id);
    const partnerId = recipients[0];
    const entries = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        messageType: messages.messageType,
        content: messages.content,
        fileKey: messages.fileKey,
        fileUrl: messages.fileUrl,
        fileName: messages.fileName,
        fileSize: messages.fileSize,
        mimeType: messages.mimeType,
        duration: messages.duration,
        replyToId: messages.replyToId,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
        senderName: users.name,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .leftJoin(messageDeletions, and(eq(messageDeletions.messageId, messages.id), eq(messageDeletions.userId, ctx.user.id)))
      .where(and(
        eq(messages.conversationId, input.conversationId),
        isNull(messageDeletions.messageId),
        input.cursor ? lt(messages.createdAt, input.cursor) : sql`1 = 1`,
      ))
      .orderBy(desc(messages.createdAt))
      .limit(40);
    const ids = entries.map(message => message.id);
    const statuses = ids.length
      ? await db.select({ messageId: messageStatuses.messageId, status: messageStatuses.status }).from(messageStatuses).where(and(inArray(messageStatuses.messageId, ids), eq(messageStatuses.userId, partnerId)))
      : [];
    const statusByMessage = new Map(statuses.map(item => [item.messageId, item.status]));
    return {
      messages: entries.reverse().map(message => ({ ...message, receiptStatus: statusByMessage.get(message.id) ?? "sent" })),
      nextCursor: entries.length === 40 ? entries[entries.length - 1]?.createdAt : null,
    };
  }),

  send: protectedProcedure.input(z.object({
    conversationId: z.number().int().positive(),
    content: z.string().max(5000).optional(),
    replyToId: z.number().int().positive().optional(),
    media: mediaInput.optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const text = input.content?.trim() || null;
    if (!text && !input.media) throw new TRPCError({ code: "BAD_REQUEST", message: "Escreva uma mensagem ou adicione uma mídia." });
    const recipients = await recipientIds(input.conversationId, ctx.user.id);
    if (input.replyToId) {
      const reply = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, input.replyToId), eq(messages.conversationId, input.conversationId))).limit(1);
      if (!reply[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "A mensagem respondida não pertence a esta conversa." });
    }

    const uploaded = input.media
      ? await storeMedia({ userId: ctx.user.id, dataUrl: input.media.dataUrl, originalName: input.media.name, kind: input.media.kind })
      : null;
    const inserted = await db.insert(messages).values({
      conversationId: input.conversationId,
      senderId: ctx.user.id,
      messageType: input.media?.kind === "image" ? "image" : input.media?.kind === "audio" ? "audio" : input.media?.kind === "file" ? "file" : "text",
      content: text,
      fileKey: uploaded?.key,
      fileUrl: uploaded?.url,
      fileName: uploaded?.fileName,
      fileSize: uploaded?.fileSize,
      mimeType: uploaded?.mimeType,
      duration: input.media?.duration,
      replyToId: input.replyToId,
    });
    const messageId = Number(inserted[0].insertId);
    await db.insert(messageStatuses).values(recipients.map(userId => ({ messageId, userId, status: "sent" as const })));
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
    publishRealtime([ctx.user.id, ...recipients], { type: "message", conversationId: input.conversationId });
    return { messageId, createdAt: new Date() };
  }),

  acknowledge: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), read: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const incoming = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, input.conversationId), ne(messages.senderId, ctx.user.id), isNull(messages.deletedAt)));
    if (incoming.length) {
      await db.update(messageStatuses)
        .set({ status: input.read ? "read" : "delivered", timestamp: new Date() })
        .where(and(inArray(messageStatuses.messageId, incoming.map(item => item.id)), eq(messageStatuses.userId, ctx.user.id)));
    }
    if (input.read) await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, ctx.user.id)));
    return { success: true };
  }),

  setTyping: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    if (!input.active) {
      await db.delete(typingStates).where(and(eq(typingStates.conversationId, input.conversationId), eq(typingStates.userId, ctx.user.id)));
      return { active: false };
    }
    const expiresAt = new Date(Date.now() + 5_000);
    await db.insert(typingStates).values({ conversationId: input.conversationId, userId: ctx.user.id, expiresAt }).onDuplicateKeyUpdate({ set: { expiresAt, updatedAt: new Date() } });
    return { active: true, expiresAt };
  }),

  typing: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    return db.select({ userId: users.id, name: users.name, expiresAt: typingStates.expiresAt })
      .from(typingStates)
      .innerJoin(users, eq(typingStates.userId, users.id))
      .where(and(eq(typingStates.conversationId, input.conversationId), ne(typingStates.userId, ctx.user.id), gt(typingStates.expiresAt, new Date())));
  }),

  deleteForMe: protectedProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const message = await db.select({ conversationId: messages.conversationId }).from(messages).where(eq(messages.id, input.messageId)).limit(1);
    if (!message[0]) throw new TRPCError({ code: "NOT_FOUND" });
    await assertMember(message[0].conversationId, ctx.user.id);
    await db.insert(messageDeletions).values({ messageId: input.messageId, userId: ctx.user.id }).onDuplicateKeyUpdate({ set: { deletedAt: new Date() } });
    return { success: true };
  }),

  deleteForEveryone: protectedProcedure.input(z.object({ messageId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const message = await db.select({ senderId: messages.senderId, createdAt: messages.createdAt }).from(messages).where(eq(messages.id, input.messageId)).limit(1);
    if (!message[0]) throw new TRPCError({ code: "NOT_FOUND" });
    if (message[0].senderId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas quem enviou pode apagar para todos." });
    if (Date.now() - message[0].createdAt.getTime() > 24 * 60 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "O prazo para apagar para todos expirou." });
    await db.update(messages).set({ content: null, fileKey: null, fileUrl: null, fileName: null, fileSize: null, mimeType: null, duration: null, deletedAt: new Date() }).where(eq(messages.id, input.messageId));
    return { success: true };
  }),
});
