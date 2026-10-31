// api/serverless.ts
import "dotenv/config";
import express from "express";
import crypto3 from "crypto";
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

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto2 from "crypto";

// drizzle/schema.ts
import { index, int, mysqlEnum, mysqlTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 120 }),
    nickname: varchar("nickname", { length: 64 }).unique(),
    email: varchar("email", { length: 320 }).unique(),
    avatarKey: varchar("avatarKey", { length: 512 }),
    avatarUrl: varchar("avatarUrl", { length: 1024 }),
    status: varchar("status", { length: 280 }).notNull().default("Dispon\xEDvel"),
    lastSeen: timestamp("lastSeen").defaultNow().notNull(),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
  },
  (table) => [index("users_name_idx").on(table.name)]
);
var conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["direct", "group"]).notNull().default("direct"),
    directKey: varchar("directKey", { length: 64 }).unique(),
    title: varchar("title", { length: 160 }),
    groupOwnerId: int("groupOwnerId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => [index("conversations_activity_idx").on(table.updatedAt)]
);
var conversationMembers = mysqlTable(
  "conversation_members",
  {
    conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    memberRole: mysqlEnum("memberRole", ["member", "admin"]).notNull().default("member"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    lastReadAt: timestamp("lastReadAt")
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] }), index("members_user_idx").on(table.userId)]
);
var messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: int("senderId").notNull().references(() => users.id, { onDelete: "cascade" }),
    messageType: mysqlEnum("messageType", ["text", "image", "audio", "file", "system"]).notNull().default("text"),
    content: text("content"),
    fileKey: varchar("fileKey", { length: 512 }),
    fileUrl: varchar("fileUrl", { length: 1024 }),
    fileName: varchar("fileName", { length: 255 }),
    fileSize: int("fileSize"),
    mimeType: varchar("mimeType", { length: 128 }),
    duration: int("duration"),
    replyToId: int("replyToId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt")
  },
  (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt), index("messages_sender_idx").on(table.senderId)]
);
var messageStatuses = mysqlTable(
  "message_status",
  {
    messageId: int("messageId").notNull().references(() => messages.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["sent", "delivered", "read"]).notNull().default("sent"),
    timestamp: timestamp("timestamp").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId] }), index("status_user_idx").on(table.userId)]
);
var messageDeletions = mysqlTable(
  "message_deletions",
  {
    messageId: int("messageId").notNull().references(() => messages.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    deletedAt: timestamp("deletedAt").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId] }), index("deletions_user_idx").on(table.userId)]
);
var calls = mysqlTable(
  "calls",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    callerId: int("callerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    receiverId: int("receiverId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ["audio", "video"]).notNull(),
    status: mysqlEnum("status", ["ringing", "connecting", "active", "ended", "declined", "missed", "failed"]).notNull().default("ringing"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    answeredAt: timestamp("answeredAt"),
    endedAt: timestamp("endedAt"),
    duration: int("duration").notNull().default(0)
  },
  (table) => [index("calls_receiver_status_idx").on(table.receiverId, table.status), index("calls_conversation_idx").on(table.conversationId, table.startedAt)]
);
var callSignals = mysqlTable(
  "call_signals",
  {
    id: int("id").autoincrement().primaryKey(),
    callId: int("callId").notNull().references(() => calls.id, { onDelete: "cascade" }),
    senderId: int("senderId").notNull().references(() => users.id, { onDelete: "cascade" }),
    receiverId: int("receiverId").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["offer", "answer", "candidate", "hangup"]).notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("signals_receiver_idx").on(table.receiverId, table.createdAt)]
);
var typingStates = mysqlTable(
  "typing_states",
  {
    conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] }), index("typing_expiry_idx").on(table.expiresAt)]
);
var blockedUsers = mysqlTable(
  "blocked_users",
  {
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: int("blockedUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.blockedUserId] })]
);
var mutedConversations = mysqlTable(
  "muted_conversations",
  {
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    mutedUntil: timestamp("mutedUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.conversationId] })]
);
var hiddenContacts = mysqlTable(
  "hidden_contacts",
  {
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetUserId: int("targetUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.targetUserId] })]
);

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "chatforall",
  cookieSecret: process.env.JWT_SECRET || "chatforall-secret-key-familia-2026-indestrutivel",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/mockDb.ts
import fs from "fs";
import path from "path";
var IS_VERCEL = !!process.env.VERCEL;
var DATA_DIR = IS_VERCEL ? "/tmp" : path.resolve(process.cwd(), "server", "data");
var STORE_FILE = path.join(DATA_DIR, "chat-store.json");
function getInitialStore() {
  const now = /* @__PURE__ */ new Date();
  return {
    users: [
      {
        id: 1,
        openId: "murilo_silva_pai",
        name: "Murilo Silva",
        email: "olirumtecapp@gmail.com",
        nickname: "@olirumpai",
        avatarKey: null,
        avatarUrl: null,
        status: "Dispon\xEDvel \u{1F680}",
        lastSeen: now,
        loginMethod: "commercial-auth",
        role: "admin",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now
      },
      {
        id: 3,
        openId: "local_cc656bff4f925bf4b69d0e25773bdd412120404ca44eb38f866c7bfa9a",
        name: "Esposa Silva",
        email: "esposa@gmail.com",
        nickname: "@esposasilva",
        avatarKey: null,
        avatarUrl: null,
        status: "Dispon\xEDvel \u2764\uFE0F",
        lastSeen: now,
        loginMethod: "commercial-auth",
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now
      },
      {
        id: 4,
        openId: "local_7c9c98a82451e8ff7f8e871e4ed3cbc8142ab9afc8074505e13ed7390b",
        name: "Filho Silva",
        email: "filho@gmail.com",
        nickname: "@olirumfilho",
        avatarKey: null,
        avatarUrl: null,
        status: "Dispon\xEDvel \u{1F3AE}",
        lastSeen: now,
        loginMethod: "commercial-auth",
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now
      }
    ],
    conversations: [],
    conversationMembers: [],
    messages: [],
    messageStatuses: [],
    messageDeletions: [],
    calls: [],
    callSignals: [],
    typingStates: [],
    blockedUsers: [],
    mutedConversations: [],
    hiddenContacts: []
  };
}
var store = loadStore();
function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const data = reviveDates(parsed);
      if (data && Array.isArray(data.conversations)) {
        data.conversations = data.conversations.filter((c) => c.title !== "Fam\xEDlia Silva \u2764\uFE0F");
      }
      if (data && Array.isArray(data.users)) {
        data.users = data.users.filter((u) => u.email !== "carlos.familia@teste.com" && u.name !== "Tio Carlos");
      }
      data.blockedUsers = data.blockedUsers || [];
      data.mutedConversations = data.mutedConversations || [];
      data.hiddenContacts = data.hiddenContacts || [];
      return data;
    }
  } catch (e) {
    console.warn("[mockDb] Failed to load store, using fresh initial store", e);
  }
  return getInitialStore();
}
function reviveDates(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
      out[k] = new Date(v);
    } else if (typeof v === "object" && v !== null) {
      out[k] = reviveDates(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
function persistStore() {
  if (process.env.VITEST) {
    return;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.warn("[mockDb] Persist error:", e);
  }
}
function getTableName(table) {
  if (!table) return "users";
  const name = table[Symbol.for("drizzle:Name")] || table._?.name || table.name || (typeof table === "string" ? table : "");
  if (name === "users") return "users";
  if (name === "conversations") return "conversations";
  if (name === "conversation_members" || name === "conversationMembers") return "conversationMembers";
  if (name === "messages") return "messages";
  if (name === "message_status" || name === "messageStatuses") return "messageStatuses";
  if (name === "message_deletions" || name === "messageDeletions") return "messageDeletions";
  if (name === "calls") return "calls";
  if (name === "call_signals" || name === "callSignals") return "callSignals";
  if (name === "typing_states" || name === "typingStates") return "typingStates";
  if (name === "blocked_users" || name === "blockedUsers") return "blockedUsers";
  if (name === "muted_conversations" || name === "mutedConversations") return "mutedConversations";
  if (name === "hidden_contacts" || name === "hiddenContacts") return "hiddenContacts";
  return "users";
}
function extractCondition(cond) {
  if (!cond) return null;
  if (!cond.queryChunks || !Array.isArray(cond.queryChunks)) return null;
  const chunks = cond.queryChunks;
  if (chunks.length === 3 && chunks[0]?.value?.[0] === "(" && chunks[2]?.value?.[0] === ")") {
    return extractCondition(chunks[1]);
  }
  const isAnd = chunks.some((c) => typeof c?.value?.[0] === "string" && c.value[0].includes(" and "));
  const isOr = chunks.some((c) => typeof c?.value?.[0] === "string" && c.value[0].includes(" or "));
  if (isAnd) {
    const subConds = chunks.filter((c) => c && c.queryChunks);
    return { type: "and", conditions: subConds.map(extractCondition).filter(Boolean) };
  }
  if (isOr) {
    const subConds = chunks.filter((c) => c && c.queryChunks);
    return { type: "or", conditions: subConds.map(extractCondition).filter(Boolean) };
  }
  let colName = null;
  let op = "=";
  let targetVal = void 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk && chunk.queryChunks) {
      const sub = extractCondition(chunk);
      if (sub && sub.colName) return sub;
      if (sub && (sub.type === "and" || sub.type === "or")) return sub;
    }
    if (chunk && chunk.name && typeof chunk.table !== "undefined") {
      colName = chunk.name;
    } else if (chunk && chunk.value && Array.isArray(chunk.value)) {
      const v = chunk.value[0];
      if (typeof v === "string") {
        if (v.includes("<=")) op = "<=";
        else if (v.includes(">=")) op = ">=";
        else if (v.includes("<>") || v.includes("!=")) op = "<>";
        else if (v.includes("<")) op = "<";
        else if (v.includes(">")) op = ">";
        else if (v.includes(" in ") || v.includes(" in(")) op = "in";
        else if (v.includes(" is not null")) op = "is_not_null";
        else if (v.includes(" is null")) op = "is_null";
        else if (v.includes(" like ") || v.toLowerCase().includes("like")) op = "like";
        else if (v.includes("=")) op = "=";
      }
    } else if (chunk !== null && typeof chunk !== "undefined") {
      if (typeof chunk === "object" && "value" in chunk && chunk.constructor?.name === "Param") {
        targetVal = chunk.value;
      } else if (Array.isArray(chunk)) {
        targetVal = chunk.map((item) => item?.value !== void 0 ? item.value : item);
      } else if (typeof chunk !== "object" || chunk instanceof Date) {
        targetVal = chunk;
      }
    }
  }
  return { type: "single", colName, op, targetVal };
}
function evaluateParsed(item, parsed) {
  if (!parsed) return true;
  if (parsed.type === "and") {
    return parsed.conditions.every((c) => evaluateParsed(item, c));
  }
  if (parsed.type === "or") {
    return parsed.conditions.some((c) => evaluateParsed(item, c));
  }
  if (parsed.type === "single") {
    const { colName, op, targetVal } = parsed;
    if (!colName) return true;
    const val = item[colName];
    switch (op) {
      case "=":
        if (targetVal instanceof Date && val instanceof Date) return val.getTime() === targetVal.getTime();
        if (typeof targetVal === "string" && typeof val === "string") return val.toLowerCase() === targetVal.toLowerCase();
        return val == targetVal;
      case "<>":
        if (targetVal instanceof Date && val instanceof Date) return val.getTime() !== targetVal.getTime();
        if (typeof targetVal === "string" && typeof val === "string") return val.toLowerCase() !== targetVal.toLowerCase();
        return val != targetVal;
      case "<":
        return val < targetVal;
      case "<=":
        return val <= targetVal;
      case ">":
        return val > targetVal;
      case ">=":
        return val >= targetVal;
      case "in":
        if (Array.isArray(targetVal)) {
          return targetVal.some((t2) => typeof t2 === "string" && typeof val === "string" ? val.toLowerCase() === t2.toLowerCase() : val == t2);
        }
        return false;
      case "like": {
        if (typeof val !== "string" || typeof targetVal !== "string") return false;
        const cleanPattern = targetVal.replace(/[%_\\]/g, (match) => match === "%" ? ".*" : match === "_" ? "." : "\\\\");
        return new RegExp(`^${cleanPattern}$`, "i").test(val);
      }
      case "is_null":
        return val === null || val === void 0;
      case "is_not_null":
        return val !== null && val !== void 0;
      default:
        return true;
    }
  }
  return true;
}
function matchesCondition(item, condition) {
  if (!condition) return true;
  const parsed = extractCondition(condition);
  return evaluateParsed(item, parsed);
}
function getMockDb() {
  return {
    __isMock: true,
    select: (fields) => {
      let currentTable = null;
      let condition = null;
      let limitNum = null;
      let orders = [];
      const joins = [];
      const queryBuilder = {
        from: (table) => {
          currentTable = table;
          return queryBuilder;
        },
        innerJoin: (joinTable, onCond) => {
          joins.push({ table: joinTable, on: onCond });
          return queryBuilder;
        },
        where: (cond) => {
          condition = cond;
          return queryBuilder;
        },
        orderBy: (...orderList) => {
          orders = orderList;
          return queryBuilder;
        },
        limit: (n) => {
          limitNum = n;
          return queryBuilder;
        },
        then: (resolve, reject) => {
          try {
            const tableName = getTableName(currentTable);
            let list = [...store[tableName] || []];
            if (joins.length > 0) {
              const joinedList = [];
              for (const row of list) {
                let matchAll = true;
                const merged = { ...row };
                for (const j of joins) {
                  const jTableName = getTableName(j.table);
                  const jTableRows = store[jTableName] || [];
                  const jCond = extractCondition(j.on);
                  const match = jTableRows.find((jRow) => {
                    if (jCond && jCond.colName) {
                      return jRow.id === row[jCond.colName] || jRow[jCond.colName] === row.id || jRow.id === row.userId || jRow.userId === row.id;
                    }
                    return true;
                  });
                  if (!match) {
                    matchAll = false;
                    break;
                  }
                  Object.assign(merged, match);
                }
                if (matchAll) joinedList.push(merged);
              }
              list = joinedList;
            }
            if (condition) {
              list = list.filter((item) => matchesCondition(item, condition));
            }
            if (orders.length > 0) {
              list.sort((a, b) => {
                const aTime = a.createdAt?.getTime?.() || a.startedAt?.getTime?.() || a.id || 0;
                const bTime = b.createdAt?.getTime?.() || b.startedAt?.getTime?.() || b.id || 0;
                return bTime - aTime;
              });
            }
            if (limitNum !== null) {
              list = list.slice(0, limitNum);
            }
            if (fields && typeof fields === "object" && !Array.isArray(fields)) {
              const fieldKeys = Object.keys(fields);
              list = list.map((item) => {
                const res = {};
                for (const k of fieldKeys) {
                  const colSpec = fields[k];
                  const colName = colSpec?.name || k;
                  res[k] = item[colName] !== void 0 ? item[colName] : item[k];
                }
                return res;
              });
            }
            return Promise.resolve(list).then(resolve, reject);
          } catch (err) {
            if (reject) return Promise.reject(err).catch(reject);
            throw err;
          }
        }
      };
      return queryBuilder;
    },
    insert: (table) => {
      return {
        values: (data) => {
          const tableName = getTableName(table);
          if (!store[tableName]) store[tableName] = [];
          let executed = false;
          const runInsert = (updateSet) => {
            if (executed) return [{ insertId: 0 }];
            executed = true;
            const items = Array.isArray(data) ? data : [data];
            let lastInsertId = 0;
            for (const item of items) {
              const tableItems = store[tableName];
              const existingIdx = tableItems.findIndex((existing) => {
                if (item.openId && existing.openId === item.openId) return true;
                if (item.email && existing.email && item.email.toLowerCase() === existing.email.toLowerCase()) return true;
                if (item.directKey && existing.directKey === item.directKey) return true;
                if (item.conversationId && item.userId && existing.conversationId === item.conversationId && existing.userId === item.userId) return true;
                if (item.id && existing.id === item.id) return true;
                return false;
              });
              if (existingIdx >= 0) {
                if (updateSet && typeof updateSet === "object") {
                  Object.assign(tableItems[existingIdx], updateSet);
                }
                lastInsertId = tableItems[existingIdx].id || 0;
              } else {
                const maxId = tableItems.reduce((max, i) => Math.max(max, Number(i.id) || 0), 0);
                const newItem = {
                  id: item.id || maxId + 1,
                  createdAt: /* @__PURE__ */ new Date(),
                  updatedAt: /* @__PURE__ */ new Date(),
                  ...item
                };
                tableItems.push(newItem);
                lastInsertId = newItem.id;
              }
            }
            persistStore();
            return [{ insertId: lastInsertId }];
          };
          return {
            onDuplicateKeyUpdate: ({ set }) => {
              return Promise.resolve(runInsert(set));
            },
            then: (resolve, reject) => {
              try {
                return Promise.resolve(runInsert()).then(resolve, reject);
              } catch (err) {
                if (reject) return Promise.reject(err).catch(reject);
                throw err;
              }
            }
          };
        }
      };
    },
    update: (table) => {
      let setValues = {};
      return {
        set: (values) => {
          setValues = values;
          return {
            where: (condition) => {
              return {
                then: (resolve, reject) => {
                  try {
                    const tableName = getTableName(table);
                    const list = store[tableName] || [];
                    let affected = 0;
                    for (const item of list) {
                      if (matchesCondition(item, condition)) {
                        Object.assign(item, setValues, { updatedAt: /* @__PURE__ */ new Date() });
                        affected++;
                      }
                    }
                    persistStore();
                    return Promise.resolve([{ affectedRows: affected }]).then(resolve, reject);
                  } catch (err) {
                    if (reject) return Promise.reject(err).catch(reject);
                    throw err;
                  }
                }
              };
            }
          };
        }
      };
    },
    delete: (table) => {
      return {
        where: (condition) => {
          return {
            then: (resolve, reject) => {
              try {
                const tableName = getTableName(table);
                const list = store[tableName] || [];
                const beforeLen = list.length;
                store[tableName] = list.filter((item) => !matchesCondition(item, condition));
                const affected = beforeLen - store[tableName].length;
                persistStore();
                return Promise.resolve([{ affectedRows: affected }]).then(resolve, reject);
              } catch (err) {
                if (reject) return Promise.reject(err).catch(reject);
                throw err;
              }
            }
          };
        }
      };
    }
  };
}

// server/db.ts
var database = null;
var useMockFallback = false;
async function getDb() {
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
async function requireDatabase() {
  const db = await getDb();
  if (!db) return getMockDb();
  return db;
}
async function getUserByOpenId(openId) {
  try {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  } catch (err) {
    console.warn("[Database] getUserByOpenId query failed, falling back to mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();
    const result = await mock.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  }
}
async function getUserByEmail(email) {
  try {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  } catch (err) {
    console.warn("[Database] getUserByEmail query failed, falling back to mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();
    const result = await mock.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required");
  try {
    const db = await getDb();
    const values = {
      openId: user.openId,
      name: user.name ?? "",
      lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date(),
      role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user")
    };
    const updateSet = { lastSignedIn: /* @__PURE__ */ new Date(), lastSeen: /* @__PURE__ */ new Date() };
    for (const field of ["name", "email", "loginMethod"]) {
      if (user[field] != null) {
        values[field] = user[field];
        updateSet[field] = user[field];
      }
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (err) {
    console.warn("[Database] upsertUser failed, using mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();
    await mock.insert(users).values(user).onDuplicateKeyUpdate({ set: { lastSignedIn: /* @__PURE__ */ new Date() } });
  }
}
async function upsertLocalUser(input) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  try {
    const existing = await getUserByEmail(email);
    const db = await getDb();
    if (existing) {
      await db.update(users).set({ name, ...input.nickname ? { nickname: input.nickname } : {}, lastSignedIn: /* @__PURE__ */ new Date(), lastSeen: /* @__PURE__ */ new Date(), loginMethod: "commercial-auth" }).where(eq(users.id, existing.id));
      const refreshed = await getUserByEmail(email);
      return refreshed || existing;
    }
    const openId = `local_${crypto2.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    const now = /* @__PURE__ */ new Date();
    await db.insert(users).values({ openId, name, nickname: input.nickname || null, email, loginMethod: "commercial-auth", lastSignedIn: now, lastSeen: now }).onDuplicateKeyUpdate({ set: { name, ...input.nickname ? { nickname: input.nickname } : {}, lastSignedIn: now, lastSeen: now, loginMethod: "commercial-auth" } });
    try {
      const createdUser = await getUserByOpenId(openId);
      if (createdUser) {
        const groups = await db.select().from(conversations).where(eq(conversations.type, "group")).limit(1);
        if (groups[0]) {
          await db.insert(conversationMembers).values({ conversationId: groups[0].id, userId: createdUser.id, memberRole: "member", joinedAt: now }).onDuplicateKeyUpdate({ set: { joinedAt: now } });
        }
      }
    } catch (_) {
    }
    const user = await getUserByOpenId(openId);
    if (!user) throw new Error("Local user could not be created");
    return user;
  } catch (err) {
    console.warn("[Database] upsertLocalUser failed, falling back to mockDb:", err?.message || err);
    useMockFallback = true;
    const mock = getMockDb();
    const existing = await mock.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) {
      await mock.update(users).set({ name, ...input.nickname ? { nickname: input.nickname } : {}, lastSignedIn: /* @__PURE__ */ new Date() }).where(eq(users.id, existing[0].id));
      return { ...existing[0], name, ...input.nickname ? { nickname: input.nickname } : {} };
    }
    const openId = `local_${crypto2.createHash("sha256").update(email).digest("hex").slice(0, 58)}`;
    await mock.insert(users).values({ openId, name, nickname: input.nickname || null, email, loginMethod: "commercial-auth", lastSignedIn: /* @__PURE__ */ new Date(), lastSeen: /* @__PURE__ */ new Date() });
    const user = await mock.select().from(users).where(eq(users.openId, openId)).limit(1);
    return user[0];
  }
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const isHttps = isSecureRequest(req) || process.env.NODE_ENV === "production";
  return {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: isHttps
  };
}

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
        appId: ENV.appId || "chatforall",
        name: options.name || "Usu\xE1rio"
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
      appId: payload.appId || "chatforall",
      name: payload.name || "Usu\xE1rio"
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
        console.warn("[Auth] Session payload missing openId");
        return null;
      }
      return {
        openId: String(openId),
        appId: typeof appId === "string" && appId ? appId : "chatforall",
        name: typeof name === "string" ? name : "Usu\xE1rio"
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
    let sessionToken;
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    }
    if (!sessionToken) {
      const cookies = this.parseCookies(req.headers.cookie);
      sessionToken = cookies.get(COOKIE_NAME);
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

// server/storage.ts
import fs2 from "fs";
import path2 from "path";
var IS_VERCEL2 = !!process.env.VERCEL;
var MEDIA_DIR = IS_VERCEL2 ? "/tmp/media" : path2.resolve(process.cwd(), "server", "data", "media");
function saveLocalMedia(key, buffer) {
  const filePath = path2.join(MEDIA_DIR, key);
  const dir = path2.dirname(filePath);
  if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(filePath, buffer);
}
function getLocalMediaPath(key) {
  const filePath = path2.join(MEDIA_DIR, key);
  if (fs2.existsSync(filePath)) return filePath;
  return null;
}
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
  const key = appendHashSuffix(normalizeKey(relKey));
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  try {
    saveLocalMedia(key, buffer);
  } catch (err) {
    console.warn("[storage] Failed to save local media:", err);
  }
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    try {
      const { forgeUrl, forgeKey } = getForgeConfig();
      const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
      presignUrl.searchParams.set("path", key);
      const presignResp = await fetch(presignUrl, {
        headers: { Authorization: `Bearer ${forgeKey}` }
      });
      if (presignResp.ok) {
        const { url: s3Url } = await presignResp.json();
        if (s3Url) {
          const blob = new Blob([buffer], { type: contentType });
          await fetch(s3Url, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: blob
          });
        }
      } else {
        console.warn("[storage] Forge presign skipped:", presignResp.status);
      }
    } catch (err) {
      console.warn("[storage] Remote upload skipped, using local media:", err);
    }
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    try {
      const localPath = getLocalMediaPath(key);
      if (localPath) {
        res.sendFile(localPath);
        return;
      }
    } catch (err) {
      console.warn("[StorageProxy] local read error:", err);
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(404).send("File not found");
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
        res.status(404).send("File not found on storage");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(404).send("Empty signed URL from backend");
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
import { eq as eq6 } from "drizzle-orm";
import { TRPCError as TRPCError7 } from "@trpc/server";
import { z as z6 } from "zod";

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

// server/routers/calls.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { and, desc, eq as eq2, gt, inArray, or } from "drizzle-orm";
import { z as z2 } from "zod";

// server/realtime.ts
var subscribers = /* @__PURE__ */ new Set();
function subscribeRealtime(userId, send) {
  const subscriber = { userId, send };
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}
function publishRealtime(userIds, event) {
  const audience = new Set(userIds);
  subscribers.forEach((subscriber) => {
    if (audience.has(subscriber.userId)) {
      try {
        subscriber.send({ ...event, at: Date.now() });
      } catch {
        subscribers.delete(subscriber);
      }
    }
  });
}

// server/routers/calls.ts
async function callWithAccess(callId, userId) {
  const db = await requireDatabase();
  const found = await db.select().from(calls).where(eq2(calls.id, callId)).limit(1);
  const call = found[0];
  if (!call) throw new TRPCError3({ code: "NOT_FOUND", message: "Chamada n\xE3o encontrada." });
  if (call.callerId !== userId && call.receiverId !== userId) throw new TRPCError3({ code: "FORBIDDEN", message: "Voc\xEA n\xE3o participa desta chamada." });
  return { db, call };
}
var callsRouter = router({
  start: protectedProcedure.input(z2.object({ conversationId: z2.number().int().positive(), type: z2.enum(["audio", "video"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq2(conversationMembers.conversationId, input.conversationId));
    if (!members.some((member) => member.userId === ctx.user.id)) throw new TRPCError3({ code: "FORBIDDEN" });
    if (members.length !== 2) throw new TRPCError3({ code: "BAD_REQUEST", message: "As chamadas individuais requerem dois participantes." });
    const receiverId = members.find((member) => member.userId !== ctx.user.id)?.userId;
    if (!receiverId) throw new TRPCError3({ code: "BAD_REQUEST" });
    const busy = await db.select({ id: calls.id }).from(calls).where(and(inArray(calls.status, ["ringing", "connecting", "active"]), or(eq2(calls.callerId, receiverId), eq2(calls.receiverId, receiverId)))).limit(1);
    if (busy[0]) throw new TRPCError3({ code: "CONFLICT", message: "Esta pessoa j\xE1 est\xE1 em outra chamada." });
    const created = await db.insert(calls).values({ conversationId: input.conversationId, callerId: ctx.user.id, receiverId, type: input.type, status: "ringing" });
    const callId = Number(created[0].insertId);
    publishRealtime([ctx.user.id, receiverId], { type: "call", callId });
    return { callId, receiverId };
  }),
  pending: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const current = await db.select({
      id: calls.id,
      conversationId: calls.conversationId,
      callerId: calls.callerId,
      receiverId: calls.receiverId,
      type: calls.type,
      status: calls.status,
      startedAt: calls.startedAt,
      answeredAt: calls.answeredAt,
      callerName: users.name,
      callerAvatar: users.avatarUrl
    }).from(calls).innerJoin(users, eq2(calls.callerId, users.id)).where(and(or(eq2(calls.callerId, ctx.user.id), eq2(calls.receiverId, ctx.user.id)), inArray(calls.status, ["ringing", "connecting", "active"]))).orderBy(desc(calls.startedAt)).limit(1);
    return current[0] ?? null;
  }),
  respond: protectedProcedure.input(z2.object({ callId: z2.number().int().positive(), accept: z2.boolean() })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (call.receiverId !== ctx.user.id) throw new TRPCError3({ code: "FORBIDDEN", message: "Somente o destinat\xE1rio pode responder." });
    if (call.status !== "ringing") throw new TRPCError3({ code: "CONFLICT", message: "Esta chamada n\xE3o est\xE1 mais aguardando resposta." });
    if (!input.accept) {
      await db.update(calls).set({ status: "declined", endedAt: /* @__PURE__ */ new Date() }).where(eq2(calls.id, call.id));
      publishRealtime([call.callerId, call.receiverId], { type: "call", callId: call.id });
      return { status: "declined" };
    }
    await db.update(calls).set({ status: "connecting", answeredAt: /* @__PURE__ */ new Date() }).where(eq2(calls.id, call.id));
    publishRealtime([call.callerId, call.receiverId], { type: "call", callId: call.id });
    return { status: "connecting" };
  }),
  setActive: protectedProcedure.input(z2.object({ callId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (!["ringing", "connecting"].includes(call.status)) return { status: call.status };
    await db.update(calls).set({ status: "active", answeredAt: call.answeredAt ?? /* @__PURE__ */ new Date() }).where(eq2(calls.id, call.id));
    return { status: "active" };
  }),
  end: protectedProcedure.input(z2.object({ callId: z2.number().int().positive(), reason: z2.enum(["ended", "missed", "failed"]).default("ended") })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (["ended", "declined", "missed", "failed"].includes(call.status)) return { success: true };
    const endedAt = /* @__PURE__ */ new Date();
    const reference = call.answeredAt ?? call.startedAt;
    const duration = Math.max(0, Math.round((endedAt.getTime() - reference.getTime()) / 1e3));
    await db.update(calls).set({ status: input.reason, endedAt, duration }).where(eq2(calls.id, call.id));
    publishRealtime([call.callerId, call.receiverId], { type: "call", callId: call.id });
    return { success: true };
  }),
  signal: protectedProcedure.input(z2.object({ callId: z2.number().int().positive(), kind: z2.enum(["offer", "answer", "candidate", "hangup"]), payload: z2.string().min(1).max(32e3) })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (["ended", "declined", "missed", "failed"].includes(call.status)) throw new TRPCError3({ code: "BAD_REQUEST", message: "A chamada j\xE1 foi encerrada." });
    const receiverId = call.callerId === ctx.user.id ? call.receiverId : call.callerId;
    await db.insert(callSignals).values({ callId: input.callId, senderId: ctx.user.id, receiverId, kind: input.kind, payload: input.payload });
    return { success: true };
  }),
  signals: protectedProcedure.input(z2.object({ callId: z2.number().int().positive(), afterId: z2.number().int().nonnegative().default(0) })).query(async ({ ctx, input }) => {
    const { db } = await callWithAccess(input.callId, ctx.user.id);
    return db.select({ id: callSignals.id, kind: callSignals.kind, payload: callSignals.payload, createdAt: callSignals.createdAt }).from(callSignals).where(and(eq2(callSignals.callId, input.callId), eq2(callSignals.receiverId, ctx.user.id), gt(callSignals.id, input.afterId))).orderBy(callSignals.id).limit(50);
  }),
  history: protectedProcedure.input(z2.object({ conversationId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const allowed = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and(eq2(conversationMembers.conversationId, input.conversationId), eq2(conversationMembers.userId, ctx.user.id))).limit(1);
    if (!allowed[0]) throw new TRPCError3({ code: "FORBIDDEN" });
    return db.select().from(calls).where(eq2(calls.conversationId, input.conversationId)).orderBy(desc(calls.startedAt)).limit(30);
  })
});

// server/routers/groups.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { and as and2, asc, eq as eq3, inArray as inArray2 } from "drizzle-orm";
import { z as z3 } from "zod";
async function membership(conversationId, userId) {
  const db = await requireDatabase();
  const result = await db.select({ role: conversationMembers.memberRole }).from(conversationMembers).where(and2(eq3(conversationMembers.conversationId, conversationId), eq3(conversationMembers.userId, userId))).limit(1);
  if (!result[0]) throw new TRPCError4({ code: "FORBIDDEN", message: "Voc\xEA n\xE3o participa deste grupo." });
  return { db, role: result[0].role };
}
var groupsRouter = router({
  create: protectedProcedure.input(z3.object({ title: z3.string().trim().min(2).max(160), memberIds: z3.array(z3.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const uniqueIds = Array.from(/* @__PURE__ */ new Set([ctx.user.id, ...input.memberIds])).filter((id) => id !== ctx.user.id);
    const people = await db.select({ id: users.id }).from(users).where(inArray2(users.id, uniqueIds));
    if (people.length !== uniqueIds.length) throw new TRPCError4({ code: "NOT_FOUND", message: "Uma ou mais pessoas n\xE3o foram encontradas." });
    const created = await db.insert(conversations).values({ type: "group", title: input.title, groupOwnerId: ctx.user.id });
    const conversationId = Number(created[0].insertId);
    await db.insert(conversationMembers).values([
      { conversationId, userId: ctx.user.id, memberRole: "admin", lastReadAt: /* @__PURE__ */ new Date() },
      ...uniqueIds.map((userId) => ({ conversationId, userId, memberRole: "member" }))
    ]);
    publishRealtime([ctx.user.id, ...uniqueIds], { type: "conversation", conversationId });
    return { conversationId };
  }),
  members: protectedProcedure.input(z3.object({ conversationId: z3.number().int().positive() })).query(async ({ ctx, input }) => {
    const { db } = await membership(input.conversationId, ctx.user.id);
    return db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, status: users.status, role: conversationMembers.memberRole, joinedAt: conversationMembers.joinedAt }).from(conversationMembers).innerJoin(users, eq3(conversationMembers.userId, users.id)).where(eq3(conversationMembers.conversationId, input.conversationId)).orderBy(asc(conversationMembers.joinedAt));
  }),
  addMembers: protectedProcedure.input(z3.object({ conversationId: z3.number().int().positive(), userIds: z3.array(z3.number().int().positive()).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const { db, role } = await membership(input.conversationId, ctx.user.id);
    if (role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Apenas administradores podem adicionar pessoas." });
    const existing = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq3(conversationMembers.conversationId, input.conversationId));
    const existingIds = new Set(existing.map((row) => row.userId));
    const candidates = Array.from(new Set(input.userIds)).filter((id) => !existingIds.has(id));
    if (!candidates.length) return { added: 0 };
    const people = await db.select({ id: users.id }).from(users).where(inArray2(users.id, candidates));
    if (people.length !== candidates.length) throw new TRPCError4({ code: "NOT_FOUND", message: "Uma ou mais pessoas n\xE3o foram encontradas." });
    await db.insert(conversationMembers).values(candidates.map((userId) => ({ conversationId: input.conversationId, userId, memberRole: "member" })));
    await db.update(conversations).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq3(conversations.id, input.conversationId));
    publishRealtime([ctx.user.id, ...candidates], { type: "conversation", conversationId: input.conversationId });
    return { added: candidates.length };
  }),
  removeMember: protectedProcedure.input(z3.object({ conversationId: z3.number().int().positive(), userId: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, role } = await membership(input.conversationId, ctx.user.id);
    if (role !== "admin" && input.userId !== ctx.user.id) throw new TRPCError4({ code: "FORBIDDEN", message: "Apenas administradores podem remover membros." });
    const group = await db.select({ type: conversations.type, groupOwnerId: conversations.groupOwnerId }).from(conversations).where(eq3(conversations.id, input.conversationId)).limit(1);
    if (!group[0] || group[0].type !== "group") throw new TRPCError4({ code: "BAD_REQUEST", message: "Esta conversa n\xE3o \xE9 um grupo." });
    if (group[0].groupOwnerId === input.userId) throw new TRPCError4({ code: "BAD_REQUEST", message: "O administrador principal n\xE3o pode sair sem transferir a administra\xE7\xE3o." });
    await db.delete(conversationMembers).where(and2(eq3(conversationMembers.conversationId, input.conversationId), eq3(conversationMembers.userId, input.userId)));
    return { success: true };
  }),
  rename: protectedProcedure.input(z3.object({ conversationId: z3.number().int().positive(), title: z3.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    const { db, role } = await membership(input.conversationId, ctx.user.id);
    if (role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Apenas administradores podem renomear o grupo." });
    await db.update(conversations).set({ title: input.title, updatedAt: /* @__PURE__ */ new Date() }).where(eq3(conversations.id, input.conversationId));
    return { success: true };
  })
});

// server/routers/messaging.ts
import { TRPCError as TRPCError5 } from "@trpc/server";
import { and as and3, desc as desc2, eq as eq4, gt as gt2, inArray as inArray3, isNull, lt, ne as ne3, sql } from "drizzle-orm";
import { z as z4 } from "zod";

// server/media.ts
import { nanoid } from "nanoid";
var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
var MAX_AUDIO_BYTES = 12 * 1024 * 1024;
var MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
var imageTypes = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
var audioTypes = /* @__PURE__ */ new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"]);
var documentTypes = /* @__PURE__ */ new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "text/plain", "text/csv"]);
function normalizeMimeType(rawMimeType) {
  return rawMimeType.toLowerCase().split(";", 1)[0] || rawMimeType;
}
function parseMediaDataUrl(dataUrl) {
  const match = /^data:([^,]+),([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de arquivo inv\xE1lido.");
  const [, metadata, base64] = match;
  if (!metadata.toLowerCase().split(";").includes("base64")) throw new Error("Formato de arquivo inv\xE1lido.");
  const rawMimeType = metadata.split(";", 1)[0] || "application/octet-stream";
  return { mimeType: normalizeMimeType(rawMimeType), base64 };
}
function extensionFor(mimeType) {
  const mapped = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv"
  };
  return mapped[mimeType] ?? "bin";
}
async function storeMedia(input) {
  const { mimeType, base64 } = parseMediaDataUrl(input.dataUrl);
  const allowed = input.kind === "audio" ? audioTypes : input.kind === "file" ? documentTypes : imageTypes;
  const maxBytes = input.kind === "audio" ? MAX_AUDIO_BYTES : input.kind === "file" ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
  if (!allowed.has(mimeType)) throw new Error("Tipo de arquivo n\xE3o permitido.");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > maxBytes) {
    throw new Error(`O arquivo excede o limite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  const prefix = input.kind === "avatar" ? "avatars" : input.kind === "audio" ? "audio" : input.kind === "file" ? "documents" : "images";
  const safeName = `${nanoid(20)}.${extensionFor(mimeType)}`;
  const { key, url } = await storagePut(`chatforall/${prefix}/${input.userId}/${safeName}`, buffer, mimeType);
  return {
    key,
    url,
    fileName: (input.originalName || safeName).replace(/[\\/<>:"|?*\u0000-\u001F]/g, "_").slice(0, 120),
    mimeType,
    fileSize: buffer.length
  };
}

// server/routers/messaging.ts
var pageInput = z4.object({ conversationId: z4.number().int().positive(), cursor: z4.coerce.date().optional() });
var mediaInput = z4.object({
  kind: z4.enum(["image", "audio", "file"]),
  dataUrl: z4.string().max(18e6),
  name: z4.string().max(120).optional(),
  duration: z4.number().int().min(0).max(60 * 60).optional()
});
async function assertMember(conversationId, userId) {
  const db = await requireDatabase();
  const result = await db.select({ conversationId: conversationMembers.conversationId }).from(conversationMembers).where(and3(eq4(conversationMembers.conversationId, conversationId), eq4(conversationMembers.userId, userId))).limit(1);
  if (!result[0]) {
    const conv = await db.select({ id: conversations.id, type: conversations.type, directKey: conversations.directKey }).from(conversations).where(eq4(conversations.id, conversationId)).limit(1);
    if (conv[0] && conv[0].type === "direct" && conv[0].directKey) {
      const allowedIds = conv[0].directKey.split(":").map(Number);
      if (allowedIds.includes(userId)) {
        try {
          await db.insert(conversationMembers).values({
            conversationId,
            userId,
            lastReadAt: /* @__PURE__ */ new Date()
          });
        } catch (_) {
        }
        return db;
      }
    }
    throw new TRPCError5({ code: "FORBIDDEN", message: "Voc\xEA n\xE3o tem acesso a esta conversa." });
  }
  return db;
}
async function recipientIds(conversationId, userId) {
  const db = await requireDatabase();
  const rows = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and3(eq4(conversationMembers.conversationId, conversationId), ne3(conversationMembers.userId, userId)));
  if (!rows.length) {
    const conv = await db.select({ type: conversations.type, directKey: conversations.directKey }).from(conversations).where(eq4(conversations.id, conversationId)).limit(1);
    if (conv[0] && conv[0].type === "direct" && conv[0].directKey) {
      const ids = conv[0].directKey.split(":").map(Number);
      const otherId = ids.find((id) => id !== userId);
      if (otherId) {
        try {
          await db.insert(conversationMembers).values({
            conversationId,
            userId: otherId
          });
        } catch (_) {
        }
        return [otherId];
      }
    }
    throw new TRPCError5({ code: "BAD_REQUEST", message: "A conversa precisa ter outro participante." });
  }
  return rows.map((row) => row.userId);
}
function online(lastSeen) {
  return Date.now() - lastSeen.getTime() < 7e4;
}
var messagingRouter = router({
  createDirect: protectedProcedure.input(z4.object({ userId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError5({ code: "BAD_REQUEST", message: "Escolha outra pessoa para conversar." });
    const db = await requireDatabase();
    const other = await db.select({ id: users.id }).from(users).where(eq4(users.id, input.userId)).limit(1);
    if (!other[0]) throw new TRPCError5({ code: "NOT_FOUND", message: "Pessoa n\xE3o encontrada." });
    const directKey = [ctx.user.id, input.userId].sort((a, b) => a - b).join(":");
    const existing = await db.select({ id: conversations.id }).from(conversations).where(eq4(conversations.directKey, directKey)).limit(1);
    if (existing[0]) {
      const convId = existing[0].id;
      const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq4(conversationMembers.conversationId, convId));
      const memberIds = new Set(members.map((m) => m.userId));
      const missing = [];
      if (!memberIds.has(ctx.user.id)) {
        missing.push({ conversationId: convId, userId: ctx.user.id, lastReadAt: /* @__PURE__ */ new Date() });
      }
      if (!memberIds.has(input.userId)) {
        missing.push({ conversationId: convId, userId: input.userId });
      }
      if (missing.length > 0) {
        try {
          await db.insert(conversationMembers).values(missing);
        } catch (_) {
        }
      }
      try {
        await db.delete(hiddenContacts).where(
          and3(eq4(hiddenContacts.userId, ctx.user.id), eq4(hiddenContacts.targetUserId, input.userId))
        );
      } catch (_) {
      }
      return { conversationId: convId, created: false };
    }
    try {
      const created = await db.insert(conversations).values({ type: "direct", directKey });
      const conversationId = Number(created[0].insertId);
      await db.insert(conversationMembers).values([
        { conversationId, userId: ctx.user.id, lastReadAt: /* @__PURE__ */ new Date() },
        { conversationId, userId: input.userId }
      ]);
      return { conversationId, created: true };
    } catch (error) {
      const concurrent = await db.select({ id: conversations.id }).from(conversations).where(eq4(conversations.directKey, directKey)).limit(1);
      if (concurrent[0]) return { conversationId: concurrent[0].id, created: false };
      throw error;
    }
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const memberships = await db.select({ id: conversations.id, type: conversations.type, title: conversations.title, updatedAt: conversations.updatedAt, lastReadAt: conversationMembers.lastReadAt }).from(conversationMembers).innerJoin(conversations, eq4(conversationMembers.conversationId, conversations.id)).where(eq4(conversationMembers.userId, ctx.user.id)).orderBy(desc2(conversations.updatedAt));
    return Promise.all(memberships.map(async (conversation) => {
      const partner = await db.select({ id: users.id, name: users.name, nickname: users.nickname, email: users.email, avatarUrl: users.avatarUrl, status: users.status, lastSeen: users.lastSeen }).from(conversationMembers).innerJoin(users, eq4(conversationMembers.userId, users.id)).where(and3(eq4(conversationMembers.conversationId, conversation.id), ne3(users.id, ctx.user.id))).limit(1);
      const latest = await db.select({ id: messages.id, content: messages.content, messageType: messages.messageType, createdAt: messages.createdAt, senderId: messages.senderId, deletedAt: messages.deletedAt }).from(messages).where(eq4(messages.conversationId, conversation.id)).orderBy(desc2(messages.createdAt)).limit(1);
      const unread = await db.select({ count: sql`count(*)` }).from(messages).where(and3(
        eq4(messages.conversationId, conversation.id),
        ne3(messages.senderId, ctx.user.id),
        isNull(messages.deletedAt),
        conversation.lastReadAt ? gt2(messages.createdAt, conversation.lastReadAt) : sql`1 = 1`
      ));
      const person = partner[0];
      const muteRecord = await db.select({ mutedUntil: mutedConversations.mutedUntil }).from(mutedConversations).where(and3(eq4(mutedConversations.userId, ctx.user.id), eq4(mutedConversations.conversationId, conversation.id))).limit(1);
      const isMuted = Boolean(muteRecord[0] && (!muteRecord[0].mutedUntil || muteRecord[0].mutedUntil > /* @__PURE__ */ new Date()));
      const blockRecord = person ? await db.select({ blockedUserId: blockedUsers.blockedUserId }).from(blockedUsers).where(and3(eq4(blockedUsers.userId, ctx.user.id), eq4(blockedUsers.blockedUserId, person.id))).limit(1) : [];
      const isBlocked = Boolean(blockRecord[0]);
      return {
        ...conversation,
        participant: person ? { ...person, online: online(person.lastSeen) } : null,
        latestMessage: latest[0] ?? null,
        unreadCount: Number(unread[0]?.count ?? 0),
        isMuted,
        isBlocked
      };
    }));
  }),
  deleteConversation: protectedProcedure.input(z4.object({ conversationId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    await db.delete(conversationMembers).where(
      and3(eq4(conversationMembers.conversationId, input.conversationId), eq4(conversationMembers.userId, ctx.user.id))
    );
    const remaining = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq4(conversationMembers.conversationId, input.conversationId));
    if (!remaining.length) {
      await db.delete(conversations).where(eq4(conversations.id, input.conversationId));
    }
    return { success: true };
  }),
  muteConversation: protectedProcedure.input(z4.object({ conversationId: z4.number().int().positive(), durationHours: z4.number().optional() })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const mutedUntil = input.durationHours ? new Date(Date.now() + input.durationHours * 3600 * 1e3) : null;
    await db.insert(mutedConversations).values({
      userId: ctx.user.id,
      conversationId: input.conversationId,
      mutedUntil
    }).onDuplicateKeyUpdate({ set: { mutedUntil } });
    return { success: true };
  }),
  unmuteConversation: protectedProcedure.input(z4.object({ conversationId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    await db.delete(mutedConversations).where(
      and3(eq4(mutedConversations.conversationId, input.conversationId), eq4(mutedConversations.userId, ctx.user.id))
    );
    return { success: true };
  }),
  blockContact: protectedProcedure.input(z4.object({ userId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.insert(blockedUsers).values({
      userId: ctx.user.id,
      blockedUserId: input.userId
    }).onDuplicateKeyUpdate({ set: { createdAt: /* @__PURE__ */ new Date() } });
    return { success: true };
  }),
  unblockContact: protectedProcedure.input(z4.object({ userId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.delete(blockedUsers).where(
      and3(eq4(blockedUsers.userId, ctx.user.id), eq4(blockedUsers.blockedUserId, input.userId))
    );
    return { success: true };
  }),
  history: protectedProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const recipients = await recipientIds(input.conversationId, ctx.user.id);
    const partnerId = recipients[0];
    const entries = await db.select({
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
      senderName: users.name
    }).from(messages).innerJoin(users, eq4(messages.senderId, users.id)).leftJoin(messageDeletions, and3(eq4(messageDeletions.messageId, messages.id), eq4(messageDeletions.userId, ctx.user.id))).where(and3(
      eq4(messages.conversationId, input.conversationId),
      isNull(messageDeletions.messageId),
      input.cursor ? lt(messages.createdAt, input.cursor) : sql`1 = 1`
    )).orderBy(desc2(messages.createdAt)).limit(40);
    const ids = entries.map((message) => message.id);
    const statuses = ids.length ? await db.select({ messageId: messageStatuses.messageId, status: messageStatuses.status }).from(messageStatuses).where(and3(inArray3(messageStatuses.messageId, ids), eq4(messageStatuses.userId, partnerId))) : [];
    const statusByMessage = new Map(statuses.map((item) => [item.messageId, item.status]));
    return {
      messages: entries.reverse().map((message) => ({ ...message, receiptStatus: statusByMessage.get(message.id) ?? "sent" })),
      nextCursor: entries.length === 40 ? entries[entries.length - 1]?.createdAt : null
    };
  }),
  send: protectedProcedure.input(z4.object({
    conversationId: z4.number().int().positive(),
    content: z4.string().max(5e3).optional(),
    replyToId: z4.number().int().positive().optional(),
    media: mediaInput.optional()
  })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const text2 = input.content?.trim() || null;
    if (!text2 && !input.media) throw new TRPCError5({ code: "BAD_REQUEST", message: "Escreva uma mensagem ou adicione uma m\xEDdia." });
    const recipients = await recipientIds(input.conversationId, ctx.user.id);
    if (input.replyToId) {
      const reply = await db.select({ id: messages.id }).from(messages).where(and3(eq4(messages.id, input.replyToId), eq4(messages.conversationId, input.conversationId))).limit(1);
      if (!reply[0]) throw new TRPCError5({ code: "BAD_REQUEST", message: "A mensagem respondida n\xE3o pertence a esta conversa." });
    }
    const uploaded = input.media ? await storeMedia({ userId: ctx.user.id, dataUrl: input.media.dataUrl, originalName: input.media.name, kind: input.media.kind }) : null;
    const inserted = await db.insert(messages).values({
      conversationId: input.conversationId,
      senderId: ctx.user.id,
      messageType: input.media?.kind === "image" ? "image" : input.media?.kind === "audio" ? "audio" : input.media?.kind === "file" ? "file" : "text",
      content: text2,
      fileKey: uploaded?.key,
      fileUrl: uploaded?.url,
      fileName: uploaded?.fileName,
      fileSize: uploaded?.fileSize,
      mimeType: uploaded?.mimeType,
      duration: input.media?.duration,
      replyToId: input.replyToId
    });
    const messageId = Number(inserted[0].insertId);
    try {
      await db.insert(messageStatuses).values(recipients.map((userId) => ({ messageId, userId, status: "sent" })));
    } catch (_) {
    }
    await db.update(conversations).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq4(conversations.id, input.conversationId));
    publishRealtime([ctx.user.id, ...recipients], { type: "message", conversationId: input.conversationId });
    return { messageId, createdAt: /* @__PURE__ */ new Date() };
  }),
  acknowledge: protectedProcedure.input(z4.object({ conversationId: z4.number().int().positive(), read: z4.boolean().default(true) })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const incoming = await db.select({ id: messages.id }).from(messages).where(and3(eq4(messages.conversationId, input.conversationId), ne3(messages.senderId, ctx.user.id), isNull(messages.deletedAt)));
    if (incoming.length) {
      await db.update(messageStatuses).set({ status: input.read ? "read" : "delivered", timestamp: /* @__PURE__ */ new Date() }).where(and3(inArray3(messageStatuses.messageId, incoming.map((item) => item.id)), eq4(messageStatuses.userId, ctx.user.id)));
    }
    if (input.read) await db.update(conversationMembers).set({ lastReadAt: /* @__PURE__ */ new Date() }).where(and3(eq4(conversationMembers.conversationId, input.conversationId), eq4(conversationMembers.userId, ctx.user.id)));
    return { success: true };
  }),
  setTyping: protectedProcedure.input(z4.object({ conversationId: z4.number().int().positive(), active: z4.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    if (!input.active) {
      await db.delete(typingStates).where(and3(eq4(typingStates.conversationId, input.conversationId), eq4(typingStates.userId, ctx.user.id)));
      return { success: true };
    }
    await db.insert(typingStates).values({
      conversationId: input.conversationId,
      userId: ctx.user.id,
      updatedAt: /* @__PURE__ */ new Date()
    }).onDuplicateKeyUpdate({ set: { updatedAt: /* @__PURE__ */ new Date() } });
    return { success: true };
  }),
  typing: protectedProcedure.input(z4.object({ conversationId: z4.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await assertMember(input.conversationId, ctx.user.id);
    const rows = await db.select({ userId: typingStates.userId, name: users.name, updatedAt: typingStates.updatedAt }).from(typingStates).innerJoin(users, eq4(typingStates.userId, users.id)).where(and3(
      eq4(typingStates.conversationId, input.conversationId),
      ne3(typingStates.userId, ctx.user.id),
      gt2(typingStates.updatedAt, new Date(Date.now() - 5e3))
    ));
    return rows.map((item) => ({ userId: item.userId, name: item.name || "Algu\xE9m" }));
  }),
  deleteForMe: protectedProcedure.input(z4.object({ messageId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const target = await db.select({ conversationId: messages.conversationId }).from(messages).where(eq4(messages.id, input.messageId)).limit(1);
    if (!target[0]) throw new TRPCError5({ code: "NOT_FOUND", message: "Mensagem n\xE3o encontrada." });
    await assertMember(target[0].conversationId, ctx.user.id);
    await db.insert(messageDeletions).values({ messageId: input.messageId, userId: ctx.user.id });
    return { success: true };
  }),
  deleteForEveryone: protectedProcedure.input(z4.object({ messageId: z4.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const target = await db.select({ conversationId: messages.conversationId, senderId: messages.senderId }).from(messages).where(eq4(messages.id, input.messageId)).limit(1);
    if (!target[0]) throw new TRPCError5({ code: "NOT_FOUND", message: "Mensagem n\xE3o encontrada." });
    if (target[0].senderId !== ctx.user.id) throw new TRPCError5({ code: "FORBIDDEN", message: "Voc\xEA s\xF3 pode apagar mensagens enviadas por voc\xEA." });
    await assertMember(target[0].conversationId, ctx.user.id);
    await db.update(messages).set({ deletedAt: /* @__PURE__ */ new Date(), content: null, fileKey: null, fileUrl: null }).where(eq4(messages.id, input.messageId));
    publishRealtime([ctx.user.id], { type: "message", conversationId: target[0].conversationId });
    return { success: true };
  })
});

// server/routers/profile.ts
import { and as and4, desc as desc3, eq as eq5, like, ne as ne4, or as or2 } from "drizzle-orm";
import { TRPCError as TRPCError6 } from "@trpc/server";
import { z as z5 } from "zod";
var profileInput = z5.object({
  name: z5.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(120),
  email: z5.string().trim().toLowerCase().email("Informe um e-mail v\xE1lido.").max(320),
  status: z5.string().trim().max(280).optional(),
  nickname: z5.string().trim().optional()
});
function isOnline(lastSeen) {
  return Date.now() - lastSeen.getTime() < 7e4;
}
var profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const result = await db.select().from(users).where(eq5(users.id, ctx.user.id)).limit(1);
    const profile = result[0];
    if (!profile) throw new TRPCError6({ code: "NOT_FOUND" });
    return { ...profile, online: isOnline(profile.lastSeen), isComplete: Boolean(profile.name && profile.email) };
  }),
  update: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    let formattedNick = void 0;
    if (input.nickname !== void 0) {
      const clean = input.nickname.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean) {
        formattedNick = `@${clean}`;
        const existing = await db.select({ id: users.id, email: users.email }).from(users).where(eq5(users.nickname, formattedNick)).limit(1);
        if (existing[0] && existing[0].id !== ctx.user.id) {
          const suggestions = [`${formattedNick}1`, `${formattedNick}2026`, `${formattedNick}_`];
          throw new TRPCError6({
            code: "CONFLICT",
            message: `O apelido ${formattedNick} j\xE1 est\xE1 em uso! Que tal ${suggestions.join(" ou ")}?`
          });
        }
      }
    }
    try {
      const updateData = {
        name: input.name,
        email: input.email,
        status: input.status,
        lastSeen: /* @__PURE__ */ new Date()
      };
      if (formattedNick !== void 0) {
        updateData.nickname = formattedNick;
      }
      await db.update(users).set(updateData).where(eq5(users.id, ctx.user.id));
    } catch (error) {
      if (error instanceof TRPCError6) throw error;
      const message = error instanceof Error && /duplicate|unique/i.test(error.message) ? "Este e-mail ou apelido j\xE1 est\xE1 em uso." : "N\xE3o foi poss\xEDvel salvar o perfil.";
      throw new TRPCError6({ code: "CONFLICT", message });
    }
    return { success: true };
  }),
  updateAvatar: protectedProcedure.input(z5.object({ dataUrl: z5.string().max(12e6), name: z5.string().max(120).optional() })).mutation(async ({ ctx, input }) => {
    const uploaded = await storeMedia({ userId: ctx.user.id, dataUrl: input.dataUrl, originalName: input.name, kind: "avatar" });
    const db = await requireDatabase();
    await db.update(users).set({ avatarKey: uploaded.key, avatarUrl: uploaded.url, lastSeen: /* @__PURE__ */ new Date() }).where(eq5(users.id, ctx.user.id));
    return uploaded;
  }),
  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDatabase();
    await db.update(users).set({ avatarKey: null, avatarUrl: null }).where(eq5(users.id, ctx.user.id));
    return { success: true };
  }),
  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDatabase();
    await db.update(users).set({ lastSeen: /* @__PURE__ */ new Date() }).where(eq5(users.id, ctx.user.id));
    return { success: true };
  }),
  deleteContact: protectedProcedure.input(z5.object({ contactId: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.insert(hiddenContacts).values({
      userId: ctx.user.id,
      targetUserId: input.contactId
    }).onDuplicateKeyUpdate({ set: { createdAt: /* @__PURE__ */ new Date() } });
    const directKey = [ctx.user.id, input.contactId].sort((a, b) => a - b).join(":");
    const conv = await db.select({ id: conversations.id }).from(conversations).where(eq5(conversations.directKey, directKey)).limit(1);
    if (conv[0]) {
      await db.delete(conversationMembers).where(
        and4(eq5(conversationMembers.conversationId, conv[0].id), eq5(conversationMembers.userId, ctx.user.id))
      );
    }
    return { success: true };
  }),
  blockContact: protectedProcedure.input(z5.object({ contactId: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.insert(blockedUsers).values({
      userId: ctx.user.id,
      blockedUserId: input.contactId
    }).onDuplicateKeyUpdate({ set: { createdAt: /* @__PURE__ */ new Date() } });
    return { success: true };
  }),
  unblockContact: protectedProcedure.input(z5.object({ contactId: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.delete(blockedUsers).where(
      and4(eq5(blockedUsers.userId, ctx.user.id), eq5(blockedUsers.blockedUserId, input.contactId))
    );
    return { success: true };
  }),
  search: protectedProcedure.input(z5.object({ query: z5.string().trim().max(120).optional().default("") })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const rawQuery = (input.query || "").trim();
    let whereClause = ne4(users.id, ctx.user.id);
    if (rawQuery.length > 0) {
      const cleanTerm = rawQuery.replace(/^@/, "");
      const term = `%${cleanTerm.replace(/[%_\\]/g, "\\$&")}%`;
      const rawTerm = `%${rawQuery.replace(/[%_\\]/g, "\\$&")}%`;
      whereClause = and4(
        ne4(users.id, ctx.user.id),
        or2(
          like(users.name, term),
          like(users.email, term),
          like(users.nickname, term),
          like(users.nickname, rawTerm)
        )
      );
    }
    const results = await db.select({
      id: users.id,
      name: users.name,
      nickname: users.nickname,
      email: users.email,
      avatarUrl: users.avatarUrl,
      status: users.status,
      lastSeen: users.lastSeen
    }).from(users).where(whereClause).orderBy(desc3(users.lastSeen)).limit(50);
    const hidden = await db.select({ targetUserId: hiddenContacts.targetUserId }).from(hiddenContacts).where(eq5(hiddenContacts.userId, ctx.user.id));
    const hiddenIds = new Set(hidden.map((h) => h.targetUserId));
    const blocked = await db.select({ blockedUserId: blockedUsers.blockedUserId }).from(blockedUsers).where(eq5(blockedUsers.userId, ctx.user.id));
    const blockedIds = new Set(blocked.map((b) => b.blockedUserId));
    return results.filter((user) => !hiddenIds.has(user.id)).map((user) => ({
      ...user,
      online: isOnline(user.lastSeen),
      isBlocked: blockedIds.has(user.id)
    }));
  })
});

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    checkNickname: publicProcedure.input(z6.object({ nickname: z6.string().trim(), currentUserId: z6.number().optional() })).mutation(async ({ input }) => {
      const clean = input.nickname.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!clean || clean.length < 2) {
        return { available: false, message: "O apelido deve ter pelo menos 2 caracteres.", suggestions: [] };
      }
      const withAt = `@${clean}`;
      const dbInstance = await requireDatabase();
      const existing = await dbInstance.select({ id: users.id, email: users.email }).from(users).where(eq6(users.nickname, withAt)).limit(1);
      if (existing && existing.length > 0) {
        if (input.currentUserId && existing[0].id === input.currentUserId) {
          return {
            available: true,
            nickname: withAt,
            message: `Este j\xE1 \xE9 o seu apelido atual.`,
            suggestions: []
          };
        }
        const suggestions = [
          `@${clean}1`,
          `@${clean}2026`,
          `@${clean}_`,
          `@${clean}_real`
        ];
        return {
          available: false,
          message: `O apelido ${withAt} j\xE1 est\xE1 em uso.`,
          suggestions
        };
      }
      return {
        available: true,
        nickname: withAt,
        message: `Apelido ${withAt} dispon\xEDvel!`,
        suggestions: []
      };
    }),
    localLogin: publicProcedure.input(z6.object({
      name: z6.string().trim().min(2).max(120),
      email: z6.string().trim().email().max(320),
      familyCode: z6.string().optional(),
      password: z6.string().optional(),
      nickname: z6.string().optional(),
      inviteBy: z6.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      let formattedNick = void 0;
      if (input.nickname) {
        const clean = input.nickname.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (clean) {
          formattedNick = `@${clean}`;
          const dbInstance = await requireDatabase();
          const existing = await dbInstance.select({ id: users.id, email: users.email }).from(users).where(eq6(users.nickname, formattedNick)).limit(1);
          if (existing[0] && existing[0].email?.toLowerCase() !== email) {
            const suggestions = [`${formattedNick}1`, `${formattedNick}2026`, `${formattedNick}_`];
            throw new TRPCError7({
              code: "CONFLICT",
              message: `O apelido ${formattedNick} j\xE1 est\xE1 em uso! Que tal ${suggestions.join(" ou ")}?`
            });
          }
        }
      }
      const user = await upsertLocalUser({ name: input.name, email, nickname: formattedNick });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { user, sessionToken };
    }),
    loginSimple: publicProcedure.input(z6.object({
      name: z6.string().trim().min(2).max(120),
      email: z6.string().trim().email().max(320),
      statusMessage: z6.string().optional(),
      avatarUrl: z6.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const user = await upsertLocalUser({ name: input.name, email: input.email });
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { user, token: sessionToken, sessionToken };
    }),
    resetAllData: publicProcedure.mutation(async () => {
      const dbInstance = await requireDatabase();
      try {
        await dbInstance.delete(callSignals);
      } catch {
      }
      try {
        await dbInstance.delete(calls);
      } catch {
      }
      try {
        await dbInstance.delete(typingStates);
      } catch {
      }
      try {
        await dbInstance.delete(messageStatuses);
      } catch {
      }
      try {
        await dbInstance.delete(messageDeletions);
      } catch {
      }
      try {
        await dbInstance.delete(messages);
      } catch {
      }
      try {
        await dbInstance.delete(conversationMembers);
      } catch {
      }
      try {
        await dbInstance.delete(conversations);
      } catch {
      }
      try {
        await dbInstance.delete(users);
      } catch {
      }
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  profile: profileRouter,
  groups: groupsRouter,
  messaging: messagingRouter,
  calls: callsRouter
});

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

// api/serverless.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.get("/api/calls/ice", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req);
    const sharedSecret = process.env.TURN_SHARED_SECRET;
    const turnServer = process.env.TURN_SERVER;
    if (!sharedSecret || !turnServer) {
      res.json({ servers: [{ urls: process.env.STUN_SERVER || "stun:stun.l.google.com:19302" }] });
      return;
    }
    const username = `${Math.floor(Date.now() / 1e3) + 24 * 3600}:${user.id}`;
    const credential = crypto3.createHmac("sha1", sharedSecret).update(username).digest("base64");
    res.json({
      servers: [
        { urls: process.env.STUN_SERVER || "stun:stun.l.google.com:19302" },
        { urls: `turn:${turnServer}`, username, credential }
      ]
    });
  } catch (error) {
    res.status(401).json({ error: "Unauthorized" });
  }
});
app.get("/api/realtime/stream", async (req, res) => {
  try {
    const user = await sdk.authenticateRequest(req);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const unsubscribe = subscribeRealtime(user.id, (data) => {
      res.write(`data: ${JSON.stringify(data)}

`);
    });
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15e3);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
});
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
var serverless_default = app;
export {
  serverless_default as default
};
