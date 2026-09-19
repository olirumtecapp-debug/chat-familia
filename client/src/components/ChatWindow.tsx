import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_AVATAR, GROUP_AVATAR, optimizeImageForChat } from "@/lib/emojiAvatars";
import { EmojiPicker } from "@/components/EmojiPicker";
import { CallModal } from "@/components/CallModal";
import { trpc } from "@/lib/trpc";
import { GroupMembersModal } from "@/components/GroupMembersModal";
import {
  ArrowLeft,
  CheckCheck,
  FileText,
  Heart,
  Loader2,
  Paperclip,
  Phone,
  Send,
  Smile,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";

interface ChatWindowProps {
  conversationId: number;
  currentUserId: number;
  onBackMobile: () => void;
}

const COMMON_REACTIONS = ["❤️", "👍", "😂", "😮", "🙏", "🎉"];

export function ChatWindow({ conversationId, currentUserId, onBackMobile }: ChatWindowProps) {
  const [inputText, setInputText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [currentCallType, setCurrentCallType] = useState<"audio" | "video">("audio");
  const [isIncomingCall, setIsIncomingCall] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const convQuery = trpc.conversations.get.useQuery(
    { conversationId },
    { refetchInterval: 3000 }
  );

  const messagesQuery = trpc.messages.list.useQuery(
    { conversationId },
    { refetchInterval: 2500 }
  );

  // Monitora chamadas recebidas para esta conversa
  const incomingCallQuery = trpc.calls.poll.useQuery(
    { conversationId },
    { refetchInterval: 2000 }
  );

  useEffect(() => {
    const session = incomingCallQuery.data;
    if (session && session.status === "ringing" && session.callerId !== currentUserId) {
      setCurrentCallType(session.type);
      setIsIncomingCall(true);
      setIsCallModalOpen(true);
    }
  }, [incomingCallQuery.data]);

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => {
      setInputText("");
      utils.messages.list.invalidate({ conversationId });
      utils.conversations.list.invalidate();
      scrollToBottom();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao enviar mensagem");
    },
  });

  const uploadMutation = trpc.messages.uploadMedia.useMutation();

  const reactMutation = trpc.messages.react.useMutation({
    onSuccess: () => {
      utils.messages.list.invalidate({ conversationId });
    },
  });

  const markReadMutation = trpc.conversations.markAsRead.useMutation({
    onSuccess: () => {
      utils.conversations.list.invalidate();
    },
  });

  useEffect(() => {
    markReadMutation.mutate({ conversationId });
  }, [conversationId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messagesQuery.data?.length]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    sendMutation.mutate({
      conversationId,
      content: inputText.trim(),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 30MB.");
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Preparando e enviando mídia familiar...");

    try {
      let mediaType: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) mediaType = "image";
      else if (file.type.startsWith("video/")) mediaType = "video";
      else if (file.type.startsWith("audio/")) mediaType = "audio";

      // Processa e otimiza de forma leve sem estourar memória do smartphone
      const { base64Data, contentType } = await optimizeImageForChat(file);

      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        contentType,
        base64Data,
      });

      await sendMutation.mutateAsync({
        conversationId,
        content: mediaType === "image" ? "" : file.name,
        mediaUrl: uploaded.url,
        mediaType,
        fileName: file.name,
      });

      toast.dismiss(toastId);
      toast.success("Enviado com sucesso!");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Erro no envio: " + (err.message || "Tente novamente"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const conv = convQuery.data;
  const messages = messagesQuery.data || [];

  let title = "Conversa";
  let subtitle = "";
  let avatar = DEFAULT_AVATAR;

  if (conv) {
    if (conv.type === "group") {
      title = conv.name || "Grupo da Família";
      subtitle = `${conv.members.length} membros da família`;
      avatar = conv.avatarUrl || GROUP_AVATAR;
    } else {
      const other = conv.members.find((m) => m.id !== currentUserId) || conv.members[0];
      if (other) {
        title = other.name || "Membro";
        subtitle = other.statusMessage || other.email || "Online";
        avatar = other.avatarUrl || avatar;
      }
    }
  }

  const handleStartCall = (type: "audio" | "video") => {
    setIsIncomingCall(false);
    setCurrentCallType(type);
    setIsCallModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#efeae2] dark:bg-[#0b141a] relative overflow-hidden">
      {/* Header Estilo WhatsApp */}
      <div className="h-14 sm:h-16 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={onBackMobile}
            className="md:hidden p-1.5 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full cursor-pointer shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div
            onClick={() => isGroup && setIsGroupModalOpen(true)}
            className={`flex items-center gap-2.5 sm:gap-3 min-w-0 ${
              isGroup ? "cursor-pointer hover:opacity-85 transition-opacity" : ""
            }`}
            title={isGroup ? "Clique para gerenciar participantes do grupo" : undefined}
          >
            <div className="relative shrink-0">
              <img src={avatar} alt={title} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover ring-1 ring-slate-300" />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-[#202c33]" />
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                {title}
                {isGroup && (
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
                    Grupo
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                {subtitle} {isGroup && "• Toque p/ gerenciar"}
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação do Header */}
        <div className="flex items-center gap-1 shrink-0">
          {isGroup && (
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition cursor-pointer"
              title="Participantes do Grupo (Adicionar / Excluir)"
            >
              <Users className="w-4.5 h-4.5" />
            </button>
          )}
          <button
            onClick={() => handleStartCall("audio")}
            className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition cursor-pointer"
            title="Iniciar Ligação de Voz"
          >
            <Phone className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={() => handleStartCall("video")}
            className="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition cursor-pointer"
            title="Iniciar Chamada de Vídeo"
          >
            <Video className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Área de Mensagens - apenas esta área rola internamente */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 chat-pattern-bg overscroll-contain">
        {messagesQuery.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
              <Heart className="w-6 h-6 fill-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Comece a conversa com sua família!</p>
            <p className="text-xs text-slate-500 max-w-xs mt-1">
              Mande um "bom dia", compartilhe fotos, áudios ou faça uma chamada de voz e vídeo.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"} group`}>
                <div
                  className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm text-sm ${
                    isMe
                      ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-800 dark:text-white rounded-tr-none"
                      : "bg-white dark:bg-[#202c33] text-slate-800 dark:text-white rounded-tl-none border border-slate-100 dark:border-transparent"
                  }`}
                >
                  {!isMe && conv?.type === "group" && (
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                      {msg.senderName}
                    </p>
                  )}

                  {/* Foto compartilhada */}
                  {msg.mediaType === "image" && msg.mediaUrl && (
                    <div className="rounded-xl overflow-hidden mb-1.5 max-h-[320px] bg-black/5">
                      <img
                        src={msg.mediaUrl}
                        alt="Foto compartilhada"
                        className="w-full h-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition"
                        onClick={() => window.open(msg.mediaUrl || "", "_blank")}
                      />
                    </div>
                  )}

                  {/* Vídeo compartilhado */}
                  {msg.mediaType === "video" && msg.mediaUrl && (
                    <div className="rounded-xl overflow-hidden mb-1.5 max-h-[320px] bg-black">
                      <video controls src={msg.mediaUrl} className="w-full max-h-[300px] object-cover rounded-xl" />
                    </div>
                  )}

                  {/* Áudio compartilhado */}
                  {msg.mediaType === "audio" && msg.mediaUrl && (
                    <div className="my-1.5 w-full min-w-[220px]">
                      <audio controls src={msg.mediaUrl} className="w-full h-8" />
                    </div>
                  )}

                  {/* Arquivo / Documento / PDF */}
                  {msg.mediaType === "file" && msg.mediaUrl && (
                    <a
                      href={msg.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 bg-black/5 dark:bg-white/10 rounded-xl mb-1.5 hover:bg-black/10 transition"
                    >
                      <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-semibold truncate underline text-emerald-700 dark:text-emerald-400">
                        {msg.fileName || "Baixar arquivo"}
                      </span>
                    </a>
                  )}

                  {/* Texto da mensagem */}
                  {msg.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>}

                  {/* Horário */}
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-500 dark:text-slate-300/80">
                    <span>{timeStr}</span>
                    {isMe && <CheckCheck className="w-3.5 h-3.5 text-sky-500" />}
                  </div>

                  {/* Lista de reações */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="absolute -bottom-2.5 right-2 flex items-center gap-0.5 bg-white dark:bg-[#1f2c34] px-1.5 py-0.5 rounded-full shadow border border-slate-200 dark:border-slate-700 text-[11px]">
                      {Array.from(new Set(msg.reactions.map((r) => r.emoji))).map((emoji, idx) => (
                        <span key={idx}>{emoji}</span>
                      ))}
                      {msg.reactions.length > 1 && (
                        <span className="text-[10px] text-slate-500 font-semibold ml-0.5">{msg.reactions.length}</span>
                      )}
                    </div>
                  )}

                  {/* Barra rápida de reação (ao passar o mouse) */}
                  <div className="hidden group-hover:flex items-center gap-1 absolute -top-3 right-0 bg-white dark:bg-[#202c33] px-2 py-0.5 rounded-full shadow border border-slate-200 dark:border-slate-700 z-10">
                    {COMMON_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => reactMutation.mutate({ messageId: msg.id, emoji })}
                        className="text-xs hover:scale-125 transition-transform cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Barra de Entrada de Mensagens WhatsApp */}
      <div className="p-2 sm:p-3 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 sm:gap-2 shrink-0 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />

        {/* Botão de Anexo (Fotos, Vídeos, Documentos) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition cursor-pointer"
          title="Enviar foto, vídeo ou documento"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
        </button>

        {/* Teclado Completo de Emojis */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition cursor-pointer"
              title="Teclado de Emojis Completo"
            >
              <Smile className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 border-none bg-transparent shadow-none" side="top" align="start">
            <EmojiPicker onSelectEmoji={(emoji) => setInputText((prev) => prev + emoji)} />
          </PopoverContent>
        </Popover>

        {/* Campo de Texto */}
        <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Mensagem para a família..."
            className="h-11 rounded-2xl bg-white dark:bg-[#2a3942] border-none focus-visible:ring-1 focus-visible:ring-emerald-500 text-sm px-4 shadow-sm"
          />

          <Button
            type="submit"
            disabled={sendMutation.isPending || (!inputText.trim() && !isUploading)}
            className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 p-0 flex items-center justify-center shadow-md transition-transform active:scale-95 cursor-pointer"
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </Button>
        </form>
      </div>

      {/* Modal de Chamada de Voz e Vídeo WebRTC */}
      {isCallModalOpen && (
        <CallModal
          isOpen={isCallModalOpen}
          onClose={() => setIsCallModalOpen(false)}
          conversationId={conversationId}
          currentUserId={currentUserId}
          currentUserName={conv?.members.find((m) => m.id === currentUserId)?.name || "Eu"}
          currentUserAvatar={conv?.members.find((m) => m.id === currentUserId)?.avatarUrl || DEFAULT_AVATAR}
          targetName={title}
          targetAvatar={avatar}
          callType={currentCallType}
          isIncoming={isIncomingCall}
          incomingCallSession={incomingCallQuery.data}
        />
      )}

      {/* Modal de Participantes do Grupo (Adicionar / Excluir) */}
      {isGroup && conv && (
        <GroupMembersModal
          isOpen={isGroupModalOpen}
          onClose={() => setIsGroupModalOpen(false)}
          conversationId={conversationId}
          groupName={conv.name || "Grupo da Família"}
          groupAvatar={conv.avatarUrl || GROUP_AVATAR}
          currentUserId={currentUserId}
          members={conv.members || []}
          onMemberRemoved={onBackMobile}
        />
      )}
    </div>
  );
}
