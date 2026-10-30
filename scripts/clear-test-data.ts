import "dotenv/config";
import { getDb } from "../server/db";
import {
  conversations,
  conversationMembers,
  messages,
  messageStatuses,
  messageDeletions,
  calls,
  callSignals,
  typingStates,
  users,
} from "../drizzle/schema";

async function clearTestData() {
  console.log("Iniciando limpeza total de dados...");
  const db = await getDb();
  if (!db) {
    console.error("Sem conexão com o banco");
    process.exit(1);
  }

  try {
    await db.delete(callSignals);
    console.log("Sinais de chamadas limpos.");
  } catch (e) {
    console.warn("callSignals:", (e as Error).message);
  }

  try {
    await db.delete(calls);
    console.log("Chamadas limpas.");
  } catch (e) {
    console.warn("calls:", (e as Error).message);
  }

  try {
    await db.delete(typingStates);
    console.log("Estados de digitação limpos.");
  } catch (e) {
    console.warn("typingStates:", (e as Error).message);
  }

  try {
    await db.delete(messageStatuses);
    console.log("Status de mensagens limpos.");
  } catch (e) {
    console.warn("messageStatuses:", (e as Error).message);
  }

  try {
    await db.delete(messageDeletions);
    console.log("Exclusões de mensagens limpas.");
  } catch (e) {
    console.warn("messageDeletions:", (e as Error).message);
  }

  try {
    await db.delete(messages);
    console.log("Todas as mensagens antigas foram removidas.");
  } catch (e) {
    console.warn("messages:", (e as Error).message);
  }

  try {
    await db.delete(conversationMembers);
    console.log("Membros de conversas removidos.");
  } catch (e) {
    console.warn("conversationMembers:", (e as Error).message);
  }

  try {
    await db.delete(conversations);
    console.log("Todas as conversas e grupos antigos foram removidos.");
  } catch (e) {
    console.warn("conversations:", (e as Error).message);
  }

  try {
    await db.delete(users);
    console.log("Todos os usuários de teste anteriores foram removidos.");
  } catch (e) {
    console.warn("users:", (e as Error).message);
  }

  console.log("Limpeza concluída com sucesso! Banco 100% zerado e novo.");
  process.exit(0);
}

clearTestData().catch((err) => {
  console.error("Erro ao limpar dados:", err);
  process.exit(1);
});
