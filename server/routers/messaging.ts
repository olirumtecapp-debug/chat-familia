import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { blockedUsers, conversationMembers, conversations, hiddenContacts, messageDeletions, messageReactions, messages, messageStatuses, mutedConversations, typingStates, users } from "../../drizzle/schema";
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
  if (!result[0]) {
    // If this is a direct conversation belonging to this user, automatically restore membership!
    const conv = await db
      .select({ id: conversations.id, type: conversations.type, directKey: conversations.directKey })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (conv[0] && conv[0].type === "direct" && conv[0].directKey) {
      const allowedIds = conv[0].directKey.split(":").map(Number);
      if (allowedIds.includes(userId)) {
        try {
          await db.insert(conversationMembers).values({
            conversationId,
            userId,
            lastReadAt: new Date(),
          });
        } catch (_) {}
        return db;
      }
    }
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta conversa." });
  }
  return db;
}

async function recipientIds(conversationId: number, userId: number) {
  const db = await requireDatabase();
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, userId)));
  if (!rows.length) {
    const conv = await db
      .select({ type: conversations.type, directKey: conversations.directKey })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (conv[0] && conv[0].type === "direct" && conv[0].directKey) {
      const ids = conv[0].directKey.split(":").map(Number);
      const otherId = ids.find(id => id !== userId);
      if (otherId) {
        try {
          await db.insert(conversationMembers).values({
            conversationId,
            userId: otherId,
          });
        } catch (_) {}
        return [otherId];
      }
      // Self-conversation: recipient is self
      return [userId];
    }
    return [userId];
  }
  return rows.map(row => row.userId);
}

function online(lastSeen?: Date | string | null): boolean {
  if (!lastSeen) return false;
  const time = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time < 70_000;
}

export const messagingRouter = router({
  createDirect: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Para suas próprias anotações, use a conversa 'Anotações Pessoais'." });
    }
    const db = await requireDatabase();
    const other = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!other[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa não encontrada." });

    const directKey = [ctx.user.id, input.userId].sort((a, b) => a - b).join(":");

    const existing = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
    if (existing[0]) {
      const convId = existing[0].id;
      // Ensure user is member (in case one previously deleted/left the conversation)
      const members = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, convId));
      const memberIds = new Set(members.map(m => m.userId));
      const missing: Array<{ conversationId: number; userId: number; lastReadAt?: Date }> = [];
      if (!memberIds.has(ctx.user.id)) {
        missing.push({ conversationId: convId, userId: ctx.user.id, lastReadAt: new Date() });
      }
      if (!memberIds.has(input.userId)) {
        missing.push({ conversationId: convId, userId: input.userId });
      }
      if (missing.length > 0) {
        try {
          await db.insert(conversationMembers).values(missing);
        } catch (_) {}
      }
      // Also unhide if user had hidden this contact
      try {
        await db.delete(hiddenContacts).where(
          and(eq(hiddenContacts.userId, ctx.user.id), eq(hiddenContacts.targetUserId, input.userId))
        );
      } catch (_) {}
      return { conversationId: convId, created: false };
    }

    try {
      const created = await db.insert(conversations).values({
        type: "direct",
        directKey,
      });
      const conversationId = Number(created[0].insertId);
      await db.insert(conversationMembers).values([
        { conversationId, userId: ctx.user.id, lastReadAt: new Date() },
        { conversationId, userId: input.userId },
      ]);
      return { conversationId, created: true };
    } catch (error) {
      const concurrent = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
      if (concurrent[0]) return { conversationId: concurrent[0].id, created: false };
      throw error;
    }
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
        .select({ id: users.id, name: users.name, nickname: users.nickname, email: users.email, avatarUrl: users.avatarUrl, status: users.status, lastSeen: users.lastSeen })
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
      let person = partner[0];
      if (!person && conversation.type === "direct") {
        const selfUser = await db
          .select({ id: users.id, name: users.name, nickname: users.nickname, email: users.email, avatarUrl: users.avatarUrl, status: users.status, lastSeen: users.lastSeen })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        if (selfUser[0]) {
          person = {
            ...selfUser[0],
            name: "Você (Anotações Pessoais)",
          };
        }
      }

      const muteRecord = await db
        .select({ mutedUntil: mutedConversations.mutedUntil })
        .from(mutedConversations)
        .where(and(eq(mutedConversations.userId, ctx.user.id), eq(mutedConversations.conversationId, conversation.id)))
        .limit(1);
      const isMuted = Boolean(muteRecord[0] && (!muteRecord[0].mutedUntil || muteRecord[0].mutedUntil > new Date()));

      const blockRecord = person ? await db
        .select({ blockedUserId: blockedUsers.blockedUserId })
        .from(blockedUsers)
        .where(and(eq(blockedUsers.userId, ctx.user.id), eq(blockedUsers.blockedUserId, person.id)))
        .limit(1) : [];
      const isBlocked = Boolean(blockRecord[0]);

      return {
        ...conversation,
        participant: person ? {
          ...person,
          name: person.name || person.nickname || (person.email ? person.email.split('@')[0] : 'Contato'),
          online: online(person.lastSeen)
        } : null,
        latestMessage: latest[0] ?? null,
        unreadCount: Number(unread[0]?.count ?? 0),
        isMuted,
        isBlocked,
      };
    }));
  }),

  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await assertMember(input.conversationId, ctx.user.id);
      await db.delete(conversationMembers).where(
        and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, ctx.user.id))
      );
      const remaining = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, input.conversationId));
      if (!remaining.length) {
        await db.delete(conversations).where(eq(conversations.id, input.conversationId));
      }
      return { success: true };
    }),

  muteConversation: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive(), durationHours: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await assertMember(input.conversationId, ctx.user.id);
      const mutedUntil = input.durationHours ? new Date(Date.now() + input.durationHours * 3600 * 1000) : null;
      await db.insert(mutedConversations).values({
        userId: ctx.user.id,
        conversationId: input.conversationId,
        mutedUntil,
      }).onDuplicateKeyUpdate({ set: { mutedUntil } });
      return { success: true };
    }),

  unmuteConversation: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await assertMember(input.conversationId, ctx.user.id);
      await db.delete(mutedConversations).where(
        and(eq(mutedConversations.conversationId, input.conversationId), eq(mutedConversations.userId, ctx.user.id))
      );
      return { success: true };
    }),

  blockContact: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.insert(blockedUsers).values({
        userId: ctx.user.id,
        blockedUserId: input.userId,
      }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
      return { success: true };
    }),

  unblockContact: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.delete(blockedUsers).where(
        and(eq(blockedUsers.userId, ctx.user.id), eq(blockedUsers.blockedUserId, input.userId))
      );
      return { success: true };
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

    const rawReactions = ids.length
      ? await db
          .select({
            id: messageReactions.id,
            messageId: messageReactions.messageId,
            userId: messageReactions.userId,
            emoji: messageReactions.emoji,
          })
          .from(messageReactions)
          .where(inArray(messageReactions.messageId, ids))
      : [];

    const reactionsByMessage = new Map<number, Array<{ emoji: string; count: number; users: number[]; hasReacted: boolean }>>();
    for (const r of rawReactions) {
      let list = reactionsByMessage.get(r.messageId);
      if (!list) {
        list = [];
        reactionsByMessage.set(r.messageId, list);
      }
      let item = list.find(x => x.emoji === r.emoji);
      if (!item) {
        item = { emoji: r.emoji, count: 0, users: [], hasReacted: false };
        list.push(item);
      }
      item.count++;
      item.users.push(r.userId);
      if (r.userId === ctx.user.id) {
        item.hasReacted = true;
      }
    }

    return {
      messages: entries.reverse().map(message => ({
        ...message,
        receiptStatus: statusByMessage.get(message.id) ?? "sent",
        reactions: reactionsByMessage.get(message.id) ?? [],
      })),
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
    try {
      await db.insert(messageStatuses).values(recipients.map(userId => ({ messageId, userId, status: "sent" as const })));
    } catch (_) {}
    try {
      await db.delete(typingStates).where(and(eq(typingStates.conversationId, input.conversationId), eq(typingStates.userId, ctx.user.id)));
    } catch (_) {}
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
      return { success: true };
    }
    await db.insert(typingStates).values({
      conversationId: input.conversationId,
      userId: ctx.user.id,
      updatedAt: new Date(),
    }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
    return { success: true };
  }),

  typing: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const rows = await db
      .select({ userId: typingStates.userId, name: users.name, updatedAt: typingStates.updatedAt })
      .from(typingStates)
      .innerJoin(users, eq(typingStates.userId, users.id))
      .where(and(
        eq(typingStates.conversationId, input.conversationId),
        ne(typingStates.userId, ctx.user.id),
        gt(typingStates.updatedAt, new Date(Date.now() - 5000)),
      ));
    return rows.map(item => ({ userId: item.userId, name: item.name || "Alguém" }));
  }),

  deleteForMe: protectedProcedure.input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const target = await db.select({ conversationId: messages.conversationId }).from(messages).where(eq(messages.id, input.messageId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada." });
      await assertMember(target[0].conversationId, ctx.user.id);
      await db.insert(messageDeletions).values({ messageId: input.messageId, userId: ctx.user.id });
      return { success: true };
    }),

  deleteForEveryone: protectedProcedure.input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const target = await db.select({ conversationId: messages.conversationId, senderId: messages.senderId }).from(messages).where(eq(messages.id, input.messageId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada." });
      if (target[0].senderId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode apagar mensagens enviadas por você." });
      await assertMember(target[0].conversationId, ctx.user.id);
      await db.update(messages).set({ deletedAt: new Date(), content: null, fileKey: null, fileUrl: null }).where(eq(messages.id, input.messageId));
      publishRealtime([ctx.user.id], { type: "message", conversationId: target[0].conversationId });
      return { success: true };
    }),

  react: protectedProcedure
    .input(
      z.object({
        messageId: z.number().int().positive(),
        emoji: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const msg = await db
        .select({ id: messages.id, conversationId: messages.conversationId })
        .from(messages)
        .where(eq(messages.id, input.messageId))
        .limit(1);
      if (!msg[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada." });
      await assertMember(msg[0].conversationId, ctx.user.id);

      const existing = await db
        .select()
        .from(messageReactions)
        .where(and(eq(messageReactions.messageId, input.messageId), eq(messageReactions.userId, ctx.user.id)))
        .limit(1);

      if (existing[0]) {
        if (existing[0].emoji === input.emoji) {
          await db
            .delete(messageReactions)
            .where(and(eq(messageReactions.messageId, input.messageId), eq(messageReactions.userId, ctx.user.id)));
        } else {
          await db
            .update(messageReactions)
            .set({ emoji: input.emoji, createdAt: new Date() })
            .where(and(eq(messageReactions.messageId, input.messageId), eq(messageReactions.userId, ctx.user.id)));
        }
      } else {
        await db.insert(messageReactions).values({
          messageId: input.messageId,
          userId: ctx.user.id,
          emoji: input.emoji,
          createdAt: new Date(),
        });
      }

      const allForMsg = await db
        .select({
          id: messageReactions.id,
          messageId: messageReactions.messageId,
          userId: messageReactions.userId,
          emoji: messageReactions.emoji,
        })
        .from(messageReactions)
        .where(eq(messageReactions.messageId, input.messageId));

      const grouped: Array<{ emoji: string; count: number; users: number[]; hasReacted: boolean }> = [];
      for (const r of allForMsg) {
        let item = grouped.find(x => x.emoji === r.emoji);
        if (!item) {
          item = { emoji: r.emoji, count: 0, users: [], hasReacted: false };
          grouped.push(item);
        }
        item.count++;
        item.users.push(r.userId);
        if (r.userId === ctx.user.id) {
          item.hasReacted = true;
        }
      }

      const targets = await recipientIds(msg[0].conversationId, ctx.user.id).catch(() => []);
      if (targets.length > 0) {
        publishRealtime(targets, {
          type: "reaction",
          conversationId: msg[0].conversationId,
          messageId: input.messageId,
          reactions: grouped,
        });
      }

      return {
        messageId: input.messageId,
        reactions: grouped,
      };
    }),
});
