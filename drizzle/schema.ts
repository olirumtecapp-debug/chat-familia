import { index, int, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Authenticated ChatForAll identity. The OAuth subject is managed by Manus;
 * public profile data is completed by the account owner after the first sign-in.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 120 }),
    email: varchar("email", { length: 320 }).unique(),
    avatarKey: varchar("avatarKey", { length: 512 }),
    avatarUrl: varchar("avatarUrl", { length: 1024 }),
    status: varchar("status", { length: 280 }).notNull().default("Disponível"),
    lastSeen: timestamp("lastSeen").defaultNow().notNull(),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [index("users_name_idx").on(table.name)],
);

export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["direct", "group"]).notNull().default("direct"),
    directKey: varchar("directKey", { length: 64 }).unique(),
    title: varchar("title", { length: 160 }),
    groupOwnerId: int("groupOwnerId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("conversations_activity_idx").on(table.updatedAt)],
);

export const conversationMembers = mysqlTable(
  "conversation_members",
  {
    conversationId: int("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberRole: mysqlEnum("memberRole", ["member", "admin"]).notNull().default("member"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    lastReadAt: timestamp("lastReadAt"),
  },
  table => [primaryKey({ columns: [table.conversationId, table.userId] }), index("members_user_idx").on(table.userId)],
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: int("senderId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    deletedAt: timestamp("deletedAt"),
  },
  table => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt), index("messages_sender_idx").on(table.senderId)],
);

export const messageStatuses = mysqlTable(
  "message_status",
  {
    messageId: int("messageId")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["sent", "delivered", "read"]).notNull().default("sent"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  table => [primaryKey({ columns: [table.messageId, table.userId] }), index("status_user_idx").on(table.userId)],
);

/** Keeps "delete for me" choices private without altering another member's history. */
export const messageDeletions = mysqlTable(
  "message_deletions",
  {
    messageId: int("messageId")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deletedAt: timestamp("deletedAt").defaultNow().notNull(),
  },
  table => [primaryKey({ columns: [table.messageId, table.userId] }), index("deletions_user_idx").on(table.userId)],
);

export const calls = mysqlTable(
  "calls",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    callerId: int("callerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: int("receiverId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ["audio", "video"]).notNull(),
    status: mysqlEnum("status", ["ringing", "connecting", "active", "ended", "declined", "missed", "failed"]).notNull().default("ringing"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    answeredAt: timestamp("answeredAt"),
    endedAt: timestamp("endedAt"),
    duration: int("duration").notNull().default(0),
  },
  table => [index("calls_receiver_status_idx").on(table.receiverId, table.status), index("calls_conversation_idx").on(table.conversationId, table.startedAt)],
);

/** Transient WebRTC signaling messages; read acknowledgements remove consumed records. */
export const callSignals = mysqlTable(
  "call_signals",
  {
    id: int("id").autoincrement().primaryKey(),
    callId: int("callId")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    senderId: int("senderId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: int("receiverId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["offer", "answer", "candidate", "hangup"]).notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("signals_receiver_idx").on(table.receiverId, table.createdAt)],
);

export const typingStates = mysqlTable(
  "typing_states",
  {
    conversationId: int("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [primaryKey({ columns: [table.conversationId, table.userId] }), index("typing_expiry_idx").on(table.expiresAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
