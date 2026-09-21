import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Bell, Camera, Check, CheckCheck, ChevronLeft, CircleUserRound, Copy, Download, FileText, ImagePlus,
  Info, Loader2, LogOut, Menu, MessageCircleMore, Mic, Moon, MoreHorizontal, Paperclip,
  Phone, Plus, Search, SendHorizonal, Smartphone, Smile, Sun, Trash2, UserRoundPlus, Video, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CallDialog } from "@/components/CallDialog";
import { InstallAppModal } from "@/components/InstallAppModal";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/ThemeContext";
import { resolveMediaUrl } from "@shared/media";

type FilePayload = { dataUrl: string; name: string; duration?: number; kind: "image" | "file" };
type ReplyTarget = { id: number; content: string | null; senderName: string | null };

function initials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.slice(0, 2).map(word => word[0]).join("").toUpperCase() || "CF";
}

function Avatar({ name, url, className }: { name?: string | null; url?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img src={url} alt={`Foto de ${name || "perfil"}`} className={cn("avatar-image", className)} onError={() => setFailed(true)} /> : <div className={cn("avatar-fallback", className)}>{initials(name)}</div>;
}

function formatTime(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

function presenceText(lastSeen?: Date | string | null, online?: boolean) {
  if (online) return "online";
  if (!lastSeen) return "offline";
  return `visto por último ${new Date(lastSeen).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxSide: number) {
  const original = await readFile(file);
  const image = new Image();
  image.src = original;
  await image.decode();
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  if (scale === 1 && file.size < 1_500_000) return original;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return original;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.84);
}

function linkify(text: string) {
  const chunks = text.split(/(https?:\/\/[^\s]+)/g);
  return chunks.map((chunk, index) => /^https?:\/\//.test(chunk)
    ? <a key={index} href={chunk} target="_blank" rel="noreferrer" className="message-link">{chunk}</a>
    : <span key={index}>{chunk}</span>);
}

function Receipt({ status }: { status?: "sent" | "delivered" | "read" }) {
  if (status === "read") return <CheckCheck className="receipt receipt-read" aria-label="Lida" />;
  if (status === "delivered") return <CheckCheck className="receipt" aria-label="Entregue" />;
  return <Check className="receipt" aria-label="Enviada" />;
}

function Welcome() {
  const { loading } = useAuth();
  const { installApp, showGuide, setShowGuide, isIOS, isInstalled } = usePwaInstall();
  const utils = trpc.useUtils();
  const login = trpc.auth.localLogin.useMutation({
    onSuccess: async (data: any) => {
      const token = data?.sessionToken;
      if (token) {
        localStorage.setItem("chat_session_token", token);
        sessionStorage.setItem("chat_session_token", token);
        document.cookie = `app_session_id=${token}; path=/; max-age=31536000; SameSite=Lax; Secure`;
      }
      if (data?.user) {
        utils.auth.me.setData(undefined, data.user);
      }
      await utils.auth.me.invalidate();
      await utils.profile.me.invalidate();
      toast.success("Acesso liberado.");
      setTimeout(() => {
        window.location.reload();
      }, 300);
    },
    onError: error => toast.error(error.message)
  });
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [familyCode, setFamilyCode] = useState("");
  return <main className="auth-shell">
    <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
    <section className="auth-panel">
      <img className="auth-logo" src="/icon-512.png" alt="ChatForAll" />
      <p className="eyebrow">Comunicação privada, sem ruído</p>
      <h1>Todos próximos.<br /><em>Onde importa.</em></h1>
      <p className="auth-copy">ChatForAll mantém as conversas da sua família em um espaço leve, privado e direto.</p>
      <form className="local-login-form" onSubmit={event => { event.preventDefault(); login.mutate({ name, email, familyCode }); }}>
        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome" autoComplete="name" />
        <Input value={email} onChange={event => setEmail(event.target.value)} placeholder="Seu e-mail" type="email" autoComplete="email" />
        <Input value={familyCode} onChange={event => setFamilyCode(event.target.value)} placeholder="Código privado da família" type="password" autoComplete="one-time-code" />
        <Button className="login-action" size="lg" disabled={loading || login.isPending} type="submit">
          {loading || login.isPending ? <Loader2 className="animate-spin" /> : <MessageCircleMore />} Entrar no ChatForAll
        </Button>
      </form>
      {!isInstalled && (
        <button type="button" onClick={installApp} className="install-pwa-banner">
          <Smartphone className="w-4 h-4 text-[var(--accent)]" />
          <span>Instalar app / atalho no celular</span>
          <Download className="w-4 h-4 text-[var(--accent)] ml-auto" />
        </button>
      )}
      <p className="auth-note">Use seu nome, e-mail e o código privado compartilhado pela família para entrar.</p>
    </section>
    <InstallAppModal open={showGuide} onOpenChange={setShowGuide} isIOS={isIOS} />
  </main>;
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const profile = trpc.profile.me.useQuery();
  const update = trpc.profile.update.useMutation({ onSuccess: onDone });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => { if (profile.data) { setName(profile.data.name || ""); setEmail(profile.data.email || ""); } }, [profile.data]);
  return <main className="onboarding-shell"><section className="onboarding-card">
    <div className="brand-mark"><MessageCircleMore /></div><p className="eyebrow">ChatForAll</p>
    <h1>Seu perfil, do seu jeito.</h1><p>Essas informações são mostradas apenas às pessoas com quem você conversar.</p>
    <form onSubmit={event => { event.preventDefault(); update.mutate({ name, email }); }} className="form-stack">
      <label>Nome público<Input value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome" autoComplete="name" /></label>
      <label>E-mail<Input value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" /></label>
      <Button type="submit" disabled={update.isPending}>{update.isPending && <Loader2 className="animate-spin" />} Continuar</Button>
    </form>
  </section></main>;
}

function ProfileDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (value: boolean) => void; profile: any }) {
  const utils = trpc.useUtils();
  const update = trpc.profile.update.useMutation({ onSuccess: () => toast.success("Perfil atualizado.") });
  const avatar = trpc.profile.updateAvatar.useMutation({ onSuccess: async () => { await utils.profile.me.invalidate(); toast.success("Foto atualizada."); }, onError: error => toast.error(error.message) });
  const removeAvatar = trpc.profile.removeAvatar.useMutation({ onSuccess: () => toast.success("Foto removida.") });
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [status, setStatus] = useState(profile?.status || "Disponível");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(profile?.name || ""); setEmail(profile?.email || ""); setStatus(profile?.status || "Disponível"); }, [profile]);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Escolha uma imagem em formato compatível.");
    try { avatar.mutate({ dataUrl: await compressImage(file, 640), name: file.name }); } catch { toast.error("Não foi possível preparar a foto."); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="profile-dialog">
    <DialogHeader><DialogTitle>Seu perfil</DialogTitle><DialogDescription>Atualize como você aparece nas conversas.</DialogDescription></DialogHeader>
    <div className="profile-hero"><Avatar name={profile?.name} url={profile?.avatarUrl} className="profile-avatar" />
      <div><strong>{profile?.name || "Seu perfil"}</strong><span>{profile?.email}</span></div></div>
    <div className="profile-actions"><Button variant="outline" onClick={() => fileRef.current?.click()} disabled={avatar.isPending}><Camera /> Alterar foto</Button>{profile?.avatarUrl && <Button variant="ghost" onClick={() => removeAvatar.mutate()}><Trash2 /> Remover</Button>}<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="user" hidden onChange={event => upload(event.target.files?.[0])} /></div>
    <form className="form-stack" onSubmit={event => { event.preventDefault(); update.mutate({ name, email, status }); }}>
      <label>Nome<Input value={name} onChange={event => setName(event.target.value)} /></label>
      <label>E-mail<Input value={email} type="email" onChange={event => setEmail(event.target.value)} /></label>
      <label>Status<Textarea value={status} maxLength={280} onChange={event => setStatus(event.target.value)} /></label>
      <Button type="submit" disabled={update.isPending}>{update.isPending && <Loader2 className="animate-spin" />} Salvar alterações</Button>
    </form>
  </DialogContent></Dialog>;
}

function NewChatDialog({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (value: boolean) => void; onChoose: (conversationId: number) => void }) {
  const [query, setQuery] = useState(""); const [groupMode, setGroupMode] = useState(false); const [title, setTitle] = useState(""); const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const search = trpc.profile.search.useQuery({ query: query || "_" }, { enabled: query.trim().length > 0 });
  const create = trpc.messaging.createDirect.useMutation({ onSuccess: result => { onChoose(result.conversationId); onOpenChange(false); setQuery(""); } });
  const createGroup = trpc.groups.create.useMutation({ onSuccess: result => { onChoose(result.conversationId); onOpenChange(false); setQuery(""); setSelectedPeople([]); setTitle(""); setGroupMode(false); } });
  const toggle = (id: number) => setSelectedPeople(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="new-chat-dialog">
    <DialogHeader><DialogTitle>{groupMode ? "Novo grupo" : "Nova conversa"}</DialogTitle><DialogDescription>{groupMode ? "Escolha as pessoas e dê um nome ao grupo." : "Encontre alguém pelo nome ou e-mail."}</DialogDescription></DialogHeader>
    {!groupMode && <div className="dialog-switch"><Button variant="outline" onClick={() => setGroupMode(true)}><UserRoundPlus /> Criar grupo</Button></div>}
    {groupMode && <div className="group-create-bar"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Nome do grupo" /><Button disabled={createGroup.isPending || selectedPeople.length < 1 || title.trim().length < 2} onClick={() => createGroup.mutate({ title, memberIds: selectedPeople })}>{createGroup.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Criar</Button></div>}
    <div className="search-field"><Search /><Input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar pessoas" /></div>
    <div className="people-results">{query && search.isLoading && <div className="quiet-state"><Loader2 className="animate-spin" /> Buscando...</div>}
      {query && !search.isLoading && !search.data?.length && <div className="quiet-state">Nenhuma pessoa encontrada.</div>}
      {search.data?.map(person => <button className={cn("person-row", selectedPeople.includes(person.id) && "selected")} key={person.id} onClick={() => groupMode ? toggle(person.id) : create.mutate({ userId: person.id })} disabled={create.isPending || createGroup.isPending}>
        <Avatar name={person.name} url={person.avatarUrl} /><span><strong>{person.name}</strong><small>{person.email}</small></span><span className={cn("presence-dot", person.online && "online")} />{groupMode && selectedPeople.includes(person.id) && <Check className="selected-check" />}</button>)}
    </div>
  </DialogContent></Dialog>;
}

function GroupInfoDialog({ open, onOpenChange, conversationId, currentUserId }: { open: boolean; onOpenChange: (value: boolean) => void; conversationId?: number; currentUserId?: number }) {
  const members = trpc.groups.members.useQuery({ conversationId: conversationId || 0 }, { enabled: open && Boolean(conversationId) });
  const addMembers = trpc.groups.addMembers.useMutation({ onSuccess: () => { members.refetch(); setQuery(""); toast.success("Membros adicionados."); } });
  const removeMember = trpc.groups.removeMember.useMutation({ onSuccess: () => members.refetch() });
  const rename = trpc.groups.rename.useMutation({ onSuccess: () => toast.success("Grupo renomeado.") });
  const [query, setQuery] = useState(""); const [title, setTitle] = useState("");
  const search = trpc.profile.search.useQuery({ query }, { enabled: open && query.trim().length > 0 });
  const addable = search.data?.filter(person => !members.data?.some(member => member.id === person.id)) || [];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="new-chat-dialog"><DialogHeader><DialogTitle>Informações do grupo</DialogTitle><DialogDescription>Gerencie o nome e as pessoas desta conversa.</DialogDescription></DialogHeader>
    <div className="group-create-bar"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Novo nome do grupo" /><Button disabled={!conversationId || title.trim().length < 2 || rename.isPending} onClick={() => rename.mutate({ conversationId: conversationId!, title })}><Check /> Salvar</Button></div>
    <div className="search-field"><Search /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Adicionar membro" /></div>
    {addable.map(person => <button className="person-row" key={person.id} onClick={() => addMembers.mutate({ conversationId: conversationId!, userIds: [person.id] })}><Avatar name={person.name} url={person.avatarUrl} /><span><strong>{person.name}</strong><small>{person.email}</small></span><Plus /></button>)}
    <div className="group-member-list">{members.data?.map(member => <div className="group-member" key={member.id}><Avatar name={member.name} url={member.avatarUrl} /><span><strong>{member.name}</strong><small>{member.role === "admin" ? "Administrador" : "Membro"}</small></span>{member.id !== currentUserId && <Button variant="ghost" size="sm" onClick={() => removeMember.mutate({ conversationId: conversationId!, userId: member.id })}>Remover</Button>}</div>)}</div>
  </DialogContent></Dialog>;
}

function ImagePreview({ source, onCancel, onSend }: { source: FilePayload; onCancel: () => void; onSend: (caption: string) => void }) {
  const [caption, setCaption] = useState("");
  return <div className="attachment-preview">{source.kind === "image" ? <img src={source.dataUrl} alt="Prévia do anexo" /> : <div className="file-preview-icon"><FileText /><small>{source.name}</small></div>}<div><Input value={caption} onChange={event => setCaption(event.target.value)} placeholder="Adicionar legenda" /><div className="preview-actions"><Button variant="ghost" size="icon" onClick={onCancel}><X /></Button><Button size="icon" onClick={() => onSend(caption)}><SendHorizonal /></Button></div></div></div>;
}

function AudioPlayer({ src, duration }: { src?: string | null; duration?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null); const [playing, setPlaying] = useState(false); const [progress, setProgress] = useState(0);
  if (!src) return <span>Áudio indisponível</span>;
  return <div className="audio-player"><button onClick={() => { if (audio.current?.paused) audio.current.play(); else audio.current?.pause(); }}><Mic className={playing ? "recording-icon" : ""} /></button><div className="audio-track"><input type="range" min="0" max="100" value={progress} onChange={event => { if (audio.current?.duration) audio.current.currentTime = (Number(event.target.value) / 100) * audio.current.duration; }} /><span>{duration ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}` : "Mensagem de voz"}</span></div><audio ref={audio} src={src} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0); }} onTimeUpdate={event => setProgress(event.currentTarget.duration ? (event.currentTarget.currentTime / event.currentTarget.duration) * 100 : 0)} /></div>;
}

function MessageBubble({ message, currentUserId, onReply, onDeleteMe, onDeleteAll }: { message: any; currentUserId?: number; onReply: (target: ReplyTarget) => void; onDeleteMe: (id: number) => void; onDeleteAll: (id: number) => void }) {
  const [actions, setActions] = useState(false); const own = message.senderId === currentUserId;
  const mediaUrl = resolveMediaUrl(message.fileUrl, message.fileKey);
  if (message.deletedAt) return <div className={cn("message-row", own && "own")}><div className="message-bubble deleted">Esta mensagem foi apagada.</div></div>;
  return <div className={cn("message-row", own && "own")} onMouseEnter={() => setActions(true)} onMouseLeave={() => setActions(false)}>
    <div className={cn("message-bubble", own && "own")}>
      {message.messageType === "image" && mediaUrl && <button className="photo-message" onClick={() => window.open(mediaUrl, "_blank", "noopener,noreferrer")}><img src={mediaUrl} alt={message.content || "Imagem enviada"} onError={event => { event.currentTarget.style.display = "none"; toast.error("Não foi possível carregar esta imagem."); }} /></button>}
      {message.messageType === "audio" && <AudioPlayer src={mediaUrl} duration={message.duration} />}
      {message.messageType === "file" && mediaUrl && <a className="document-message" href={mediaUrl} target="_blank" rel="noreferrer"><FileText /><span><strong>{message.fileName || "Documento"}</strong><small>Baixar arquivo</small></span></a>}
      {message.content && <p>{linkify(message.content)}</p>}
      <footer><time>{formatTime(message.createdAt)}</time>{own && <Receipt status={message.receiptStatus} />}</footer>
    </div>
    <AnimatePresence>{actions && <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="message-actions">
      <button aria-label="Responder" onClick={() => onReply({ id: message.id, content: message.content, senderName: message.senderName })}><MessageCircleMore /></button>
      {message.content && <button aria-label="Copiar" onClick={() => navigator.clipboard.writeText(message.content).then(() => toast.success("Mensagem copiada."))}><Copy /></button>}
      <button aria-label="Apagar para mim" onClick={() => onDeleteMe(message.id)}><Trash2 /></button>
      {own && <button aria-label="Apagar para todos" onClick={() => onDeleteAll(message.id)}><X /></button>}
    </motion.div>}</AnimatePresence>
  </div>;
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { installApp, showGuide, setShowGuide, isIOS, isInstalled } = usePwaInstall();
  const utils = trpc.useUtils();
  const profile = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 20_000 });
  const conversations = trpc.messaging.list.useQuery(undefined, { enabled: Boolean(profile.data?.isComplete), refetchInterval: 2_500 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false); const [newChatOpen, setNewChatOpen] = useState(false); const [groupInfoOpen, setGroupInfoOpen] = useState(false); const [sidebarOpen, setSidebarOpen] = useState(true);
  const selected = conversations.data?.find(conversation => conversation.id === selectedId) || null;
  const history = trpc.messaging.history.useQuery({ conversationId: selectedId || 0 }, { enabled: Boolean(selectedId), refetchInterval: 2_000 });
  const typing = trpc.messaging.typing.useQuery({ conversationId: selectedId || 0 }, { enabled: Boolean(selectedId), refetchInterval: 1_500 });
  const acknowledge = trpc.messaging.acknowledge.useMutation(); const deleteMe = trpc.messaging.deleteForMe.useMutation(); const deleteAll = trpc.messaging.deleteForEveryone.useMutation();
  const heartbeat = trpc.profile.heartbeat.useMutation(); const startCall = trpc.calls.start.useMutation({ onError: error => toast.error(error.message) });
  const pendingCall = trpc.calls.pending.useQuery(undefined, { enabled: Boolean(profile.data?.isComplete), refetchInterval: 1_500 });
  const [composer, setComposer] = useState(""); const [reply, setReply] = useState<ReplyTarget | null>(null); const [image, setImage] = useState<FilePayload | null>(null);
  const [olderMessages, setOlderMessages] = useState<any[]>([]); const [nextOlderCursor, setNextOlderCursor] = useState<Date | null>(null);
  const [recording, setRecording] = useState(false); const [recordingTime, setRecordingTime] = useState(0); const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const timer = useRef<number | null>(null); const recordingTimeRef = useRef(0); const recordGesture = useRef(false); const recordPointerType = useRef<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null); const scroll = useRef<HTMLDivElement>(null); const knownIncoming = useRef(new Set<number>());
  const send = trpc.messaging.send.useMutation({ onSuccess: () => { setComposer(""); setReply(null); setImage(null); utils.messaging.history.invalidate(); utils.messaging.list.invalidate(); }, onError: error => toast.error(error.message) });
  const setTyping = trpc.messaging.setTyping.useMutation();

  useEffect(() => { if (conversations.data && selectedId === null && conversations.data[0]) setSelectedId(conversations.data[0].id); }, [conversations.data, selectedId]);
  useEffect(() => { setOlderMessages([]); setNextOlderCursor(null); }, [selectedId]);
  useEffect(() => { if (!olderMessages.length) setNextOlderCursor(history.data?.nextCursor ?? null); }, [history.data?.nextCursor, olderMessages.length]);
  useEffect(() => { if (selectedId) acknowledge.mutate({ conversationId: selectedId, read: true }); }, [selectedId, history.data?.messages.length]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [history.data?.messages.length]);
  useEffect(() => { if (!isAuthenticated) return; const beat = () => heartbeat.mutate(); beat(); const interval = window.setInterval(beat, 30_000); return () => window.clearInterval(interval); }, [isAuthenticated]);
  useEffect(() => { const incoming = history.data?.messages.filter(message => message.senderId !== user?.id) || []; for (const message of incoming) { if (knownIncoming.current.has(message.id)) continue; knownIncoming.current.add(message.id); if (document.hidden && Notification.permission === "granted") new Notification(selected?.participant?.name || "Nova mensagem", { body: message.messageType === "text" ? (message.content || "Nova mensagem") : "Nova mídia recebida" }); } }, [history.data, selected?.participant?.name, user?.id]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  useEffect(() => { if (!isAuthenticated) return; const source = new EventSource("/api/realtime"); source.onmessage = () => { utils.messaging.list.invalidate(); utils.messaging.history.invalidate(); utils.calls.pending.invalidate(); }; source.onerror = () => source.close(); return () => source.close(); }, [isAuthenticated]);
  const displayedMessages = useMemo(() => [...olderMessages, ...(history.data?.messages || [])].filter((message, index, list) => list.findIndex(item => item.id === message.id) === index).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [olderMessages, history.data?.messages]);

  if (loading || (isAuthenticated && profile.isLoading)) return <div className="loading-screen"><Loader2 className="animate-spin" /></div>;
  if (!isAuthenticated) return <Welcome />;
  if (!profile.data?.isComplete) return <Onboarding onDone={() => profile.refetch()} />;

  const chooseConversation = (conversationId: number) => { setSelectedId(conversationId); setSidebarOpen(false); };
  const loadOlder = async () => { if (!selectedId || !nextOlderCursor) return; try { const page = await utils.messaging.history.fetch({ conversationId: selectedId, cursor: nextOlderCursor }); setOlderMessages(existing => [...page.messages, ...existing]); setNextOlderCursor(page.nextCursor); } catch { toast.error("Não foi possível carregar mensagens anteriores."); } };
  const prepareImage = async (file?: File) => { if (!file) return; const isImage = file.type.startsWith("image/"); const isDocument = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "text/plain", "text/csv"].includes(file.type); if (!isImage && !isDocument) return toast.error("Formato não permitido. Use imagem, PDF, DOC, DOCX, ZIP ou texto."); try { setImage({ dataUrl: isImage ? await compressImage(file, 1600) : await readFile(file), name: file.name, kind: isImage ? "image" : "file" }); } catch { toast.error("Não foi possível preparar o arquivo."); } };
  const submit = (caption = composer, media = image) => { if (!selectedId || send.isPending) return; send.mutate({ conversationId: selectedId, content: caption || undefined, replyToId: reply?.id, media: media ? { kind: media.kind, dataUrl: media.dataUrl, name: media.name } : undefined }); };
  const typingChange = (value: string) => { setComposer(value); if (!selectedId) return; setTyping.mutate({ conversationId: selectedId, active: Boolean(value.trim()) }); };
  const requestNotification = async () => { if (!("Notification" in window)) return toast.error("Este navegador não suporta notificações."); const permission = await Notification.requestPermission(); permission === "granted" ? toast.success("Notificações ativadas.") : toast.message("As notificações permanecem desativadas."); };
  const startRecord = async () => { if (!selectedId || recording || recorder.current) return; recordGesture.current = true; try { if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported"); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); if (!recordGesture.current) { stream.getTracks().forEach(track => track.stop()); return; } const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type)); const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); chunks.current = []; recordingTimeRef.current = 0; mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); }; mediaRecorder.onerror = () => { stream.getTracks().forEach(track => track.stop()); recorder.current = null; setRecording(false); toast.error("A gravação de áudio foi interrompida."); }; mediaRecorder.onstop = async () => { stream.getTracks().forEach(track => track.stop()); if (timer.current) window.clearInterval(timer.current); const duration = recordingTimeRef.current; const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" }); chunks.current = []; recorder.current = null; setRecording(false); setRecordingTime(0); if (!blob.size) return; try { const file = new File([blob], `mensagem-de-voz.${(mediaRecorder.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm"}`, { type: blob.type }); await send.mutateAsync({ conversationId: selectedId, media: { kind: "audio", dataUrl: await readFile(file), name: file.name, duration } }); } catch { toast.error("Não foi possível enviar o áudio. Tente novamente."); } }; recorder.current = mediaRecorder; mediaRecorder.start(250); setRecording(true); setRecordingTime(0); timer.current = window.setInterval(() => { recordingTimeRef.current += 1; setRecordingTime(recordingTimeRef.current); }, 1_000); } catch { recordGesture.current = false; toast.error("O acesso ao microfone foi negado ou indisponível."); } };
  const stopRecord = (discard = false) => { recordGesture.current = false; const active = recorder.current; if (!active) return; if (discard) { active.onstop = null; if (active.state !== "inactive") active.stop(); active.stream.getTracks().forEach(track => track.stop()); chunks.current = []; if (timer.current) window.clearInterval(timer.current); recorder.current = null; setRecording(false); setRecordingTime(0); return; } if (active.state !== "inactive") active.stop(); };

  return <div className="app-shell">
    <aside className={cn("sidebar", !sidebarOpen && "mobile-hidden")}>
      <header className="sidebar-header"><button className="brand" onClick={() => setSelectedId(null)}><img className="brand-logo" src="/icon-192.png" alt="ChatForAll" /><span>ChatForAll</span></button><div className="header-tools"><button aria-label="Nova conversa" onClick={() => setNewChatOpen(true)}><Plus /></button><button className="mobile-only" aria-label="Fechar" onClick={() => setSidebarOpen(false)}><X /></button></div></header>
      <button className="account-card" onClick={() => setProfileOpen(true)}><Avatar name={profile.data.name} url={profile.data.avatarUrl} /><span><strong>{profile.data.name}</strong><small>{profile.data.status || "Disponível"}</small></span><MoreHorizontal /></button>
      <div className="sidebar-search"><Search /><Input placeholder="Pesquisar conversas" onChange={event => { const term = event.target.value.toLowerCase(); if (!term) return; const match = conversations.data?.find(item => item.participant?.name?.toLowerCase().includes(term)); if (match) setSelectedId(match.id); }} /></div>
      <div className="conversation-list">{conversations.isLoading && <div className="quiet-state"><Loader2 className="animate-spin" /> Carregando conversas</div>}{!conversations.isLoading && !conversations.data?.length && <div className="clean-empty"><MessageCircleMore /><strong>Suas conversas começam aqui.</strong><span>Crie uma nova conversa para falar com alguém da família.</span><Button variant="outline" onClick={() => setNewChatOpen(true)}><UserRoundPlus /> Nova conversa</Button></div>}{conversations.data?.map(conversation => <button key={conversation.id} className={cn("conversation-row", selectedId === conversation.id && "active", conversation.unreadCount > 0 && "unread")} onClick={() => chooseConversation(conversation.id)}><Avatar name={conversation.participant?.name || conversation.title} url={conversation.participant?.avatarUrl} /><span className="conversation-copy"><span><strong>{conversation.participant?.name || conversation.title || "Conversa"}</strong><time>{formatTime(conversation.latestMessage?.createdAt)}</time></span><span><small>{conversation.latestMessage?.deletedAt ? "Mensagem apagada" : conversation.latestMessage?.messageType === "image" ? "Imagem" : conversation.latestMessage?.messageType === "audio" ? "Mensagem de voz" : conversation.latestMessage?.messageType === "file" ? "Documento" : conversation.latestMessage?.content || "Conversa iniciada"}</small>{conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}</span></span></button>)}</div>
      <footer className="sidebar-footer">
        {!isInstalled && <button className="install-btn" onClick={installApp} title="Instalar aplicativo"><Download /> Instalar</button>}
        <button onClick={requestNotification}><Bell /> Notificações</button>
        <button onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Modo claro" : "Modo escuro"}</button>
        <button onClick={() => logout()}><LogOut /> Sair</button>
      </footer>
    </aside>

    <main className={cn("chat-stage", !selected && "no-selection")}>{!selected ? <section className="stage-empty"><div className="stage-art"><MessageCircleMore /><span /><span /><span /></div><p className="eyebrow">ChatForAll</p><h2>Uma conversa de cada vez.</h2><p>Selecione uma conversa ou comece uma nova quando estiver pronto.</p><Button onClick={() => setNewChatOpen(true)}><Plus /> Nova conversa</Button></section> : <>
      <header className="chat-header"><button className="mobile-only" aria-label="Voltar" onClick={() => setSidebarOpen(true)}><ArrowLeft /></button><button className="chat-person" onClick={() => selected.type === "group" ? setGroupInfoOpen(true) : setProfileOpen(true)}><Avatar name={selected.participant?.name || selected.title} url={selected.participant?.avatarUrl} /><span><strong>{selected.participant?.name || selected.title || "Grupo"}</strong><small className={selected.participant?.online ? "online-text" : ""}>{selected.type === "group" ? "Informações do grupo" : presenceText(selected.participant?.lastSeen, selected.participant?.online)}</small></span></button><div className="call-actions">{selected.type !== "group" && <><button aria-label="Iniciar chamada de áudio" disabled={startCall.isPending} onClick={() => startCall.mutate({ conversationId: selected.id, type: "audio" })}><Phone /></button><button aria-label="Chamar por vídeo" disabled={startCall.isPending} onClick={() => startCall.mutate({ conversationId: selected.id, type: "video" })}><Video /></button></>}<button aria-label="Informações da conversa" onClick={() => selected.type === "group" ? setGroupInfoOpen(true) : toast.message(selected.participant?.status || "Sem status.")}><Info /></button></div></header>
      <div className="message-scroll" ref={scroll}>{history.isLoading && <div className="quiet-state"><Loader2 className="animate-spin" /> Carregando mensagens</div>}<button className="load-more" onClick={loadOlder} style={{ display: nextOlderCursor ? "block" : "none" }}>Carregar mensagens anteriores</button>{displayedMessages.length === 0 && <div className="conversation-empty"><MessageCircleMore /><span>Nenhuma mensagem ainda.</span><small>Envie a primeira mensagem para iniciar a conversa.</small></div>}{displayedMessages.map(message => <MessageBubble key={message.id} message={message} currentUserId={user?.id} onReply={setReply} onDeleteMe={id => deleteMe.mutate({ messageId: id }, { onSuccess: () => utils.messaging.history.invalidate() })} onDeleteAll={id => deleteAll.mutate({ messageId: id }, { onSuccess: () => utils.messaging.history.invalidate(), onError: error => toast.error(error.message) })} />)}{typing.data?.map(entry => <div key={entry.userId} className="typing-indicator"><span /><span /><span /> {entry.name} está digitando...</div>)}</div>
      <div className="composer-area">{reply && <div className="reply-bar"><MessageCircleMore /><span>Respondendo a <strong>{reply.senderName || "mensagem"}</strong><small>{reply.content || "Mídia"}</small></span><button onClick={() => setReply(null)}><X /></button></div>}{image && <ImagePreview source={image} onCancel={() => setImage(null)} onSend={caption => submit(caption, image)} />}{recording ? <div className="recording-bar"><button onClick={() => stopRecord(true)} aria-label="Cancelar gravação"><Trash2 /></button><span><i /> Solte para enviar · {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}</span><Button size="icon" onClick={() => stopRecord(false)}><SendHorizonal /></Button></div> : <div className="composer"><button aria-label="Emoji" onClick={() => typingChange(`${composer}😊`)}><Smile /></button><button aria-label="Anexar imagem ou documento" onClick={() => imageInput.current?.click()}><Paperclip /></button><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,text/plain,text/csv" hidden onChange={event => prepareImage(event.target.files?.[0])} /><Textarea value={composer} onChange={event => typingChange(event.target.value)} placeholder="Escreva uma mensagem" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} /><button aria-label="Gravar mensagem de voz" onPointerDown={event => { recordPointerType.current = event.pointerType; if (event.pointerType === "mouse") void startRecord(); }} onPointerUp={event => { if (event.pointerType === "mouse") stopRecord(false); }} onPointerLeave={event => { if (event.pointerType === "mouse" && recording) stopRecord(true); }} onClick={() => { if (recordPointerType.current !== "mouse") { if (recording) stopRecord(false); else void startRecord(); } recordPointerType.current = null; }} onKeyDown={event => { if (event.key === " ") { event.preventDefault(); void startRecord(); } }} onKeyUp={event => { if (event.key === " ") stopRecord(false); }}><Mic /></button><Button size="icon" aria-label="Enviar mensagem" disabled={send.isPending || (!composer.trim() && !image)} onClick={() => submit()}>{send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}</Button></div>}</div>
    </>}</main>
    <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} profile={profile.data} /><NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onChoose={chooseConversation} /><GroupInfoDialog open={groupInfoOpen} onOpenChange={setGroupInfoOpen} conversationId={selected?.type === "group" ? selected.id : undefined} currentUserId={user?.id} />
    <CallDialog call={pendingCall.data && ["ringing", "connecting", "active"].includes(pendingCall.data.status) ? pendingCall.data as any : null} currentUserId={user?.id} onFinished={() => pendingCall.refetch()} />
    <InstallAppModal open={showGuide} onOpenChange={setShowGuide} isIOS={isIOS} />
  </div>;
}
