export type Tool = 'none' | 'pen' | 'eraser' | 'text' | 'sticker';

export interface Stroke {
  id: string;
  tool: 'pen' | 'eraser' | 'text' | 'sticker';
  color: string;
  size: number; // 1080px referansına göre kalınlık / ölçek
  points: [number, number][]; // normalize (0..1) koordinatlar
  text?: string; // 'text' aracı için
  sticker?: string; // 'sticker' aracı için: yapıştırılan emoji (points[0] = merkez)
}

// Öğretmenin tahtaya yapıştırabileceği hazır sticker seti (görsel tasarım sonra
// gelene kadar emoji). Sticker'lar çizim gibi senkronlanır ve sürüklenebilir.
export const STICKERS = [
  '⭐', '🎉', '👍', '❤️', '🌟', '🏆', '😊', '🔥',
  '💯', '✅', '🌈', '🦄', '🎈', '👏', '💡', '🎯',
];
