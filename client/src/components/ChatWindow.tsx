import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  Heart,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Phone,
  Send,
  Smile,
  Users,
  Video,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Consultas tRPC com atualização periódica automática (polling) para simular tempo real
  const convQuery = trpc.conversations.get.useQuery(
    { conversationId },
    { refetchInterval: 3000 }
  );

  const messagesQuery = trpc.messages.list.useQuery(
    { conversationId },
    { refetchInterval: 2500 }
  );

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

  // Marca como lida ao abrir
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

    if (file.size > 15 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 15MB");
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Enviando mídia familiar...");

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64String = (reader.result as string).split(",")[1];
        const isImg = file.type.startsWith("image/");

        try {
          const uploaded = await uploadMutation.mutateAsync({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            base64Data: base64String,
          });

          await sendMutation.mutateAsync({
            conversationId,
            content: isImg ? "" : file.name,
            mediaUrl: uploaded.url,
            mediaType: isImg ? "image" : "file",
            fileName: file.name,
          });

          toast.dismiss(toastId);
          toast.success("Foto/arquivo enviado!");
        } catch (err: any) {
          toast.dismiss(toastId);
          toast.error("Erro no envio: " + (err.message || "Tente novamente"));
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploading(false);
      toast.dismiss(toastId);
      toast.error("Falha ao ler arquivo");
    }
  };

  const conv = convQuery.data;
  const messages = messagesQuery.data || [];

  // Nome e avatar a exibir no topo
  let title = "Conversa";
  let subtitle = "";
  let avatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150";

  if (conv) {
    if (conv.type === "group") {
      title = conv.name || "Grupo da Família";
      subtitle = `${conv.members.length} membros da família`;
      avatar = conv.avatarUrl || "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=150";
    } else {
      const other = conv.members.find((m) => m.id !== currentUserId) || conv.members[0];
      if (other) {
        title = other.name || "Membro";
        subtitle = other.statusMessage || other.email || "Online";
        avatar = other.avatarUrl || avatar;
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#efeae2] dark:bg-[#0b141a] relative">
      {/* Header Estilo WhatsApp */}
      <div className="h-16 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackMobile}
            className="md:hidden p-1.5 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative">
            <img src={avatar} alt={title} className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-300" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-[#202c33]" />
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
          <button
            onClick={() => toast.info("Ligação de voz da família (simulação)")}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition"
            title="Chamada de voz"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => toast.info("Vídeo-chamada da família (simulação)")}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition"
            title="Chamada de vídeo"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Área de Mensagens com Papel de Parede Sutil */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-pattern-bg">
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
              Mande um "bom dia", compartilhe fotos de almoço ou combine os próximos encontros.
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
                  {/* Nome do remetente se for grupo e não for eu */}
                  {!isMe && conv?.type === "group" && (
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                      {msg.senderName}
                    </p>
                  )}

                  {/* Foto enviada */}
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

                  {/* Arquivo / Documento */}
                  {msg.mediaType === "file" && msg.mediaUrl && (
                    <a
                      href={msg.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/10 rounded-xl mb-1.5 hover:bg-black/10 transition"
                    >
                      <FileText className="w-5 h-5 text-emerald-600" />
                      <span className="text-xs font-medium truncate underline">{msg.fileName || "Baixar arquivo"}</span>
                    </a>
                  )}

                  {/* Texto da mensagem */}
                  {msg.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>}

                  {/* Horário e confirmação de leitura estilo WhatsApp */}
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
                  <div className="hidden group-hover:flex items-center gap-1 absolute -top-3 right-0 bg-white dark:bg-[#202c33] px-2 py-0.5 rounded-full shadow border border-slate-200 dark:border-slate-700">
                    {COMMON_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => reactMutation.mutate({ messageId: msg.id, emoji })}
                        className="text-xs hover:scale-125 transition-transform"
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
      <div className="p-3 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*,.pdf,.doc,.docx"
          className="hidden"
        />

        {/* Botão de Anexo */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition"
          title="Enviar foto ou arquivo"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
        </button>

        {/* Emojis rápidos */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition hidden sm:block"
              title="Emojis"
            >
              <Smile className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 bg-white dark:bg-slate-800 rounded-2xl shadow-xl">
            <div className="grid grid-cols-6 gap-2 text-xl text-center">
              {["❤️", "😂", "🥰", "👍", "🙏", "🍕", "🎂", "🎉", "😘", "☕", "🏡", "👶"].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setInputText((prev) => prev + e)}
                  className="hover:scale-125 transition-transform p-1"
                >
                  {e}
                </button>
              ))}
            </div>
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
            className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 p-0 flex items-center justify-center shadow-md transition-transform active:scale-95"
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
