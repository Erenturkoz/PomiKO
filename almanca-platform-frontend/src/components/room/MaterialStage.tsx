import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { DailyCall } from '@daily-co/daily-js';
import { API_URL } from '../../api/client';
import { DrawingCanvas } from './DrawingCanvas';
import { Tool } from './drawTypes';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const PAGE_MSG = 'pomiko-page';
const WB_MSG = 'pomiko-wb'; // beyaz tahta aç/kapa senkronu (öğretmen → herkes)
const WB_PAGE = 0; // beyaz tahta için ayrılmış çizim-sayfa anahtarı (PDF sayfaları ≥ 1)
const WB_ASPECT = 16 / 9;

interface Material {
  name: string;
  fileUrl: string;
  filename: string | null;
}

interface Props {
  co: DailyCall;
  material: Material | null;
  isTeacher: boolean;
  canDraw: boolean;
  tool: Tool;
  color: string;
  size: number;
  sticker: string;
  clearNonce: number;
}

/* --- Alt gezinme ikonları (SVG) --- */
const svgProps = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const IcPrev = () => (
  <svg {...svgProps}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
const IcNext = () => (
  <svg {...svgProps}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const IcBoard = () => (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21l1.5-4M16 21l-1.5-4" />
  </svg>
);
const IcBack = () => (
  <svg {...svgProps}>
    <polyline points="9 10 4 15 9 20" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </svg>
);

export function MaterialStage({
  co,
  material,
  isTeacher,
  canDraw,
  tool,
  color,
  size,
  sticker,
  clearNonce,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(16 / 9);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [whiteboard, setWhiteboard] = useState(false);
  const pageRef = useRef(1);
  pageRef.current = page;
  const wbRef = useRef(false);
  wbRef.current = whiteboard;

  // Alan boyutunu ölç (fit-contain hesabı için)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setArea({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Öğrenci: öğretmenin sayfa + beyaz tahta mesajlarını dinle
  useEffect(() => {
    function onMsg(ev: any) {
      const d = ev?.data;
      if (d?.type === PAGE_MSG && typeof d.page === 'number') setPage(d.page);
      else if (d?.type === WB_MSG && typeof d.on === 'boolean') setWhiteboard(d.on);
    }
    co.on('app-message', onMsg);
    return () => {
      co.off('app-message', onMsg);
    };
  }, [co]);

  // Öğretmen: yeni katılımcı gelince mevcut sayfa + tahta durumunu yolla
  useEffect(() => {
    if (!isTeacher) return;
    function onJoin() {
      co.sendAppMessage({ type: PAGE_MSG, page: pageRef.current }, '*');
      co.sendAppMessage({ type: WB_MSG, on: wbRef.current }, '*');
    }
    co.on('participant-joined', onJoin);
    return () => {
      co.off('participant-joined', onJoin);
    };
  }, [co, isTeacher]);

  function goTo(p: number) {
    const np = Math.min(Math.max(1, p), numPages || 1);
    setPage(np);
    if (isTeacher) co.sendAppMessage({ type: PAGE_MSG, page: np }, '*');
  }

  // Beyaz tahtayı YALNIZCA öğretmen açıp kapatır
  function toggleWhiteboard() {
    if (!isTeacher) return;
    const next = !whiteboard;
    setWhiteboard(next);
    co.sendAppMessage({ type: WB_MSG, on: next }, '*');
  }

  const effectiveAspect = whiteboard ? WB_ASPECT : aspect;
  const activePage = whiteboard ? WB_PAGE : page;
  const hasSurface = whiteboard || !!material;

  // fit-contain: yüzey hem genişliğe hem yüksekliğe sığsın
  let renderW = 0;
  let renderH = 0;
  if (area.w > 0 && area.h > 0 && hasSurface) {
    renderW = Math.min(area.w, area.h * effectiveAspect);
    renderH = renderW / effectiveAspect;
  }

  return (
    <div className="material-stage">
      <div className="ms-area" ref={areaRef}>
        {hasSurface ? (
          <div className="ms-page" style={{ width: renderW || undefined, height: renderH || undefined }}>
            {whiteboard ? (
              <div className="ms-whiteboard" />
            ) : material ? (
              <Document
                file={`${API_URL}${material.fileUrl}`}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                loading={<div className="pdf-msg">Materyal yükleniyor…</div>}
                error={<div className="pdf-msg">Materyal yüklenemedi</div>}
              >
                <Page
                  pageNumber={page}
                  width={renderW || undefined}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading=""
                  onLoadSuccess={(pg: any) => {
                    const v = pg.getViewport({ scale: 1 });
                    const a = v.width / v.height;
                    if (a && Math.abs(a - aspect) > 0.001) setAspect(a);
                  }}
                />
              </Document>
            ) : null}
            {/* Tek DrawingCanvas: sayfa anahtarı değişir (PDF sayfası ↔ beyaz tahta),
                çizimler ref'te sayfaya göre saklandığı için mod değişince kaybolmaz. */}
            {renderW > 0 && (
              <DrawingCanvas
                co={co}
                page={activePage}
                width={renderW}
                height={renderH}
                tool={tool}
                color={color}
                size={size}
                sticker={sticker}
                isTeacher={isTeacher}
                canDraw={canDraw}
                clearNonce={clearNonce}
              />
            )}
          </div>
        ) : (
          <div className="pdf-msg">
            Bu ders için materyal tanımlanmamış.{isTeacher ? ' Beyaz tahtayı açabilirsin.' : ''}
          </div>
        )}
      </div>

      <div className="ms-nav">
        {isTeacher ? (
          <>
            <button
              className={`ms-navbtn ${whiteboard ? 'is-on' : ''}`}
              onClick={toggleWhiteboard}
              title={whiteboard ? (material ? 'Materyale dön' : 'Tahtayı kapat') : 'Beyaz tahta'}
              aria-label={whiteboard ? (material ? 'Materyale dön' : 'Beyaz tahtayı kapat') : 'Beyaz tahtayı aç'}
            >
              {whiteboard && material ? <IcBack /> : <IcBoard />}
            </button>
            {!whiteboard && material && (
              <>
                <button
                  className="ms-navbtn"
                  disabled={page <= 1}
                  onClick={() => goTo(page - 1)}
                  title="Önceki sayfa"
                  aria-label="Önceki sayfa"
                >
                  <IcPrev />
                </button>
                <span className="pdf-page">
                  {page} / {numPages || '–'}
                </span>
                <button
                  className="ms-navbtn"
                  disabled={numPages === 0 || page >= numPages}
                  onClick={() => goTo(page + 1)}
                  title="Sonraki sayfa"
                  aria-label="Sonraki sayfa"
                >
                  <IcNext />
                </button>
              </>
            )}
          </>
        ) : (
          <span className="pdf-page">
            {whiteboard
              ? 'Beyaz tahta · öğretmen yönetiyor'
              : `Sayfa ${page} / ${numPages || '–'} · öğretmen yönetiyor`}
          </span>
        )}
      </div>
    </div>
  );
}
