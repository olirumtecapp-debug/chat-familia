import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { callSignals, calls, conversationMembers, users } from "../../drizzle/schema";
import { requireDatabase } from "../db";
import { publishRealtime } from "../realtime";
import { protectedProcedure, router } from "../_core/trpc";

async function callWithAccess(callId: number, userId: number) {
  const db = await requireDatabase();
  const found = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  const call = found[0];
  if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Chamada não encontrada." });
  if (call.callerId !== userId && call.receiverId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Você não participa desta chamada." });
  return { db, call };
}

export const callsRouter = router({
  start: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), type: z.enum(["audio", "video"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, input.conversationId));
    if (!members.some(member => member.userId === ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN" });
    if (members.length !== 2) throw new TRPCError({ code: "BAD_REQUEST", message: "As chamadas individuais requerem dois participantes." });
    const receiverId = members.find(member => member.userId !== ctx.user.id)?.userId;
    if (!receiverId) throw new TRPCError({ code: "BAD_REQUEST" });

    const busy = await db.select({ id: calls.id }).from(calls).where(and(inArray(calls.status, ["ringing", "connecting", "active"]), or(eq(calls.callerId, receiverId), eq(calls.receiverId, receiverId)))).limit(1);
    if (busy[0]) throw new TRPCError({ code: "CONFLICT", message: "Esta pessoa já está em outra chamada." });
    const created = await db.insert(calls).values({ conversationId: input.conversationId, callerId: ctx.user.id, receiverId, type: input.type, status: "ringing" });
    const callId = Number(created[0].insertId);
    publishRealtime([ctx.user.id, receiverId], { type: "call", callId });
    return { callId, receiverId };
  }),

  pending: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const current = await db
      .select({
        id: calls.id, conversationId: calls.conversationId, callerId: calls.callerId, receiverId: calls.receiverId, type: calls.type, status: calls.status, startedAt: calls.startedAt, answeredAt: calls.answeredAt,
        callerName: users.name, callerAvatar: users.avatarUrl,
      })
      .from(calls)
      .innerJoin(users, eq(calls.callerId, users.id))
      .where(and(or(eq(calls.callerId, ctx.user.id), eq(calls.receiverId, ctx.user.id)), inArray(calls.status, ["ringing", "connecting", "active"])))
      .orderBy(desc(calls.startedAt))
      .limit(1);
    return current[0] ?? null;
  }),

  respond: protectedProcedure.input(z.object({ callId: z.number().int().positive(), accept: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (call.receiverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o destinatário pode responder." });
    if (call.status !== "ringing") throw new TRPCError({ code: "CONFLICT", message: "Esta chamada não está mais aguardando resposta." });
    if (!input.accept) {
      await db.update(calls).set({ status: "declined", endedAt: new Date() }).where(eq(calls.id, call.id));
      publishRealtime([call.callerId, call.receiverId], { type: "call", callId: call.id });
      return { status: "declined" as const };
    }
    await db.update(calls).set({ status: "connecting", answeredAt: new Date() }).where(eq(calls.id, call.id));
    publishRealtime([call.callerId, call.receiverId], { type: "call", callId: call.id });
    return { status: "connecting" as const };
  }),

  setActive: protectedProcedure.input(z.object({ callId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (!["ringing", "connecting"].includes(call.status)) return { status: call.status };
    await db.update(calls).set({ status: "active", answeredAt: call.answeredAt ?? new Date() }).where(eq(calls.id, call.id));
    return { status: "active" as const };
  }),

  end: protectedProcedure.input(z.object({ callId: z.number().int().positive(), reason: z.enum(["ended", "missed", "failed"]).default("ended") })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (["ended", "declined", "missed", "failed"].includes(call.status)) return { success: true };
    const endedAt = new Date();
    const reference = call.answeredAt ?? call.startedAt;
    const duration = Math.max(0, Math.round((endedAt.getTime() - reference.getTime()) / 1000));
    await db.update(calls).set({ status: input.reason, endedAt, duration }).where(eq(calls.id, call.id));
    publishRealtime([call.callerId, call.receiverId], { type: "call", callId: call.id });
    return { success: true };
  }),

  signal: protectedProcedure.input(z.object({ callId: z.number().int().positive(), kind: z.enum(["offer", "answer", "candidate", "hangup"]), payload: z.string().min(1).max(32_000) })).mutation(async ({ ctx, input }) => {
    const { db, call } = await callWithAccess(input.callId, ctx.user.id);
    if (["ended", "declined", "missed", "failed"].includes(call.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "A chamada já foi encerrada." });
    const receiverId = call.callerId === ctx.user.id ? call.receiverId : call.callerId;
    await db.insert(callSignals).values({ callId: input.callId, senderId: ctx.user.id, receiverId, kind: input.kind, payload: input.payload });
    return { success: true };
  }),

  signals: protectedProcedure.input(z.object({ callId: z.number().int().positive(), afterId: z.number().int().nonnegative().default(0) })).query(async ({ ctx, input }) => {
    const { db } = await callWithAccess(input.callId, ctx.user.id);
    return db.select({ id: callSignals.id, kind: callSignals.kind, payload: callSignals.payload, createdAt: callSignals.createdAt })
      .from(callSignals)
      .where(and(eq(callSignals.callId, input.callId), eq(callSignals.receiverId, ctx.user.id), gt(callSignals.id, input.afterId)))
      .orderBy(callSignals.id)
      .limit(50);
  }),

  history: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const allowed = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, ctx.user.id))).limit(1);
    if (!allowed[0]) throw new TRPCError({ code: "FORBIDDEN" });
    return db.select().from(calls).where(eq(calls.conversationId, input.conversationId)).orderBy(desc(calls.startedAt)).limit(30);
  }),
});
