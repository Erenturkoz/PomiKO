import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { LessonJoin } from '../components/LessonJoin';
import { useAuth } from '../auth/AuthContext';
import { formatTimeRange, joinState, minutesUntil } from '../lib/format';

interface Me {
  id: string;
  name: string;
  age: number | null;
  credits: number;
}

interface OpenSlot {
  id: string;
  startTime: string;
  endTime: string;
  teacher: { id: string; user: { name: string } };
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
}

interface Booking {
  id: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  slot: { startTime: string; endTime: string };
  child: { id: string; name: string };
  teacher: { user: { name: string } };
  topic: { name: string } | null;
}

type Tab = 'home' | 'lessons' | 'tasks' | 'badges' | 'settings';

const TABS: Tab[] = ['home', 'lessons', 'tasks', 'badges', 'settings'] as Tab[];

const NAV: { key: Tab; label: string; dot: string }[] = [
  { key: 'home', label: 'Panelim', dot: '#3b5bdb' },
  { key: 'lessons', label: 'Derslerim', dot: '#2f9e44' },
  { key: 'tasks', label: 'Görevler', dot: '#f08c00' },
  { key: 'badges', label: 'Rozetlerim', dot: '#9775fa' },
  { key: 'settings', label: 'Ayarlar', dot: '#868e96' },
];

// Yakında gelecek bölümler için yer tutucu
function Soon({ title, note }: { title: string; note: string }) {
  return (
    <div className="s-card s-soon">
      <h3 className="s-card-title">{title}</h3>
      <p className="muted">{note}</p>
      <span className="s-soon-pill">Yakında</span>
    </div>
  );
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const { session, unlockAccount, logout } = useAuth();
  // Sekme URL'de tutulur: yenilemede korunur, geri tuşu çalışır
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : 'home';
  const setTab = (t: Tab) => setSearchParams(t === 'home' ? {} : { tab: t });

  const [me, setMe] = useState<Me | null>(null);
  const [openSlots, setOpenSlots] = useState<OpenSlot[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTopic, setSelectedTopic] = useState('');
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [meRes, slotRes, topicRes, bookingRes] = await Promise.all([
        apiFetch<{ child: Me }>('/api/me'),
        apiFetch<{ slots: OpenSlot[] }>('/api/slots/open'),
        apiFetch<{ topics: Topic[] }>('/api/topics'),
        apiFetch<{ bookings: Booking[] }>('/api/bookings'),
      ]);
      setMe(meRes.child);
      setOpenSlots(slotRes.slots);
      setTopics(topicRes.topics);
      setBookings(bookingRes.bookings);
      setSelectedTopic((prev) => prev || topicRes.topics[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function book(slotId: string) {
    if (!selectedTopic) return;
    setError(null);
    try {
      await apiFetch('/api/bookings', { method: 'POST', body: { slotId, topicId: selectedTopic } });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rezervasyon yapılamadı');
    }
  }

  async function cancelBooking(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/bookings/${id}/cancel`, { method: 'POST' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İptal edilemedi');
    } finally {
      setPendingCancelId(null);
    }
  }

  async function submitPin() {
    if (pin.length < 1) {
      setPinError('Parolanı gir');
      return;
    }
    setPinBusy(true);
    setPinError(null);
    try {
      await unlockAccount(pin);
      navigate('/parent');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Parola hatalı');
    } finally {
      setPinBusy(false);
    }
  }

  const credits = me?.credits ?? session.child?.credits ?? 0;
  const childName = me?.name ?? session.child?.name ?? 'Öğrenci';

  const activeBookings = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
  const upcoming = activeBookings.filter((b) => joinState(b.slot.startTime, b.slot.endTime) !== 'ended');
  const done = activeBookings.filter((b) => joinState(b.slot.startTime, b.slot.endTime) === 'ended');
  const nextLesson = upcoming[0];
  const canBook = credits >= 1 && !!selectedTopic;

  function canCancel(startIso: string) {
    return minutesUntil(startIso) > 30;
  }

  function BookingRow({ b }: { b: Booking }) {
    return (
      <li className="s-row">
        <div>
          <div className="s-row-main">{formatTimeRange(b.slot.startTime, b.slot.endTime)}</div>
          <div className="muted small">
            {b.topic ? `${b.topic.name} · ` : ''}Öğretmen: {b.teacher.user.name}
          </div>
        </div>
        <div className="row-actions">
          <LessonJoin
            bookingId={b.id}
            start={b.slot.startTime}
            end={b.slot.endTime}
            onJoin={(id) => navigate(`/room/${id}`)}
          />
          {joinState(b.slot.startTime, b.slot.endTime) !== 'ended' &&
            (canCancel(b.slot.startTime) ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setPendingCancelId(b.id)}>
                İptal
              </button>
            ) : (
              <span className="join-soon">iptal edilemez</span>
            ))}
        </div>
      </li>
    );
  }

  return (
    <div className="student-shell">
      {/* Sol menü */}
      <aside className="s-side">
        <div className="s-brand">
          <img src="/lumiko-logo.png" alt="Lumiko" className="s-logo" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        </div>
        <nav className="s-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`s-nav-item ${tab === n.key ? 'is-on' : ''}`}
              onClick={() => setTab(n.key)}
            >
              <i className="s-nav-dot" style={{ background: n.dot }} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="s-side-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => setPinOpen(true)}>
            Hesaba dön
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
            Çıkış yap
          </button>
        </div>
      </aside>

      {/* İçerik */}
      <main className="s-main">
        <header className="s-topline">
          <div>
            <h1 className="s-hello">Merhaba, {childName}! 👋</h1>
            <p className="muted">Bugün öğrenmeye devam etmeye hazır mısın?</p>
          </div>
          <div className="s-credit-chip">
            <span className="s-star">★</span> {credits} kredi
          </div>
        </header>

        {error && <div className="alert alert-error">{error}</div>}

        {tab === 'home' && (
          <>
            {/* İstatistik kartları */}
            <div className="s-stats">
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#f2d16b' }} />
                <div className="s-stat-num">{credits}</div>
                <div className="s-stat-label">Kredi</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#a5d8ff' }} />
                <div className="s-stat-num">{done.length}</div>
                <div className="s-stat-label">Tamamlanan Ders</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#b2f2bb' }} />
                <div className="s-stat-num">{upcoming.length}</div>
                <div className="s-stat-label">Yaklaşan Ders</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#d0bfff' }} />
                <div className="s-stat-num">—</div>
                <div className="s-stat-label">Rozet Sayısı</div>
              </div>
            </div>

            {/* Sıradaki ders */}
            {nextLesson ? (
              <div className="s-next">
                <div>
                  <span className="s-next-label">Sıradaki ders</span>
                  <div className="s-next-time">
                    {formatTimeRange(nextLesson.slot.startTime, nextLesson.slot.endTime)}
                  </div>
                  <div className="muted small">
                    {nextLesson.topic ? `${nextLesson.topic.name} · ` : ''}Öğretmen:{' '}
                    {nextLesson.teacher.user.name}
                  </div>
                </div>
                <LessonJoin
                  bookingId={nextLesson.id}
                  start={nextLesson.slot.startTime}
                  end={nextLesson.slot.endTime}
                  onJoin={(id) => navigate(`/room/${id}`)}
                />
              </div>
            ) : (
              <div className="s-card">
                <h3 className="s-card-title">Sıradaki ders yok</h3>
                <p className="muted">"Derslerim" bölümünden yeni bir ders ayırtabilirsin.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setTab('lessons')}>
                  Ders al
                </button>
              </div>
            )}

            <div className="s-grid-2">
              <Soon
                title="Lumiko Dünyasındaki Yolculuğun"
                note="Konu haritan ve ilerlemen burada görünecek."
              />
              <Soon title="Günlük Öğrenme Serisi" note="Üst üste çalıştığın günler burada sayılacak." />
              <Soon title="Haftalık Görevler" note="Mini quizler ve kelime görevleri burada olacak." />
              <Soon title="Yeni Rozetler" note="Kazandığın rozetler burada birikecek." />
            </div>
          </>
        )}

        {tab === 'lessons' && (
          <div className="s-cols">
            <div className="s-card">
              <h3 className="s-card-title">Ders al</h3>
              <div className="booking-bar">
                <label className="field">
                  <span>Ders konusu</span>
                  <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                    {topics.length === 0 && <option value="">Konu bulunamadı</option>}
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {credits < 1 && (
                <div className="alert alert-error">
                  Kredin yok. "Hesaba dön" deyip kredi yükleyebilirsin.
                </div>
              )}

              {loading ? (
                <p className="muted">Yükleniyor…</p>
              ) : openSlots.length === 0 ? (
                <p className="empty">Şu an açık ders saati yok.</p>
              ) : (
                <ul className="s-list">
                  {openSlots.map((slot) => (
                    <li key={slot.id} className="s-row">
                      <div>
                        <div className="s-row-main">{formatTimeRange(slot.startTime, slot.endTime)}</div>
                        <div className="muted small">Öğretmen: {slot.teacher.user.name}</div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => book(slot.id)}
                        disabled={!canBook}
                      >
                        Rezerve et (1 kredi)
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
            <div className="s-card">
              <h3 className="s-card-title">Yaklaşan derslerim</h3>
              {upcoming.length === 0 ? (
                <p className="empty">Yaklaşan dersin yok.</p>
              ) : (
                <ul className="s-list">
                  {upcoming.map((b) => (
                    <BookingRow key={b.id} b={b} />
                  ))}
                </ul>
              )}
            </div>

            {done.length > 0 && (
              <div className="s-card">
                <h3 className="s-card-title">Geçmiş dersler</h3>
                <ul className="s-list">
                  {done.map((b) => (
                    <BookingRow key={b.id} b={b} />
                  ))}
                </ul>
              </div>
            )}
            </div>
          </div>
        )}

        {tab === 'tasks' && (
          <Soon title="Görevler" note="Haftalık görevler, mini quizler ve kelime alıştırmaları burada olacak." />
        )}
        {tab === 'badges' && (
          <Soon title="Rozetlerim" note="Kazandığın rozetler ve başarımların burada listelenecek." />
        )}
        {tab === 'settings' && (
          <div className="s-card">
            <h3 className="s-card-title">Ayarlar</h3>
            <p className="muted">
              {childName}
              {me?.age != null ? ` · ${me.age} yaş` : ''}
            </p>
            <p className="muted small">
              Kredi yükleme ve profil ayarları veli hesabından yapılır.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => setPinOpen(true)}>
              Hesaba dön
            </button>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={pendingCancelId !== null}
        title="Dersi iptal et"
        message="Bu dersi iptal etmek istediğine emin misin? Kredin iade edilir."
        confirmLabel="Evet, iptal et"
        cancelLabel="Vazgeç"
        danger
        onConfirm={() => pendingCancelId && cancelBooking(pendingCancelId)}
        onCancel={() => setPendingCancelId(null)}
      />

      <Modal open={pinOpen} title="Hesaba dön" onClose={() => setPinOpen(false)}>
        <p className="muted small" style={{ marginTop: 0 }}>
          Kredi yükleme ve profil değiştirme için veli hesabının parolasını gir.
        </p>
        {pinError && <div className="alert alert-error">{pinError}</div>}
        <input
          className="pin-input pin-input-pass"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Veli parolası"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && submitPin()}
        />
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={submitPin}
          disabled={pinBusy}
        >
          {pinBusy ? 'Kontrol ediliyor…' : 'Hesaba dön'}
        </button>
      </Modal>
    </div>
  );
}
