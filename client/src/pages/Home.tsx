import { useAuth } from "@/_core/hooks/useAuth";
import { ChatWindow } from "@/components/ChatWindow";
import { NewChatModal } from "@/components/NewChatModal";
import { ProfileModal } from "@/components/ProfileModal";
import { Sidebar } from "@/components/Sidebar";
import { SimpleAuthModal } from "@/components/SimpleAuthModal";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Heart, Loader2, MessageSquarePlus, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);

  const defaultAvatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150";

  const convListQuery = trpc.conversations.list.useQuery(undefined, {
    enabled: isAuthenticated && !!user,
  });

  // No desktop, se houver conversas e nenhuma estiver aberta, seleciona a primeira
  useEffect(() => {
    if (convListQuery.data && convListQuery.data.length > 0 && selectedConversationId === null) {
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setSelectedConversationId(convListQuery.data[0].id);
      }
    }
  }, [convListQuery.data, selectedConversationId]);

  const handleSelectConversation = (id: number) => {
    setSelectedConversationId(id);
    setShowMobileChat(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] dark:bg-[#0c1317]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center animate-pulse shadow-md">
            <Heart className="w-6 h-6 fill-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Carregando CasaChat da Família...</p>
        </div>
      </div>
    );
  }

  // Se o usuário ainda não entrou, exibe o modal simples de entrada
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-slate-950 dark:to-slate-900">
        <header className="p-6 flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <Heart className="w-5 h-5 fill-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800 dark:text-white">CasaChat</span>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-800 font-medium px-3 py-1 rounded-full">
            Exclusivo para a Família
          </span>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 text-center flex-1 flex flex-col items-center justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-6 shadow-sm">
            <ShieldCheck className="w-4 h-4" />
            Ambiente Seguro, Privado e Sem Complicação
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            O cantinho da nossa família para conversar todos os dias
          </h1>

          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl">
            Tudo o que você mais gosta no WhatsApp: mensagens instantâneas, fotos, reações com emojis e grupos da família, sem precisar cadastrar senhas difíceis.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <Button
              onClick={() => {}}
              className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-semibold shadow-lg shadow-emerald-600/20"
            >
              Entrar com Nome e Email
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full max-w-2xl text-left">
            <div className="p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <Smartphone className="w-6 h-6 text-emerald-600 mb-2" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Simples no Celular</h4>
              <p className="text-[11px] text-slate-500 mt-1">Interface idêntica ao WhatsApp, fácil para pais, tios e avós.</p>
            </div>
            <div className="p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <Users className="w-6 h-6 text-emerald-600 mb-2" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Grupos e Fotos</h4>
              <p className="text-[11px] text-slate-500 mt-1">Crie grupos para churrascos, festas e envie fotos com um clique.</p>
            </div>
            <div className="p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
              <Heart className="w-6 h-6 text-emerald-600 mb-2" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Reações com Emojis</h4>
              <p className="text-[11px] text-slate-500 mt-1">Curta as mensagens com ❤️, 👍, 😂 e mantenha a família conectada.</p>
            </div>
          </div>
        </main>

        <footer className="p-4 text-center text-xs text-slate-400">
          CasaChat &bull; Feito com carinho para reunir nossa família
        </footer>

        {/* Modal de cadastro/login simples sempre aberto quando não autenticado */}
        <SimpleAuthModal isOpen={!isAuthenticated} onSuccess={() => {}} />
      </div>
    );
  }

  // Usuário Autenticado: Estrutura idêntica ao WhatsApp Web
  return (
    <div className="min-h-screen bg-[#dadbd3] dark:bg-[#0c1317] flex items-center justify-center p-0 md:p-4">
      {/* Barra verde WhatsApp no topo */}
      <div className="hidden md:block fixed top-0 left-0 w-full h-32 bg-[#00a884] -z-10" />

      <div className="w-full h-screen md:h-[94vh] md:max-w-7xl bg-white dark:bg-[#111b21] md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-200/60 dark:border-slate-800">
        {/* Barra Lateral */}
        <div
          className={`w-full md:w-[380px] lg:w-[420px] h-full shrink-0 ${
            showMobileChat ? "hidden md:flex md:flex-col" : "flex flex-col"
          }`}
        >
          <Sidebar
            currentUserId={user.id}
            currentUserName={user.name || "Família"}
            currentUserAvatar={user.avatarUrl || defaultAvatar}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onOpenNewChat={() => setIsNewChatOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
            onLogout={logout}
          />
        </div>

        {/* Janela de Chat ou Tela Inicial Vazia */}
        <div
          className={`flex-1 h-full flex-col ${
            showMobileChat ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedConversationId ? (
            <ChatWindow
              conversationId={selectedConversationId}
              currentUserId={user.id}
              onBackMobile={() => setShowMobileChat(false)}
            />
          ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full bg-[#f0f2f5] dark:bg-[#222e35] p-8 text-center border-b-8 border-emerald-500">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 rounded-3xl flex items-center justify-center mb-4 shadow-sm">
                <Heart className="w-10 h-10 fill-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                CasaChat da Família
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 leading-relaxed">
                Envie e receba mensagens da sua família sem complicação. Selecione uma conversa ao lado ou crie um novo grupo para o próximo encontro!
              </p>

              <div className="mt-6 flex items-center gap-3">
                <Button
                  onClick={() => setIsNewChatOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold px-4 h-10 gap-2 shadow-sm"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  Iniciar Nova Conversa ou Grupo
                </Button>
              </div>

              <div className="mt-8 flex items-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Acesso seguro e restrito aos membros cadastrados da família
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modais */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onSelectConversation={handleSelectConversation}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={{
          name: user.name,
          email: user.email,
          statusMessage: user.statusMessage,
          avatarUrl: user.avatarUrl,
        }}
      />
    </div>
  );
}
