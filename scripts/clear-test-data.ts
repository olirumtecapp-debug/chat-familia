import "dotenv/config";
import { ne } from "drizzle-orm";
import { getDb } from "../server/db";
import { conversations, conversationMembers, messages, messageReactions, users } from "../drizzle/schema";

async function clearTestData() {
  console.log("Iniciando limpeza dos dados e papos de teste...");
  const db = await getDb();
  if (!db) {
    console.error("Sem conexão com o banco");
    process.exit(1);
  }

  // 1. Limpar reações
  await db.delete(messageReactions);
  console.log("Reações de teste removidas.");

  // 2. Limpar mensagens de teste
  await db.delete(messages);
  console.log("Mensagens de teste removidas.");

  // 3. Limpar membros de conversas de teste
  await db.delete(conversationMembers);
  console.log("Membros de conversas de teste removidos.");

  // 4. Limpar conversas/grupos de teste
  await db.delete(conversations);
  console.log("Conversas e grupos de teste removidos.");

  // 5. Remover usuários fictícios do seed (mantém o usuário real Murilo)
  await db.delete(users).where(ne(users.email, "olirumdev1@gmail.com"));
  console.log("Usuários fictícios removidos. Apenas a conta real de Murilo foi mantida.");

  const remainingUsers = await db.select().from(users);
  console.log("Usuários restantes no banco:", remainingUsers.map(u => ({ id: u.id, name: u.name, email: u.email })));

  const remainingConvs = await db.select().from(conversations);
  console.log("Conversas restantes no banco:", remainingConvs.length);

  console.log("Limpeza concluída com sucesso! O chat está 100% limpo.");
  process.exit(0);
}

clearTestData().catch((err) => {
  console.error("Erro ao limpar dados de teste:", err);
  process.exit(1);
});
