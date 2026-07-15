export type Tool = 'none' | 'pen' | 'eraser' | 'text';

export interface Stroke {
  id: string;
  tool: 'pen' | 'eraser' | 'text';
  color: string;
  size: number; // 1080px referansına göre kalınlık
  points: [number, number][]; // normalize (0..1) koordinatlar
  text?: string;
}
