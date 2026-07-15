import { useEffect, useRef } from 'react';
import type { DailyCall } from '@daily-co/daily-js';
import { Tool, Stroke } from './drawTypes';

const REF_H = 1080; // kalınlık/metin boyu referansı

interface Props {
  co: DailyCall;
  page: number;
  width: number;
  height: number;
  tool: Tool;
  color: string;
  size: number;
  isTeacher: boolean;
  canDraw: boolean;
  clearNonce: number;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function DrawingCanvas({
  co,
  page,
  width,
  height,
  tool,
  color,
  size,
  isTeacher,
  canDraw,
  clearNonce,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Map<number, Stroke[]>>(new Map());
  const drawingRef = useRef<Stroke | null>(null);
  const lastSentRef = useRef(0);
  const pageRef = useRef(page);
  pageRef.current = page;

  // canlı prop'ları ref'te tut (event handler'lar güncel görsün)
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  function getPageStrokes(p: number): Stroke[] {
    let arr = strokesRef.current.get(p);
    if (!arr) {
      arr = [];
      strokesRef.current.set(p, arr);
    }
    return arr;
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (s.tool === 'text') {
      if (!s.text || s.points.length === 0) return;
      const [nx, ny] = s.points[0];
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = s.color;
      ctx.font = `${(s.size * 8 / REF_H) * height}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text, nx * width, ny * height);
      return;
    }
    if (s.points.length === 0) return;
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = (s.size / REF_H) * height * (s.tool === 'eraser' ? 6 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.points.forEach(([nx, ny], i) => {
      const x = nx * width;
      const y = ny * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (s.points.length === 1) {
      const [nx, ny] = s.points[0];
      ctx.lineTo(nx * width + 0.1, ny * height);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const strokes = strokesRef.current.get(pageRef.current) || [];
    for (const s of strokes) drawStroke(ctx, s);
    if (drawingRef.current) drawStroke(ctx, drawingRef.current);
  }

  // Boyut / sayfa değişince yeniden çiz
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, page]);

  // Gelen çizim mesajları
  useEffect(() => {
    function onMsg(ev: any) {
      const d = ev?.data;
      if (!d || typeof d.t !== 'string') return;
      if (d.t === 'stroke' || d.t === 'text') {
        const arr = getPageStrokes(d.page);
        const idx = arr.findIndex((s) => s.id === d.stroke.id);
        if (idx >= 0) arr[idx] = d.stroke;
        else arr.push(d.stroke);
        if (d.page === pageRef.current) redraw();
      } else if (d.t === 'clear') {
        strokesRef.current.set(d.page, []);
        if (d.page === pageRef.current) redraw();
      } else if (d.t === 'snapshot') {
        strokesRef.current.set(d.page, Array.isArray(d.strokes) ? d.strokes : []);
        if (d.page === pageRef.current) redraw();
      }
    }
    co.on('app-message', onMsg);
    return () => {
      co.off('app-message', onMsg);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co]);

  // Öğretmen: yeni katılımcıya mevcut sayfanın çizimlerini yolla
  useEffect(() => {
    if (!isTeacher) return;
    function onJoin() {
      co.sendAppMessage(
        { t: 'snapshot', page: pageRef.current, strokes: strokesRef.current.get(pageRef.current) || [] },
        '*'
      );
    }
    co.on('participant-joined', onJoin);
    return () => {
      co.off('participant-joined', onJoin);
    };
  }, [co, isTeacher]);

  // Temizle (öğretmen butonu → nonce artar)
  useEffect(() => {
    if (clearNonce === 0) return;
    strokesRef.current.set(pageRef.current, []);
    co.sendAppMessage({ t: 'clear', page: pageRef.current }, '*');
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNonce]);

  function toNorm(e: React.PointerEvent): [number, number] {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canDraw || toolRef.current === 'none') return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const pt = toNorm(e);

    if (toolRef.current === 'text') {
      const text = window.prompt('Metin:');
      if (!text) return;
      const stroke: Stroke = { id: uid(), tool: 'text', color: colorRef.current, size: sizeRef.current, points: [pt], text };
      getPageStrokes(pageRef.current).push(stroke);
      co.sendAppMessage({ t: 'text', page: pageRef.current, stroke }, '*');
      redraw();
      return;
    }

    const stroke: Stroke = {
      id: uid(),
      tool: toolRef.current === 'eraser' ? 'eraser' : 'pen',
      color: colorRef.current,
      size: sizeRef.current,
      points: [pt],
    };
    drawingRef.current = stroke;
    getPageStrokes(pageRef.current).push(stroke);
    redraw();
    co.sendAppMessage({ t: 'stroke', page: pageRef.current, stroke }, '*');
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(toNorm(e));
    redraw();
    const now = performance.now();
    if (now - lastSentRef.current > 40) {
      lastSentRef.current = now;
      co.sendAppMessage({ t: 'stroke', page: pageRef.current, stroke: drawingRef.current }, '*');
    }
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    co.sendAppMessage({ t: 'stroke', page: pageRef.current, stroke: drawingRef.current }, '*');
    drawingRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="draw-canvas"
      style={{ pointerEvents: canDraw && tool !== 'none' ? 'auto' : 'none', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
}
