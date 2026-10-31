import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { seedTestUsers } from "./mockDb";

describe("Contact & Conversation Actions (Delete, Mute, Block)", () => {
  beforeEach(() => {
    seedTestUsers();
  });
  it("allows user to mute and unmute a conversation", async () => {
    // User 1 (Murilo) and User 4 (Filho)
    const caller1 = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    // Create a direct chat with User 4
    const chat = await caller1.messaging.createDirect({ userId: 4 });
    expect(chat.conversationId).toBeGreaterThan(0);

    // Mute conversation for 8 hours
    const muteRes = await caller1.messaging.muteConversation({ conversationId: chat.conversationId, durationHours: 8 });
    expect(muteRes.success).toBe(true);

    // Verify conversation appears as muted in list
    const listMuted = await caller1.messaging.list();
    const convMuted = listMuted.find(c => c.id === chat.conversationId);
    expect(convMuted?.isMuted).toBe(true);

    // Unmute
    const unmuteRes = await caller1.messaging.unmuteConversation({ conversationId: chat.conversationId });
    expect(unmuteRes.success).toBe(true);

    const listUnmuted = await caller1.messaging.list();
    const convUnmuted = listUnmuted.find(c => c.id === chat.conversationId);
    expect(convUnmuted?.isMuted).toBe(false);
  });

  it("allows user to block and unblock a contact", async () => {
    const caller1 = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    // Block User 4
    await caller1.messaging.blockContact({ userId: 4 });

    // In profile.search, User 4 should have isBlocked = true
    const searchRes = await caller1.profile.search({ query: "" });
    const user4 = searchRes.find(u => u.id === 4);
    expect(user4?.isBlocked).toBe(true);

    // Unblock User 4
    await caller1.messaging.unblockContact({ userId: 4 });
    const searchRes2 = await caller1.profile.search({ query: "" });
    const user4After = searchRes2.find(u => u.id === 4);
    expect(user4After?.isBlocked).toBe(false);
  });

  it("allows user to delete a contact and hide it from their list", async () => {
    const caller1 = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    // Delete contact User 3 (Esposa)
    await caller1.profile.deleteContact({ contactId: 3 });

    // In profile.search, User 3 should NOT appear anymore
    const searchRes = await caller1.profile.search({ query: "" });
    expect(searchRes.some(u => u.id === 3)).toBe(false);
  });

  it("allows user to delete a conversation", async () => {
    const caller1 = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    const chat = await caller1.messaging.createDirect({ userId: 4 });
    const deleteRes = await caller1.messaging.deleteConversation({ conversationId: chat.conversationId });
    expect(deleteRes.success).toBe(true);

    const list = await caller1.messaging.list();
    expect(list.some(c => c.id === chat.conversationId)).toBe(false);
  });

  it("allows user to recreate or send message to a previously deleted conversation without forbidden error", async () => {
    const caller1 = appRouter.createCaller({
      user: { id: 1, name: "Murilo Silva", email: "olirumtecapp@gmail.com", role: "admin" } as any,
      req: {} as any,
      res: { cookie: () => {} } as any,
    });

    // Create chat with User 3 (Esposa)
    const chat = await caller1.messaging.createDirect({ userId: 3 });
    // Delete conversation from user 1's side
    await caller1.messaging.deleteConversation({ conversationId: chat.conversationId });

    // User 1 re-opens conversation with User 3 (Esposa)
    const reChat = await caller1.messaging.createDirect({ userId: 3 });
    expect(reChat.conversationId).toBe(chat.conversationId);

    // User 1 sends a message to User 3 (Esposa)
    const sendRes = await caller1.messaging.send({
      conversationId: reChat.conversationId,
      content: "Oi amor, tudo bem?",
    });
    expect(sendRes.messageId).toBeGreaterThan(0);
  });
});
