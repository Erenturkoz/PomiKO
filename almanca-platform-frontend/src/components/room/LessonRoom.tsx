import { useEffect, useRef, useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { VideoTile, ParticipantAudio } from './VideoTile';
import { MaterialStage } from './MaterialStage';
import { Toolbox } from './Toolbox';
import { Tool, STICKERS } from './drawTypes';
import { ConfirmDialog } from '../ConfirmDialog';

interface Material {
  name: string;
  fileUrl: string;
  filename: string | null;
}


/* --- Kontrol ikonları (SVG) --- */
const IcMic = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21" />
    {off && <line x1="4" y1="4" x2="20" y2="20" stroke="#fff" strokeWidth="2.4" />}
  </svg>
);
const IcCam = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="12" height="12" rx="2.5" />
    <path d="M15 10.5 21 7v10l-6-3.5" />
    {off && <line x1="3" y1="4" x2="21" y2="20" stroke="#fff" strokeWidth="2.4" />}
  </svg>
);
const IcLeave = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 9c-2.9 0-5.6.6-8 1.7-.6.3-1 .9-1 1.6v2.3c0 .8.7 1.4 1.5 1.3l3.6-.5c.7-.1 1.2-.6 1.3-1.3l.2-1.5c.8-.2 1.6-.3 2.4-.3s1.6.1 2.4.3l.2 1.5c.1.7.6 1.2 1.3 1.3l3.6.5c.8.1 1.5-.5 1.5-1.3v-2.3c0-.7-.4-1.3-1-1.6C17.6 9.6 14.9 9 12 9z" />
  </svg>
);
const IcUrgent = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 16.5h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);
const IcStar = ({ filled = false, size = 22 }: { filled?: boolean; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill={filled ? '#ffd43b' : 'none'}
    stroke={filled ? '#f59f00' : 'currentColor'}
    strokeWidth="1.7"
    strokeLinejoin="round"
  >
    <path d="M12 3l2.7 5.5 6 .9-4.35 4.2 1 6L12 17.8 6.65 19.6l1-6L3.3 9.4l6-.9z" />
  </svg>
);

// Tam ekran kutlama için dağıtılmış yıldız konumları (deterministik → her oynatışta aynı düzen)
const CELEBRATE_BITS = Array.from({ length: 18 }, (_, i) => ({
  left: `${4 + ((i * 53) % 92)}%`,
  top: `${8 + ((i * 37) % 82)}%`,
  size: 20 + ((i * 11) % 30),
  delay: `${(i % 7) * 70}ms`,
}));

interface Props {
  co: DailyCall;
  role: 'TEACHER' | 'PARENT' | 'ADMIN';
  participants: Record<string, DailyParticipant>;
  material: Material | null;
  micOn: boolean;
  camOn: boolean;
  remainingMs: number;
  initialStars: number;
  onPersistStars: (count: number) => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
}

export function LessonRoom({
  co,
  role,
  participants,
  material,
  micOn,
  camOn,
  remainingMs,
  initialStars,
  onPersistStars,
  onToggleMic,
  onToggleCam,
  onLeave,
}: Props) {
  const all = Object.values(participants);
  // Rol token'a user_id olarak gömülü → öğretmen hep üstte, öğrenci hep altta
  const teacher = all.find((p) => p.user_id === 'TEACHER') ?? null;
  const student = all.find((p) => p.user_id === 'PARENT') ?? null;
  const remotes = all.filter((p) => !p.local);
  const isObserver = role === 'ADMIN';
  const isTeacher = role === 'TEACHER';

  const [tool, setTool] = useState<Tool>('none');
  const [color, setColor] = useState('#e03131');
  const [size, setSize] = useState(4);
  const [sticker, setSticker] = useState(STICKERS[0]);
  const [clearNonce, setClearNonce] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // --- Yıldızlar: öğretmen tek tek GÖNDERİR (max 5, geri alma yok); app-message ile
  //     senkron, backend'de kalıcı. Her yeni yıldızda öğrencinin tüm ekranında kutlama. ---
  const [stars, setStars] = useState(initialStars);
  const starsRef = useRef(initialStars);
  starsRef.current = stars;
  const [celebrateKey, setCelebrateKey] = useState(0); // her artışta artar → efekti yeniden oynatır
  const prevStarsRef = useRef(initialStars);

  // Gelen yıldız mesajını dinle (gönderen kendi mesajını almaz → bu öğrenci/gözlemci tarafı)
  useEffect(() => {
    function onMsg(ev: any) {
      const d = ev?.data;
      if (d?.t === 'stars' && typeof d.count === 'number') {
        setStars(Math.max(0, Math.min(5, d.count)));
      }
    }
    co.on('app-message', onMsg);
    return () => {
      co.off('app-message', onMsg);
    };
  }, [co]);

  // Öğretmen: yeni katılımcı gelince güncel yıldız sayısını yolla (geç katılan da görsün)
  useEffect(() => {
    if (role !== 'TEACHER') return;
    function onJoin() {
      co.sendAppMessage({ t: 'stars', count: starsRef.current }, '*');
    }
    co.on('participant-joined', onJoin);
    return () => {
      co.off('participant-joined', onJoin);
    };
  }, [co, role]);

  // Yıldız ARTINCA kutlama efektini tetikle (öğrenci ekranında tam ekran)
  useEffect(() => {
    if (stars > prevStarsRef.current) setCelebrateKey((n) => n + 1);
    prevStarsRef.current = stars;
  }, [stars]);

  // Öğretmen bir yıldız GÖNDERİR: mevcut +1 (5'te durur). Azaltma/dial yok.
  function sendStar() {
    if (role !== 'TEACHER') return;
    const next = Math.min(5, stars + 1);
    if (next === stars) return;
    setStars(next);
    co.sendAppMessage({ t: 'stars', count: next }, '*');
    onPersistStars(next);
  }

  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec <= 300; // son 5 dakika

  return (
    <div className="room-stage">
      {/* Sol üst: kameralar + kontroller */}
      <div className="rs-left">
        <VideoTile participant={teacher} label="Öğretmen" mirror={!!teacher?.local} />
        <VideoTile participant={student} label="Öğrenci" mirror={!!student?.local} />
        {!isObserver && (
          <div className="rs-controls">
            <button
              className={`ctl-btn ${micOn ? '' : 'is-off'}`}
              onClick={onToggleMic}
              title={micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
              aria-label={micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
            >
              <IcMic off={!micOn} />
            </button>
            <button
              className={`ctl-btn ${camOn ? '' : 'is-off'}`}
              onClick={onToggleCam}
              title={camOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
              aria-label={camOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
            >
              <IcCam off={!camOn} />
            </button>
          </div>
        )}

        {/* Öğretmen: kameraların altında "Yıldız Gönder" paneli (tek tek gönderir, 5'te dolar) */}
        {role === 'TEACHER' && (
          <div className="star-send">
            <button
              className="star-send-btn"
              onClick={sendStar}
              disabled={stars >= 5}
              title={stars >= 5 ? 'Tüm yıldızlar verildi' : 'Öğrenciye yıldız gönder'}
            >
              <IcStar filled size={20} />
              <span>{stars >= 5 ? 'Tamamlandı' : 'Yıldız Gönder'}</span>
            </button>
            <div className="star-send-track" aria-label={`${stars}/5 yıldız gönderildi`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <IcStar key={i} filled={i <= stars} size={16} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Orta: ekranı kaplayan materyal / beyaz tahta + çizim */}
      <div className="rs-center">
        <MaterialStage
          co={co}
          material={material}
          isTeacher={isTeacher}
          canDraw={!isObserver}
          tool={tool}
          color={color}
          size={size}
          sticker={sticker}
          clearNonce={clearNonce}
        />

        {/* Öğrenci (ve gözlemci): kazanılan yıldızlar köşede kalıcı gösterge */}
        {role !== 'TEACHER' && stars > 0 && (
          <div className="star-earned" aria-label={`${stars} yıldız kazandın`}>
            <div className="star-earned-icons">
              {[1, 2, 3, 4, 5].map((i) => (
                <IcStar key={i} filled={i <= stars} size={18} />
              ))}
            </div>
            <span className="star-earned-count">{stars}/5</span>
          </div>
        )}
      </div>

      {/* Sağ: sayaç + araç kutusu */}
      <div className="rs-right">
        <button
          className="ctl-btn ctl-leave"
          onClick={() => setConfirmLeave(true)}
          title="Dersten ayrıl"
          aria-label="Dersten ayrıl"
        >
          <IcLeave />
        </button>
        <div className={`lesson-timer ${urgent ? 'is-urgent' : ''}`}>
          {urgent && <IcUrgent />}
          <span className="lesson-timer-time">
            {mm}:{ss}
          </span>
        </div>
        <Toolbox
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          size={size}
          setSize={setSize}
          sticker={sticker}
          setSticker={setSticker}
          canDraw={!isObserver}
          canClear={isTeacher}
          onClear={() => setConfirmClear(true)}
        />
      </div>

      {/* Uzak katılımcı sesleri */}
      {remotes.map((p) => (
        <ParticipantAudio key={p.session_id} participant={p} />
      ))}

      {/* Yıldız gelince öğrencinin TÜM ekranında kutlama efekti (anlık, tıklamayı engellemez) */}
      {role !== 'TEACHER' && celebrateKey > 0 && (
        <div className="star-celebrate" key={celebrateKey} aria-hidden="true">
          {CELEBRATE_BITS.map((b, i) => (
            <span
              className="star-celebrate-bit"
              key={i}
              style={{ left: b.left, top: b.top, fontSize: b.size, animationDelay: b.delay }}
            >
              ⭐
            </span>
          ))}
          <div className="star-celebrate-main">⭐</div>
          <div className="star-celebrate-text">Aferin!</div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Dersten ayrıl"
        message="Dersten ayrılmak istediğine emin misin?"
        confirmLabel="Ayrıl"
        danger
        onConfirm={() => {
          setConfirmLeave(false);
          onLeave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Tümünü temizle"
        message="Tahtadaki tüm çizim silinsin mi? Bu işlem geri alınamaz."
        confirmLabel="Temizle"
        danger
        onConfirm={() => {
          setConfirmClear(false);
          setClearNonce((n) => n + 1);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
