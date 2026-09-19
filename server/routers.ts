import fs from "fs";
import path from "path";
import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    // Cadastro ou Login Simples de Família (apenas nome e email)
    loginSimple: publicProcedure
      .input(
        z.object({
          name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
          email: z.string().email("Email inválido"),
          statusMessage: z.string().optional(),
          avatarUrl: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        const name = input.name.trim();

        // Verificar se usuário já existe com esse email
        let user = await db.getUserByEmail(email);

        if (!user) {
          // Gerar openId determinístico e seguro para contas simples
          const openId = `family_${Buffer.from(email).toString("hex").slice(0, 32)}`;
          await db.upsertUser({
            openId,
            name,
            email,
            statusMessage: input.statusMessage || "Oi família, estou usando o CasaChat!",
            avatarUrl: input.avatarUrl || null,
            loginMethod: "family_simple",
            lastSignedIn: new Date(),
          });
          user = await db.getUserByEmail(email);
        } else {
          // Atualiza dados e último login
          await db.upsertUser({
            openId: user.openId,
            name: name || user.name || "Membro da Família",
            email: user.email,
            statusMessage: input.statusMessage || user.statusMessage || "Oi família, estou usando o CasaChat!",
            avatarUrl: input.avatarUrl || user.avatarUrl,
            lastSignedIn: new Date(),
          });
          user = await db.getUserByEmail(email);
        }

        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível autenticar o usuário" });
        }

        // Garante que o usuário esteja automaticamente no Grupo da Família
        try {
          await db.ensureUserInFamilyGroup(user.id);
        } catch (e) {
          console.error("[Login] Failed to join family group:", e);
        }

        // Emitir cookie de sessão assinado
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || name,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 ano
        });

        return {
          user,
          token: sessionToken,
        };
      }),

    // Atualizar perfil do usuário conectado
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).optional(),
          statusMessage: z.string().max(250).optional(),
          avatarUrl: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateProfile(ctx.user.id, input);
        return db.getUserById(ctx.user.id);
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Usuários da Família
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const all = await db.listAllUsers();
      // Retorna todos os usuários exceto ele mesmo (para iniciar conversa) e lista geral
      return all.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        statusMessage: u.statusMessage,
        isSelf: u.id === ctx.user.id,
      }));
    }),
  }),

  // Conversas
  conversations: router({
    // Listar conversas do usuário logado
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        await db.ensureUserInFamilyGroup(ctx.user.id);
      } catch (e) {
        console.error("[Conversations] Failed to ensure family group:", e);
      }
      return db.listUserConversations(ctx.user.id);
    }),

    // Obter detalhes de uma conversa
    get: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        const conv = await db.getConversationDetails(input.conversationId, ctx.user.id);
        if (!conv) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada ou acesso não autorizado" });
        }
        return conv;
      }),

    // Criar conversa direta (ou abrir existente)
    startDirect: protectedProcedure
      .input(z.object({ targetUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (input.targetUserId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você já está em contato consigo mesmo" });
        }

        const existingId = await db.findDirectConversation(ctx.user.id, input.targetUserId);
        if (existingId) {
          return { conversationId: existingId, isNew: false };
        }

        const target = await db.getUserById(input.targetUserId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuário alvo não encontrado" });
        }

        const newId = await db.createConversation({
          type: "direct",
          createdById: ctx.user.id,
          memberUserIds: [input.targetUserId],
        });

        return { conversationId: newId, isNew: true };
      }),

    // Criar Grupo familiar
    createGroup: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2, "Nome do grupo deve ter pelo menos 2 caracteres"),
          description: z.string().optional(),
          memberUserIds: z.array(z.number()).min(1, "Adicione pelo menos 1 membro"),
          avatarUrl: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const conversationId = await db.createConversation({
          type: "group",
          name: input.name,
          description: input.description,
          avatarUrl: input.avatarUrl,
          createdById: ctx.user.id,
          memberUserIds: input.memberUserIds,
        });

        return { conversationId };
      }),

    // Marcar conversa como lida
    markAsRead: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.markConversationAsRead(input.conversationId, ctx.user.id);
        return { success: true };
      }),

    // Adicionar membro ao grupo
    addMember: protectedProcedure
      .input(z.object({ conversationId: z.number(), targetUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conv = await db.getConversationDetails(input.conversationId, ctx.user.id);
        if (!conv) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas membros podem adicionar participantes" });
        }
        const targetUser = await db.getUserById(input.targetUserId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
        }
        await db.addMemberToConversation(input.conversationId, input.targetUserId);

        await db.sendMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          content: `👋 ${targetUser.name || "Novo membro"} entrou no grupo`,
        });

        return { success: true };
      }),

    // Remover membro do grupo (ou sair do grupo)
    removeMember: protectedProcedure
      .input(z.object({ conversationId: z.number(), targetUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conv = await db.getConversationDetails(input.conversationId, ctx.user.id);
        if (!conv) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado a esta conversa" });
        }

        const targetUser = await db.getUserById(input.targetUserId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
        }

        await db.removeMemberFromConversation(input.conversationId, input.targetUserId);

        const isSelf = input.targetUserId === ctx.user.id;
        const notice = isSelf
          ? `🚪 ${targetUser.name || "Um membro"} saiu do grupo`
          : `🚪 ${targetUser.name || "Um membro"} foi removido(a) do grupo por ${ctx.user.name || "um participante"}`;

        await db.sendMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          content: notice,
        });

        return { success: true };
      }),
  }),

  // Mensagens
  messages: router({
    list: protectedProcedure
      .input(z.object({ conversationId: z.number(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        // Valida se o usuário é participante
        const conv = await db.getConversationDetails(input.conversationId, ctx.user.id);
        if (!conv) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta conversa" });
        }
        return db.listConversationMessages(input.conversationId, input.limit ?? 100);
      }),

    send: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          content: z.string().optional(),
          mediaUrl: z.string().optional(),
          mediaType: z.string().optional(),
          fileName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!input.content && !input.mediaUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Mensagem não pode ser vazia" });
        }

        const conv = await db.getConversationDetails(input.conversationId, ctx.user.id);
        if (!conv) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta conversa" });
        }

        const messageId = await db.sendMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          content: input.content,
          mediaUrl: input.mediaUrl,
          mediaType: input.mediaType,
          fileName: input.fileName,
        });

        return { messageId, success: true };
      }),

    react: protectedProcedure
      .input(z.object({ messageId: z.number(), emoji: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await db.toggleMessageReaction({
          messageId: input.messageId,
          userId: ctx.user.id,
          emoji: input.emoji,
        });
        return { success: true };
      }),

    // Upload de arquivo ou foto base64 (Salva localmente com alta performance)
    uploadMedia: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          contentType: z.string(),
          base64Data: z.string(), // payload base64 enviado pelo cliente
        })
      )
      .mutation(async ({ input }) => {
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
            key: uniqueName,
          };
        } catch (localErr) {
          console.error("Erro no salvamento local, tentando storage:", localErr);
          const relKey = `chat-media/${uniqueName}`;
          const result = await storagePut(relKey, buffer, input.contentType);
          return {
            url: result.url,
            key: result.key,
          };
        }
      }),
  }),

  // Módulo de Chamadas de Áudio e Vídeo (WebRTC Signaling)
  calls: router({
    initiate: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          type: z.enum(["audio", "video"]),
          offer: z.any().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const session: CallSession = {
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
          updatedAt: Date.now(),
        };
        activeCalls.set(callId, session);
        return { callId, session };
      }),

    poll: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        for (const session of Array.from(activeCalls.values())) {
          if (
            session.conversationId === input.conversationId &&
            (session.status === "ringing" || session.status === "connected")
          ) {
            return session;
          }
        }
        return null;
      }),

    answer: protectedProcedure
      .input(
        z.object({
          callId: z.string(),
          answer: z.any(),
        })
      )
      .mutation(async ({ input }) => {
        const session = activeCalls.get(input.callId);
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Chamada não encontrada" });
        }
        session.answer = input.answer;
        session.status = "connected";
        session.updatedAt = Date.now();
        return { success: true };
      }),

    addCandidate: protectedProcedure
      .input(
        z.object({
          callId: z.string(),
          candidate: z.any(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const session = activeCalls.get(input.callId);
        if (session) {
          session.candidates.push({
            candidate: input.candidate,
            senderId: ctx.user.id,
          });
          session.updatedAt = Date.now();
        }
        return { success: true };
      }),

    getCandidates: protectedProcedure
      .input(z.object({ callId: z.string() }))
      .query(async ({ ctx, input }) => {
        const session = activeCalls.get(input.callId);
        if (!session) return [];
        return session.candidates.filter((c) => c.senderId !== ctx.user.id);
      }),

    end: protectedProcedure
      .input(
        z.object({
          callId: z.string(),
          status: z.enum(["ended", "rejected"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const session = activeCalls.get(input.callId);
        if (session) {
          session.status = input.status || "ended";
          session.updatedAt = Date.now();
          setTimeout(() => activeCalls.delete(input.callId), 15000);
        }
        return { success: true };
      }),
  }),
});

interface CallSession {
  id: string;
  conversationId: number;
  callerId: number;
  callerName: string;
  callerAvatar?: string | null;
  type: "audio" | "video";
  status: "ringing" | "connected" | "ended" | "rejected";
  offer?: any;
  answer?: any;
  candidates: Array<{ candidate: any; senderId: number }>;
  startedAt: number;
  updatedAt: number;
}

const activeCalls = new Map<string, CallSession>();

setInterval(() => {
  const now = Date.now();
  activeCalls.forEach((session, id) => {
    if (now - session.updatedAt > 60 * 60 * 1000 || session.status === "ended") {
      activeCalls.delete(id);
    }
  });
}, 30000);

export type AppRouter = typeof appRouter;
