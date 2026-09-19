import { Input } from "@/components/ui/input";
import { DEFAULT_AVATAR, GROUP_AVATAR } from "@/lib/emojiAvatars";
import { trpc } from "@/lib/trpc";
import { CheckCheck, Heart, LogOut, MessageSquarePlus, Search, UserCog, Users } from "lucide-react";
import React, { useState } from "react";

interface SidebarProps {
  currentUserId: number;
  currentUserName: string;
  currentUserAvatar: string;
  selectedConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onOpenNewChat: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function Sidebar({
  currentUserId,
  currentUserName,
  currentUserAvatar,
  selectedConversationId,
  onSelectConversation,
  onOpenNewChat,
  onOpenProfile,
  onLogout,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const utils = trpc.useUtils();
  const conversationsQuery = trpc.conversations.list.useQuery(undefined, {
    refetchInterval: 3500,
  });

  const usersQuery = trpc.users.list.useQuery(undefined, {
    refetchInterval: 8000,
  });

  const startDirectMutation = trpc.conversations.startDirect.useMutation({
    onSuccess: (data) => {
      utils.conversations.list.invalidate();
      onSelectConversation(data.conversationId);
    },
  });

  const convList = conversationsQuery.data || [];
  const otherUsers = (usersQuery.data || []).filter((u) => !u.isSelf);

  const filtered = convList.filter((c) => {
    if (c.type === "group") {
      return (c.name || "Grupo").toLowerCase().includes(searchTerm.toLowerCase());
    }
    const other = c.members.find((m) => m.id !== currentUserId) || c.members[0];
    return (other?.name || "").toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-white dark:bg-[#111b21] border-r border-slate-200 dark:border-slate-800">
      {/* Topo do Usuário Conectado */}
      <div className="h-14 sm:h-16 bg-[#f0f2f5] dark:bg-[#202c33] px-3 sm:px-4 flex items-center justify-between shrink-0 border-b border-slate-200 dark:border-slate-800">
        <div
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition"
          title="Editar meu perfil"
        >
          <img
            src={currentUserAvatar}
            alt={currentUserName}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500 shadow-sm"
          />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1">
              {currentUserName}
              <Heart className="w-3 h-3 fill-rose-500 text-rose-500 inline shrink-0" />
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Online na família</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
          <button
            onClick={onOpenNewChat}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition"
            title="Nova conversa ou grupo"
          >
            <MessageSquarePlus className="w-5 h-5 text-emerald-600" />
          </button>
          <button
            onClick={onOpenProfile}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition"
            title="Meu perfil"
          >
            <UserCog className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-rose-100 text-rose-600 rounded-full transition"
            title="Sair / Trocar de parente"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Barra de Pesquisa */}
      <div className="p-3 bg-white dark:bg-[#111b21] border-b border-slate-100 dark:border-slate-800/60">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar conversa ou parente..."
            className="h-10 pl-9 rounded-xl bg-slate-100 dark:bg-[#202c33] border-none text-xs"
          />
        </div>
      </div>

      {/* Barra de Membros Cadastrados da Família */}
      {otherUsers.length > 0 && (
        <div className="px-3 py-2 bg-slate-50/70 dark:bg-[#182229] border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Heart className="w-3 h-3 text-emerald-500 fill-emerald-500" />
              Familiares Conectados ({otherUsers.length})
            </span>
            <button
              onClick={onOpenNewChat}
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer"
            >
              + Novo Grupo
            </button>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {otherUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => startDirectMutation.mutate({ targetUserId: u.id })}
                disabled={startDirectMutation.isPending}
                className="flex flex-col items-center gap-1 group shrink-0 focus:outline-none cursor-pointer"
                title={`Conversar com ${u.name}`}
              >
                <div className="relative">
                  <img
                    src={u.avatarUrl || DEFAULT_AVATAR}
                    alt={u.name || "Parente"}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/80 group-hover:scale-105 group-hover:ring-emerald-600 transition shadow-xs"
                  />
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#182229] rounded-full" />
                </div>
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 max-w-[54px] truncate text-center group-hover:text-emerald-600">
                  {u.name?.split(" ")[0] || "Parente"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Conversas Recentes */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40 overscroll-contain">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-400 space-y-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Família Reunida!</p>
              <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
                {otherUsers.length > 0
                  ? "Toque em um familiar acima ou abaixo para começar a conversar:"
                  : "Aguardando outros familiares entrarem pelo link!"}
              </p>
            </div>

            {otherUsers.length > 0 && (
              <div className="space-y-1.5 text-left pt-2">
                {otherUsers.slice(0, 5).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startDirectMutation.mutate({ targetUserId: u.id })}
                    disabled={startDirectMutation.isPending}
                    className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 transition border border-slate-100 dark:border-slate-700 cursor-pointer"
                  >
                    <img
                      src={u.avatarUrl || DEFAULT_AVATAR}
                      alt={u.name || ""}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{u.statusMessage || "Disponível"}</p>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600">Conversar</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const isGroup = conv.type === "group";
            let name = conv.name || "Grupo da Família";
            let avatar = conv.avatarUrl || (isGroup ? GROUP_AVATAR : DEFAULT_AVATAR);

            if (!isGroup) {
              const other = conv.members.find((m) => m.id !== currentUserId) || conv.members[0];
              name = other?.name || "Parente";
              avatar = other?.avatarUrl || avatar;
            }

            const isSelected = conv.id === selectedConversationId;
            const timeStr = new Date(conv.lastMessageAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`flex items-center gap-3 p-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-slate-100 dark:bg-[#2a3942]"
                    : "hover:bg-slate-50 dark:hover:bg-[#202c33]"
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={avatar}
                    alt={name}
                    className="w-12 h-12 rounded-full object-cover ring-1 ring-slate-200"
                  />
                  {isGroup && (
                    <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-[#111b21]">
                      <Users className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {name}
                    </h4>
                    <span className="text-[11px] text-slate-400 shrink-0">{timeStr}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate pr-2">
                      {conv.lastMessageText || "Nenhuma mensagem ainda"}
                    </p>

                    {conv.unreadCount > 0 && (
                      <span className="bg-emerald-600 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
