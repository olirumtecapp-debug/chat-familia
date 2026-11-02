// Audio synthesizer using standard Web Audio API - no external file dependencies, zero lag

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Som agradável e cristalino de mensagem recebida (dois tons harmônicos) + vibração
 */
export function playMessageReceivedSound() {
  try {
    // Vibração tátil no celular
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      try { window.navigator.vibrate([60, 40, 80]); } catch (_) {}
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Primeiro tom (Dó agudo 880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Segundo tom harmônico (Mi agudo 1318Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318, now + 0.08);
    gain2.gain.setValueAtTime(0.12, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.28);
  } catch (err) {
    console.warn("[Sound] Falha ao tocar som de mensagem:", err);
  }
}

/**
 * Som sutil de mensagem enviada (pop curto)
 */
export function playMessageSentSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.08);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch (_) {}
}

/**
 * Toca toque de chamada contínuo (Retorna função para parar)
 * @param type "incoming" (quem recebe a ligação) ou "outgoing" (quem discou e está chamando)
 */
export function startCallRingtone(type: "incoming" | "outgoing"): () => void {
  let isStopped = false;
  let intervalId: any = null;

  try {
    const ctx = getAudioContext();
    if (!ctx) return () => {};

    if (type === "outgoing") {
      // Tom clássico de chamada discando: Tuuuut... Tuuuut...
      const playDialBeep = () => {
        if (isStopped || ctx.state === "closed") return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      };

      playDialBeep();
      intervalId = setInterval(playDialBeep, 3000);
    } else {
      // Toque melódico e vibrante de chamada recebida (estilo ringtone moderno)
      const playIncomingMelody = () => {
        if (isStopped || ctx.state === "closed") return;

        // Vibrar no ritmo da chamada
        if (typeof window !== "undefined" && window.navigator?.vibrate) {
          try { window.navigator.vibrate([400, 200, 400, 800]); } catch (_) {}
        }

        const now = ctx.currentTime;
        const notes = [
          { freq: 659.25, time: 0.0, dur: 0.15 },   // E5
          { freq: 783.99, time: 0.18, dur: 0.15 },  // G5
          { freq: 987.77, time: 0.36, dur: 0.25 },  // B5
          { freq: 783.99, time: 0.65, dur: 0.15 },  // G5
          { freq: 987.77, time: 0.83, dur: 0.4 },   // B5
        ];

        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + time);
          gain.gain.setValueAtTime(0.12, now + time);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + time);
          osc.stop(now + time + dur);
        });
      };

      playIncomingMelody();
      intervalId = setInterval(playIncomingMelody, 2200);
    }
  } catch (err) {
    console.warn("[Sound] Erro ao iniciar ringtone:", err);
  }

  // Função de parada
  return () => {
    isStopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      try { window.navigator.vibrate(0); } catch (_) {}
    }
  };
}
