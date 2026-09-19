import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, upsertUser, createConversation, sendMessage } from "../server/db";
import { users } from "../drizzle/schema";

async function seed() {
  console.log("Iniciando dados familiares de exemplo...");
  const db = await getDb();
  if (!db) {
    console.error("Sem conexão com o banco");
    process.exit(1);
  }

  // Criar 3 familiares de exemplo
  const familiares = [
    {
      openId: "family_mae_maria",
      name: "Mãe Maria",
      email: "mae.maria@familia.com",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
      statusMessage: "Fazendo bolo de cenoura pro café 🍰",
    },
    {
      openId: "family_tio_carlos",
      name: "Tio Carlos",
      email: "carlos.churrasco@familia.com",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
      statusMessage: "Churrasco no domingo confirmado! 🔥🥩",
    },
    {
      openId: "family_prima_luiza",
      name: "Prima Luiza",
      email: "luiza.arquiteta@familia.com",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      statusMessage: "Saudades de todo mundo ❤️",
    },
  ];

  for (const f of familiares) {
    await upsertUser(f);
  }

  const all = await db.select().from(users);
  const mae = all.find((u) => u.email === "mae.maria@familia.com");
  const tio = all.find((u) => u.email === "carlos.churrasco@familia.com");
  const luiza = all.find((u) => u.email === "luiza.arquiteta@familia.com");
  const dono = all.find((u) => u.id !== mae?.id && u.id !== tio?.id && u.id !== luiza?.id);

  if (mae && tio && luiza) {
    const memberIds = [mae.id, tio.id, luiza.id];
    if (dono) memberIds.push(dono.id);

    // Criar Grupo Geral da Família
    const convId = await createConversation({
      type: "group",
      name: "Família Reunida & Churrasco 🍖",
      description: "Grupo oficial para avisos, fotos e organização dos almoços",
      avatarUrl: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=150",
      createdById: mae.id,
      memberUserIds: memberIds,
    });

    // Enviar mensagens iniciais simpáticas
    await sendMessage({
      conversationId: convId,
      senderId: mae.id,
      content: "Bom dia família querida! Criei nosso cantinho aqui no CasaChat.",
    });

    await sendMessage({
      conversationId: convId,
      senderId: tio.id,
      content: "Que maravilha! Domingo o churrasco é lá em casa. Quem leva a sobremesa? 🥩🔥",
    });

    await sendMessage({
      conversationId: convId,
      senderId: luiza.id,
      content: "Eu levo a torta de limão e o refrigerante! Ansiosa pra ver todo mundo.",
    });

    console.log("Grupo e mensagens criados com sucesso!");
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
