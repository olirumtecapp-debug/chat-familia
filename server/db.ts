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
    console.warn("[Database] upsertLocalUser failed, falling back to mockDb:", err?.message || err);
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
