import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormEvent, ReactNode } from 'react';
import { apiFetch, API_URL, getAccessToken } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { LessonJoin } from '../components/LessonJoin';
import { ToastStack } from '../components/Toast';
import { AvailabilityGrid, GridSlot } from '../components/AvailabilityGrid';
import { startOfWeek, addWeeks, formatWeekRange } from '../lib/week';
import { formatDate, formatTimeOnly, joinState } from '../lib/format';
import {
  IcBook,
  IcCalendar,
  IcCamera,
  IcCheck,
  IcClock,
  IcDashboard,
  IcLogout,
  IcSettings,
  IcWallet,
  IcX,
} from '../components/icons';

type Tab = 'home' | 'calendar' | 'lessons' | 'payouts' | 'settings';

const TABS: Tab[] = ['home', 'calendar', 'lessons', 'payouts', 'settings'] as Tab[];

const NAV: { key: Tab; label: string; Icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { key: 'home', label: 'Dashboard', Icon: IcDashboard },
  { key: 'calendar', label: 'Takvim', Icon: IcCalendar },
  { key: 'lessons', label: 'Dersler', Icon: IcBook },
  { key: 'payouts', label: 'Ödemeler', Icon: IcWallet },
  { key: 'settings', label: 'Hesap ayarları', Icon: IcSettings },
];

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4dabf7, #748ffc)',
  'linear-gradient(135deg, #51cf66, #38d9a9)',
  'linear-gradient(135deg, #f783ac, #da77f2)',
  'linear-gradient(135deg, #ffa94d, #ff8787)',
  'linear-gradient(135deg, #ffd43b, #fab005)',
  'linear-gradient(135deg, #9775fa, #748ffc)',
];

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Her öğrenci her zaman aynı rengi alsın diye id'den kararlı bir renk seçilir
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[h];
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Öğrenci adı + ders konusu: listede en çok göze çarpması gereken bilgi.
// `meta`: altında görünecek ikincil satır (saat, veli adı vb. — çağırana göre değişir).
function StudentChip({
  child,
  topic,
  isReview,
  meta,
}: {
  child: { id: string; name: string };
  topic: { name: string } | null | undefined;
  isReview?: boolean;
  meta?: ReactNode;
}) {
  return (
    <>
      <span className="lesson-avatar" style={{ background: avatarColor(child.id) }}>
        {initials(child.name)}
      </span>
      <div className="lesson-info">
        <div className="lesson-info-top">
          <span className="lesson-student">{child.name}</span>
          {topic && <span className="topic-pill">{topic.name}</span>}
          {isReview && <span className="badge badge-warn">Tekrar</span>}
        </div>
        {meta && <div className="lesson-info-meta">{meta}</div>}
      </div>
    </>
  );
}

function PayoutBadge({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  if (status === 'APPROVED') {
    return (
      <span className="badge payout-badge payout-approved">
        <IcCheck size={12} /> Onaylandı
      </span>
    );
  }
  if (status === 'REJECTED') {
    return (
      <span className="badge payout-badge payout-rejected">
        <IcX size={12} /> Reddedildi
      </span>
    );
  }
  return (
    <span className="badge payout-badge payout-pending">
      <IcClock size={12} /> Onay bekliyor
    </span>
  );
}

interface TeacherMe {
  name: string;
  email: string;
  bio: string | null;
  phone: string | null;
  birthDate: string | null;
  education: string | null;
  experienceYears: number | null;
  specialties: string | null;
  iban: string | null;
  startDate: string | null;
  photoUrl: string | null;
  lessonRate: number | null;
}

interface TeacherBooking {
  id: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  isReview: boolean;
  payoutStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  slot: { startTime: string; endTime: string };
  child: { id: string; name: string; parent: { name: string } };
  topic: { name: string } | null;
}

interface PayoutSummary {
  lessonRate: number;
  monthApproved: number;
  monthApprovedEarnings: number;
  monthPending: number;
  monthRejected: number;
}

type LessonFilter = 'upcoming' | 'done' | 'cancelled' | 'all';

const LESSON_FILTERS: { key: LessonFilter; label: string }[] = [
  { key: 'upcoming', label: 'Yaklaşan' },
  { key: 'done', label: 'Tamamlanan' },
  { key: 'cancelled', label: 'İptal edilen' },
  { key: 'all', label: 'Tümü' },
];

export function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Sekme URL'de tutulur: yenilemede korunur, geri tuşu çalışır
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : 'home';
  const setTab = (t: Tab) => setSearchParams(t === 'home' ? {} : { tab: t });
  const [slots, setSlots] = useState<GridSlot[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Dersler (Dashboard + Dersler sekmesi + Ödemeler için ortak veri)
  const [bookings, setBookings] = useState<TeacherBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>('upcoming');

  // Ödemeler
  const [earningsSummary, setEarningsSummary] = useState<PayoutSummary | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(true);

  // Ayarlar
  const [me, setMe] = useState<TeacherMe | null>(null);
  const [meBusy, setMeBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  function flash(msg: string) {
    setOk(msg);
  }

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function loadSlots() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ slots: GridSlot[] }>('/api/teacher/slots');
      setSlots(data.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ders saatleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    setBookingsLoading(true);
    try {
      const data = await apiFetch<{ bookings: TeacherBooking[] }>('/api/teacher/bookings');
      setBookings(data.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dersler yüklenemedi');
    } finally {
      setBookingsLoading(false);
    }
  }

  async function loadEarnings() {
    setEarningsLoading(true);
    try {
      const data = await apiFetch<{ summary: PayoutSummary; bookings: TeacherBooking[] }>(
        '/api/teacher/me/earnings'
      );
      setEarningsSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödeme özeti yüklenemedi');
    } finally {
      setEarningsLoading(false);
    }
  }

  useEffect(() => {
    loadSlots();
    loadBookings();
    loadEarnings();
  }, []);

  useEffect(() => {
    if (tab !== 'settings' || me) return;
    apiFetch<{ me: TeacherMe }>('/api/teacher/me')
      .then((d) => setMe(d.me))
      .catch((err) => setError(err instanceof Error ? err.message : 'Bilgiler yüklenemedi'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function saveMe(e: FormEvent) {
    e.preventDefault();
    if (!me) return;
    setMeBusy(true);
    setError(null);
    try {
      await apiFetch('/api/teacher/me', {
        method: 'PUT',
        body: {
          bio: me.bio,
          phone: me.phone,
          birthDate: me.birthDate ? new Date(me.birthDate).toISOString() : null,
          education: me.education,
          experienceYears: me.experienceYears,
          specialties: me.specialties,
          iban: me.iban,
        },
      });
      flash('Bilgilerin kaydedildi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setMeBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/teacher/me/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fotoğraf yüklenemedi');
      setMe((prev) => (prev ? { ...prev, photoUrl: data.photoUrl } : prev));
      flash('Fotoğrafın güncellendi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setError(null);
    try {
      await apiFetch('/api/teacher/me/password', {
        method: 'POST',
        body: { currentPassword: pwCur, newPassword: pwNew },
      });
      setPwCur('');
      setPwNew('');
      flash('Parolan değiştirildi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parola değiştirilemedi');
    } finally {
      setPwBusy(false);
    }
  }

  async function openCell(iso: string) {
    setError(null);
    try {
      const { slot } = await apiFetch<{ slot: Omit<GridSlot, 'booking'> }>('/api/teacher/slots', {
        method: 'POST',
        body: { startTime: iso, durationMinutes: 30 },
      });
      setSlots((prev) => [...prev, { ...slot, booking: null }]);
      flash('Ders saati açıldı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ders saati açılamadı');
    }
  }

  async function closeSlot(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/teacher/slots/${id}`, { method: 'DELETE' });
      setSlots((prev) => prev.filter((s) => s.id !== id));
      flash('Ders saati kapatıldı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ders saati kapatılamadı');
    }
  }

  const openSlots = slots.filter((s) => s.status === 'OPEN' && joinState(s.startTime, s.endTime) !== 'ended');

  const activeBookings = bookings.filter((b) => b.status !== 'CANCELLED');
  const upcomingBookings = activeBookings
    .filter((b) => b.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
  const nextBooking = upcomingBookings[0];

  const today = new Date();
  const todayBookings = activeBookings
    .filter((b) => sameDay(new Date(b.slot.startTime), today))
    .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
  const todayDone = todayBookings.filter((b) => b.status === 'COMPLETED').length;

  const filteredLessons = bookings
    .filter((b) => {
      if (lessonFilter === 'upcoming') return b.status === 'SCHEDULED';
      if (lessonFilter === 'done') return b.status === 'COMPLETED';
      if (lessonFilter === 'cancelled') return b.status === 'CANCELLED';
      return true;
    })
    .sort((a, b) =>
      lessonFilter === 'upcoming'
        ? new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime()
        : new Date(b.slot.startTime).getTime() - new Date(a.slot.startTime).getTime()
    );

  function BookingRow({ b }: { b: TeacherBooking }) {
    return (
      <li className="lesson-row">
        <StudentChip
          child={b.child}
          topic={b.topic}
          isReview={b.isReview}
          meta={
            <span className="meta-icons">
              <span className="meta-icon-item">
                <IcCalendar size={13} /> {formatDate(b.slot.startTime)}
              </span>
              <span className="meta-icon-item">
                <IcClock size={13} /> {formatTimeOnly(b.slot.startTime, b.slot.endTime)}
              </span>
              <span>veli: {b.child.parent.name}</span>
            </span>
          }
        />
        <div className="lesson-row-action">
          {b.status === 'CANCELLED' ? (
            <span className="badge badge-red">İptal edildi</span>
          ) : b.status === 'COMPLETED' ? (
            <PayoutBadge status={b.payoutStatus} />
          ) : (
            <LessonJoin
              bookingId={b.id}
              start={b.slot.startTime}
              end={b.slot.endTime}
              onJoin={(id) => navigate(`/room/${id}`)}
            />
          )}
        </div>
      </li>
    );
  }

  function Calendar() {
    return (
      <div className="s-card">
        <div className="cal-toolbar">
          <h3 className="s-card-title" style={{ margin: 0 }}>
            <IcCalendar size={17} className="title-icon" />
            {formatWeekRange(weekStart)}
          </h3>
          <div className="cal-nav">
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
              ‹ Önceki
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              Bu hafta
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
              Sonraki ›
            </button>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Boş bir kareye tıkla, o yarım saatlik dilimi derse aç. Açık bir dilime tekrar tıklarsan
          kapatırsın.
        </p>
        {loading ? (
          <p className="muted">Yükleniyor…</p>
        ) : (
          <>
            <AvailabilityGrid
              weekStart={weekStart}
              slots={slots}
              onOpenCell={openCell}
              onCloseSlot={closeSlot}
            />
            <div className="cal-legend">
              <span>
                <i className="dot dot-empty" /> Kapalı
              </span>
              <span>
                <i className="dot dot-open" /> Açık
              </span>
              <span>
                <i className="dot dot-booked" /> Rezerve
              </span>
              <span>
                <i className="dot dot-done" /> Bitmiş
              </span>
              <span>
                <i className="dot dot-past" /> Geçmiş
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="student-shell teacher-shell">
      {/* Sol menü */}
      <aside className="s-side">
        <div className="s-brand">
          <img
            src="/pomiko-logo.png"
            alt="Pomiko"
            className="s-logo"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        </div>

        {/* Giriş yapan öğretmenin profil bloku */}
        <div className="side-profile">
          {me?.photoUrl ? (
            <img src={`${API_URL}${me.photoUrl}`} alt={user?.name} className="side-profile-photo" />
          ) : (
            <span
              className="side-profile-photo side-profile-initials"
              style={{ background: avatarColor(user?.id ?? user?.name ?? 'x') }}
            >
              {initials(user?.name ?? '?')}
            </span>
          )}
          <div className="side-profile-info">
            <span className="side-profile-name">{user?.name}</span>
            <span className="side-profile-role">Öğretmen</span>
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
          <button className="btn btn-ghost btn-sm s-logout-btn" onClick={() => logout()}>
            <IcLogout size={15} /> Çıkış yap
          </button>
        </div>
      </aside>

      {/* İçerik */}
      <main className="s-main">
        <header className="s-topline">
          <div>
            <h1 className="s-hello">Hoş geldin, {user?.name}! 👋</h1>
            <p className="muted">Ders saatlerini yönet ve derslerine buradan katıl.</p>
          </div>
        </header>

        <ToastStack ok={ok} error={error} onCloseOk={() => setOk(null)} onCloseError={() => setError(null)} />

        {/* ---------- Dashboard ---------- */}
        {tab === 'home' && (
          <>
            <div className="s-stats">
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#a5d8ff' }} />
                <div className="s-stat-num">
                  {todayDone}/{todayBookings.length}
                </div>
                <div className="s-stat-label">Bugünkü Dersler</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#b2f2bb' }} />
                <div className="s-stat-num">{openSlots.length}</div>
                <div className="s-stat-label">Açık Ders Saati</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#ffd8a8' }} />
                <div className="s-stat-num">
                  {earningsLoading ? '—' : `₺${(earningsSummary?.monthApprovedEarnings ?? 0).toLocaleString('tr-TR')}`}
                </div>
                <div className="s-stat-label">Aylık Kazanç</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#d0bfff' }} />
                <div className="s-stat-num">{activeBookings.length}</div>
                <div className="s-stat-label">Toplam Rezerve</div>
              </div>
            </div>

            {nextBooking ? (
              <div className="s-next">
                <div className="s-next-body">
                  <span className="s-next-label">Sıradaki ders</span>
                  <div className="s-next-time">
                    <IcCalendar size={15} className="title-icon" /> {formatDate(nextBooking.slot.startTime)}
                    <span className="s-next-time-sep">·</span>
                    <IcClock size={15} className="title-icon" />{' '}
                    {formatTimeOnly(nextBooking.slot.startTime, nextBooking.slot.endTime)}
                  </div>
                  <div className="s-next-who">
                    <StudentChip
                      child={nextBooking.child}
                      topic={nextBooking.topic}
                      isReview={nextBooking.isReview}
                      meta={<>veli: {nextBooking.child.parent.name}</>}
                    />
                  </div>
                </div>
                <LessonJoin
                  bookingId={nextBooking.id}
                  start={nextBooking.slot.startTime}
                  end={nextBooking.slot.endTime}
                  onJoin={(id) => navigate(`/room/${id}`)}
                />
              </div>
            ) : (
              <div className="s-card">
                <h3 className="s-card-title">Yaklaşan ders yok</h3>
                <p className="muted">Takvimden yeni ders saatleri açabilirsin.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setTab('calendar')}>
                  Takvimi aç
                </button>
              </div>
            )}

            <div className="s-card">
              <h3 className="s-card-title">
                <IcCalendar size={17} className="title-icon" /> Bugünkü dersler
              </h3>
              {bookingsLoading ? (
                <p className="muted">Yükleniyor…</p>
              ) : todayBookings.length === 0 ? (
                <p className="empty">Bugün için planlı bir dersin yok.</p>
              ) : (
                <ul className="s-list">
                  {todayBookings.map((b) => (
                    <BookingRow key={b.id} b={b} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ---------- Takvim ---------- */}
        {tab === 'calendar' && <Calendar />}

        {/* ---------- Dersler ---------- */}
        {tab === 'lessons' && (
          <div className="s-card">
            <h3 className="s-card-title">
              <IcBook size={17} className="title-icon" /> Derslerim
            </h3>
            <div className="filter-chips">
              {LESSON_FILTERS.map((f) => {
                const count = bookings.filter((b) => {
                  if (f.key === 'upcoming') return b.status === 'SCHEDULED';
                  if (f.key === 'done') return b.status === 'COMPLETED';
                  if (f.key === 'cancelled') return b.status === 'CANCELLED';
                  return true;
                }).length;
                return (
                  <button
                    key={f.key}
                    type="button"
                    className={`filter-chip ${lessonFilter === f.key ? 'is-on' : ''}`}
                    onClick={() => setLessonFilter(f.key)}
                  >
                    {f.label} <span className="filter-chip-count">{count}</span>
                  </button>
                );
              })}
            </div>
            {bookingsLoading ? (
              <p className="muted">Yükleniyor…</p>
            ) : filteredLessons.length === 0 ? (
              <p className="empty">Bu filtreye uyan ders yok.</p>
            ) : (
              <ul className="s-list">
                {filteredLessons.map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---------- Ödemeler ---------- */}
        {tab === 'payouts' && (
          <>
            <div className="s-stats">
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#ffd8a8' }} />
                <div className="s-stat-num">
                  {earningsLoading ? '—' : `₺${(earningsSummary?.monthApprovedEarnings ?? 0).toLocaleString('tr-TR')}`}
                </div>
                <div className="s-stat-label">Bu Ay Kazanç</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#a5d8ff' }} />
                <div className="s-stat-num">
                  {earningsLoading ? '—' : `₺${earningsSummary?.lessonRate ?? 0}`}
                </div>
                <div className="s-stat-label">Ders Ücretiniz</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#fff3bf' }} />
                <div className="s-stat-num">{earningsLoading ? '—' : earningsSummary?.monthPending ?? 0}</div>
                <div className="s-stat-label">Onay Bekleyen</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#ffc9c9' }} />
                <div className="s-stat-num">{earningsLoading ? '—' : earningsSummary?.monthRejected ?? 0}</div>
                <div className="s-stat-label">Reddedilen</div>
              </div>
            </div>

            <div className="s-card">
              <h3 className="s-card-title">
                <IcWallet size={17} className="title-icon" /> Bu ayki tamamlanan dersler
              </h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                Bir ders tamamlandığında önce "onay bekliyor" durumunda görünür; hem senin hem velinin
                derse gerçekten bağlandığı doğrulanınca otomatik onaylanır. Bir sorun varsa yönetim elle
                inceler.
              </p>
              {earningsLoading ? (
                <p className="muted">Yükleniyor…</p>
              ) : bookings.filter((b) => b.status === 'COMPLETED' && sameDay(new Date(), new Date())).length ===
                0 && bookings.filter((b) => b.status === 'COMPLETED').length === 0 ? (
                <p className="empty">Bu ay tamamlanmış bir ders yok.</p>
              ) : (
                <ul className="s-list">
                  {bookings
                    .filter((b) => b.status === 'COMPLETED')
                    .sort((a, b) => new Date(b.slot.startTime).getTime() - new Date(a.slot.startTime).getTime())
                    .map((b) => (
                      <BookingRow key={b.id} b={b} />
                    ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ---------- Hesap ayarları ---------- */}
        {tab === 'settings' && (
          <div className="s-cols s-cols-wide-first">
            <div className="s-card">
              <h3 className="s-card-title">
                <IcSettings size={17} className="title-icon" /> Kişisel bilgiler
              </h3>
              {!me ? (
                <p className="muted">Yükleniyor…</p>
              ) : (
                <>
                  <div className="settings-photo-row">
                    {me.photoUrl ? (
                      <img src={`${API_URL}${me.photoUrl}`} alt={me.name} className="settings-photo" />
                    ) : (
                      <span
                        className="settings-photo settings-photo-initials"
                        style={{ background: avatarColor(me.email) }}
                      >
                        {initials(me.name)}
                      </span>
                    )}
                    <div>
                      <label className="btn btn-ghost btn-sm settings-photo-btn">
                        <IcCamera size={14} /> {photoBusy ? 'Yükleniyor…' : 'Fotoğraf yükle'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={photoBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadPhoto(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <p className="muted small" style={{ margin: '6px 0 0' }}>
                        Panelde ve (görünür olarak ayarlandıysan) ana sayfada bu fotoğraf kullanılır.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={saveMe} className="form">
                    <div className="hr-grid">
                      <label className="field">
                        <span>Ad soyad</span>
                        <input value={me.name} disabled />
                      </label>
                      <label className="field">
                        <span>E-posta</span>
                        <input value={me.email} disabled />
                      </label>
                      <label className="field">
                        <span>Telefon</span>
                        <input
                          value={me.phone ?? ''}
                          onChange={(e) => setMe({ ...me, phone: e.target.value })}
                          placeholder="05xx…"
                        />
                      </label>
                      <label className="field">
                        <span>Doğum tarihi</span>
                        <input
                          type="date"
                          value={me.birthDate ? me.birthDate.slice(0, 10) : ''}
                          onChange={(e) => setMe({ ...me, birthDate: e.target.value || null })}
                        />
                      </label>
                      <label className="field">
                        <span>Deneyim (yıl)</span>
                        <input
                          inputMode="numeric"
                          value={me.experienceYears ?? ''}
                          onChange={(e) =>
                            setMe({
                              ...me,
                              experienceYears: e.target.value
                                ? Number(e.target.value.replace(/\D/g, '').slice(0, 2))
                                : null,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>İşe başlama</span>
                        <input value={me.startDate ? new Date(me.startDate).toLocaleDateString('tr-TR') : '—'} disabled />
                      </label>
                      <label className="field">
                        <span>Ders ücreti</span>
                        <input value={me.lessonRate != null ? `₺${me.lessonRate}` : 'Henüz atanmadı'} disabled />
                      </label>
                      <label className="field detail-full">
                        <span>Eğitim (okul / bölüm)</span>
                        <input
                          value={me.education ?? ''}
                          onChange={(e) => setMe({ ...me, education: e.target.value })}
                        />
                      </label>
                      <label className="field detail-full">
                        <span>Uzmanlık alanları</span>
                        <input
                          value={me.specialties ?? ''}
                          onChange={(e) => setMe({ ...me, specialties: e.target.value })}
                        />
                      </label>
                      <label className="field detail-full">
                        <span>IBAN</span>
                        <input
                          value={me.iban ?? ''}
                          onChange={(e) => setMe({ ...me, iban: e.target.value })}
                          placeholder="TR…"
                        />
                      </label>
                      <label className="field detail-full">
                        <span>Kısa tanıtım</span>
                        <textarea
                          rows={2}
                          value={me.bio ?? ''}
                          onChange={(e) => setMe({ ...me, bio: e.target.value })}
                        />
                      </label>
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={meBusy}>
                      {meBusy ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                    <p className="muted small" style={{ margin: '8px 0 0' }}>
                      Ünvan, ana sayfa görünürlüğü ve ders ücreti yönetim tarafından ayarlanır.
                    </p>
                  </form>
                </>
              )}
            </div>

            <div className="s-card">
              <h3 className="s-card-title">Parola değiştir</h3>
              <form onSubmit={changePassword} className="form pw-form">
                <label className="field">
                  <span>Mevcut parola</span>
                  <input
                    type="password"
                    value={pwCur}
                    onChange={(e) => setPwCur(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="field">
                  <span>Yeni parola</span>
                  <input
                    type="password"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <small className="hint">En az 8 karakter; yalnızca rakam olamaz.</small>
                </label>
                <button className="btn btn-primary" type="submit" disabled={pwBusy}>
                  {pwBusy ? 'Değiştiriliyor…' : 'Parolayı değiştir'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
