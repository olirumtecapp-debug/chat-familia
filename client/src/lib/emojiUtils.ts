// Utilitário para detecção de emojis grandes em mensagens
const EMOJI_REGEX = /^(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83d\ud83e][\ud000-\udfff]|[\u200d\ufe0f])+$/;

export function getEmojiDisplayStyle(text: string | null | undefined): { isEmojiOnly: boolean; sizeClass: string; isJumbo: boolean } {
  if (!text) return { isEmojiOnly: false, sizeClass: "", isJumbo: false };
  const trimmed = text.trim();
  
  // Remove espaços para testar se é estritamente emojis
  const noSpaces = trimmed.replace(/\s+/g, "");
  if (!noSpaces || !EMOJI_REGEX.test(noSpaces)) {
    return { isEmojiOnly: false, sizeClass: "", isJumbo: false };
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
    return { isEmojiOnly: true, sizeClass: "text-5xl leading-tight py-1 inline-block animate-bounce-subtle", isJumbo: true };
  } else if (count <= 3) {
    return { isEmojiOnly: true, sizeClass: "text-3xl leading-snug py-0.5", isJumbo: false };
  } else if (count <= 6) {
    return { isEmojiOnly: true, sizeClass: "text-2xl leading-normal", isJumbo: false };
  }
  return { isEmojiOnly: false, sizeClass: "", isJumbo: false };
}
