export type RealtimeEvent = { type: "message" | "conversation" | "call" | "presence"; conversationId?: number; callId?: number; at: number };
type Subscriber = { userId: number; send: (event: RealtimeEvent) => void };

const subscribers = new Set<Subscriber>();

export function subscribeRealtime(userId: number, send: Subscriber["send"]) {
  const subscriber = { userId, send };
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function publishRealtime(userIds: number[], event: Omit<RealtimeEvent, "at">) {
  const audience = new Set(userIds);
  subscribers.forEach(subscriber => {
    if (audience.has(subscriber.userId)) {
      try { subscriber.send({ ...event, at: Date.now() }); } catch { subscribers.delete(subscriber); }
    }
  });
}
