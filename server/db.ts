import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let database: ReturnType<typeof drizzle> | null = null;

/** Lazily creates the database client so static tooling can run without service credentials. */
export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    try {
      database = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.error("[Database] Connection initialization failed", error);
      database = null;
    }
  }
  return database;
}

/** Called by the OAuth infrastructure; never creates application test data. */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

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
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function upsertLocalUser(input: { name: string; email: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const existing = await getUserByEmail(email);
  if (existing) {
    await db.update(users).set({ name, lastSignedIn: new Date(), lastSeen: new Date(), loginMethod: "family-code" }).where(eq(users.id, existing.id));
    const refreshed = await db.select().from(users).where(eq(users.id, existing.id)).limit(1);
    return refreshed[0] || existing;
  }
  const openId = `local_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
  const now = new Date();
  await db.insert(users).values({ openId, name, email, loginMethod: "family-code", lastSignedIn: now }).onDuplicateKeyUpdate({ set: { name, lastSignedIn: now, lastSeen: now, loginMethod: "family-code" } });
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error("Local user could not be created");
  return user;
}
