import fs from "fs";
import path from "path";

export interface ChatStore {
  users: Array<{
    id: number;
    openId: string;
    name: string;
    email: string | null;
    avatarKey: string | null;
    avatarUrl: string | null;
    status: string;
    lastSeen: Date;
    loginMethod: string | null;
    role: "user" | "admin";
    createdAt: Date;
    updatedAt: Date;
    lastSignedIn: Date;
    passwordHash?: string;
    nickname?: string;
  }>;
  conversations: Array<{
    id: number;
    type: "direct" | "group";
    directKey: string | null;
    title: string | null;
    groupOwnerId: number | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  conversationMembers: Array<{
    conversationId: number;
    userId: number;
    memberRole: "member" | "admin";
    joinedAt: Date;
    lastReadAt: Date | null;
  }>;
  messages: Array<{
    id: number;
    conversationId: number;
    senderId: number;
    messageType: "text" | "image" | "audio" | "file" | "system";
    content: string | null;
    fileKey: string | null;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    duration: number | null;
    replyToId: number | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }>;
  messageStatuses: Array<{
    messageId: number;
    userId: number;
    status: "sent" | "delivered" | "read";
    timestamp: Date;
  }>;
  messageDeletions: Array<{
    messageId: number;
    userId: number;
    deletedAt: Date;
  }>;
  calls: Array<{
    id: number;
    conversationId: number;
    callerId: number;
    receiverId: number;
    type: "audio" | "video";
    status: "ringing" | "connecting" | "active" | "ended" | "declined" | "missed" | "failed";
    startedAt: Date;
    answeredAt: Date | null;
    endedAt: Date | null;
    duration: number;
  }>;
  callSignals: Array<{
    id: number;
    callId: number;
    senderId: number;
    receiverId: number;
    kind: "offer" | "answer" | "candidate" | "hangup";
    payload: string;
    createdAt: Date;
  }>;
  typingStates: Array<{
    conversationId: number;
    userId: number;
    expiresAt: Date;
    updatedAt: Date;
  }>;
}

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? "/tmp" : path.resolve(process.cwd(), "server", "data");
const STORE_FILE = path.join(DATA_DIR, "chat-store.json");

function getInitialStore(): ChatStore {
  const now = new Date();
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
        status: "Disponível 🚀",
        lastSeen: now,
        loginMethod: "commercial-auth",
        role: "admin",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
    ],
    conversations: [],
    conversationMembers: [],
    messages: [],
    messageStatuses: [],
    messageDeletions: [],
    calls: [],
    callSignals: [],
    typingStates: [],
  };
}

let store: ChatStore = loadStore();

function loadStore(): ChatStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      // Revive dates
      const data = reviveDates(parsed);
      if (data && Array.isArray(data.conversations)) {
        // Strip out any dummy/placeholder conversations
        data.conversations = data.conversations.filter((c: any) => c.title !== "Família Silva ❤️");
      }
      return data;
    }
  } catch (e) {
    console.warn("[mockDb] Failed to load store, using fresh initial store", e);
  }
  return getInitialStore();
}

function reviveDates(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  const out: any = {};
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
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.warn("[mockDb] Persist error:", e);
  }
}

export function resetChatStore() {
  store = getInitialStore();
  persistStore();
  return store;
}

export function getRawStore(): ChatStore {
  return store;
}

function getTableName(table: any): keyof ChatStore {
  if (!table) return "users";
  // Drizzle mysqlTable objects have Symbol(drizzle:Name) or _.name
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
  return "users";
}

function extractCondition(cond: any): any {
  if (!cond) return null;
  if (!cond.queryChunks || !Array.isArray(cond.queryChunks)) return null;

  const chunks = cond.queryChunks;
  if (chunks.length === 3 && chunks[0]?.value?.[0] === "(" && chunks[2]?.value?.[0] === ")") {
    return extractCondition(chunks[1]);
  }

  const isAnd = chunks.some((c: any) => typeof c?.value?.[0] === "string" && c.value[0].includes(" and "));
  const isOr = chunks.some((c: any) => typeof c?.value?.[0] === "string" && c.value[0].includes(" or "));

  if (isAnd) {
    const subConds = chunks.filter((c: any) => c && c.queryChunks);
    return { type: "and", conditions: subConds.map(extractCondition).filter(Boolean) };
  }
  if (isOr) {
    const subConds = chunks.filter((c: any) => c && c.queryChunks);
    return { type: "or", conditions: subConds.map(extractCondition).filter(Boolean) };
  }

  let colName: string | null = null;
  let op = "=";
  let targetVal: any = undefined;

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
        targetVal = chunk.map((item: any) => (item?.value !== undefined ? item.value : item));
      } else if (typeof chunk !== "object" || chunk instanceof Date) {
        targetVal = chunk;
      }
    }
  }

  return { type: "single", colName, op, targetVal };
}

function evaluateParsed(item: any, parsed: any): boolean {
  if (!parsed) return true;
  if (parsed.type === "and") {
    return parsed.conditions.every((c: any) => evaluateParsed(item, c));
  }
  if (parsed.type === "or") {
    return parsed.conditions.some((c: any) => evaluateParsed(item, c));
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
          return targetVal.some(t => (typeof t === "string" && typeof val === "string" ? val.toLowerCase() === t.toLowerCase() : val == t));
        }
        return false;
      case "like": {
        if (typeof val !== "string" || typeof targetVal !== "string") return false;
        const cleanPattern = targetVal.replace(/[%_\\]/g, match => (match === "%" ? ".*" : match === "_" ? "." : "\\\\"));
        return new RegExp(`^${cleanPattern}$`, "i").test(val);
      }
      case "is_null":
        return val === null || val === undefined;
      case "is_not_null":
        return val !== null && val !== undefined;
      default:
        return true;
    }
  }
  return true;
}

function matchesCondition(item: any, condition: any): boolean {
  if (!condition) return true;
  const parsed = extractCondition(condition);
  return evaluateParsed(item, parsed);
}

export function getMockDb() {
  return {
    __isMock: true,
    select: (fields?: any) => {
      let currentTable: any = null;
      let condition: any = null;
      let limitNum: number | null = null;
      let orders: any[] = [];
      const joins: Array<{ table: any; on: any }> = [];

      const queryBuilder: any = {
        from: (table: any) => {
          currentTable = table;
          return queryBuilder;
        },
        innerJoin: (joinTable: any, onCond: any) => {
          joins.push({ table: joinTable, on: onCond });
          return queryBuilder;
        },
        where: (cond: any) => {
          condition = cond;
          return queryBuilder;
        },
        orderBy: (...orderList: any[]) => {
          orders = orderList;
          return queryBuilder;
        },
        limit: (n: number) => {
          limitNum = n;
          return queryBuilder;
        },
        then: (resolve: any, reject: any) => {
          try {
            const tableName = getTableName(currentTable);
            let list = [...((store[tableName] as any[]) || [])];

            // Handle inner joins if present
            if (joins.length > 0) {
              const joinedList: any[] = [];
              for (const row of list) {
                let matchAll = true;
                const merged = { ...row };
                for (const j of joins) {
                  const jTableName = getTableName(j.table);
                  const jTableRows = (store[jTableName] as any[]) || [];
                  const jCond = extractCondition(j.on);
                  // Find matching joined row
                  const match = jTableRows.find(jRow => {
                    if (jCond && jCond.colName) {
                      // ColName in join usually matches id or userId
                      return jRow.id === row[jCond.colName] || jRow[jCond.colName] === row.id || jRow.id === row.userId || jRow.userId === row.id;
                    }
                    return true;
                  });
                  if (!match) {
                    matchAll = false;
                    break;
                  }
                  // Prefix or merge
                  Object.assign(merged, match);
                }
                if (matchAll) joinedList.push(merged);
              }
              list = joinedList;
            }

            if (condition) {
              list = list.filter(item => matchesCondition(item, condition));
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
              list = list.map(item => {
                const res: any = {};
                for (const k of fieldKeys) {
                  const colSpec = fields[k];
                  const colName = colSpec?.name || k;
                  res[k] = item[colName] !== undefined ? item[colName] : item[k];
                }
                return res;
              });
            }

            return Promise.resolve(list).then(resolve, reject);
          } catch (err) {
            if (reject) return Promise.reject(err).catch(reject);
            throw err;
          }
        },
      };
      return queryBuilder;
    },

    insert: (table: any) => {
      return {
        values: (data: any) => {
          const tableName = getTableName(table);
          if (!store[tableName]) (store as any)[tableName] = [];

          let executed = false;
          const runInsert = (updateSet?: any) => {
            if (executed) return [{ insertId: 0 }];
            executed = true;

            const items = Array.isArray(data) ? data : [data];
            let lastInsertId = 0;

            for (const item of items) {
              const tableItems = store[tableName] as any[];
              const existingIdx = tableItems.findIndex(existing => {
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
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  ...item,
                };
                tableItems.push(newItem);
                lastInsertId = newItem.id;
              }
            }

            persistStore();
            return [{ insertId: lastInsertId }];
          };

          return {
            onDuplicateKeyUpdate: ({ set }: { set: any }) => {
              return Promise.resolve(runInsert(set));
            },
            then: (resolve: any, reject: any) => {
              try {
                return Promise.resolve(runInsert()).then(resolve, reject);
              } catch (err) {
                if (reject) return Promise.reject(err).catch(reject);
                throw err;
              }
            },
          };
        },
      };
    },

    update: (table: any) => {
      let setValues: any = {};
      return {
        set: (values: any) => {
          setValues = values;
          return {
            where: (condition: any) => {
              return {
                then: (resolve: any, reject: any) => {
                  try {
                    const tableName = getTableName(table);
                    const list = (store[tableName] as any[]) || [];
                    let affected = 0;

                    for (const item of list) {
                      if (matchesCondition(item, condition)) {
                        Object.assign(item, setValues, { updatedAt: new Date() });
                        affected++;
                      }
                    }

                    persistStore();
                    return Promise.resolve([{ affectedRows: affected }]).then(resolve, reject);
                  } catch (err) {
                    if (reject) return Promise.reject(err).catch(reject);
                    throw err;
                  }
                },
              };
            },
          };
        },
      };
    },

    delete: (table: any) => {
      return {
        where: (condition: any) => {
          return {
            then: (resolve: any, reject: any) => {
              try {
                const tableName = getTableName(table);
                const list = (store[tableName] as any[]) || [];
                const beforeLen = list.length;
                (store as any)[tableName] = list.filter(item => !matchesCondition(item, condition));
                const affected = beforeLen - (store[tableName] as any[]).length;
                persistStore();
                return Promise.resolve([{ affectedRows: affected }]).then(resolve, reject);
              } catch (err) {
                if (reject) return Promise.reject(err).catch(reject);
                throw err;
              }
            },
          };
        },
      };
    },
  };
}
