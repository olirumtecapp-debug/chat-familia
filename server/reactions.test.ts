import { describe, expect, it, beforeAll } from "vitest";
import { seedTestUsers } from "./mockDb";
import { appRouter } from "./routers";
import { getEmojiDisplayStyle } from "../client/src/lib/emojiUtils";

describe("Emoji Display Style (Jumbo & Animations)", () => {
  it("detects single emoji as jumbo with animation", () => {
    const singleHeart = getEmojiDisplayStyle("❤️");
    expect(singleHeart.isEmojiOnly).toBe(true);
    expect(singleHeart.isJumbo).toBe(true);
    expect(singleHeart.animClass).toBe("emoji-heart-beat");

    const singleRocket = getEmojiDisplayStyle("🚀");
    expect(singleRocket.isEmojiOnly).toBe(true);
    expect(singleRocket.isJumbo).toBe(true);
    expect(singleRocket.animClass).toBe("emoji-rocket-fly");
  });

  it("detects 2 and 3 emojis as jumbo with decreasing size", () => {
    const two = getEmojiDisplayStyle("👍🔥");
    expect(two.isEmojiOnly).toBe(true);
    expect(two.isJumbo).toBe(true);
    expect(two.sizeClass).toContain("text-5xl");

    const three = getEmojiDisplayStyle("🎉✨🥳");
    expect(three.isEmojiOnly).toBe(true);
    expect(three.isJumbo).toBe(true);
    expect(three.sizeClass).toContain("text-3xl");
  });

  it("detects 4+ emojis or text as standard size", () => {
    const four = getEmojiDisplayStyle("😀😃😄😁");
    expect(four.isEmojiOnly).toBe(false);

    const withText = getEmojiDisplayStyle("Olá mundo! ❤️");
    expect(withText.isEmojiOnly).toBe(false);
  });
});

describe("Message Reactions TRPC endpoints", () => {
  beforeAll(() => {
    seedTestUsers();
  });
  it("allows reacting to a message, toggling off, and switching emoji", async () => {
    const userA = { id: 1, openId: "user_a", name: "User A", role: "user" as const, email: "a@test.com" };
    const userB = { id: 3, openId: "user_b", name: "User B", role: "user" as const, email: "b@test.com" };

    const callerA = appRouter.createCaller({ user: userA as any, req: {} as any, res: {} as any });
    const callerB = appRouter.createCaller({ user: userB as any, req: {} as any, res: {} as any });

    // Create a direct chat
    const direct = await callerA.messaging.createDirect({ userId: userB.id });
    expect(direct.conversationId).toBeDefined();

    // Send a message
    const msg = await callerA.messaging.send({
      conversationId: direct.conversationId,
      content: "Mensagem de teste de reações!",
    });
    expect(msg.messageId).toBeDefined();

    // User B reacts with ❤️
    const react1 = await callerB.messaging.react({
      messageId: msg.messageId,
      emoji: "❤️",
    });
    expect(react1.reactions.length).toBe(1);
    expect(react1.reactions[0].emoji).toBe("❤️");
    expect(react1.reactions[0].count).toBe(1);
    expect(react1.reactions[0].hasReacted).toBe(true);

    // User A reacts with ❤️ as well
    const reactA = await callerA.messaging.react({
      messageId: msg.messageId,
      emoji: "❤️",
    });
    expect(reactA.reactions.find(r => r.emoji === "❤️")?.count).toBe(2);

    // User B toggles off ❤️
    const reactToggle = await callerB.messaging.react({
      messageId: msg.messageId,
      emoji: "❤️",
    });
    expect(reactToggle.reactions.find(r => r.emoji === "❤️")?.count).toBe(1);
    expect(reactToggle.reactions.find(r => r.emoji === "❤️")?.hasReacted).toBe(false);

    // Check history includes reactions
    const hist = await callerA.messaging.history({
      conversationId: direct.conversationId,
    });
    const foundMsg = hist.messages.find(m => m.id === msg.messageId);
    expect(foundMsg).toBeDefined();
    expect(foundMsg?.reactions?.length).toBeGreaterThan(0);
  });
});
