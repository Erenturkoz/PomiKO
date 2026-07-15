import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { DailyCall } from '@daily-co/daily-js';
import { API_URL } from '../../api/client';

// pdf.js worker (Vite bundler ile çözülür)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface Props {
  co: DailyCall;
  fileUrl: string; // /uploads/... (göreli)
  isTeacher: boolean;
}

const PAGE_MSG = 'lumiko-page';

export function PdfViewer({ co, fileUrl, isTeacher }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  pageRef.current = page;

  // Genişliği ölç → responsive sayfa
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
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

  // Öğretmen: yeni katılımcı gelince mevcut sayfayı yolla (geç katılım senkronu)
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

  return (
    <div className="pdf-viewer">
      <div className="pdf-canvas" ref={wrapRef}>
        <Document
          file={`${API_URL}${fileUrl}`}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="pdf-msg">Materyal yükleniyor…</div>}
          error={<div className="pdf-msg">Materyal yüklenemedi</div>}
        >
          <Page
            pageNumber={page}
            width={width || undefined}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading=""
          />
        </Document>
      </div>

      <div className="pdf-nav">
        {isTeacher ? (
          <>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => goTo(page - 1)}
            >
              ‹ Önceki
            </button>
            <span className="pdf-page">
              {page} / {numPages || '–'}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={numPages > 0 && page >= numPages}
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
