// api/index.ts
import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: text("avatarUrl"),
  statusMessage: varchar("statusMessage", { length: 255 }).default("Oi fam\xEDlia, estou usando o CasaChat!"),
  loginMethod: varchar("loginMethod", { length: 64 }).default("family_simple"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["direct", "group"]).notNull().default("direct"),
  name: varchar("name", { length: 120 }),
  description: text("description"),
  avatarUrl: text("avatarUrl"),
  createdById: int("createdById").notNull(),
  lastMessageText: text("lastMessageText"),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var conversationMembers = mysqlTable("conversation_members", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  lastReadAt: timestamp("lastReadAt").defaultNow().notNull()
});
var messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  content: text("content"),
  mediaUrl: text("mediaUrl"),
  mediaType: varchar("mediaType", { length: 32 }),
  fileName: varchar("fileName", { length: 255 }),
  isPinned: boolean("isPinned").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var messageReactions = mysqlTable("message_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID || "casachat_family",
  cookieSecret: process.env.JWT_SECRET || "casachat_family_secret_key_2026",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId,
      name: user.name ?? "",
      email: user.email ?? null,
      avatarUrl: user.avatarUrl ?? null,
      statusMessage: user.statusMessage ?? "Oi fam\xEDlia, estou usando o CasaChat!",
      loginMethod: user.loginMethod ?? "family_simple"
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod", "avatarUrl", "statusMessage"];
    textFields.forEach((field) => {
      const value = user[field];
      if (value !== void 0) {
        const normalized = value ?? null;
        values[field] = normalized;
        updateSet[field] = normalized;
      }
    });
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) return void 0;
  const normalized = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return result[0];
}
async function getUserById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}
async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}
async function updateProfile(userId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}
async function createConversation(data) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const [inserted] = await db.insert(conversations).values({
    type: data.type,
    name: data.name ?? null,
    description: data.description ?? null,
    avatarUrl: data.avatarUrl ?? null,
    createdById: data.createdById,
    lastMessageText: "Conversa criada",
    lastMessageAt: /* @__PURE__ */ new Date()
  });
  const conversationId = inserted.insertId;
  const uniqueMemberIds = Array.from(/* @__PURE__ */ new Set([data.createdById, ...data.memberUserIds]));
  for (const uid of uniqueMemberIds) {
    await db.insert(conversationMembers).values({
      conversationId,
      userId: uid,
      role: uid === data.createdById ? "admin" : "member",
      joinedAt: /* @__PURE__ */ new Date(),
      lastReadAt: /* @__PURE__ */ new Date()
    });
  }
  return conversationId;
}
async function findDirectConversation(userA, userB) {
  const db = await getDb();
  if (!db) return null;
  const directConvs = await db.select({
    id: conversations.id
  }).from(conversations).where(eq(conversations.type, "direct"));
  for (const conv of directConvs) {
    const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conv.id));
    const ids = members.map((m) => m.userId);
    if (ids.length === 2 && ids.includes(userA) && ids.includes(userB)) {
      return conv.id;
    }
  }
  return null;
}
async function ensureUserInFamilyGroup(userId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const existingGroups = await db.select().from(conversations).where(eq(conversations.type, "group")).limit(10);
    let familyGroup = existingGroups.find((g) => g.name?.includes("Fam\xEDlia")) || existingGroups[0];
    if (!familyGroup) {
      const [inserted] = await db.insert(conversations).values({
        type: "group",
        name: "\u{1F3E1} Grupo da Fam\xEDlia",
        description: "Nosso espa\xE7o oficial para bater papo, mandar fotos e dar bom dia!",
        avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=FamiliaReunida",
        createdById: userId,
        lastMessageText: "Bem-vindos ao Grupo da Fam\xEDlia!",
        lastMessageAt: /* @__PURE__ */ new Date()
      });
      const groupId = inserted.insertId;
      familyGroup = { id: groupId };
      await db.insert(messages).values({
        conversationId: groupId,
        senderId: userId,
        content: "\u{1F44B} Bem-vindos ao cantinho oficial da nossa fam\xEDlia no CasaChat! Sintam-se em casa para conversar e mandar fotos \u2764\uFE0F",
        type: "system",
        createdAt: /* @__PURE__ */ new Date()
      });
    }
    const membership = await db.select().from(conversationMembers).where(
      and(
        eq(conversationMembers.conversationId, familyGroup.id),
        eq(conversationMembers.userId, userId)
      )
    ).limit(1);
    if (membership.length === 0) {
      await db.insert(conversationMembers).values({
        conversationId: familyGroup.id,
        userId,
        role: "member",
        joinedAt: /* @__PURE__ */ new Date(),
        lastReadAt: /* @__PURE__ */ new Date()
      });
    }
    const allUsers = await db.select({ id: users.id }).from(users);
    const currentMembers = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, familyGroup.id));
    const memberSet = new Set(currentMembers.map((m) => m.userId));
    for (const u of allUsers) {
      if (!memberSet.has(u.id)) {
        try {
          await db.insert(conversationMembers).values({
            conversationId: familyGroup.id,
            userId: u.id,
            role: "member",
            joinedAt: /* @__PURE__ */ new Date(),
            lastReadAt: /* @__PURE__ */ new Date()
          });
        } catch {
        }
      }
    }
    return familyGroup.id;
  } catch (err) {
    console.error("[Database] Error in ensureUserInFamilyGroup:", err);
    return null;
  }
}
async function listUserConversations(userId) {
  const db = await getDb();
  if (!db) return [];
  const memberEntries = await db.select({ conversationId: conversationMembers.conversationId }).from(conversationMembers).where(eq(conversationMembers.userId, userId));
  if (memberEntries.length === 0) return [];
  const convIds = memberEntries.map((m) => m.conversationId);
  const convList = await db.select().from(conversations).where(inArray(conversations.id, convIds)).orderBy(desc(conversations.lastMessageAt));
  const results = [];
  for (const c of convList) {
    const members = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      statusMessage: users.statusMessage,
      role: conversationMembers.role,
      lastReadAt: conversationMembers.lastReadAt
    }).from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(eq(conversationMembers.conversationId, c.id));
    const userMember = members.find((m) => m.id === userId);
    let unreadCount = 0;
    if (userMember) {
      const unread = await db.select({ count: sql`count(*)` }).from(messages).where(
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
      unreadCount
    });
  }
  return results;
}
async function getConversationDetails(conversationId, userId) {
  const db = await getDb();
  if (!db) return null;
  const conv = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (conv.length === 0) return null;
  const isMember = await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))).limit(1);
  if (isMember.length === 0) return null;
  const members = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    avatarUrl: users.avatarUrl,
    statusMessage: users.statusMessage,
    role: conversationMembers.role
  }).from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(eq(conversationMembers.conversationId, conversationId));
  return {
    ...conv[0],
    members
  };
}
async function markConversationAsRead(conversationId, userId) {
  const db = await getDb();
  if (!db) return;
  await db.update(conversationMembers).set({ lastReadAt: /* @__PURE__ */ new Date() }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}
async function listConversationMessages(conversationId, limitCount = 100) {
  const db = await getDb();
  if (!db) return [];
  const msgs = await db.select({
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
    senderAvatar: users.avatarUrl
  }).from(messages).innerJoin(users, eq(users.id, messages.senderId)).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt).limit(limitCount);
  const msgIds = msgs.map((m) => m.id);
  let reactionsList = [];
  if (msgIds.length > 0) {
    reactionsList = await db.select({
      id: messageReactions.id,
      messageId: messageReactions.messageId,
      userId: messageReactions.userId,
      emoji: messageReactions.emoji,
      createdAt: messageReactions.createdAt,
      userName: users.name
    }).from(messageReactions).innerJoin(users, eq(users.id, messageReactions.userId)).where(inArray(messageReactions.messageId, msgIds));
  }
  return msgs.map((m) => ({
    ...m,
    reactions: reactionsList.filter((r) => r.messageId === m.id)
  }));
}
async function sendMessage(data) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const [inserted] = await db.insert(messages).values({
    conversationId: data.conversationId,
    senderId: data.senderId,
    content: data.content ?? null,
    mediaUrl: data.mediaUrl ?? null,
    mediaType: data.mediaType ?? null,
    fileName: data.fileName ?? null,
    createdAt: /* @__PURE__ */ new Date()
  });
  const previewText = data.content ? data.content.slice(0, 80) : data.mediaType === "image" ? "\u{1F4F7} Foto" : "\u{1F4CE} Anexo";
  await db.update(conversations).set({
    lastMessageText: previewText,
    lastMessageAt: /* @__PURE__ */ new Date()
  }).where(eq(conversations.id, data.conversationId));
  await markConversationAsRead(data.conversationId, data.senderId);
  return inserted.insertId;
}
async function toggleMessageReaction(data) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(messageReactions).where(
    and(
      eq(messageReactions.messageId, data.messageId),
      eq(messageReactions.userId, data.userId),
      eq(messageReactions.emoji, data.emoji)
    )
  ).limit(1);
  if (existing.length > 0) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
  } else {
    await db.insert(messageReactions).values({
      messageId: data.messageId,
      userId: data.userId,
      emoji: data.emoji,
      createdAt: /* @__PURE__ */ new Date()
    });
  }
}
async function addMemberToConversation(conversationId, targetUserId) {
  const db = await getDb();
  if (!db) return;
  const exists = await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, targetUserId))).limit(1);
  if (exists.length === 0) {
    await db.insert(conversationMembers).values({
      conversationId,
      userId: targetUserId,
      role: "member",
      joinedAt: /* @__PURE__ */ new Date(),
      lastReadAt: /* @__PURE__ */ new Date()
    });
  }
}

// server/_core/sdk.ts
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "casachat_family",
        name: options.name || "Membro da Fam\xEDlia"
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId || "casachat_family",
      name: payload.name || "Membro da Fam\xEDlia"
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId)) {
        console.warn("[Auth] Session payload missing required openId");
        return null;
      }
      return {
        openId,
        appId: isNonEmptyString(appId) ? appId : ENV.appId || "casachat_family",
        name: isNonEmptyString(name) ? name : "Membro da Fam\xEDlia"
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const isSecure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: isSecure ? "none" : "lax",
    secure: isSecure
  };
}

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import fs from "fs";
import path from "path";
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    // Cadastro ou Login Simples de Família (apenas nome e email)
    loginSimple: publicProcedure.input(
      z2.object({
        name: z2.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        email: z2.string().email("Email inv\xE1lido"),
        statusMessage: z2.string().optional(),
        avatarUrl: z2.string().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      let user = await getUserByEmail(email);
      if (!user) {
        const openId = `family_${Buffer.from(email).toString("hex").slice(0, 32)}`;
        await upsertUser({
          openId,
          name,
          email,
          statusMessage: input.statusMessage || "Oi fam\xEDlia, estou usando o CasaChat!",
          avatarUrl: input.avatarUrl || null,
          loginMethod: "family_simple",
          lastSignedIn: /* @__PURE__ */ new Date()
        });
        user = await getUserByEmail(email);
      } else {
        await upsertUser({
          openId: user.openId,
          name: name || user.name || "Membro da Fam\xEDlia",
          email: user.email,
          statusMessage: input.statusMessage || user.statusMessage || "Oi fam\xEDlia, estou usando o CasaChat!",
          avatarUrl: input.avatarUrl || user.avatarUrl,
          lastSignedIn: /* @__PURE__ */ new Date()
        });
        user = await getUserByEmail(email);
      }
      if (!user) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "N\xE3o foi poss\xEDvel autenticar o usu\xE1rio" });
      }
      try {
        await ensureUserInFamilyGroup(user.id);
      } catch (e) {
        console.error("[Login] Failed to join family group:", e);
      }
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || name
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 365 * 24 * 60 * 60 * 1e3
        // 1 ano
      });
      return {
        user,
        token: sessionToken
      };
    }),
    // Atualizar perfil do usuário conectado
    updateProfile: protectedProcedure.input(
      z2.object({
        name: z2.string().min(2).optional(),
        statusMessage: z2.string().max(250).optional(),
        avatarUrl: z2.string().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      await updateProfile(ctx.user.id, input);
      return getUserById(ctx.user.id);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  // Usuários da Família
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const all = await listAllUsers();
      return all.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        statusMessage: u.statusMessage,
        isSelf: u.id === ctx.user.id
      }));
    })
  }),
  // Conversas
  conversations: router({
    // Listar conversas do usuário logado
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        await ensureUserInFamilyGroup(ctx.user.id);
      } catch (e) {
        console.error("[Conversations] Failed to ensure family group:", e);
      }
      return listUserConversations(ctx.user.id);
    }),
    // Obter detalhes de uma conversa
    get: protectedProcedure.input(z2.object({ conversationId: z2.number() })).query(async ({ ctx, input }) => {
      const conv = await getConversationDetails(input.conversationId, ctx.user.id);
      if (!conv) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "Conversa n\xE3o encontrada ou acesso n\xE3o autorizado" });
      }
      return conv;
    }),
    // Criar conversa direta (ou abrir existente)
    startDirect: protectedProcedure.input(z2.object({ targetUserId: z2.number() })).mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.user.id) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Voc\xEA j\xE1 est\xE1 em contato consigo mesmo" });
      }
      const existingId = await findDirectConversation(ctx.user.id, input.targetUserId);
      if (existingId) {
        return { conversationId: existingId, isNew: false };
      }
      const target = await getUserById(input.targetUserId);
      if (!target) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "Usu\xE1rio alvo n\xE3o encontrado" });
      }
      const newId = await createConversation({
        type: "direct",
        createdById: ctx.user.id,
        memberUserIds: [input.targetUserId]
      });
      return { conversationId: newId, isNew: true };
    }),
    // Criar Grupo familiar
    createGroup: protectedProcedure.input(
      z2.object({
        name: z2.string().min(2, "Nome do grupo deve ter pelo menos 2 caracteres"),
        description: z2.string().optional(),
        memberUserIds: z2.array(z2.number()).min(1, "Adicione pelo menos 1 membro"),
        avatarUrl: z2.string().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      const conversationId = await createConversation({
        type: "group",
        name: input.name,
        description: input.description,
        avatarUrl: input.avatarUrl,
        createdById: ctx.user.id,
        memberUserIds: input.memberUserIds
      });
      return { conversationId };
    }),
    // Marcar conversa como lida
    markAsRead: protectedProcedure.input(z2.object({ conversationId: z2.number() })).mutation(async ({ ctx, input }) => {
      await markConversationAsRead(input.conversationId, ctx.user.id);
      return { success: true };
    }),
    // Adicionar membro ao grupo
    addMember: protectedProcedure.input(z2.object({ conversationId: z2.number(), targetUserId: z2.number() })).mutation(async ({ ctx, input }) => {
      const conv = await getConversationDetails(input.conversationId, ctx.user.id);
      if (!conv) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "Apenas membros podem adicionar participantes" });
      }
      await addMemberToConversation(input.conversationId, input.targetUserId);
      return { success: true };
    })
  }),
  // Mensagens
  messages: router({
    list: protectedProcedure.input(z2.object({ conversationId: z2.number(), limit: z2.number().optional() })).query(async ({ ctx, input }) => {
      const conv = await getConversationDetails(input.conversationId, ctx.user.id);
      if (!conv) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "Sem acesso a esta conversa" });
      }
      return listConversationMessages(input.conversationId, input.limit ?? 100);
    }),
    send: protectedProcedure.input(
      z2.object({
        conversationId: z2.number(),
        content: z2.string().optional(),
        mediaUrl: z2.string().optional(),
        mediaType: z2.string().optional(),
        fileName: z2.string().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      if (!input.content && !input.mediaUrl) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Mensagem n\xE3o pode ser vazia" });
      }
      const conv = await getConversationDetails(input.conversationId, ctx.user.id);
      if (!conv) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "Sem acesso a esta conversa" });
      }
      const messageId = await sendMessage({
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        content: input.content,
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        fileName: input.fileName
      });
      return { messageId, success: true };
    }),
    react: protectedProcedure.input(z2.object({ messageId: z2.number(), emoji: z2.string().min(1) })).mutation(async ({ ctx, input }) => {
      await toggleMessageReaction({
        messageId: input.messageId,
        userId: ctx.user.id,
        emoji: input.emoji
      });
      return { success: true };
    }),
    // Upload de arquivo ou foto base64 (Salva localmente com alta performance)
    uploadMedia: protectedProcedure.input(
      z2.object({
        fileName: z2.string(),
        contentType: z2.string(),
        base64Data: z2.string()
        // payload base64 enviado pelo cliente
      })
    ).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const safeName = input.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const uniqueName = `${Date.now()}_${safeName}`;
      try {
        const uploadsDir = path.resolve(process.cwd(), "uploads");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const filePath = path.join(uploadsDir, uniqueName);
        await fs.promises.writeFile(filePath, buffer);
        return {
          url: `/uploads/${uniqueName}`,
          key: uniqueName
        };
      } catch (localErr) {
        console.error("Erro no salvamento local, tentando storage:", localErr);
        const relKey = `chat-media/${uniqueName}`;
        const result = await storagePut(relKey, buffer, input.contentType);
        return {
          url: result.url,
          key: result.key
        };
      }
    })
  }),
  // Módulo de Chamadas de Áudio e Vídeo (WebRTC Signaling)
  calls: router({
    initiate: protectedProcedure.input(
      z2.object({
        conversationId: z2.number(),
        type: z2.enum(["audio", "video"]),
        offer: z2.any().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const session = {
        id: callId,
        conversationId: input.conversationId,
        callerId: ctx.user.id,
        callerName: ctx.user.name || "Familiar",
        callerAvatar: ctx.user.avatarUrl,
        type: input.type,
        status: "ringing",
        offer: input.offer,
        candidates: [],
        startedAt: Date.now(),
        updatedAt: Date.now()
      };
      activeCalls.set(callId, session);
      return { callId, session };
    }),
    poll: protectedProcedure.input(z2.object({ conversationId: z2.number() })).query(async ({ ctx, input }) => {
      for (const session of Array.from(activeCalls.values())) {
        if (session.conversationId === input.conversationId && (session.status === "ringing" || session.status === "connected")) {
          return session;
        }
      }
      return null;
    }),
    answer: protectedProcedure.input(
      z2.object({
        callId: z2.string(),
        answer: z2.any()
      })
    ).mutation(async ({ input }) => {
      const session = activeCalls.get(input.callId);
      if (!session) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "Chamada n\xE3o encontrada" });
      }
      session.answer = input.answer;
      session.status = "connected";
      session.updatedAt = Date.now();
      return { success: true };
    }),
    addCandidate: protectedProcedure.input(
      z2.object({
        callId: z2.string(),
        candidate: z2.any()
      })
    ).mutation(async ({ ctx, input }) => {
      const session = activeCalls.get(input.callId);
      if (session) {
        session.candidates.push({
          candidate: input.candidate,
          senderId: ctx.user.id
        });
        session.updatedAt = Date.now();
      }
      return { success: true };
    }),
    getCandidates: protectedProcedure.input(z2.object({ callId: z2.string() })).query(async ({ ctx, input }) => {
      const session = activeCalls.get(input.callId);
      if (!session) return [];
      return session.candidates.filter((c) => c.senderId !== ctx.user.id);
    }),
    end: protectedProcedure.input(
      z2.object({
        callId: z2.string(),
        status: z2.enum(["ended", "rejected"]).optional()
      })
    ).mutation(async ({ input }) => {
      const session = activeCalls.get(input.callId);
      if (session) {
        session.status = input.status || "ended";
        session.updatedAt = Date.now();
        setTimeout(() => activeCalls.delete(input.callId), 15e3);
      }
      return { success: true };
    })
  })
});
var activeCalls = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  activeCalls.forEach((session, id) => {
    if (now - session.updatedAt > 60 * 60 * 1e3 || session.status === "ended") {
      activeCalls.delete(id);
    }
  });
}, 3e4);

// api/index.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
var index_default = app;
export {
  index_default as default
};
