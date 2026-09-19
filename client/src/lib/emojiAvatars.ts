export interface EmojiAvatarPreset {
  id: string;
  emoji: string;
  label: string;
  bgColor: string;
  url: string;
}

export const createEmojiSvgDataUrl = (emoji: string, bgColor: string): string => {
  const cleanEmoji = emoji.trim() || '😊';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="50" fill="${bgColor}"/>` +
    `<text x="50" y="58" font-size="52" text-anchor="middle" dominant-baseline="middle" font-family="'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif">${cleanEmoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Conjunto enxuto e essencial de 6 avatares familiares para entrada rápida
export const EMOJI_AVATAR_PRESETS: EmojiAvatarPreset[] = [
  { id: 'pai', emoji: '👨', label: 'Pai', bgColor: '#0284c7' },
  { id: 'mae', emoji: '👩', label: 'Mãe', bgColor: '#ec4899' },
  { id: 'filho', emoji: '👦', label: 'Filho', bgColor: '#3b82f6' },
  { id: 'filha', emoji: '👧', label: 'Filha', bgColor: '#f43f5e' },
  { id: 'alegre', emoji: '😊', label: 'Família', bgColor: '#10b981' },
  { id: 'pet', emoji: '🐶', label: 'Pet', bgColor: '#f97316' },
].map((item) => ({
  ...item,
  url: createEmojiSvgDataUrl(item.emoji, item.bgColor),
}));

export const DEFAULT_AVATAR = EMOJI_AVATAR_PRESETS[0].url;
export const GROUP_AVATAR = createEmojiSvgDataUrl('👨‍👩‍👧‍👦', '#059669');

/**
 * Converte um arquivo de imagem do usuário (foto real) em um Data URL JPEG leve e redimensionado
 * perfeitamente otimizado para avatar (~10KB a 20KB).
 */
export function compressImageForAvatar(file: File, maxDim: number = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Por favor, selecione um arquivo de imagem válido (JPG, PNG, WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Mantém aspecto quadrado centralizado para avatar
        const minDim = Math.min(width, height);
        const startX = (width - minDim) / 2;
        const startY = (height - minDim) / 2;

        const targetDim = Math.min(minDim, maxDim);
        canvas.width = targetDim;
        canvas.height = targetDim;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetDim, targetDim);

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao carregar o arquivo.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Otimiza uma foto enviada no chat (reduz até 1280px e comprime em JPEG).
 * Usa createImageBitmap para não estourar a memória do celular
 * mesmo com fotos de 50 Megapixels de câmeras modernas.
 */
export async function optimizeImageForChat(file: File): Promise<{ base64Data: string; contentType: string }> {
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const str = reader.result as string;
        resolve({
          base64Data: str.split(',')[1],
          contentType: file.type || 'application/octet-stream',
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  let width = 0;
  let height = 0;
  let source: CanvasImageSource;

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } else {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });
    width = img.width;
    height = img.height;
    source = img;
    URL.revokeObjectURL(objectUrl);
  }

  const maxDim = 1280;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Falha ao processar imagem.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  if ('close' in source && typeof (source as any).close === 'function') {
    (source as any).close();
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return {
    base64Data: dataUrl.split(',')[1],
    contentType: 'image/jpeg',
  };
}

