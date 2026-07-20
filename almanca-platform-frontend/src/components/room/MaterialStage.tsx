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

interface Props {
  co: DailyCall;
  fileUrl: string;
  isTeacher: boolean;
  canDraw: boolean;
  tool: Tool;
  color: string;
  size: number;
  clearNonce: number;
}

export function MaterialStage({ co, fileUrl, isTeacher, canDraw, tool, color, size, clearNonce }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(16 / 9);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  pageRef.current = page;

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

  // Öğrenci: öğretmenin sayfa mesajını dinle
  useEffect(() => {
    function onMsg(ev: any) {
      if (ev?.data?.type === PAGE_MSG && typeof ev.data.page === 'number') {
        setPage(ev.data.page);
      }
    }
    co.on('app-message', onMsg);
    return () => {
      co.off('app-message', onMsg);
    };
  }, [co]);

  // Öğretmen: yeni katılımcı gelince mevcut sayfayı yolla
  useEffect(() => {
    if (!isTeacher) return;
    function onJoin() {
      co.sendAppMessage({ type: PAGE_MSG, page: pageRef.current }, '*');
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

  // fit-contain: sayfa hem genişliğe hem yüksekliğe sığsın
  let renderW = 0;
  let renderH = 0;
  if (area.w > 0 && area.h > 0) {
    renderW = Math.min(area.w, area.h * aspect);
    renderH = renderW / aspect;
  }

  return (
    <div className="material-stage">
      <div className="ms-area" ref={areaRef}>
        <div className="ms-page" style={{ width: renderW || undefined, height: renderH || undefined }}>
          <Document
            file={`${API_URL}${fileUrl}`}
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
          {renderW > 0 && (
            <DrawingCanvas
              co={co}
              page={page}
              width={renderW}
              height={renderH}
              tool={tool}
              color={color}
              size={size}
              isTeacher={isTeacher}
              canDraw={canDraw}
              clearNonce={clearNonce}
            />
          )}
        </div>
      </div>

      <div className="ms-nav">
        {isTeacher ? (
          <>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
              ‹ Önceki
            </button>
            <span className="pdf-page">
              {page} / {numPages || '–'}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={numPages === 0 || page >= numPages}
              onClick={() => goTo(page + 1)}
            >
              Sonraki ›
            </button>
          </>
        ) : (
          <span className="pdf-page">
            Sayfa {page} / {numPages || '–'} · öğretmen yönetiyor
          </span>
        )}
      </div>
    </div>
  );
}
