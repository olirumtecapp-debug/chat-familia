import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  currentUserId: number;
  currentUserName: string;
  currentUserAvatar?: string;
  targetName: string;
  targetAvatar?: string;
  callType: "audio" | "video";
  isIncoming?: boolean;
  incomingCallSession?: any;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function CallModal({
  isOpen,
  onClose,
  conversationId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  targetName,
  targetAvatar,
  callType,
  isIncoming = false,
  incomingCallSession = null,
}: CallModalProps) {
  const [callStatus, setCallStatus] = useState<"ringing" | "connected" | "ended">(
    isIncoming ? "ringing" : "ringing"
  );
  const [callDuration, setCallDuration] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === "audio");
  const [callId, setCallId] = useState<string | null>(incomingCallSession?.id || null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const ringtoneTimerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const utils = trpc.useUtils();
  const initiateMutation = trpc.calls.initiate.useMutation();
  const answerMutation = trpc.calls.answer.useMutation();
  const addCandidateMutation = trpc.calls.addCandidate.useMutation();
  const endMutation = trpc.calls.end.useMutation();

  // Polling para receber resposta (se for quem ligou) ou candidatos ICE
  const pollQuery = trpc.calls.poll.useQuery(
    { conversationId },
    {
      enabled: isOpen && !!callId,
      refetchInterval: 1200,
    }
  );

  const candidatesQuery = trpc.calls.getCandidates.useQuery(
    { callId: callId || "" },
    {
      enabled: isOpen && !!callId && callStatus !== "ended",
      refetchInterval: 1500,
    }
  );

  // Sintetizador de áudio Web Audio API para tocar o "Tuuuut... Tuuuut..." agradável da chamada
  const startRingtone = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;

      const playBeep = () => {
        if (!audioContextRef.current || ctx.state === "closed") return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
      };

      playBeep();
      ringtoneTimerRef.current = setInterval(playBeep, 3000);
    } catch {}
  };

  const stopRingtone = () => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Temporizador de duração da chamada conectada
  useEffect(() => {
    let timer: any;
    if (callStatus === "connected") {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  // Inicializa WebRTC e Mídia
  useEffect(() => {
    if (!isOpen) return;

    startRingtone();

    const startMediaAndPeer = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error(
          "Câmera e microfone exigem conexão segura HTTPS no smartphone. Acesse pelo link seguro HTTPS para liberar!",
          { duration: 6000 }
        );
        handleEndCall();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Adiciona tracks locais à conexão
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Quando recebe track remota do outro lado
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
          stopRingtone();
          setCallStatus("connected");
        };

        // Coleta candidatos ICE para enviar ao outro lado
        pc.onicecandidate = (event) => {
          if (event.candidate && callId) {
            addCandidateMutation.mutate({
              callId,
              candidate: event.candidate.toJSON(),
            });
          }
        };

        // Se NÃO for recebendo, nós que iniciamos a chamada (Caller cria Offer)
        if (!isIncoming) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const res = await initiateMutation.mutateAsync({
            conversationId,
            type: callType,
            offer: { sdp: offer.sdp, type: offer.type },
          });

          setCallId(res.callId);
        }
      } catch (err: any) {
        console.error("Erro ao acessar câmera/microfone:", err);
        toast.error("Permissão de câmera/microfone necessária para chamada.");
        handleEndCall();
      }
    };

    startMediaAndPeer();

    return () => {
      cleanupResources();
    };
  }, [isOpen]);

  // Se iniciamos a chamada, observa quando o outro lado atende e manda a Answer
  useEffect(() => {
    const session = pollQuery.data;
    if (!session || !peerConnectionRef.current) return;

    if (session.status === "connected" && session.answer && !isIncoming) {
      const pc = peerConnectionRef.current;
      if (pc.signalingState === "have-local-offer") {
        pc.setRemoteDescription(new RTCSessionDescription(session.answer))
          .then(() => {
            stopRingtone();
            setCallStatus("connected");
          })
          .catch((e) => console.error("Erro ao definir answer:", e));
      }
    } else if (session.status === "ended" || session.status === "rejected") {
      toast.info("Chamada encerrada.");
      handleEndCall();
    }
  }, [pollQuery.data]);

  // Aplica candidatos ICE recebidos da outra ponta
  useEffect(() => {
    const candidates = candidatesQuery.data || [];
    const pc = peerConnectionRef.current;
    if (!pc || !pc.remoteDescription) return;

    for (const item of candidates) {
      try {
        pc.addIceCandidate(new RTCIceCandidate(item.candidate)).catch(() => {});
      } catch {}
    }
  }, [candidatesQuery.data]);

  // Função para o receptor Atender a chamada
  const handleAnswerCall = async () => {
    stopRingtone();
    const pc = peerConnectionRef.current;
    const session = incomingCallSession || pollQuery.data;

    if (pc && session?.offer) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(session.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await answerMutation.mutateAsync({
          callId: session.id,
          answer: { sdp: answer.sdp, type: answer.type },
        });

        setCallStatus("connected");
      } catch (err) {
        console.error("Erro ao atender chamada:", err);
        toast.error("Erro ao estabelecer conexão de chamada.");
      }
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMicMuted((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff((prev) => !prev);
    }
  };

  const cleanupResources = () => {
    stopRingtone();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const handleEndCall = () => {
    stopRingtone();
    if (callId) {
      endMutation.mutate({ callId, status: "ended" });
    }
    cleanupResources();
    setCallStatus("ended");
    onClose();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleEndCall()}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden rounded-3xl bg-slate-900 text-white border-slate-800 shadow-2xl">
        <div className="relative w-full h-[520px] flex flex-col justify-between p-6 bg-radial from-slate-800 to-slate-950">
          {/* Vídeo Remoto (se for vídeo) ou Fundo Escuro com Avatar Pulsante */}
          {callType === "video" ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover rounded-3xl"
            />
          ) : null}

          {/* Vídeo Local (Picture-in-Picture no canto) */}
          {callType === "video" && (
            <div className="absolute top-4 right-4 w-28 h-36 rounded-2xl overflow-hidden shadow-xl border-2 border-white/20 bg-slate-800 z-20">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isVideoOff && (
                <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-xs text-slate-400">
                  Câmera off
                </div>
              )}
            </div>
          )}

          {/* Cabeçalho da Chamada */}
          <div className="relative z-10 text-center pt-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs text-emerald-400 font-semibold mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {callType === "video" ? "Vídeo-Chamada Familiar" : "Chamada de Voz da Família"}
            </div>

            {/* Avatar em Áudio ou quando vídeo remoto ainda não conectou */}
            {(callType === "audio" || callStatus !== "connected") && (
              <div className="flex flex-col items-center justify-center my-4">
                <div
                  className={`relative w-28 h-28 rounded-full overflow-hidden border-4 border-emerald-500 shadow-2xl ${
                    callStatus === "ringing" ? "animate-bounce" : ""
                  }`}
                >
                  <img
                    src={targetAvatar || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23059669'/><text x='50' y='58' font-size='50' text-anchor='middle' dominant-baseline='middle'>👨‍👩‍👦</text></svg>"}
                    alt={targetName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-xl font-bold mt-4 tracking-tight">{targetName}</h3>
                <p className="text-xs text-slate-300 mt-1 font-medium">
                  {callStatus === "ringing"
                    ? isIncoming
                      ? "Chamando você..."
                      : "Chamando parente..."
                    : `Conectado • ${formatDuration(callDuration)}`}
                </p>
              </div>
            )}
          </div>

          {/* Barra de Controles Inferior */}
          <div className="relative z-20 flex items-center justify-center gap-4 pb-2">
            {/* Se for chamada recebida no estado Tocando, mostra botão verde de Atender */}
            {isIncoming && callStatus === "ringing" ? (
              <div className="flex items-center gap-6">
                <button
                  onClick={handleAnswerCall}
                  className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex flex-col items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  title="Atender Chamada"
                >
                  <Phone className="w-7 h-7" />
                  <span className="text-[10px] mt-0.5 font-bold">Atender</span>
                </button>

                <button
                  onClick={handleEndCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg flex flex-col items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  title="Recusar Chamada"
                >
                  <PhoneOff className="w-7 h-7" />
                  <span className="text-[10px] mt-0.5 font-bold">Recusar</span>
                </button>
              </div>
            ) : (
              // Controles da Chamada em Andamento ou Realizada
              <div className="flex items-center gap-3 bg-black/50 backdrop-blur-xl p-3 rounded-full border border-white/10 shadow-2xl">
                {/* Mudo Microfone */}
                <button
                  onClick={toggleMic}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    isMicMuted ? "bg-rose-600/80 text-white" : "bg-white/15 hover:bg-white/25 text-white"
                  }`}
                  title={isMicMuted ? "Ativar Microfone" : "Silenciar Microfone"}
                >
                  {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Alternar Câmera (apenas em vídeo) */}
                {callType === "video" && (
                  <button
                    onClick={toggleVideo}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                      isVideoOff ? "bg-rose-600/80 text-white" : "bg-white/15 hover:bg-white/25 text-white"
                    }`}
                    title={isVideoOff ? "Ligar Câmera" : "Desligar Câmera"}
                  >
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                  </button>
                )}

                {/* Desligar (Botão Vermelho) */}
                <button
                  onClick={handleEndCall}
                  className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer ml-1"
                  title="Desligar Chamada"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
