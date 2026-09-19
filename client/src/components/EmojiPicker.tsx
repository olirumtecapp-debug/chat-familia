import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
}

const EMOJI_CATEGORIES = [
  {
    id: "faces",
    label: "😀",
    title: "Carinhas",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹", "😊", "😇",
      "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛",
      "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒",
      "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢",
      "😭", "😮‍💨", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨",
      "😰", "😥", "😓", "🤗", "🫡", "🤔", "🫣", "🤫", "🤥", "😶", "😐", "😑"
    ],
  },
  {
    id: "people",
    label: "👨‍👩‍👦",
    title: "Família & Gestos",
    emojis: [
      "👨‍👩‍👧‍👦", "👨‍👩‍👦", "👨‍👩‍👧", "👨‍👨‍👦", "👩‍👩‍👧", "👨‍👦", "👩‍👧", "👶", "👧", "👦", "👩", "👨",
      "👵", "👴", "🧓", "🧑‍🦰", "🧑‍🦱", "🧑‍🦳", "👱‍♀️", "👱‍♂️", "👋", "🤚", "🖐️", "✋",
      "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
      "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐",
      "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾"
    ],
  },
  {
    id: "nature",
    label: "🐶",
    title: "Animais & Flores",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁",
      "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇",
      "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰",
      "🌸", "💮", "🪷", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱", "🪴",
      "🌲", "🌳", "🌴", "🌵", "🌾", "🌿", "☘️", "🍀", "🍁", "🍂", "🍃"
    ],
  },
  {
    id: "food",
    label: "🍕",
    title: "Comidas & Bebidas",
    emojis: [
      "🍕", "🍔", "🍟", "🌭", "🍿", "🥓", "🍳", "🧇", "🥞", "🧀", "🥖", "🥐",
      "🍞", "🥯", "🥨", "🥩", "🍗", "🍖", "🥟", "🍣", "🍱", "🍛", "🍜", "🍝",
      "🍰", "🎂", "🧁", "🥧", "🍫", "🍬", "🍭", "🍮", "🍯", "☕", "🍵", "🧃",
      "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾",
      "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑",
      "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🌽", "🥕", "🧄", "🧅", "🥔"
    ],
  },
  {
    id: "activities",
    label: "🎉",
    title: "Festas & Lazer",
    emojis: [
      "🎉", "🎊", "🎈", "🎂", "🎁", "🎀", "🪄", "🪅", "✨", "🎇", "🎆", "🎄",
      "🎃", "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓",
      "🏸", "🏒", "🏑", "🥍", "🏏", "⛳", "🏹", "🎣", "🤿", "🥊", "🥋", "🛹",
      "🛼", "🛷", "⛸️", "🎯", "🎮", "🕹️", "🎲", "🧩", "♟️", "🎭", "🎨", "🧵",
      "🎸", "🎹", "🎺", "🎻", "🪕", "🥁", "🪘", "🎤", "🎧", "📻", "🎷"
    ],
  },
  {
    id: "symbols",
    label: "❤️",
    title: "Corações & Símbolos",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️",
      "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊",
      "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "⭐",
      "🌟", "✨", "⚡", "☄️", "💥", "🔥", "🌈", "☀️", "🌤️", "⛅", "🌧️", "⛈️",
      "❄️", "☃️", "⛄", "💨", "🌊", "🔔", "🔕", "📢", "📣", "💬", "💭", "💯"
    ],
  },
];

export function EmojiPicker({ onSelectEmoji }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("faces");

  const filteredCategories = EMOJI_CATEGORIES.map((cat) => ({
    ...cat,
    emojis: search
      ? cat.emojis.filter(() => true) // Emojis são gráficos; exibimos todas se busca vazia
      : cat.emojis,
  }));

  return (
    <div className="w-[300px] sm:w-[340px] p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-6 h-9 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl mb-2">
          {EMOJI_CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.id}
              className="text-base p-0 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-xs rounded-lg transition-all"
              title={cat.title}
            >
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {EMOJI_CATEGORIES.map((cat) => (
          <TabsContent key={cat.id} value={cat.id} className="mt-0 focus-visible:outline-none">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {cat.title}
              </span>
              <span className="text-[10px] text-slate-400">
                {cat.emojis.length} emojis
              </span>
            </div>
            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1 p-1 max-h-48 overflow-y-auto rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/50">
              {cat.emojis.map((emoji, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => onSelectEmoji(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-xl hover:scale-125 active:scale-95 transition-transform rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
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
