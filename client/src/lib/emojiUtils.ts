// Utilitário completo para detecção e animação de emojis estilo WhatsApp/Telegram
const EMOJI_REGEX = /^(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83d\ud83e][\ud000-\udfff]|[\u200d\ufe0f])+$/;

export function getEmojiDisplayStyle(text: string | null | undefined): {
  isEmojiOnly: boolean;
  sizeClass: string;
  isJumbo: boolean;
  animClass: string;
} {
  if (!text) return { isEmojiOnly: false, sizeClass: "", isJumbo: false, animClass: "" };
  const trimmed = text.trim();

  // Remove espaços para testar se é estritamente emojis
  const noSpaces = trimmed.replace(/\s+/g, "");
  if (!noSpaces || !EMOJI_REGEX.test(noSpaces)) {
    return { isEmojiOnly: false, sizeClass: "", isJumbo: false, animClass: "" };
  }

  // Conta a quantidade aproximada de glifos/emojis com Intl.Segmenter
  let count = 0;
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
    count = Array.from(segmenter.segment(trimmed)).filter(s => s.segment.trim().length > 0).length;
  } else {
    count = Array.from(trimmed.replace(/\s+/g, "")).length;
  }

  if (count === 1) {
    let animClass = "emoji-float-3d";
    if (/[\u2764\ufe0f|\ud83d\udc96|\ud83d\udc97|\ud83d\udc93|\ud83d\udc9e|\ud83d\udc95|❤️|💖|💓|💗|💞|💕|💘]/.test(trimmed)) {
      animClass = "emoji-heart-beat";
    } else if (/[\ud83d\udd25|\u26a1|\ud83d\udca5|🔥|⚡|💥]/.test(trimmed)) {
      animClass = "emoji-flame-burst";
    } else if (/[\ud83d\ude02|\ud83e\udd23|\ud83d\ude06|😂|🤣|😆]/.test(trimmed)) {
      animClass = "emoji-joy-bounce";
    } else if (/[\ud83c\udf89|\ud83e\udd73|\u2728|🎉|🥳|✨]/.test(trimmed)) {
      animClass = "emoji-party-pop";
    } else if (/[\ud83d\ude80|🚀]/.test(trimmed)) {
      animClass = "emoji-rocket-fly";
    }

    return {
      isEmojiOnly: true,
      sizeClass: "text-6xl sm:text-7xl leading-tight py-2 inline-block filter drop-shadow-md select-none",
      isJumbo: true,
      animClass,
    };
  } else if (count <= 3) {
    return {
      isEmojiOnly: true,
      sizeClass: "text-4xl sm:text-5xl leading-snug py-1 inline-block select-none filter drop-shadow-sm",
      isJumbo: true,
      animClass: "emoji-float-3d",
    };
  } else if (count <= 6) {
    return {
      isEmojiOnly: true,
      sizeClass: "text-2xl sm:text-3xl leading-normal py-0.5 inline-block select-none",
      isJumbo: false,
      animClass: "",
    };
  }

  return { isEmojiOnly: false, sizeClass: "", isJumbo: false, animClass: "" };
}
