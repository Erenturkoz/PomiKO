import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { LessonJoin } from '../components/LessonJoin';
import { ToastStack } from '../components/Toast';
import { BookingWizard } from '../components/BookingWizard';
import { useAuth } from '../auth/AuthContext';
import { formatDate, formatTimeOnly, joinState, minutesUntil } from '../lib/format';
import { IcBadge, IcBook, IcCalendar, IcClock, IcDashboard, IcLogout, IcSettings, IcTasks } from '../components/icons';

interface Me {
  id: string;
  name: string;
  age: number | null;
  credits: number;
  avatarEmoji: string | null;
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

const NAV: { key: Tab; label: string; Icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { key: 'home', label: 'Panelim', Icon: IcDashboard },
  { key: 'lessons', label: 'Derslerim', Icon: IcBook },
  { key: 'tasks', label: 'Görevler', Icon: IcTasks },
  { key: 'badges', label: 'Rozetlerim', Icon: IcBadge },
  { key: 'settings', label: 'Ayarlar', Icon: IcSettings },
];

// Şimdilik profil resmi yerine sabit bir emoji seti — gerçek fotoğraf yayına alınca eklenecek.
// Backend'deki (booking.routes.ts) AVATAR_EMOJIS listesiyle birebir aynı olmalı.
const AVATAR_EMOJIS = [
  '🦊', '🐼', '🐵', '🐸', '🐯', '🦁', '🐶', '🐱',
  '🐰', '🦄', '🐨', '🐧', '🦋', '🐢', '🦖', '🐳',
  '🌟', '🚀', '⚽', '🎨', '🎸', '🍕', '🍩', '🌈',
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function onDocClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setEmojiPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [emojiPickerOpen]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [meRes, bookingRes] = await Promise.all([
        apiFetch<{ child: Me }>('/api/me'),
        apiFetch<{ bookings: Booking[] }>('/api/bookings'),
      ]);
      setMe(meRes.child);
      setBookings(bookingRes.bookings);
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

  async function chooseEmoji(emoji: string) {
    setAvatarBusy(true);
    setError(null);
    try {
      await apiFetch('/api/me/avatar', { method: 'PUT', body: { emoji } });
      setMe((prev) => (prev ? { ...prev, avatarEmoji: emoji } : prev));
      setEmojiPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil resmi güncellenemedi');
    } finally {
      setAvatarBusy(false);
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
  const avatarEmoji = me?.avatarEmoji ?? session.child?.avatarEmoji ?? null;

  const activeBookings = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
  const upcoming = activeBookings.filter((b) => joinState(b.slot.startTime, b.slot.endTime) !== 'ended');
  const done = activeBookings.filter((b) => joinState(b.slot.startTime, b.slot.endTime) === 'ended');
  const nextLesson = upcoming[0];
  const DONE_PAGE_SIZE = 5;
  // En yeni geçmiş ders en üstte görünsün diye ters çevrilir
  const doneRecentFirst = [...done].reverse();
  const visibleDone = showAllDone ? doneRecentFirst : doneRecentFirst.slice(0, DONE_PAGE_SIZE);

  function canCancel(startIso: string) {
    return minutesUntil(startIso) > 30;
  }

  function BookingRow({ b }: { b: Booking }) {
    return (
      <li className="s-row">
        <div>
          <div className="s-row-main">
            {b.topic ? b.topic.name : 'Ders'}
            <span className="muted" style={{ fontWeight: 500, marginLeft: 6 }}>
              · Öğretmen: {b.teacher.user.name}
            </span>
          </div>
          <div className="meta-icons muted small" style={{ marginTop: 4 }}>
            <span className="meta-icon-item">
              <IcCalendar size={13} /> {formatDate(b.slot.startTime)}
            </span>
            <span className="meta-icon-item">
              <IcClock size={13} /> {formatTimeOnly(b.slot.startTime, b.slot.endTime)}
            </span>
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
          <img src="/pomiko-logo.png" alt="Pomiko" className="s-logo" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        </div>

        {/* Giriş yapan çocuğun profil bloku — emoji avatarına tıklayınca değiştirilebilir */}
        <div className="side-profile" ref={profileRef}>
          <button
            type="button"
            className="side-profile-avatar-btn"
            onClick={() => setEmojiPickerOpen((v) => !v)}
            disabled={avatarBusy}
            aria-label="Profil resmini değiştir"
          >
            <span className="side-profile-photo side-profile-emoji">{avatarEmoji ?? '🙂'}</span>
            <span className="side-profile-edit-dot">+</span>
          </button>
          {emojiPickerOpen && (
            <div className="emoji-picker-pop">
              {AVATAR_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`emoji-picker-item ${avatarEmoji === e ? 'is-on' : ''}`}
                  onClick={() => chooseEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="side-profile-info">
            <span className="side-profile-name">{childName}</span>
            <span className="side-profile-role">Öğrenci</span>
          </div>
        </div>

        <nav className="s-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`s-nav-item ${tab === n.key ? 'is-on' : ''}`}
              onClick={() => setTab(n.key)}
            >
              <n.Icon size={17} className="s-nav-icon" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="s-side-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => setPinOpen(true)}>
            Hesaba dön
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
            <IcLogout size={15} /> Çıkış yap
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

        <ToastStack error={error} onCloseError={() => setError(null)} />

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
                    <IcCalendar size={15} className="title-icon" /> {formatDate(nextLesson.slot.startTime)}
                    <span className="s-next-time-sep">·</span>
                    <IcClock size={15} className="title-icon" />{' '}
                    {formatTimeOnly(nextLesson.slot.startTime, nextLesson.slot.endTime)}
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
                title="Pomiko Dünyasındaki Yolculuğun"
                note="Konu haritan ve ilerlemen burada görünecek."
              />
              <Soon title="Günlük Öğrenme Serisi" note="Üst üste çalıştığın günler burada sayılacak." />
              <Soon title="Haftalık Görevler" note="Mini quizler ve kelime görevleri burada olacak." />
              <Soon title="Yeni Rozetler" note="Kazandığın rozetler burada birikecek." />
            </div>
          </>
        )}

        {tab === 'lessons' && (
          <div className="s-cols s-cols-wide-first">
            <div className="s-card">
              <h3 className="s-card-title">Ders al</h3>
              <BookingWizard credits={credits} onBooked={loadAll} />
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
                <h3 className="s-card-title">Geçmiş dersler ({done.length})</h3>
                <ul className="s-list">
                  {visibleDone.map((b) => (
                    <BookingRow key={b.id} b={b} />
                  ))}
                </ul>
                {done.length > DONE_PAGE_SIZE && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm s-show-more"
                    onClick={() => setShowAllDone((v) => !v)}
                  >
                    {showAllDone ? 'Daha az göster' : `Daha fazla göster (${done.length - DONE_PAGE_SIZE})`}
                  </button>
                )}
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
            <div className="settings-photo-row">
              <span className="settings-photo settings-photo-initials" style={{ fontSize: '1.6rem', background: '#fff3d6' }}>
                {avatarEmoji ?? '🙂'}
              </span>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  {childName}
                  {me?.age != null ? ` · ${me.age} yaş` : ''}
                </p>
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  Profil resmini sol üstteki emoji simgesine tıklayarak değiştirebilirsin.
                </p>
              </div>
            </div>
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
