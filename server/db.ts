import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";
import { InsertUser, users, conversations, conversationMembers } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getMockDb, resetChatStore } from "./mockDb";

let database: any = null;
let useMockFallback = false;
const IS_PRODUCTION = process.env.NODE_ENV === "production" || !!process.env.VERCEL;


let schemaEnsured = false;
async function ensureSchema(db: any) {
  if (schemaEnsured || !db || typeof db.execute !== "function") return;
  schemaEnsured = true;

  const tableStatements = [
    `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`openId\` varchar(64) NOT NULL UNIQUE,
      \`name\` varchar(120),
      \`nickname\` varchar(64) UNIQUE,
      \`email\` varchar(320) UNIQUE,
      \`avatarKey\` varchar(512),
      \`avatarUrl\` varchar(1024),
      \`status\` varchar(280) NOT NULL DEFAULT 'Disponível',
      \`lastSeen\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`loginMethod\` varchar(64),
      \`role\` enum('user','admin') NOT NULL DEFAULT 'user',
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`lastSignedIn\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS \`conversations\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`type\` enum('direct','group') NOT NULL DEFAULT 'direct',
      \`directKey\` varchar(64) UNIQUE,
      \`title\` varchar(160),
      \`groupOwnerId\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS \`conversation_members\` (
      \`conversationId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`memberRole\` enum('member','admin') NOT NULL DEFAULT 'member',
      \`joinedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`lastReadAt\` timestamp NULL,
      PRIMARY KEY (\`conversationId\`, \`userId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`messages\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`conversationId\` int NOT NULL,
      \`senderId\` int NOT NULL,
      \`messageType\` enum('text','image','audio','file','system') NOT NULL DEFAULT 'text',
      \`content\` text,
      \`fileKey\` varchar(512),
      \`fileUrl\` varchar(1024),
      \`fileName\` varchar(255),
      \`fileSize\` int,
      \`mimeType\` varchar(128),
      \`duration\` int,
      \`replyToId\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`deletedAt\` timestamp NULL
    )`,
    `CREATE TABLE IF NOT EXISTS \`message_status\` (
      \`messageId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`status\` enum('sent','delivered','read') NOT NULL DEFAULT 'sent',
      \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`messageId\`, \`userId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`message_deletions\` (
      \`messageId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`deletedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`messageId\`, \`userId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`calls\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`conversationId\` int NOT NULL,
      \`callerId\` int NOT NULL,
      \`receiverId\` int NOT NULL,
      \`type\` enum('audio','video') NOT NULL,
      \`status\` enum('ringing','connecting','active','ended','declined','missed','failed') NOT NULL DEFAULT 'ringing',
      \`startedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`answeredAt\` timestamp NULL,
      \`endedAt\` timestamp NULL,
      \`duration\` int NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS \`call_signals\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`callId\` int NOT NULL,
      \`senderId\` int NOT NULL,
      \`receiverId\` int NOT NULL,
      \`kind\` enum('offer','answer','candidate','hangup') NOT NULL,
      \`payload\` text NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS \`typing_states\` (
      \`conversationId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`expiresAt\` timestamp NOT NULL,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`conversationId\`, \`userId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`blocked_users\` (
      \`userId\` int NOT NULL,
      \`blockedUserId\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`userId\`, \`blockedUserId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`hidden_contacts\` (
      \`userId\` int NOT NULL,
      \`targetUserId\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`userId\`, \`targetUserId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`muted_conversations\` (
      \`userId\` int NOT NULL,
      \`conversationId\` int NOT NULL,
      \`mutedUntil\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`userId\`, \`conversationId\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`message_reactions\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`messageId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`emoji\` varchar(32) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`message_user_reaction_idx\` (\`messageId\`, \`userId\`)
    )`
  ];

  for (const stmt of tableStatements) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (e: any) {
      console.warn("[Database] ensureSchema table warning:", e?.message);
    }
  }

  // Ensure missing columns on users if table already existed
  const userAlterCols = [
    "ALTER TABLE `users` ADD COLUMN `nickname` varchar(64)",
    "ALTER TABLE `users` ADD COLUMN `avatarKey` varchar(512)",
    "ALTER TABLE `users` ADD COLUMN `avatarUrl` varchar(1024)",
    "ALTER TABLE `users` ADD COLUMN `status` varchar(280) NOT NULL DEFAULT 'Disponível'",
    "ALTER TABLE `users` ADD COLUMN `lastSeen` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP",
  ];
  for (const colSql of userAlterCols) {
    try {
      await db.execute(sql.raw(colSql));
    } catch (_) {}
  }

  try {
    await db.execute(sql.raw("ALTER TABLE `users` ADD UNIQUE KEY `users_nickname_unique` (`nickname`)"));
  } catch (_) {}
}

/** Lazily creates the database client or falls back to resilient store on error. */
export async function getDb() {
  if (useMockFallback) {
    if (IS_PRODUCTION) {
      throw new Error("[Database] Fallback local para mockDb não é permitido no ambiente de produção.");
    }
    return getMockDb();
  }

  if (!database && process.env.DATABASE_URL) {
    try {
      database = drizzle(process.env.DATABASE_URL);
    } catch (error: any) {
      console.error("[Database] Drizzle init failed:", error?.message || error);
      if (IS_PRODUCTION) {
        throw new Error("[Database] Falha ao inicializar conexão com o banco de dados em produção: " + (error?.message || error));
      }
      useMockFallback = true;
      return getMockDb();
    }
  }

  if (!database) {
    if (IS_PRODUCTION) {
      throw new Error("[Database] DATABASE_URL não está configurada no ambiente de produção.");
    }
    return getMockDb();
  }

  if (!schemaEnsured) { await ensureSchema(database); }
  return database;
}

export async function requireDatabase() {
  const db = await getDb();
  if (!db) {
    if (IS_PRODUCTION) {
      throw new Error("[Database] Banco de dados não disponível no ambiente de produção.");
    }
    return getMockDb();
  }
  return db;
}

export async function getUserByOpenId(openId: string) {
  try {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  } catch (err: any) {
    console.error("[Database] getUserByOpenId query failed:", err?.message || err);
    if (IS_PRODUCTION) {
      throw new Error("[Database] Falha ao consultar usuário em produção: " + (err?.message || err));
    }
    useMockFallback = true;
    const mock = getMockDb();
    const result = await mock.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  }
}

export async function getUserByEmail(email: string) {
  try {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  } catch (err: any) {
    console.error("[Database] getUserByEmail query failed:", err?.message || err);
    if (IS_PRODUCTION) {
      throw new Error("[Database] Falha ao consultar usuário por e-mail em produção: " + (err?.message || err));
    }
    useMockFallback = true;
    const mock = getMockDb();
    const result = await mock.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  try {
    const db = await getDb();
    const values: InsertUser = {
      openId: user.openId,
      name: user.name ?? "",
      lastSignedIn: user.lastSignedIn ?? new Date(),
      role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
    };
    const updateSet: Record<string, unknown> = { lastSignedIn: new Date(), lastSeen: new Date() };

    for (const field of ["name", "email", "loginMethod"] as const) {
      if (user[field] != null) {
        values[field] = user[field];
        updateSet[field] = user[field];
      }
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (err: any) {
    console.error("[Database] upsertUser failed:", err?.message || err);
    if (IS_PRODUCTION) {
      throw new Error("[Database] Falha ao salvar usuário em produção: " + (err?.message || err));
    }
    useMockFallback = true;
    const mock = getMockDb();
    await mock.insert(users).values(user).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
  }
}

export async function upsertLocalUser(input: { name: string; email: string; nickname?: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  let nickname = input.nickname?.trim();
  if (nickname && !nickname.startsWith("@")) {
    nickname = `@${nickname.toLowerCase()}`;
  } else if (nickname) {
    nickname = nickname.toLowerCase();
  }

  const now = new Date();
  const db = await getDb();

  try {
    // O e-mail identifica a conta. Não permita que outra pessoa tome um apelido
    // já cadastrado apenas informando esse apelido no formulário de entrada.
    let existing: any = null;
    const emailResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    existing = emailResult[0];

    if (existing) {
      await db.update(users).set({
        name,
        email,
        ...(nickname ? { nickname } : {}),
        lastSignedIn: now,
        lastSeen: now,
        loginMethod: "commercial-auth"
      }).where(eq(users.id, existing.id));
      const refreshed = await getUserByOpenId(existing.openId);
      return refreshed || existing;
    }

    const openId = `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    // Mantém identidade estável: o usuário deve recuperar a mesma conta ao voltar.
    const existingByOpenId = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    if (existingByOpenId[0]) {
      await db.update(users).set({
        name,
        email,
        ...(nickname ? { nickname } : {}),
        lastSignedIn: now,
        lastSeen: now,
        loginMethod: "commercial-auth",
      }).where(eq(users.id, existingByOpenId[0].id));
      return { ...existingByOpenId[0], name, email, ...(nickname ? { nickname } : {}), lastSignedIn: now, lastSeen: now };
    }

    await db.insert(users).values({
      openId,
      name,
      nickname: nickname || null,
      email,
      loginMethod: "commercial-auth",
      lastSignedIn: now,
      lastSeen: now
    }).onDuplicateKeyUpdate({
      set: {
        name,
        email,
        ...(nickname ? { nickname } : {}),
        lastSignedIn: now,
        lastSeen: now,
        loginMethod: "commercial-auth"
      }
    });

    const user = await getUserByOpenId(openId);
    if (!user) throw new Error("Local user could not be created");
    return user;
  } catch (err: any) {
    console.error("[Database] upsertLocalUser failed:", err?.message || err);
    if (IS_PRODUCTION) {
      const detail = err?.cause?.message || err?.sqlMessage || err?.message || String(err); throw new Error("[Database] Falha em produção: " + detail);
    }
    useMockFallback = true;
    const mock = getMockDb();

    // O fallback local mantém a mesma regra do banco principal: conta é identificada pelo e-mail.
    const fallbackUser = await mock.select().from(users).where(eq(users.email, email)).limit(1);
    let existing: any = fallbackUser[0];

    if (existing) {
      await (mock.update(users).set({
        name,
        email,
        ...(nickname ? { nickname } : {}),
        lastSignedIn: now,
        lastSeen: now
      }).where(eq(users.id, existing.id)) as any);
      return { ...existing, name, email, ...(nickname ? { nickname } : {}), lastSignedIn: now, lastSeen: now };
    }

    const openId = `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    await (mock.insert(users).values({
      openId,
      name,
      nickname: nickname || null,
      email,
      loginMethod: "commercial-auth",
      lastSignedIn: now,
      lastSeen: now
    }) as any);
    const user = await mock.select().from(users).where(eq(users.openId, openId)).limit(1);
    return user[0];
  }
}

export { resetChatStore };
