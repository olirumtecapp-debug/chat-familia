import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  conversationMembers,
  conversations,
  InsertConversation,
  InsertConversationMember,
  InsertMessage,
  InsertMessageReaction,
  InsertUser,
  messageReactions,
  messages,
  User,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
      name: user.name ?? "",
      email: user.email ?? null,
      avatarUrl: user.avatarUrl ?? null,
      statusMessage: user.statusMessage ?? "Oi família, estou usando o CasaChat!",
      loginMethod: user.loginMethod ?? "family_simple",
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "avatarUrl", "statusMessage"] as const;
    textFields.forEach((field) => {
      const value = user[field];
      if (value !== undefined) {
        const normalized = value ?? null;
        values[field] = normalized as any;
        updateSet[field] = normalized;
      }
    });

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function updateProfile(userId: number, data: { name?: string; statusMessage?: string; avatarUrl?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ========================
// CONVERSATIONS
// ========================

export async function createConversation(data: {
  type: "direct" | "group";
  name?: string;
  description?: string;
  avatarUrl?: string;
  createdById: number;
  memberUserIds: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [inserted] = await db.insert(conversations).values({
    type: data.type,
    name: data.name ?? null,
    description: data.description ?? null,
    avatarUrl: data.avatarUrl ?? null,
    createdById: data.createdById,
    lastMessageText: "Conversa criada",
    lastMessageAt: new Date(),
  });

  const conversationId = inserted.insertId;

  // Adicionar criador e participantes
  const uniqueMemberIds = Array.from(new Set([data.createdById, ...data.memberUserIds]));
  for (const uid of uniqueMemberIds) {
    await db.insert(conversationMembers).values({
      conversationId,
      userId: uid,
      role: uid === data.createdById ? "admin" : "member",
      joinedAt: new Date(),
      lastReadAt: new Date(),
    });
  }

  return conversationId;
}

export async function findDirectConversation(userA: number, userB: number) {
  const db = await getDb();
  if (!db) return null;

  // Busca se já existe uma conversa direta entre os dois
  const directConvs = await db
    .select({
      id: conversations.id,
    })
    .from(conversations)
    .where(eq(conversations.type, "direct"));

  for (const conv of directConvs) {
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conv.id));

    const ids = members.map((m) => m.userId);
    if (ids.length === 2 && ids.includes(userA) && ids.includes(userB)) {
      return conv.id;
    }
  }

  return null;
}

export async function listUserConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Pega IDs de conversas em que o usuário está
  const memberEntries = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  if (memberEntries.length === 0) return [];
  const convIds = memberEntries.map((m) => m.conversationId);

  const convList = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, convIds))
    .orderBy(desc(conversations.lastMessageAt));

  // Para cada conversa, obter detalhes dos participantes
  const results = [];
  for (const c of convList) {
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        statusMessage: users.statusMessage,
        role: conversationMembers.role,
        lastReadAt: conversationMembers.lastReadAt,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, c.id));

    // Contar mensagens não lidas
    const userMember = members.find((m) => m.id === userId);
    let unreadCount = 0;
    if (userMember) {
      const unread = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, c.id),
            sql`${messages.createdAt} > ${userMember.lastReadAt}`,
            sql`${messages.senderId} != ${userId}`
          )
        );
      unreadCount = Number(unread[0]?.count ?? 0);
    }

    results.push({
      ...c,
      members,
      unreadCount,
    });
  }

  return results;
}

export async function getConversationDetails(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const conv = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (conv.length === 0) return null;

  // Verificar se o usuário faz parte
  const isMember = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);

  if (isMember.length === 0) return null;

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      statusMessage: users.statusMessage,
      role: conversationMembers.role,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId));

  return {
    ...conv[0],
    members,
  };
}

export async function markConversationAsRead(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}

// ========================
// MESSAGES
// ========================

export async function listConversationMessages(conversationId: number, limitCount = 100) {
  const db = await getDb();
  if (!db) return [];

  const msgs = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      content: messages.content,
      mediaUrl: messages.mediaUrl,
      mediaType: messages.mediaType,
      fileName: messages.fileName,
      isPinned: messages.isPinned,
      createdAt: messages.createdAt,
      senderName: users.name,
      senderAvatar: users.avatarUrl,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(limitCount);

  // Buscar reações para cada mensagem
  const msgIds = msgs.map((m) => m.id);
  let reactionsList: (typeof messageReactions.$inferSelect & { userName: string | null })[] = [];
  if (msgIds.length > 0) {
    reactionsList = await db
      .select({
        id: messageReactions.id,
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        userName: users.name,
      })
      .from(messageReactions)
      .innerJoin(users, eq(users.id, messageReactions.userId))
      .where(inArray(messageReactions.messageId, msgIds));
  }

  return msgs.map((m) => ({
    ...m,
    reactions: reactionsList.filter((r) => r.messageId === m.id),
  }));
}

export async function sendMessage(data: {
  conversationId: number;
  senderId: number;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [inserted] = await db.insert(messages).values({
    conversationId: data.conversationId,
    senderId: data.senderId,
    content: data.content ?? null,
    mediaUrl: data.mediaUrl ?? null,
    mediaType: data.mediaType ?? null,
    fileName: data.fileName ?? null,
    createdAt: new Date(),
  });

  const previewText = data.content
    ? data.content.slice(0, 80)
    : data.mediaType === "image"
      ? "📷 Foto"
      : "📎 Anexo";

  await db
    .update(conversations)
    .set({
      lastMessageText: previewText,
      lastMessageAt: new Date(),
    })
    .where(eq(conversations.id, data.conversationId));

  // Marca como lida para o remetente
  await markConversationAsRead(data.conversationId, data.senderId);

  return inserted.insertId;
}

export async function toggleMessageReaction(data: { messageId: number; userId: number; emoji: string }) {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, data.messageId),
        eq(messageReactions.userId, data.userId),
        eq(messageReactions.emoji, data.emoji)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
  } else {
    await db.insert(messageReactions).values({
      messageId: data.messageId,
      userId: data.userId,
      emoji: data.emoji,
      createdAt: new Date(),
    });
  }
}

export async function addMemberToConversation(conversationId: number, targetUserId: number) {
  const db = await getDb();
  if (!db) return;

  const exists = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, targetUserId)))
    .limit(1);

  if (exists.length === 0) {
    await db.insert(conversationMembers).values({
      conversationId,
      userId: targetUserId,
      role: "member",
      joinedAt: new Date(),
      lastReadAt: new Date(),
    });
  }
}
