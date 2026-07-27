import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { apiFetch, ApiError } from '../api/client';
import { PreJoin } from '../components/room/PreJoin';
import { LessonRoom } from '../components/room/LessonRoom';
import { now as serverNow, setServerNow } from '../lib/serverTime';
import { IcClock } from '../components/icons';

interface Material {
  name: string;
  fileUrl: string;
  filename: string | null;
}

interface RoomInfo {
  role: 'TEACHER' | 'PARENT' | 'ADMIN';
  serverNow: string;
  startsAt: string;
  endsAt: string;
  stars: number;
  material: Material | null;
}

interface JoinInfo extends RoomInfo {
  roomUrl: string;
  token: string;
  sessionId: string | null;
}

type Phase = 'loading' | 'lobby' | 'joining' | 'incall' | 'ended' | 'error';

const SYNC_EVENTS = [
  'participant-joined',
  'participant-updated',
  'participant-left',
  'joined-meeting',
  'track-started',
  'track-stopped',
] as const;

// Aynı cihazdan/hesaptan tekrar bağlanmaya çalışırken (ör. sayfa yenilendi) sunucunun eski
// oturumu "bayat" sayıp devretmesini beklemek için birkaç kez sessizce yeniden dene —
// kullanıcıya hemen "zaten bağlısın" hatası göstermek yerine.
const RECONNECT_MAX_ATTEMPTS = 4;
const RECONNECT_DELAY_MS = 5000;

// Ders içindeyken oturumu canlı tutmak için bu aralıkla heartbeat gönderilir
// (sunucudaki bayat-oturum eşiğinden kısa tutulmalı ki tek bir kaçırılan tık sorun yaratmasın).
const HEARTBEAT_INTERVAL_MS = 7000;

/** Olay kaydı gönder (log). Hata olursa sessizce geç. */
function sendEvent(
  bookingId: string | undefined,
  type: string,
  meta?: Record<string, unknown>,
  keepalive = false
) {
  if (!bookingId || bookingId === 'test') return;
  apiFetch(`/api/room/${bookingId}/event`, { method: 'POST', body: { type, meta }, keepalive }).catch(() => {});
}

/** ss:dd biçiminde kalan süre */
function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RoomPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const isTestRoom = bookingId === 'test';

  const coRef = useRef<DailyCall | null>(null);
  if (!coRef.current) {
    coRef.current = DailyIframe.getCallInstance() ?? DailyIframe.createCallObject();
  }
  const co = coRef.current;

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [participants, setParticipants] = useState<Record<string, DailyParticipant>>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [tick, setTick] = useState(0); // saniyelik yeniden çizim

  const joiningRef = useRef(false);
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;
  const sessionIdRef = useRef<string | null>(null);

  // Saniyede bir yeniden çiz (geri sayım / ders sayacı)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Daily olayları
  useEffect(() => {
    function sync() {
      setParticipants({ ...(co.participants() as Record<string, DailyParticipant>) });
    }
    function onJoined() {
      setPhase('incall');
      sync();
      sendEvent(bookingId, 'room.media', { at: 'start', mic: micOn, cam: camOn });
    }
    function onError(e: any) {
      console.error('[Daily] error:', e);
      setError(e?.errorMsg ?? 'Bağlantı hatası');
      setPhase('error');
    }
    SYNC_EVENTS.forEach((e) => co.on(e as any, sync));
    co.on('joined-meeting', onJoined);
    co.on('error', onError);
    return () => {
      SYNC_EVENTS.forEach((e) => co.off(e as any, sync));
      co.off('joined-meeting', onJoined);
      co.off('error', onError);
    };
  }, [co]);

  // Ders bilgisi (lobi) — Daily'ye bağlanmadan
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isTestRoom) {
          // Test odası: doğrudan bağlan
          const data = await apiFetch<JoinInfo>('/api/room/test/join', { method: 'POST' });
          if (cancelled) return;
          setServerNow(data.serverNow);
          setInfo(data);
          setPhase('lobby');
          return;
        }
        const data = await apiFetch<RoomInfo>(`/api/room/${bookingId}/info`);
        if (cancelled) return;
        setServerNow(data.serverNow); // sunucu saatiyle hizalan
        setInfo(data);
        setPhase('lobby');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Ders bilgisi alınamadı');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, isTestRoom]);

  // Sekme/pencere kapanırsa ayrılmayı bildirmeye çalış (garanti değil).
  // keepalive:true kullanılır ki istek, sayfa kapanırken/yenilenirken de gönderilmeye devam
  // etsin — bu, sunucudaki oturum kaydının hemen bırakılmasını (ve sayfa yenilendiğinde anında
  // yeniden bağlanabilmeyi) sağlar; aksi halde bayat-oturum eşiği dolana kadar beklenirdi.
  useEffect(() => {
    function onUnload() {
      if (phaseRef.current === 'incall') {
        sendEvent(bookingId, 'room.leave', { reason: 'unload', sessionId: sessionIdRef.current }, true);
      }
    }
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [bookingId]);

  // Ayrılırken temizle
  useEffect(() => {
    return () => {
      co.destroy().catch(() => {});
      coRef.current = null;
    };
  }, [co]);

  // Not: `connect` (aşağıda) doğrudan `onClick`/`onJoin` olarak geçiliyor — bu yüzden bir
  // parametre alırsa React tıklama olayını (Event) parametre sanıp `attempt` olarak kullanır.
  // Bunu önlemek için gerçek deneme mantığı ayrı, parametreli bir fonksiyonda tutulur.
  const attemptJoin = useCallback(
    async (attempt: number) => {
      if (joiningRef.current || !info) return;
      joiningRef.current = true;
      setPhase('joining');
      try {
        const data = await apiFetch<JoinInfo>(
          isTestRoom ? '/api/room/test/join' : `/api/room/${bookingId}/join`,
          { method: 'POST' }
        );
        setServerNow(data.serverNow);
        sessionIdRef.current = data.sessionId ?? null;
        joiningRef.current = false;
        await co.join({ url: data.roomUrl, token: data.token });
        // 'joined-meeting' → phase 'incall'
      } catch (err) {
        joiningRef.current = false;
        // Sayfa yenilendikten hemen sonra eski oturum sunucuda henüz "bayat" sayılmamış olabilir
        // (ör. Daily'nin presence bilgisi gecikmesi). Kullanıcıya hemen hata göstermek yerine
        // birkaç kez sessizce yeniden dene — gerçekten başka bir cihaz açıksa zaten tekrar aynı
        // hatayı alıp deneme hakkı biter, en sonunda doğru hata gösterilir.
        if (err instanceof ApiError && err.code === 'SESSION_ACTIVE' && attempt < RECONNECT_MAX_ATTEMPTS) {
          setTimeout(() => {
            // Bu arada ders süresi dolup 'ended' durumuna geçtiyse yeniden deneme
            if (phaseRef.current !== 'ended') attemptJoin(attempt + 1);
          }, RECONNECT_DELAY_MS);
          return;
        }
        console.error('[Room] connect failed:', err);
        setError(err instanceof Error ? err.message : 'Derse bağlanılamadı');
        setPhase('error');
      }
    },
    [bookingId, co, info, isTestRoom]
  );

  const connect = useCallback(() => {
    attemptJoin(0);
  }, [attemptJoin]);

  // Öğretmenin verdiği yıldızı kalıcılaştır (test odasında/gözlemcide çağrılmaz).
  const persistStars = useCallback(
    (count: number) => {
      if (!bookingId || bookingId === 'test') return;
      apiFetch(`/api/room/${bookingId}/stars`, { method: 'POST', body: { count } }).catch(() => {});
    },
    [bookingId]
  );

  const startMs = info ? new Date(info.startsAt).getTime() : 0;
  const endMs = info ? new Date(info.endsAt).getTime() : 0;
  const nowMs = serverNow();
  const untilStart = startMs - nowMs;
  const untilEnd = endMs - nowMs;
  const isObserver = info?.role === 'ADMIN';

  // Ders içindeyken oturumu canlı tut. Sunucu sessionId eşleşmiyor derse (ok:false) — başka bir
  // cihaz bu oturumu devralmış demektir (bayat sayılıp geçilmiş) — bu sekmenin bağlantısı nazikçe
  // sonlandırılır ki aynı derste iki "aynı rol" katılımcı aynı anda görünmesin.
  useEffect(() => {
    if (phase !== 'incall' || isTestRoom || isObserver || !bookingId) return;
    const t = setInterval(async () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        const res = await apiFetch<{ ok: boolean }>(`/api/room/${bookingId}/heartbeat`, {
          method: 'POST',
          body: { sessionId: sid },
        });
        if (!res.ok && phaseRef.current === 'incall') {
          await co.leave().catch(() => {});
          setError('Bu derse başka bir cihazdan bağlanıldığı için bu sekmedeki bağlantı sonlandırıldı.');
          setPhase('error');
        }
      } catch {
        /* ağ hatası — bir sonraki heartbeat'te tekrar denenir */
      }
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [phase, bookingId, isTestRoom, isObserver, co]);

  // Otomatik bağlanma YOK: öğretmen/öğrenci ders başlayınca "Derse bağlan"
  // butonuna kendisi basar. Yalnızca admin (gizli denetim) ve test odası
  // doğrudan bağlanır.
  useEffect(() => {
    if (!info) return;
    if (phaseRef.current !== 'lobby') return;
    if (untilEnd <= 0) return;
    if (isTestRoom || isObserver) connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, tick]);

  // Ders bitince odayı kapat
  useEffect(() => {
    if (!info || isTestRoom) return;
    if (untilEnd > 0) return;
    if (phase === 'incall' || phase === 'joining') {
      sendEvent(bookingId, 'room.ended', { reason: 'time_up' });
      co.leave().catch(() => {});
      setPhase('ended');
    } else if (phase === 'lobby') {
      setPhase('ended');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, info]);

  async function leave() {
    sendEvent(bookingId, 'room.leave', {
      mic: micOn,
      cam: camOn,
      remainingSec: Math.max(0, Math.ceil(untilEnd / 1000)),
      sessionId: sessionIdRef.current,
    });
    try {
      await co.leave();
    } catch {
      /* yok say */
    }
    navigate(info ? backPath(info.role) : '/');
  }

  function backPath(role: RoomInfo['role']) {
    if (role === 'TEACHER') return '/teacher';
    if (role === 'ADMIN') return '/admin';
    return '/student';
  }

  function toggleMic() {
    const n = !micOn;
    setMicOn(n);
    co.setLocalAudio(n);
    if (phaseRef.current === 'incall') sendEvent(bookingId, 'room.media', { mic: n, cam: camOn });
  }
  function toggleCam() {
    const n = !camOn;
    setCamOn(n);
    co.setLocalVideo(n);
    if (phaseRef.current === 'incall') sendEvent(bookingId, 'room.media', { mic: micOn, cam: n });
  }

  const local = participants.local ?? null;

  /* ---------- Ders içi ---------- */
  if (phase === 'incall' && info) {
    return (
      <LessonRoom
        co={co}
        role={info.role}
        participants={participants}
        material={info.material}
        micOn={micOn}
        camOn={camOn}
        remainingMs={untilEnd}
        initialStars={info.stars}
        onPersistStars={persistStars}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onLeave={leave}
      />
    );
  }

  /* ---------- Ders bitti ---------- */
  if (phase === 'ended') {
    return (
      <div className="room-plain">
        <div className="lobby-card">
          <h1 className="lobby-title">Ders bitti</h1>
          <p className="muted">Ders süresi doldu ve oda kapandı.</p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => navigate(info ? backPath(info.role) : '/')}
          >
            Panele dön
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Hata ---------- */
  if (phase === 'error') {
    return (
      <div className="room-plain">
        <div className="lobby-card">
          <h1 className="lobby-title">Bir sorun var</h1>
          <p className="muted">{error ?? 'Bilinmeyen hata'}</p>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => navigate(-1)}
          >
            Geri dön
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Yükleniyor ---------- */
  if (phase === 'loading' || !info) {
    return (
      <div className="room-plain">
        <div className="room-status-page">
          <span className="spinner" style={{ marginBottom: 12 }} />
          Hazırlanıyor…
        </div>
      </div>
    );
  }

  /* ---------- Lobi (ders öncesi bekleme) ---------- */
  const waiting = untilStart > 0 && !isObserver && !isTestRoom;

  return (
    <div className="room-plain">
      <div className="lobby">
        {waiting && (
          <div className="lobby-countdown">
            <span className="lobby-countdown-label">
              <IcClock size={12} /> Ders başlamasına
            </span>
            <span className="lobby-countdown-time">{fmt(untilStart)}</span>
            <span className="muted small">
              Ders tam saatinde başlar; o ana kadar karşı taraf seni görmez ve duymaz.
            </span>
          </div>
        )}
        <PreJoin
          co={co}
          role={info.role}
          local={local}
          micOn={micOn}
          camOn={camOn}
          joining={phase === 'joining'}
          waiting={waiting}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onJoin={connect}
        />
      </div>
    </div>
  );
}
