import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeUserContext(user: any): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as any,
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as any,
  };
}

describe("Fluxo básico de chat de ponta a ponta (Passos 1 a 7)", () => {
  it("executa com sucesso o ciclo completo de comunicação entre dois usuários e persiste mensagens", async () => {
    // 1. Uma pessoa entra com seu e-mail (Usuário A)
    const ctxA_guest = makeUserContext(null);
    const loginA = await appRouter.createCaller(ctxA_guest).auth.loginSimple({
      name: "Maria Silva",
      email: "maria.silva@exemplo.com",
    });
    expect(loginA.user).toBeDefined();
    expect(loginA.user.email).toBe("maria.silva@exemplo.com");
    const userA = loginA.user;
    const ctxA = makeUserContext(userA);

    // 2. Outra pessoa entra com outro e-mail (Usuário B)
    const ctxB_guest = makeUserContext(null);
    const loginB = await appRouter.createCaller(ctxB_guest).auth.loginSimple({
      name: "João Santos",
      email: "joao.santos@exemplo.com",
    });
    expect(loginB.user).toBeDefined();
    expect(loginB.user.email).toBe("joao.santos@exemplo.com");
    const userB = loginB.user;
    const ctxB = makeUserContext(userB);

    // 3. Cada uma consegue localizar a outra pelo apelido ou e-mail
    // A busca por B via e-mail
    const searchByEmail = await appRouter.createCaller(ctxA).profile.search({
      query: "joao.santos@exemplo.com",
    });
    expect(searchByEmail.some(u => u.id === userB.id)).toBe(true);

    // A busca por B via apelido (com ou sem @)
    if (userB.nickname) {
      const searchByNick = await appRouter.createCaller(ctxA).profile.search({
        query: userB.nickname,
      });
      expect(searchByNick.some(u => u.id === userB.id)).toBe(true);

      const searchByNickWithAt = await appRouter.createCaller(ctxA).profile.search({
        query: `@${userB.nickname}`,
      });
      expect(searchByNickWithAt.some(u => u.id === userB.id)).toBe(true);
    }

    // B busca por A via e-mail
    const searchA = await appRouter.createCaller(ctxB).profile.search({
      query: "maria.silva@exemplo.com",
    });
    expect(searchA.some(u => u.id === userA.id)).toBe(true);

    // 4. Uma inicia uma conversa (A cria conversa com B)
    const directConv = await appRouter.createCaller(ctxA).messaging.createDirect({
      userId: userB.id,
    });
    expect(directConv.conversationId).toBeGreaterThan(0);
    const conversationId = directConv.conversationId;

    // 5. Envia uma mensagem (A envia para B)
    const sendResultA = await appRouter.createCaller(ctxA).messaging.send({
      conversationId,
      content: "Olá João! Tudo bem?",
    });
    expect(sendResultA.messageId).toBeGreaterThan(0);

    // 6. A outra recebe e consegue responder
    // B lista conversas e vê a mensagem de A
    const listB = await appRouter.createCaller(ctxB).messaging.list();
    const convForB = listB.find(c => c.id === conversationId);
    expect(convForB).toBeDefined();
    expect(convForB?.latestMessage?.content).toBe("Olá João! Tudo bem?");

    // B visualiza o histórico da conversa
    const historyB = await appRouter.createCaller(ctxB).messaging.history({
      conversationId,
    });
    expect(historyB.messages.some(m => m.content === "Olá João! Tudo bem?")).toBe(true);

    // B responde para A
    const sendResultB = await appRouter.createCaller(ctxB).messaging.send({
      conversationId,
      content: "Tudo ótimo, Maria! Que bom falar com você.",
    });
    expect(sendResultB.messageId).toBeGreaterThan(0);

    // 7. As mensagens continuam aparecendo depois de 'atualizar a página' (novo fetch)
    // Simula reload da página para A
    const reloadedHistoryA = await appRouter.createCaller(ctxA).messaging.history({
      conversationId,
    });
    const contentsA = reloadedHistoryA.messages.map(m => m.content);
    expect(contentsA).toContain("Olá João! Tudo bem?");
    expect(contentsA).toContain("Tudo ótimo, Maria! Que bom falar com você.");

    // Simula reload da página para B
    const reloadedHistoryB = await appRouter.createCaller(ctxB).messaging.history({
      conversationId,
    });
    const contentsB = reloadedHistoryB.messages.map(m => m.content);
    expect(contentsB).toContain("Olá João! Tudo bem?");
    expect(contentsB).toContain("Tudo ótimo, Maria! Que bom falar com você.");

    // Verifica que ambas as contas compartilham o mesmo banco de dados
    expect(contentsA).toEqual(contentsB);
  });
});
