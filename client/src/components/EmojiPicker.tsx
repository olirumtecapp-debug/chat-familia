import React, { useState } from "react";
import EmojiPicker, { Categories, EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Smile, Sparkles } from "lucide-react";

interface EmojiPickerComponentProps {
  onSelectEmoji: (emoji: string) => void;
  className?: string;
}

const ANIMATED_EMOJIS = [
  { id: "heart-beat", emoji: "❤️", name: "Coração Pulsante", animClass: "emoji-heart-beat" },
  { id: "flame-burst", emoji: "🔥", name: "Fogo Quente", animClass: "emoji-flame-burst" },
  { id: "joy-bounce", emoji: "😂", name: "Riso Saltitante", animClass: "emoji-joy-bounce" },
  { id: "party-pop", emoji: "🎉", name: "Festa & Confete", animClass: "emoji-party-pop" },
  { id: "rocket-fly", emoji: "🚀", name: "Foguete Espacial", animClass: "emoji-rocket-fly" },
  { id: "heart-eyes", emoji: "😍", name: "Olhos Apaixonados", animClass: "emoji-heart-beat" },
  { id: "sparkles", emoji: "✨", name: "Brilho Mágico", animClass: "emoji-party-pop" },
  { id: "rolling-laugh", emoji: "🤣", name: "Rolando de Rir", animClass: "emoji-joy-bounce" },
  { id: "celebrate", emoji: "🥳", name: "Comemoração", animClass: "emoji-party-pop" },
  { id: "star-glow", emoji: "⭐", name: "Estrela Brilhante", animClass: "emoji-float-3d" },
  { id: "thumbs-up", emoji: "👍", name: "Polegar Positivo", animClass: "emoji-float-3d" },
  { id: "praying", emoji: "🙏", name: "Gratidão & Fé", animClass: "emoji-float-3d" },
  { id: "cool-sunglasses", emoji: "😎", name: "Legal / Óculos", animClass: "emoji-float-3d" },
  { id: "mind-blown", emoji: "🤯", name: "Cabeça Explodindo", animClass: "emoji-flame-burst" },
  { id: "blushing-smile", emoji: "🥰", name: "Afeto Carinhoso", animClass: "emoji-heart-beat" },
  { id: "lightning", emoji: "⚡", name: "Raio Energético", animClass: "emoji-flame-burst" },
];

export function EmojiPickerComponent({ onSelectEmoji, className = "" }: EmojiPickerComponentProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"standard" | "animated">("standard");

  const pickerTheme = theme === "dark" ? Theme.DARK : Theme.LIGHT;

  return (
    <div
      className={`w-[320px] sm:w-[360px] max-w-[94vw] bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--line)] overflow-hidden flex flex-col ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Barra superior de alternância discreta: Emojis Tradicionais vs Animados */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--line)] bg-[var(--surface-soft)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("standard")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              activeTab === "standard"
                ? "bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Smile className="w-4 h-4" />
            <span>Emojis</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("animated")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              activeTab === "animated"
                ? "bg-[var(--surface)] text-amber-500 shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Animados</span>
          </button>
        </div>
        <span className="text-[11px] text-[var(--muted)] font-medium">ChatForAll</span>
      </div>

      {activeTab === "standard" ? (
        <div className="w-full h-[380px] overflow-hidden emoji-picker-container">
          <EmojiPicker
            theme={pickerTheme}
            searchPlaceHolder="Pesquisar emoji..."
            width="100%"
            height={380}
            lazyLoadEmojis={true}
            previewConfig={{ showPreview: false }}
            categories={[
              { category: Categories.SUGGESTED, name: "Recentes" },
              { category: Categories.SMILEYS_PEOPLE, name: "Carinhas e pessoas" },
              { category: Categories.ANIMALS_NATURE, name: "Animais e natureza" },
              { category: Categories.FOOD_DRINK, name: "Comidas e bebidas" },
              { category: Categories.ACTIVITIES, name: "Atividades" },
              { category: Categories.TRAVEL_PLACES, name: "Viagens e lugares" },
              { category: Categories.OBJECTS, name: "Objetos" },
              { category: Categories.SYMBOLS, name: "Símbolos" },
              { category: Categories.FLAGS, name: "Bandeiras" },
            ]}
            onEmojiClick={(emojiData: EmojiClickData) => {
              onSelectEmoji(emojiData.emoji);
            }}
          />
        </div>
      ) : (
        <div className="p-3 h-[380px] overflow-y-auto">
          <p className="text-[11px] text-[var(--muted)] mb-2 px-1">
            Toque para enviar o emoji com animação interativa no chat:
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {ANIMATED_EMOJIS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectEmoji(item.emoji)}
                className="flex flex-col items-center justify-center p-2 rounded-xl hover:bg-[var(--surface-soft)] active:scale-95 transition-all text-center group cursor-pointer border border-transparent hover:border-[var(--line)]"
                title={item.name}
              >
                <span className={`text-3xl leading-none py-1 filter drop-shadow-sm group-hover:scale-110 transition-transform ${item.animClass}`}>
                  {item.emoji}
                </span>
                <span className="text-[10px] text-[var(--muted)] group-hover:text-[var(--ink)] mt-1 truncate max-w-full">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { EmojiPickerComponent as EmojiPicker };
