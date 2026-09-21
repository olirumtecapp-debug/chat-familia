import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ActiveCall = {
  id: number; callerId: number; receiverId: number; callerName?: string | null; callerAvatar?: string | null;
  type: "audio" | "video"; status: "ringing" | "connecting" | "active"; startedAt: Date | string;
} | null;

function Avatar({ name, source }: { name?: string | null; source?: string | null }) {
  return source ? <img className="call-avatar" src={source} alt="" /> : <div className="call-avatar fallback">{name?.slice(0, 2).toUpperCase() || "CF"}</div>;
}

export function CallDialog({ call, currentUserId, onFinished }: { call: ActiveCall; currentUserId?: number; onFinished: () => void }) {
  const utils = trpc.useUtils();
  const respond = trpc.calls.respond.useMutation({ onError: error => toast.error(error.message) });
  const setActive = trpc.calls.setActive.useMutation({ onError: error => toast.error(error.message) });
  const sendSignal = trpc.calls.signal.useMutation();
  const end = trpc.calls.end.useMutation();
  const callId = call?.id;
  const callType = call?.type;
  const callStatus = call?.status;
  const signals = trpc.calls.signals.useQuery({ callId: callId || 0, afterId: 0 }, { enabled: Boolean(callId), refetchInterval: 700, retry: false });
  const [localReady, setLocalReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const lastSignalId = useRef(0);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionReady = useRef(false);
  const finished = useRef(false);
  const activeCallId = useRef<number | null>(null);
  const isCaller = call?.callerId === currentUserId;
  const isReceiver = call?.receiverId === currentUserId;

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    started.current = false;
    remoteDescriptionReady.current = false;
    pendingCandidates.current = [];
    lastSignalId.current = 0;
    setLocalReady(false);
    setRemoteReady(false);
  }, []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    cleanup();
    onFinished();
  }, [cleanup, onFinished]);

  const emit = useCallback(async (kind: "offer" | "answer" | "candidate" | "hangup", payload: unknown) => {
    if (!callId) return;
    await sendSignal.mutateAsync({ callId, kind, payload: JSON.stringify(payload) });
  }, [callId, sendSignal]);

  const flushCandidates = useCallback(async () => {
    const connection = pc.current;
    if (!connection || !remoteDescriptionReady.current) return;
    const queued = pendingCandidates.current.splice(0);
    for (const candidate of queued) {
      try { await connection.addIceCandidate(candidate); } catch { /* stale candidates are harmless */ }
    }
  }, []);

  const initialize = useCallback(async (offer = false) => {
    if (!callId || !callType || started.current) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("WebRTC indisponível neste navegador.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
      if (finished.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      started.current = true;
      setLocalReady(true);
      if (localVideo.current) localVideo.current.srcObject = media;
      const connection = new RTCPeerConnection({ iceServers });
      pc.current = connection;
      media.getTracks().forEach(track => connection.addTrack(track, media));
      connection.ontrack = event => {
        const remoteStream = event.streams[0];
        if (remoteVideo.current && remoteStream) {
          remoteVideo.current.srcObject = remoteStream;
          setRemoteReady(true);
        }
      };
      connection.onicecandidate = event => { if (event.candidate) void emit("candidate", event.candidate.toJSON()).catch(() => undefined); };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") void setActive.mutateAsync({ callId }).catch(() => undefined);
        if (["failed", "closed"].includes(connection.connectionState)) {
          void end.mutateAsync({ callId, reason: "failed" }).catch(() => undefined);
          finish();
        }
      };
      if (offer) {
        const description = await connection.createOffer();
        await connection.setLocalDescription(description);
        await emit("offer", description);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (callType === "video" ? "Câmera ou microfone indisponível." : "Microfone indisponível."));
      if (callId) await end.mutateAsync({ callId, reason: "failed" }).catch(() => undefined);
      finish();
    }
  }, [callId, callType, emit, end, finish, iceServers, setActive]);

  useEffect(() => {
    if (!callId) { activeCallId.current = null; cleanup(); return; }
    if (activeCallId.current !== callId) {
      activeCallId.current = callId;
      finished.current = false;
      setElapsed(0);
      lastSignalId.current = 0;
    }
  }, [callId, cleanup]);

  useEffect(() => {
    if (callId && isCaller && callStatus === "connecting") void initialize(true);
  }, [callId, callStatus, initialize, isCaller]);

  useEffect(() => {
    if (!callId) return;
    fetch("/api/calls/ice", { credentials: "include" })
      .then(response => response.ok ? response.json() : null)
      .then(payload => { if (payload?.servers?.length) setIceServers(payload.servers); })
      .catch(() => undefined);
  }, [callId]);

  useEffect(() => {
    if (!call?.startedAt) return;
    const interval = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000))), 1000);
    return () => window.clearInterval(interval);
  }, [call?.id, call?.startedAt]);

  useEffect(() => {
    if (!callId || !localReady || !signals.data?.length || !pc.current) return;
    let cancelled = false;
    const process = async () => {
      const connection = pc.current;
      if (!connection) return;
      for (const signal of signals.data) {
        if (cancelled || signal.id <= lastSignalId.current) continue;
        const payload = JSON.parse(signal.payload) as RTCSessionDescriptionInit | RTCIceCandidateInit;
        try {
          if (signal.kind === "offer") {
            await connection.setRemoteDescription(payload as RTCSessionDescriptionInit);
            remoteDescriptionReady.current = true;
            await flushCandidates();
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await emit("answer", answer);
          } else if (signal.kind === "answer") {
            await connection.setRemoteDescription(payload as RTCSessionDescriptionInit);
            remoteDescriptionReady.current = true;
            await flushCandidates();
          } else if (signal.kind === "candidate") {
            if (remoteDescriptionReady.current) await connection.addIceCandidate(payload as RTCIceCandidateInit);
            else pendingCandidates.current.push(payload as RTCIceCandidateInit);
          } else if (signal.kind === "hangup") {
            finish();
            return;
          }
          lastSignalId.current = signal.id;
        } catch (error) {
          lastSignalId.current = signal.id;
          console.warn("[Call] Signal processing failed", error);
        }
      }
    };
    void process();
    return () => { cancelled = true; };
  }, [callId, emit, finish, flushCandidates, localReady, signals.data]);

  useEffect(() => () => cleanup(), [cleanup]);

  if (!call) return null;
  const accept = async () => { try { await respond.mutateAsync({ callId: call.id, accept: true }); await initialize(false); utils.calls.pending.invalidate(); } catch { /* mutation displays the server error */ } };
  const decline = async () => { try { await respond.mutateAsync({ callId: call.id, accept: false }); } finally { finish(); } };
  const hangup = async () => { try { await emit("hangup", { endedAt: Date.now() }); } catch { /* status still ends locally */ } try { await end.mutateAsync({ callId: call.id, reason: "ended" }); } finally { finish(); } };
  const toggleMic = () => { stream.current?.getAudioTracks().forEach(track => { track.enabled = !track.enabled; }); setMuted(value => !value); };
  const toggleCamera = () => { stream.current?.getVideoTracks().forEach(track => { track.enabled = !track.enabled; }); setCameraOff(value => !value); };
  const stateLabel = call.status === "ringing" ? (isCaller ? "Chamando..." : "Chamada recebida") : call.status === "connecting" ? "Conectando com segurança..." : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return <div className={cn("call-overlay", call.type === "video" && "video-call")}><section className="call-window">
    {call.type === "video" ? <div className="video-stage"><video ref={remoteVideo} autoPlay playsInline className="remote-video" /><video ref={localVideo} autoPlay muted playsInline className="local-video" />{!remoteReady && <div className="video-placeholder"><Avatar name={call.callerName} source={call.callerAvatar} /></div>}</div> : <><Avatar name={call.callerName} source={call.callerAvatar} /><h2>{isCaller ? "Chamada para" : "Chamada de"} {isCaller ? "contato" : call.callerName}</h2></>}
    <p className="call-state">{call.status === "connecting" && !localReady && <Loader2 className="animate-spin" />} {stateLabel}</p>
    {isReceiver && call.status === "ringing" ? <div className="incoming-actions"><Button variant="outline" onClick={decline}>Recusar</Button><Button onClick={accept} disabled={respond.isPending}>{respond.isPending ? <Loader2 className="animate-spin" /> : call.type === "video" ? <Video /> : <Mic />} Atender</Button></div> : <div className="call-controls"><Button variant="outline" size="icon" onClick={toggleMic} disabled={!localReady}>{muted ? <MicOff /> : <Mic />}</Button>{call.type === "video" && <Button variant="outline" size="icon" onClick={toggleCamera} disabled={!localReady}>{cameraOff ? <VideoOff /> : <Video />}</Button>}<Button variant="destructive" size="icon" onClick={hangup}><PhoneOff /></Button></div>}
  </section></div>;
}
