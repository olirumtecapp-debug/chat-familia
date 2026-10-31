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
  let nickname = input.nickname?.trim();
  if (nickname && !nickname.startsWith("@")) {
    nickname = `@${nickname.toLowerCase()}`;
  } else if (nickname) {
    nickname = nickname.toLowerCase();
  }

  // Canonical mapping for family accounts to guarantee single source of truth
  let canonicalOpenId: string | null = null;
  let canonicalId: number | null = null;
  if (email === "olirumtecapp@gmail.com" || nickname === "@olirumpai") {
    canonicalOpenId = "murilo_silva_pai";
    canonicalId = 1;
    nickname = "@olirumpai";
  } else if (email === "esposa@gmail.com" || nickname === "@esposasilva") {
    canonicalOpenId = "local_cc656bff4f925bf4b69d0e25773bdd412120404ca44eb38f866c7bfa9a";
    canonicalId = 3;
    nickname = "@esposasilva";
  } else if (email === "filho@gmail.com" || nickname === "@olirumfilho") {
    canonicalOpenId = "local_7c9c98a82451e8ff7f8e871e4ed3cbc8142ab9afc8074505e13ed7390b";
    canonicalId = 4;
    nickname = "@olirumfilho";
  }

  const now = new Date();
  const db = await getDb();

  try {
    // 1. Try to find by canonical openId
    let existing: any = null;
    if (canonicalOpenId) {
      existing = await getUserByOpenId(canonicalOpenId);
    }
    // 2. Try to find by email
    if (!existing) {
      existing = await getUserByEmail(email);
    }

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

    const openId = canonicalOpenId || `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    await db.insert(users).values({
      ...(canonicalId ? { id: canonicalId } : {}),
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
    console.warn("[Database] upsertLocalUser failed, falling back to mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();

    let existing: any = null;
    if (canonicalOpenId) {
      const res = await mock.select().from(users).where(eq(users.openId, canonicalOpenId)).limit(1);
      existing = res[0];
    }
    if (!existing) {
      const res = await mock.select().from(users).where(eq(users.email, email)).limit(1);
      existing = res[0];
    }

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

    const openId = canonicalOpenId || `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    await (mock.insert(users).values({
      ...(canonicalId ? { id: canonicalId } : {}),
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
