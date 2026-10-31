import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
}

const EMOJI_CATEGORIES = [
  {
    id: "animated",
    label: "✨",
    title: "Animados & 3D",
    emojis: [
      "🔥", "❤️", "🎉", "😂", "🥰", "🚀", "⭐", "💥", "🥳", "✨",
      "👏", "💯", "😍", "🤩", "💃", "🕺", "🍕", "☕", "🍿", "⚡",
      "😎", "🤗", "😱", "🤯", "💪", "👑", "💎", "🎈", "🥂", "🍻",
      "🌈", "🌟", "🏆", "🎯", "🛸", "🎸", "🎧", "🎮", "👾", "🤖"
    ],
  },
  {
    id: "faces",
    label: "😀",
    title: "Carinhas & Expressões",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
      "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
      "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮",
      "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓"
    ],
  },
  {
    id: "hearts",
    label: "❤️",
    title: "Corações & Amor",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "💖", "💗", "💓", "💞", "💕", "💌", "💘", "💝",
      "💟", "❣️", "🌹", "💐", "🌺", "🌸", "🌷", "🌻", "🌼", "✨"
    ],
  },
  {
    id: "gestures",
    label: "👍",
    title: "Gestos & Mãos",
    emojis: [
      "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲",
      "🤝", "🙏", "✍️", "💅", "🤳", "💪", "✌️", "🤞", "🤟", "🤘",
      "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👋", "🤚", "🖐️"
    ],
  },
  {
    id: "animals",
    label: "🐶",
    title: "Animais & Natureza",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆",
      "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋"
    ],
  },
  {
    id: "food",
    label: "🍕",
    title: "Comidas & Bebidas",
    emojis: [
      "🍕", "🍔", "🍟", "🌭", "🥪", "🌮", "🌯", "🥙", "🧆", "🥚",
      "🍳", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🍣", "🍦", "🍧",
      "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🍫", "🍬", "🍭", "☕"
    ],
  },
];

export function EmojiPicker({ onSelectEmoji }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState("animated");

  return (
    <div className="w-[310px] sm:w-[350px] p-2 bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--line)]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-6 h-9 p-1 bg-[var(--surface-soft)] rounded-xl mb-2">
          {EMOJI_CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="text-base p-0 data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-xs rounded-lg transition-all"
              title={cat.title}
            >
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {EMOJI_CATEGORIES.map((cat) => (
          <TabsContent key={cat.id} value={cat.id} className="mt-0 focus-visible:outline-none">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-xs font-semibold text-[var(--ink)]">
                {cat.title}
              </span>
              <span className="text-[10px] text-[var(--muted)]">
                {cat.emojis.length} emojis
              </span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5 p-1 max-h-52 overflow-y-auto rounded-xl bg-[var(--surface-soft)] border border-[var(--line)]">
              {cat.emojis.map((emoji, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => onSelectEmoji(emoji)}
                  className="w-10 h-10 flex items-center justify-center text-2xl hover:scale-130 active:scale-95 transition-all rounded-xl hover:bg-[var(--surface)] cursor-pointer shadow-xs hover:shadow"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
