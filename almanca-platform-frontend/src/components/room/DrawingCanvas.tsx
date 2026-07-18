import { useEffect, useRef, useState } from 'react';
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

interface TextDraft {
  x: number; // normalize
  y: number;
  value: string;
  editingId?: string; // varsa mevcut metni düzenliyoruz
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Noktanın bir doğru parçasına uzaklığı (piksel uzayında) */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
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

  // Satır içi metin kutusu (popup yok)
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const draftRef = useRef<TextDraft | null>(null);
  draftRef.current = draft;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Metin taşıma
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

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

  function fontPx(s: Stroke) {
    return ((s.size * 8) / REF_H) * height;
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (s.tool === 'text') {
      if (!s.text || s.points.length === 0) return;
      const [nx, ny] = s.points[0];
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = s.color;
      ctx.font = `${fontPx(s)}px sans-serif`;
      ctx.textBaseline = 'top';
      const lines = s.text.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, nx * width, ny * height + i * fontPx(s) * 1.25);
      });
      return;
    }
    if (s.points.length === 0) return;
    // Eski kayıtlarla uyum: 'eraser' stroke'ları hâlâ piksel siler
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
    for (const s of strokes) {
      // Düzenlenmekte olan metni canvasa çizme (kutuda görünüyor)
      if (draftRef.current?.editingId && s.id === draftRef.current.editingId) continue;
      drawStroke(ctx, s);
    }
    if (drawingRef.current) drawStroke(ctx, drawingRef.current);
  }

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

  // Sayfa değişince açık metin kutusunu iptal et
  useEffect(() => {
    setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Gelen mesajlar
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
      } else if (d.t === 'del') {
        const arr = getPageStrokes(d.page);
        const ids: string[] = Array.isArray(d.ids) ? d.ids : [];
        strokesRef.current.set(
          d.page,
          arr.filter((s) => !ids.includes(s.id))
        );
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

  useEffect(() => {
    if (clearNonce === 0) return;
    strokesRef.current.set(pageRef.current, []);
    setDraft(null);
    co.sendAppMessage({ t: 'clear', page: pageRef.current }, '*');
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNonce]);

  function toNorm(e: React.PointerEvent): [number, number] {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  /** Piksel konumundaki metin stroke'unu bul (kaba sınır kutusu) */
  function hitText(px: number, py: number): Stroke | null {
    const strokes = strokesRef.current.get(pageRef.current) || [];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.tool !== 'text' || !s.text) continue;
      const [nx, ny] = s.points[0];
      const x = nx * width;
      const y = ny * height;
      const fs = fontPx(s);
      const lines = s.text.split('\n');
      let w = 0;
      if (ctx) {
        ctx.font = `${fs}px sans-serif`;
        for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
      } else {
        w = Math.max(...lines.map((l) => l.length)) * fs * 0.6;
      }
      const h = lines.length * fs * 1.25;
      const pad = 6;
      if (px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad) return s;
    }
    return null;
  }

  /** SİLGİ: piksel silmek yerine değdiği ÇİZGİYİ/METNİ komple sil */
  function eraseAt(px: number, py: number) {
    const strokes = strokesRef.current.get(pageRef.current) || [];
    const radius = Math.max(12, ((sizeRef.current * 3) / REF_H) * height);
    const dead: string[] = [];
    for (const s of strokes) {
      if (s.tool === 'text') {
        continue; // metinler yanlışlıkla silinmesin; metni silmek için üstüne silgiyle TIKLA (aşağıda)
      }
      for (let i = 0; i < s.points.length; i++) {
        const [nx, ny] = s.points[i];
        const x = nx * width;
        const y = ny * height;
        let hit = Math.hypot(px - x, py - y) <= radius;
        if (!hit && i > 0) {
          const [pnx, pny] = s.points[i - 1];
          hit = distToSegment(px, py, pnx * width, pny * height, x, y) <= radius;
        }
        if (hit) {
          dead.push(s.id);
          break;
        }
      }
    }
    if (dead.length > 0) {
      strokesRef.current.set(
        pageRef.current,
        strokes.filter((s) => !dead.includes(s.id))
      );
      co.sendAppMessage({ t: 'del', page: pageRef.current, ids: dead }, '*');
      redraw();
    }
  }

  /** Metin kutusunu kaydet (boşsa siler) */
  function commitDraft() {
    const d = draftRef.current;
    if (!d) return;
    const value = d.value.trim();
    const arr = getPageStrokes(pageRef.current);
    if (d.editingId) {
      const idx = arr.findIndex((s) => s.id === d.editingId);
      if (idx >= 0) {
        if (value) {
          arr[idx] = { ...arr[idx], text: value };
          co.sendAppMessage({ t: 'text', page: pageRef.current, stroke: arr[idx] }, '*');
        } else {
          const id = arr[idx].id;
          strokesRef.current.set(pageRef.current, arr.filter((s) => s.id !== id));
          co.sendAppMessage({ t: 'del', page: pageRef.current, ids: [id] }, '*');
        }
      }
    } else if (value) {
      const stroke: Stroke = {
        id: uid(),
        tool: 'text',
        color: colorRef.current,
        size: sizeRef.current,
        points: [[d.x, d.y]],
        text: value,
      };
      arr.push(stroke);
      co.sendAppMessage({ t: 'text', page: pageRef.current, stroke }, '*');
    }
    setDraft(null);
    requestAnimationFrame(redraw);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canDraw) return;

    // Açık metin kutusu varsa önce onu kaydet
    if (draftRef.current) {
      commitDraft();
      return;
    }

    const [nx, ny] = toNorm(e);
    const px = nx * width;
    const py = ny * height;
    const t = toolRef.current;

    // İmleç (veya metin aracı) ile mevcut metne tıklanırsa: TAŞIMA başlat
    if (t === 'none' || t === 'text') {
      const hit = hitText(px, py);
      if (hit) {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        const [hx, hy] = hit.points[0];
        dragRef.current = { id: hit.id, offX: nx - hx, offY: ny - hy };
        return;
      }
    }

    if (t === 'none') return;

    if (t === 'text') {
      // Popup yok: tıklanan yerde satır içi kutu aç
      setDraft({ x: nx, y: ny, value: '' });
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    if (t === 'eraser') {
      // Silgiyle metne tıklanırsa metni sil
      const hit = hitText(px, py);
      if (hit) {
        const arr = getPageStrokes(pageRef.current);
        strokesRef.current.set(pageRef.current, arr.filter((s) => s.id !== hit.id));
        co.sendAppMessage({ t: 'del', page: pageRef.current, ids: [hit.id] }, '*');
        redraw();
        return;
      }
      drawingRef.current = { id: 'erase', tool: 'eraser', color: '', size: 0, points: [] }; // sadece "sürükleniyor" işareti
      eraseAt(px, py);
      return;
    }

    // Kalem
    const stroke: Stroke = {
      id: uid(),
      tool: 'pen',
      color: colorRef.current,
      size: sizeRef.current,
      points: [[nx, ny]],
    };
    drawingRef.current = stroke;
    getPageStrokes(pageRef.current).push(stroke);
    redraw();
    co.sendAppMessage({ t: 'stroke', page: pageRef.current, stroke }, '*');
  }

  function onPointerMove(e: React.PointerEvent) {
    const [nx, ny] = toNorm(e);

    // Metin taşınıyor
    if (dragRef.current) {
      const arr = getPageStrokes(pageRef.current);
      const s = arr.find((x) => x.id === dragRef.current!.id);
      if (s) {
        s.points[0] = [nx - dragRef.current.offX, ny - dragRef.current.offY];
        redraw();
        const now = performance.now();
        if (now - lastSentRef.current > 40) {
          lastSentRef.current = now;
          co.sendAppMessage({ t: 'text', page: pageRef.current, stroke: s }, '*');
        }
      }
      return;
    }

    if (!drawingRef.current) return;

    // Silgi sürükleniyor
    if (drawingRef.current.tool === 'eraser') {
      eraseAt(nx * width, ny * height);
      return;
    }

    // Kalem
    drawingRef.current.points.push([nx, ny]);
    redraw();
    const now = performance.now();
    if (now - lastSentRef.current > 40) {
      lastSentRef.current = now;
      co.sendAppMessage({ t: 'stroke', page: pageRef.current, stroke: drawingRef.current }, '*');
    }
  }

  function onPointerUp() {
    if (dragRef.current) {
      const arr = getPageStrokes(pageRef.current);
      const s = arr.find((x) => x.id === dragRef.current!.id);
      if (s) co.sendAppMessage({ t: 'text', page: pageRef.current, stroke: s }, '*');
      dragRef.current = null;
      return;
    }
    if (!drawingRef.current) return;
    if (drawingRef.current.tool !== 'eraser') {
      co.sendAppMessage({ t: 'stroke', page: pageRef.current, stroke: drawingRef.current }, '*');
    }
    drawingRef.current = null;
  }

  const draftFontPx = ((sizeRef.current * 8) / REF_H) * height;

  return (
    <div
      className="draw-layer"
      style={{ pointerEvents: canDraw ? 'auto' : 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {draft && (
        <textarea
          ref={inputRef}
          className="draw-textbox"
          style={{
            left: draft.x * width,
            top: draft.y * height,
            color: colorRef.current,
            fontSize: draftFontPx,
            lineHeight: 1.25,
          }}
          value={draft.value}
          placeholder="Yaz…"
          rows={1}
          onChange={(e) => setDraft((d) => (d ? { ...d, value: e.target.value } : d))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitDraft();
            }
            if (e.key === 'Escape') setDraft(null);
          }}
          onBlur={commitDraft}
        />
      )}
    </div>
  );
}
