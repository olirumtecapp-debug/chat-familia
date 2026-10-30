import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";
import { InsertUser, users, conversations, conversationMembers } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getMockDb, resetChatStore } from "./mockDb";

let database: any = null;
let useMockFallback = false;

/** Lazily creates the database client or falls back to resilient store on error. */
export async function getDb() {
  if (useMockFallback) {
    return getMockDb();
  }

  if (!database && process.env.DATABASE_URL) {
    try {
      database = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Drizzle init failed, using resilient store:", error);
      useMockFallback = true;
      return getMockDb();
    }
  }

  if (!database) {
    return getMockDb();
  }

  return database;
}

export async function requireDatabase() {
  const db = await getDb();
  if (!db) return getMockDb();
  return db;
}

export async function getUserByOpenId(openId: string) {
  try {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  } catch (err: any) {
    console.warn("[Database] getUserByOpenId query failed, falling back to mockDb:", err?.message || err);
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
    console.warn("[Database] getUserByEmail query failed, falling back to mockDb:", err?.message || err);
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
    console.warn("[Database] upsertUser failed, using mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();
    await mock.insert(users).values(user).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
  }
}

export async function upsertLocalUser(input: { name: string; email: string; nickname?: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  try {
    const existing = await getUserByEmail(email);
    const db = await getDb();

    if (existing) {
      await db.update(users).set({ name, ...(input.nickname ? { nickname: input.nickname } : {}), lastSignedIn: new Date(), lastSeen: new Date(), loginMethod: "commercial-auth" }).where(eq(users.id, existing.id));
      const refreshed = await getUserByEmail(email);
      return refreshed || existing;
    }

    const openId = `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    const now = new Date();
    await db.insert(users).values({ openId, name, nickname: input.nickname || null, email, loginMethod: "commercial-auth", lastSignedIn: now, lastSeen: now }).onDuplicateKeyUpdate({ set: { name, ...(input.nickname ? { nickname: input.nickname } : {}), lastSignedIn: now, lastSeen: now, loginMethod: "commercial-auth" } });
    
    // Auto join default family group
    try {
      const createdUser = await getUserByOpenId(openId);
      if (createdUser) {
        const groups = await db.select().from(conversations).where(eq(conversations.type, "group")).limit(1);
        if (groups[0]) {
          await db.insert(conversationMembers).values({ conversationId: groups[0].id, userId: createdUser.id, memberRole: "member", joinedAt: now }).onDuplicateKeyUpdate({ set: { joinedAt: now } });
        }
      }
    } catch (_) {}

    const user = await getUserByOpenId(openId);
    if (!user) throw new Error("Local user could not be created");
    return user;
  } catch (err: any) {
    console.warn("[Database] upsertLocalUser failed, falling back to mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();
    const existing = await mock.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) {
      await mock.update(users).set({ name, ...(input.nickname ? { nickname: input.nickname } : {}), lastSignedIn: new Date() }).where(eq(users.id, existing[0].id));
      return { ...existing[0], name, ...(input.nickname ? { nickname: input.nickname } : {}) };
    }
    const openId = `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    await mock.insert(users).values({ openId, name, nickname: input.nickname || null, email, loginMethod: "commercial-auth", lastSignedIn: new Date(), lastSeen: new Date() });
    const user = await mock.select().from(users).where(eq(users.openId, openId)).limit(1);
    return user[0];
  }
}

export { resetChatStore };
