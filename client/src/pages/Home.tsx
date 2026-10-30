import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Bell, Camera, Check, CheckCheck, ChevronLeft, CircleUserRound, Copy, Download, FileText, ImagePlus,
  Info, Loader2, LogOut, Menu, MessageCircle, MessageCircleMore, MessageSquarePlus, Mic, Moon, MoreHorizontal, Paperclip,
  Phone, Plus, Search, SendHorizonal, Smartphone, Smile, Sun, Trash2, UserRoundPlus, Users, Video, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CallDialog } from "@/components/CallDialog";
import { InstallAppModal } from "@/components/InstallAppModal";
import { DownloadApkModal } from "@/components/DownloadApkModal";
import { InviteModal } from "@/components/InviteModal";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/ThemeContext";
import { resolveMediaUrl } from "@shared/media";
import { getEmojiDisplayStyle } from "@/lib/emojiUtils";
import { EmojiPicker } from "@/components/EmojiPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPlus, User, AtSign, Mail, Lock, Sparkles, ShieldCheck } from "lucide-react";

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
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [mode, setMode] = useState<"signup" | "login">("signup");

  const invitedBy = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("u") : null;

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
      await utils.auth.me.refetch();
      await utils.profile.me.refetch();
      toast.success("Conta acessada com sucesso!");
    },
    onError: error => toast.error(error.message)
  });

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "signup") {
      const cleanName = name.trim();
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const cleanEmail = email.trim();
      if (!cleanName) return toast.error("Informe seu nome.");
      if (!cleanEmail) return toast.error("Informe seu e-mail.");

      const finalEmail = cleanEmail.includes("@") ? cleanEmail : `${cleanUsername || cleanName.toLowerCase().replace(/\s+/g, "")}@chat.creativeam.com.br`;
      login.mutate({ name: cleanName, email: finalEmail, nickname: cleanUsername, password: password || undefined, inviteBy: invitedBy || undefined });
    } else {
      const cleanIdentifier = email.trim();
      const cleanName = name.trim() || cleanIdentifier.split("@")[0] || "Usuário";
      if (!cleanIdentifier) return toast.error("Informe seu e-mail ou apelido.");
      const finalEmail = cleanIdentifier.includes("@") ? cleanIdentifier : `${cleanIdentifier.toLowerCase().replace(/[^a-z0-9_]/g, "")}@chat.creativeam.com.br`;
      login.mutate({ name: cleanName, email: finalEmail, password: password || undefined });
    }
  };

  return <main className="auth-shell">
    <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
    <section className="auth-panel">
      <img className="auth-logo h-14 sm:h-16 w-auto object-contain mx-auto mb-2" src="/ChatForAll-Logo.png" alt="ChatForAll" />
      
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0080EA]/10 border border-[#0080EA]/25 text-[#0080EA] text-[11px] font-extrabold uppercase tracking-wider mb-3">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Comunicação Direta & Privada</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
        Converse Livremente.<br />
        <span className="text-[#0080EA]">Simples e descomplicado.</span>
      </h1>
      
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
        Mensagens, fotos, áudios e chamadas criptografadas sem precisar expor seu número de celular.
      </p>

      {invitedBy && (
        <div className="p-3 mb-4 bg-[#0080EA]/10 border border-[#0080EA]/30 rounded-2xl text-xs text-[#0080EA] dark:text-[#38BDF8] font-semibold flex items-center gap-2 text-left">
          <span>✨</span>
          <span>Você foi convidado por <b>@{invitedBy}</b>! Crie sua conta abaixo para conectar:</span>
        </div>
      )}

      <div className="flex w-full p-1 bg-slate-100 dark:bg-[#142034] rounded-2xl border border-slate-200/80 dark:border-[#1E2F4D] mb-4">
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${mode === "signup" ? "bg-[#0080EA] text-white shadow-md shadow-[#0080EA]/25" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}
        >
          Criar Conta
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${mode === "login" ? "bg-[#0080EA] text-white shadow-md shadow-[#0080EA]/25" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}
        >
          Já tenho conta
        </button>
      </div>

      <form className="local-login-form flex flex-col gap-3" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <>
            <div className="relative flex items-center">
              <User className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Seu nome completo"
                autoComplete="name"
                required
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0080EA] focus:ring-4 focus:ring-[#0080EA]/15 outline-none transition-all"
              />
            </div>

            <div className="relative flex items-center">
              <AtSign className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={username}
                onChange={event => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="Apelido único (ex: @seu_nome)"
                autoComplete="username"
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0080EA] focus:ring-4 focus:ring-[#0080EA]/15 outline-none transition-all"
              />
            </div>

            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Seu e-mail"
                type="email"
                autoComplete="email"
                required
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0080EA] focus:ring-4 focus:ring-[#0080EA]/15 outline-none transition-all"
              />
            </div>

            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Criar senha de acesso (opcional)"
                type="password"
                autoComplete="new-password"
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0080EA] focus:ring-4 focus:ring-[#0080EA]/15 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || login.isPending}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0080EA] to-[#005bb5] hover:from-[#0070d0] hover:to-[#004f9f] text-white font-bold text-sm shadow-lg shadow-[#0080EA]/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              {loading || login.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircleMore className="w-5 h-5" />}
              <span>Criar Conta e Entrar</span>
            </button>
          </>
        ) : (
          <>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Seu e-mail ou @apelido"
                autoComplete="email"
                required
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0080EA] focus:ring-4 focus:ring-[#0080EA]/15 outline-none transition-all"
              />
            </div>

            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Sua senha de acesso"
                type="password"
                autoComplete="current-password"
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#0080EA] focus:ring-4 focus:ring-[#0080EA]/15 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || login.isPending}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0080EA] to-[#005bb5] hover:from-[#0070d0] hover:to-[#004f9f] text-white font-bold text-sm shadow-lg shadow-[#0080EA]/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              {loading || login.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircleMore className="w-5 h-5" />}
              <span>Entrar no ChatForAll</span>
            </button>
          </>
        )}
      </form>

      <div className="flex flex-col gap-2 w-full mt-3">
        <button
          type="button"
          onClick={() => setDownloadModalOpen(true)}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold bg-[#0080EA]/10 hover:bg-[#0080EA]/20 text-[#0080EA] dark:text-[#38BDF8] border border-[#0080EA]/25 transition-all cursor-pointer"
        >
          <Smartphone className="w-4 h-4" />
          <span>Baixar APK oficial para Android</span>
        </button>

        {!isInstalled && (
          <button type="button" onClick={installApp} className="install-pwa-banner text-xs">
            <Smartphone className="w-4 h-4 text-[var(--accent)]" />
            <span>Adicionar atalho na tela inicial</span>
            <Download className="w-4 h-4 text-[var(--accent)] ml-auto" />
          </button>
        )}
      </div>

      <div className="mt-5 pt-3 border-t border-slate-200/60 dark:border-[#1E2F4D]/60 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-[#0080EA]" />
        <span>ChatForAll Oficial · Conexão Segura & Criptografada</span>
      </div>
    </section>

    <InstallAppModal open={showGuide} onOpenChange={setShowGuide} isIOS={isIOS} />
    <DownloadApkModal open={downloadModalOpen} onOpenChange={setDownloadModalOpen} />
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
  const update = trpc.profile.update.useMutation({
    onSuccess: async () => {
      await utils.profile.me.invalidate();
      toast.success("Perfil atualizado com sucesso!");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });
  const avatar = trpc.profile.updateAvatar.useMutation({
    onSuccess: async () => {
      await utils.profile.me.invalidate();
      toast.success("Foto atualizada com sucesso.");
    },
    onError: error => toast.error(error.message),
  });
  const removeAvatar = trpc.profile.removeAvatar.useMutation({
    onSuccess: async () => {
      await utils.profile.me.invalidate();
      toast.success("Foto removida.");
    },
    onError: error => toast.error(error.message),
  });
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [status, setStatus] = useState(profile?.status || "Disponível");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(profile?.name || "");
    setEmail(profile?.email || "");
    setStatus(profile?.status || "Disponível");
  }, [profile]);

  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Escolha uma imagem em formato compatível.");
    try {
      avatar.mutate({ dataUrl: await compressImage(file, 640), name: file.name });
    } catch {
      toast.error("Não foi possível preparar a foto.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="profile-dialog sm:max-w-md bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-slate-900 dark:text-slate-100 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">Meu Perfil</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Atualize seu nome, foto e status para que sua família reconheça você.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#142034] border border-slate-200 dark:border-slate-800 my-2">
          <Avatar name={profile?.name} url={profile?.avatarUrl} className="w-16 h-16 rounded-2xl border-2 border-[#0080EA] shadow-sm" />
          <div className="flex-1 min-w-0">
            <strong className="block text-base font-semibold truncate text-slate-900 dark:text-white">
              {profile?.name || "Seu perfil"}
            </strong>
            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{profile?.email}</span>
            <span className="inline-block mt-1 text-[11px] font-medium text-[#0080EA] bg-[#0080EA]/10 dark:bg-[#0080EA]/20 px-2.5 py-0.5 rounded-full">
              {status || "Disponível"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={avatar.isPending}
            className="flex-1 border-slate-300 dark:border-slate-700 hover:bg-[#0080EA]/10 font-medium"
          >
            <Camera className="w-4 h-4 mr-1.5 text-[#0080EA]" /> Alterar foto
          </Button>
          {profile?.avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeAvatar.mutate()}
              disabled={removeAvatar.isPending}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Remover
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="user"
            hidden
            onChange={event => upload(event.target.files?.[0])}
          />
        </div>

        <form
          className="space-y-4 pt-2"
          onSubmit={event => {
            event.preventDefault();
            update.mutate({ name, email, status });
          }}
        >
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Nome completo</label>
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Seu nome"
              required
              className="bg-white dark:bg-[#0E1726] border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">E-mail</label>
            <Input
              value={email}
              type="email"
              onChange={event => setEmail(event.target.value)}
              placeholder="seuemail@exemplo.com"
              required
              className="bg-white dark:bg-[#0E1726] border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Status / Recado</label>
            <Textarea
              value={status}
              maxLength={280}
              onChange={event => setStatus(event.target.value)}
              placeholder="Ex: Disponível, Na estrada, Em reunião..."
              rows={2}
              className="bg-white dark:bg-[#0E1726] border-slate-300 dark:border-slate-700 resize-none text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-300 dark:border-slate-700 text-xs font-medium"
            >
              Fechar
            </Button>
            <Button
              type="submit"
              disabled={update.isPending}
              className="bg-[#0080EA] hover:bg-[#0060B8] text-white font-medium text-xs shadow-md"
            >
              {update.isPending ? <Loader2 className="animate-spin w-3.5 h-3.5 mr-1.5" /> : null}
              Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewChatDialog({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (value: boolean) => void; onChoose: (conversationId: number, contactName?: string) => void }) {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);

  // Automatically fetch contacts when dialog is open without requiring text query
  const search = trpc.profile.search.useQuery({ query: query.trim() }, { enabled: open });

  const create = trpc.messaging.createDirect.useMutation({
    onSuccess: (result, variables) => {
      const contact = search.data?.find(p => p.id === variables.userId);
      utils.messaging.list.invalidate();
      onChoose(result.conversationId, contact?.name ?? undefined);
      onOpenChange(false);
      setQuery("");
    },
    onError: error => toast.error(error.message),
  });

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: result => {
      onChoose(result.conversationId);
      onOpenChange(false);
      setQuery("");
      setSelectedPeople([]);
      setTitle("");
      setGroupMode(false);
    },
    onError: error => toast.error(error.message),
  });

  const toggle = (id: number) => setSelectedPeople(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="new-chat-dialog sm:max-w-md bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1E2F4D] text-slate-900 dark:text-slate-100 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
            {groupMode ? "Criar novo grupo" : "Nova conversa"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            {groupMode ? "Escolha as pessoas da família e dê um nome ao grupo." : "Toque em qualquer pessoa abaixo para começar a conversar na hora."}
          </DialogDescription>
        </DialogHeader>

        {!groupMode && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setGroupMode(true)} className="text-xs border-slate-300 dark:border-slate-700">
              <UserRoundPlus className="w-3.5 h-3.5 mr-1.5 text-[#0080EA]" /> Criar grupo familiar
            </Button>
          </div>
        )}

        {groupMode && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="Nome do grupo (ex: Família)"
                className="bg-white dark:bg-[#0E1726] text-sm"
              />
              <Button
                disabled={createGroup.isPending || selectedPeople.length < 1 || title.trim().length < 2}
                onClick={() => createGroup.mutate({ title, memberIds: selectedPeople })}
                className="bg-[#0080EA] hover:bg-[#0060B8] text-white text-xs whitespace-nowrap"
              >
                {createGroup.isPending ? <Loader2 className="animate-spin w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />} Criar ({selectedPeople.length})
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-[#0080EA] hover:underline"
              onClick={() => { setGroupMode(false); setSelectedPeople([]); }}
            >
              ← Voltar para conversa individual
            </button>
          </div>
        )}

        <div className="search-field relative my-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Pesquisar por nome ou e-mail..."
            className="pl-9 bg-slate-50 dark:bg-[#142034] text-sm"
          />
        </div>

        <div className="people-results overflow-y-auto max-h-[320px] divide-y divide-slate-100 dark:divide-slate-800 -mx-2 px-2">
          {search.isLoading && (
            <div className="quiet-state py-8 text-center text-xs text-slate-500">
              <Loader2 className="animate-spin w-5 h-5 mx-auto mb-2 text-[#0080EA]" />
              Buscando contatos cadastrados...
            </div>
          )}

          {!search.isLoading && !search.data?.length && (
            <div className="quiet-state py-8 text-center text-xs text-slate-500">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-60" />
              Nenhum contato encontrado.
            </div>
          )}

          {search.data?.map(person => (
            <button
              type="button"
              className={cn(
                "person-row w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-[#142034] transition-colors rounded-xl my-1",
                selectedPeople.includes(person.id) && "bg-[#0080EA]/10 dark:bg-[#0080EA]/20 font-semibold"
              )}
              key={person.id}
              onClick={() => (groupMode ? toggle(person.id) : create.mutate({ userId: person.id }))}
              disabled={create.isPending || createGroup.isPending}
            >
              <div className="relative shrink-0">
                <Avatar name={person.name} url={person.avatarUrl} className="w-10 h-10 rounded-full" />
                <span className={cn("presence-dot absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0E1726]", person.online ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-semibold truncate text-slate-900 dark:text-white">
                    {person.name}
                  </strong>
                  {!groupMode && (
                    <span className="text-[11px] font-semibold text-[#0080EA] bg-[#0080EA]/10 dark:bg-[#0080EA]/20 px-2 py-0.5 rounded-full shrink-0 ml-2">
                      Conversar
                    </span>
                  )}
                </div>
                <small className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                  {person.email || person.status || "Disponível"}
                </small>
              </div>

              {groupMode && selectedPeople.includes(person.id) && (
                <Check className="selected-check w-4 h-4 text-[#0080EA] ml-auto shrink-0" />
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
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
      {message.content && (() => {
        const emojiInfo = getEmojiDisplayStyle(message.content);
        return emojiInfo.isEmojiOnly ? (
          <div className={`select-none text-center ${emojiInfo.sizeClass}`}>
            {message.content}
          </div>
        ) : (
          <p>{linkify(message.content)}</p>
        );
      })()}
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
  const [pendingContact, setPendingContact] = useState<{ name: string } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"chats" | "contacts">("chats");
  const allContacts = trpc.profile.search.useQuery({ query: "" }, { enabled: Boolean(profile.data?.isComplete), refetchInterval: 10_000 });
  const createDirect = trpc.messaging.createDirect.useMutation({
    onSuccess: (result, variables) => {
      const contact = allContacts.data?.find(p => p.id === variables.userId);
      utils.messaging.list.invalidate();
      chooseConversation(result.conversationId, contact?.name);
      setSidebarTab("chats");
      if (window.innerWidth < 768) setSidebarOpen(false);
    },
    onError: error => toast.error(error.message),
  });
  const [profileOpen, setProfileOpen] = useState(false); const [newChatOpen, setNewChatOpen] = useState(false); const [groupInfoOpen, setGroupInfoOpen] = useState(false); const [sidebarOpen, setSidebarOpen] = useState(true);
  const [downloadApkOpen, setDownloadApkOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const selected = conversations.data?.find(conversation => conversation.id === selectedId) || null;
  const conversationReady = Boolean(selectedId && selected);
  const history = trpc.messaging.history.useQuery({ conversationId: selectedId || 0 }, { enabled: conversationReady, refetchInterval: 2_000 });
  const typing = trpc.messaging.typing.useQuery({ conversationId: selectedId || 0 }, { enabled: conversationReady, refetchInterval: 1_500 });
  const acknowledge = trpc.messaging.acknowledge.useMutation(); const deleteMe = trpc.messaging.deleteForMe.useMutation(); const deleteAll = trpc.messaging.deleteForEveryone.useMutation();
  const heartbeat = trpc.profile.heartbeat.useMutation(); const startCall = trpc.calls.start.useMutation({ onError: error => toast.error(error.message) });
  const pendingCall = trpc.calls.pending.useQuery(undefined, { enabled: Boolean(profile.data?.isComplete), refetchInterval: 1_500 });
  const [composer, setComposer] = useState(""); const [reply, setReply] = useState<ReplyTarget | null>(null); const [image, setImage] = useState<FilePayload | null>(null);
  const [olderMessages, setOlderMessages] = useState<any[]>([]); const [nextOlderCursor, setNextOlderCursor] = useState<Date | null>(null);
  const [recording, setRecording] = useState(false); const [recordingTime, setRecordingTime] = useState(0); const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const timer = useRef<number | null>(null); const recordingTimeRef = useRef(0); const recordGesture = useRef(false); const recordPointerType = useRef<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null); const scroll = useRef<HTMLDivElement>(null); const knownIncoming = useRef(new Set<number>());
  const send = trpc.messaging.send.useMutation({ onSuccess: () => { setComposer(""); setReply(null); setImage(null); utils.messaging.history.invalidate(); utils.messaging.list.invalidate(); }, onError: error => toast.error(error.message) });
  const setTyping = trpc.messaging.setTyping.useMutation();
  const resetData = (trpc.auth as any).resetAllData.useMutation({
    onSuccess: () => {
      toast.success('Banco de dados zerado com sucesso!');
      logout();
      window.location.reload();
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao zerar dados.')
  });

  useEffect(() => { if (conversations.data && selectedId === null && conversations.data[0]) setSelectedId(conversations.data[0].id); }, [conversations.data, selectedId]);
  useEffect(() => { setOlderMessages([]); setNextOlderCursor(null); }, [selectedId]);
  useEffect(() => { if (!olderMessages.length) setNextOlderCursor(history.data?.nextCursor ?? null); }, [history.data?.nextCursor, olderMessages.length]);
  useEffect(() => { if (selectedId) acknowledge.mutate({ conversationId: selectedId, read: true }); }, [selectedId, history.data?.messages.length]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [history.data?.messages.length]);
  useEffect(() => { if (!isAuthenticated) return; const beat = () => heartbeat.mutate(); beat(); const interval = window.setInterval(beat, 30_000); return () => window.clearInterval(interval); }, [isAuthenticated]);
  useEffect(() => { const incoming = history.data?.messages.filter(message => message.senderId !== user?.id) || []; for (const message of incoming) { if (knownIncoming.current.has(message.id)) continue; knownIncoming.current.add(message.id); if (document.hidden && Notification.permission === "granted") new Notification(selected?.participant?.name || "Nova mensagem", { body: message.messageType === "text" ? (message.content || "Nova mensagem") : "Nova mídia recebida" }); } }, [history.data, selected?.participant?.name, user?.id]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  useEffect(() => { if (!isAuthenticated) return; const source = new EventSource("/api/realtime"); source.onmessage = () => { utils.messaging.list.invalidate(); utils.messaging.history.invalidate(); utils.calls.pending.invalidate(); }; source.onerror = () => source.close(); return () => source.close(); }, [isAuthenticated]);
  // When selected loads, clear the pending contact info
  useEffect(() => { if (selected) setPendingContact(null); }, [selected]);
  const displayedMessages = useMemo(() => [...olderMessages, ...(history.data?.messages || [])].filter((message, index, list) => list.findIndex(item => item.id === message.id) === index).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [olderMessages, history.data?.messages]);

  if (loading || (isAuthenticated && profile.isLoading)) return <div className="loading-screen"><Loader2 className="animate-spin" /></div>;
  if (!isAuthenticated) return <Welcome />;
  if (!profile.data?.isComplete) return <Onboarding onDone={() => profile.refetch()} />;

  const chooseConversation = (conversationId: number, contactName?: string) => { setSelectedId(conversationId); setSidebarOpen(false); if (contactName) setPendingContact({ name: contactName }); utils.messaging.list.invalidate(); };
  const loadOlder = async () => { if (!selectedId || !nextOlderCursor) return; try { const page = await utils.messaging.history.fetch({ conversationId: selectedId, cursor: nextOlderCursor }); setOlderMessages(existing => [...page.messages, ...existing]); setNextOlderCursor(page.nextCursor); } catch { toast.error("Não foi possível carregar mensagens anteriores."); } };
  const prepareImage = async (file?: File) => { if (!file) return; const isImage = file.type.startsWith("image/"); const isDocument = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "text/plain", "text/csv"].includes(file.type); if (!isImage && !isDocument) return toast.error("Formato não permitido. Use imagem, PDF, DOC, DOCX, ZIP ou texto."); try { setImage({ dataUrl: isImage ? await compressImage(file, 1600) : await readFile(file), name: file.name, kind: isImage ? "image" : "file" }); } catch { toast.error("Não foi possível preparar o arquivo."); } };
  const submit = (caption = composer, media = image) => { if (!selectedId || send.isPending) return; send.mutate({ conversationId: selectedId, content: caption || undefined, replyToId: reply?.id, media: media ? { kind: media.kind, dataUrl: media.dataUrl, name: media.name } : undefined }); };
  const typingChange = (value: string) => { setComposer(value); if (!selectedId) return; setTyping.mutate({ conversationId: selectedId, active: Boolean(value.trim()) }); };
  const requestNotification = async () => { if (!("Notification" in window)) return toast.error("Este navegador não suporta notificações."); const permission = await Notification.requestPermission(); permission === "granted" ? toast.success("Notificações ativadas.") : toast.message("As notificações permanecem desativadas."); };
  const startRecord = async () => { if (!selectedId || recording || recorder.current) return; recordGesture.current = true; try { if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported"); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); if (!recordGesture.current) { stream.getTracks().forEach(track => track.stop()); return; } const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type)); const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); chunks.current = []; recordingTimeRef.current = 0; mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); }; mediaRecorder.onerror = () => { stream.getTracks().forEach(track => track.stop()); recorder.current = null; setRecording(false); toast.error("A gravação de áudio foi interrompida."); }; mediaRecorder.onstop = async () => { stream.getTracks().forEach(track => track.stop()); if (timer.current) window.clearInterval(timer.current); const duration = recordingTimeRef.current; const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" }); chunks.current = []; recorder.current = null; setRecording(false); setRecordingTime(0); if (!blob.size) return; try { const file = new File([blob], `mensagem-de-voz.${(mediaRecorder.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm"}`, { type: blob.type }); await send.mutateAsync({ conversationId: selectedId, media: { kind: "audio", dataUrl: await readFile(file), name: file.name, duration } }); } catch { toast.error("Não foi possível enviar o áudio. Tente novamente."); } }; recorder.current = mediaRecorder; mediaRecorder.start(250); setRecording(true); setRecordingTime(0); timer.current = window.setInterval(() => { recordingTimeRef.current += 1; setRecordingTime(recordingTimeRef.current); }, 1_000); } catch { recordGesture.current = false; toast.error("O acesso ao microfone foi negado ou indisponível."); } };
  const stopRecord = (discard = false) => { recordGesture.current = false; const active = recorder.current; if (!active) return; if (discard) { active.onstop = null; if (active.state !== "inactive") active.stop(); active.stream.getTracks().forEach(track => track.stop()); chunks.current = []; if (timer.current) window.clearInterval(timer.current); recorder.current = null; setRecording(false); setRecordingTime(0); return; } if (active.state !== "inactive") active.stop(); };

  return <div className="app-shell">
    <aside className={cn("sidebar", !sidebarOpen && "mobile-hidden")}>
      <header className="sidebar-header"><button className="brand" onClick={() => setSelectedId(null)}><img className="brand-logo" src="/icon-192.png" alt="ChatForAll" /><span>ChatForAll</span></button><div className="header-tools"><button aria-label="Convidar amigo por link" onClick={() => setInviteModalOpen(true)} title="Convidar amigo com link pessoal"><UserPlus className="w-5 h-5 text-[#0080EA] dark:text-[#38BDF8]" /></button><button aria-label="Nova conversa" onClick={() => setNewChatOpen(true)}><Plus /></button><button className="mobile-only" aria-label="Fechar" onClick={() => setSidebarOpen(false)}><X /></button></div></header>
      <button className="account-card" onClick={() => setProfileOpen(true)}><Avatar name={profile.data.name} url={profile.data.avatarUrl} /><span><strong>{profile.data.name}</strong><small>{profile.data.status || "Disponível"}</small></span><MoreHorizontal /></button>
      <div className="sidebar-search"><Search /><Input placeholder="Pesquisar conversas" onChange={event => { const term = event.target.value.toLowerCase(); if (!term) return; const match = conversations.data?.find(item => item.participant?.name?.toLowerCase().includes(term)); if (match) setSelectedId(match.id); }} /></div>
      
      <div className="flex px-3 pt-2 pb-1 gap-2 border-b border-[var(--line)]">
        <button
          type="button"
          className={cn(
            "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
            sidebarTab === "chats"
              ? "bg-[#0080EA] text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
          onClick={() => setSidebarTab("chats")}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Conversas {conversations.data?.length ? `(${conversations.data.length})` : ""}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
            sidebarTab === "contacts"
              ? "bg-[#0080EA] text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
          onClick={() => setSidebarTab("contacts")}
        >
          <Users className="w-3.5 h-3.5" />
          Contatos {allContacts.data?.length ? `(${allContacts.data.length})` : ""}
        </button>
      </div>

      {sidebarTab === "chats" && (
        <div className="conversation-list flex-1 overflow-y-auto">
          {conversations.isLoading && (
            <div className="quiet-state"><Loader2 className="animate-spin" /> Carregando conversas...</div>
          )}
          {!conversations.isLoading && !conversations.data?.length && (
            <div className="clean-empty p-6 text-center">
              <MessageCircleMore className="w-12 h-12 text-[#0080EA] mx-auto mb-2 opacity-80" />
              <strong className="text-sm font-semibold block mb-1 text-slate-800 dark:text-slate-200">Nenhuma conversa aberta ainda</strong>
              <span className="text-xs text-muted-foreground block mb-4">Escolha alguém da sua família nos contatos para começar a conversar!</span>
              <Button
                size="sm"
                className="bg-[#0080EA] hover:bg-[#0060B8] text-white text-xs mx-auto shadow-md"
                onClick={() => setSidebarTab("contacts")}
              >
                <Users className="w-3.5 h-3.5 mr-1.5" /> Ver contatos cadastrados ({allContacts.data?.length || 0})
              </Button>
            </div>
          )}
          {conversations.data?.map(conversation => (
            <button
              key={conversation.id}
              className={cn("conversation-row", selectedId === conversation.id && "active", conversation.unreadCount > 0 && "unread")}
              onClick={() => chooseConversation(conversation.id)}
            >
              <Avatar name={conversation.participant?.name || conversation.title} url={conversation.participant?.avatarUrl} />
              <span className="conversation-copy">
                <span>
                  <strong>{conversation.participant?.name || conversation.title || "Conversa"}</strong>
                  <time>{formatTime(conversation.latestMessage?.createdAt)}</time>
                </span>
                <span>
                  <small>
                    {conversation.latestMessage?.deletedAt
                      ? "Mensagem apagada"
                      : conversation.latestMessage?.messageType === "image"
                      ? "Imagem"
                      : conversation.latestMessage?.messageType === "audio"
                      ? "Mensagem de voz"
                      : conversation.latestMessage?.messageType === "file"
                      ? "Documento"
                      : conversation.latestMessage?.content || "Conversa iniciada"}
                  </small>
                  {conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {sidebarTab === "contacts" && (
        <div className="conversation-list flex-1 overflow-y-auto">
          {allContacts.isLoading && (
            <div className="quiet-state"><Loader2 className="animate-spin" /> Carregando contatos...</div>
          )}
          {!allContacts.isLoading && !allContacts.data?.length && (
            <div className="clean-empty p-6 text-center">
              <Users className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
              <strong className="text-sm font-semibold block mb-1 text-slate-800 dark:text-slate-200">Nenhum outro contato cadastrado</strong>
              <span className="text-xs text-muted-foreground block mb-4">Envie o link de convite para sua esposa e filhos!</span>
              <Button size="sm" variant="outline" onClick={() => setInviteModalOpen(true)} className="text-xs border-slate-300 dark:border-slate-700">
                <UserPlus className="w-3.5 h-3.5 mr-1.5 text-[#0080EA]" /> Convidar família
              </Button>
            </div>
          )}
          {allContacts.data?.map(contact => (
            <button
              key={contact.id}
              className="conversation-row hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors w-full text-left cursor-pointer"
              onClick={() => createDirect.mutate({ userId: contact.id })}
              disabled={createDirect.isPending}
            >
              <div className="relative shrink-0">
                <Avatar name={contact.name} url={contact.avatarUrl} />
                <span className={cn("presence-dot absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0E1726]", contact.online ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
              </div>
              <span className="conversation-copy flex-1 min-w-0">
                <span className="flex items-center justify-between">
                  <strong className="truncate font-semibold text-sm text-slate-900 dark:text-white">{contact.name}</strong>
                  <span className="text-[11px] font-semibold text-[#0080EA] bg-[#0080EA]/10 dark:bg-[#0080EA]/20 px-2 py-0.5 rounded-full shrink-0 ml-2">
                    Conversar
                  </span>
                </span>
                <small className="truncate text-xs text-muted-foreground block">{contact.email || contact.status || "Disponível"}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        className="sidebar-fab"
        onClick={() => setNewChatOpen(true)}
        title="Iniciar nova conversa ou criar grupo"
        aria-label="Nova conversa"
      >
        <MessageSquarePlus className="w-6 h-6 text-white" />
      </button>

      <footer className="sidebar-footer px-3 py-2 border-t border-[var(--line)] bg-[var(--surface)] flex items-center justify-between gap-1 overflow-x-auto">
        <button
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0080EA]/10 hover:bg-[#0080EA]/20 text-[#0080EA] dark:text-[#38BDF8] font-bold text-xs border border-[#0080EA]/20 whitespace-nowrap transition-all cursor-pointer"
          onClick={() => setDownloadApkOpen(true)}
          title="Baixar APK oficial para Android"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>APK</span>
        </button>

        <button
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] font-semibold text-xs whitespace-nowrap transition-all cursor-pointer"
          onClick={() => setInviteModalOpen(true)}
          title="Convidar amigos para o chat"
        >
          <UserPlus className="w-3.5 h-3.5 text-[#0080EA]" />
          <span>Convidar</span>
        </button>

        <button
          className="p-2 rounded-xl hover:bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] transition-all flex items-center justify-center cursor-pointer"
          onClick={requestNotification}
          title="Notificações"
          aria-label="Notificações"
        >
          <Bell className="w-4 h-4" />
        </button>

        <button
          className="p-2 rounded-xl hover:bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] transition-all flex items-center justify-center cursor-pointer"
          onClick={toggleTheme}
          title={theme === "dark" ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
          aria-label="Alternar tema"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          className="p-2 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all flex items-center justify-center cursor-pointer"
          onClick={() => logout()}
          title="Sair da conta"
          aria-label="Sair da conta"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </footer>
    </aside>

    <main className={cn("chat-stage", !selectedId && "no-selection")}>{!selectedId ? <section className="stage-empty"><div className="stage-art"><MessageCircleMore /><span /><span /><span /></div><p className="eyebrow">ChatForAll</p><h2>Uma conversa de cada vez.</h2><p>Selecione uma conversa ou comece uma nova quando estiver pronto.</p><Button onClick={() => setNewChatOpen(true)}><Plus /> Nova conversa</Button></section> : <>
      <header className="chat-header"><button className="mobile-only" aria-label="Voltar" onClick={() => setSidebarOpen(true)}><ArrowLeft /></button><button className="chat-person" onClick={() => selected?.type === "group" ? setGroupInfoOpen(true) : setProfileOpen(true)}><Avatar name={selected?.participant?.name || selected?.title || pendingContact?.name} url={selected?.participant?.avatarUrl} /><span><strong>{selected?.participant?.name || selected?.title || pendingContact?.name || "Conversa"}</strong><small className={selected?.participant?.online ? "online-text" : ""}>{selected?.type === "group" ? "Informações do grupo" : presenceText(selected?.participant?.lastSeen, selected?.participant?.online)}</small></span></button><div className="call-actions">{selected?.type !== "group" && <><button aria-label="Iniciar chamada de áudio" disabled={startCall.isPending} onClick={() => selected && startCall.mutate({ conversationId: selected.id, type: "audio" })}><Phone /></button><button aria-label="Chamar por vídeo" disabled={startCall.isPending} onClick={() => selected && startCall.mutate({ conversationId: selected.id, type: "video" })}><Video /></button></>}<button aria-label="Informações da conversa" onClick={() => selected?.type === "group" ? setGroupInfoOpen(true) : toast.message(selected?.participant?.status || "Sem status.")}><Info /></button></div></header>
      <div className="message-scroll" ref={scroll}>{history.isLoading && <div className="quiet-state"><Loader2 className="animate-spin" /> Carregando mensagens</div>}<button className="load-more" onClick={loadOlder} style={{ display: nextOlderCursor ? "block" : "none" }}>Carregar mensagens anteriores</button>{displayedMessages.length === 0 && !history.isLoading && <div className="conversation-empty"><MessageCircleMore /><span>Nenhuma mensagem ainda.</span><small>Envie a primeira mensagem para iniciar a conversa.</small></div>}{displayedMessages.map(message => <MessageBubble key={message.id} message={message} currentUserId={user?.id} onReply={setReply} onDeleteMe={id => deleteMe.mutate({ messageId: id }, { onSuccess: () => utils.messaging.history.invalidate() })} onDeleteAll={id => deleteAll.mutate({ messageId: id }, { onSuccess: () => utils.messaging.history.invalidate(), onError: error => toast.error(error.message) })} />)}{typing.data?.map(entry => <div key={entry.userId} className="typing-indicator"><span /><span /><span /> {entry.name} está digitando...</div>)}</div>
      <div className="composer-area">{reply && <div className="reply-bar"><MessageCircleMore /><span>Respondendo a <strong>{reply.senderName || "mensagem"}</strong><small>{reply.content || "Mídia"}</small></span><button onClick={() => setReply(null)}><X /></button></div>}{image && <ImagePreview source={image} onCancel={() => setImage(null)} onSend={caption => submit(caption, image)} />}{recording ? <div className="recording-bar"><button onClick={() => stopRecord(true)} aria-label="Cancelar gravação"><Trash2 /></button><span><i /> Solte para enviar · {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}</span><Button size="icon" onClick={() => stopRecord(false)}><SendHorizonal /></Button></div> : <div className="composer"><Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
  <PopoverTrigger asChild>
    <button type="button" aria-label="Teclado de Emojis Divertidos" className="hover:text-[#0080EA] transition-colors">
      <Smile />
    </button>
  </PopoverTrigger>
  <PopoverContent side="top" align="start" className="p-0 border-none bg-transparent shadow-none w-auto">
    <EmojiPicker onSelectEmoji={(emoji) => {
      typingChange(`${composer}${emoji}`);
      setEmojiPickerOpen(false);
    }} />
  </PopoverContent>
</Popover><button aria-label="Anexar imagem ou documento" onClick={() => imageInput.current?.click()}><Paperclip /></button><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,text/plain,text/csv" hidden onChange={event => prepareImage(event.target.files?.[0])} /><Textarea value={composer} onChange={event => typingChange(event.target.value)} placeholder="Escreva uma mensagem" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} /><button aria-label="Gravar mensagem de voz" onPointerDown={event => { recordPointerType.current = event.pointerType; if (event.pointerType === "mouse") void startRecord(); }} onPointerUp={event => { if (event.pointerType === "mouse") stopRecord(false); }} onPointerLeave={event => { if (event.pointerType === "mouse" && recording) stopRecord(true); }} onClick={() => { if (recordPointerType.current !== "mouse") { if (recording) stopRecord(false); else void startRecord(); } recordPointerType.current = null; }} onKeyDown={event => { if (event.key === " ") { event.preventDefault(); void startRecord(); } }} onKeyUp={event => { if (event.key === " ") stopRecord(false); }}><Mic /></button><Button size="icon" aria-label="Enviar mensagem" disabled={send.isPending || (!composer.trim() && !image)} onClick={() => submit()}>{send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}</Button></div>}</div>
    </>}</main>
    <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} profile={profile.data} /><NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onChoose={chooseConversation} /><GroupInfoDialog open={groupInfoOpen} onOpenChange={setGroupInfoOpen} conversationId={selected?.type === "group" ? selected.id : undefined} currentUserId={user?.id} />
    <CallDialog call={pendingCall.data && ["ringing", "connecting", "active"].includes(pendingCall.data.status) ? pendingCall.data as any : null} currentUserId={user?.id} onFinished={() => pendingCall.refetch()} />
    <InstallAppModal open={showGuide} onOpenChange={setShowGuide} isIOS={isIOS} />
    <DownloadApkModal open={downloadApkOpen} onOpenChange={setDownloadApkOpen} />
    <InviteModal open={inviteModalOpen} onOpenChange={setInviteModalOpen} currentUserName={profile.data?.name} currentUserEmail={user?.email} />
  </div>;
}
