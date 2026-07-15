import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormEvent } from 'react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { LessonJoin } from '../components/LessonJoin';
import { AvailabilityGrid, GridSlot } from '../components/AvailabilityGrid';
import { startOfWeek, addWeeks, formatWeekRange } from '../lib/week';
import { formatTimeRange, joinState } from '../lib/format';

type Tab = 'home' | 'calendar' | 'lessons' | 'past' | 'settings';

const TABS: Tab[] = ['home', 'calendar', 'lessons', 'past', 'settings'] as Tab[];

const NAV: { key: Tab; label: string; dot: string }[] = [
  { key: 'home', label: 'Panelim', dot: '#3b5bdb' },
  { key: 'calendar', label: 'Takvimim', dot: '#2f9e44' },
  { key: 'lessons', label: 'Derslerim', dot: '#f08c00' },
  { key: 'past', label: 'Geçmiş Dersler', dot: '#868e96' },
  { key: 'settings', label: 'Ayarlar', dot: '#9775fa' },
];

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
}

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

  // Ayarlar
  const [me, setMe] = useState<TeacherMe | null>(null);
  const [meBusy, setMeBusy] = useState(false);
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  function flash(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(null), 2500);
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

  useEffect(() => {
    loadSlots();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ders saati açılamadı');
    }
  }

  async function closeSlot(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/teacher/slots/${id}`, { method: 'DELETE' });
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ders saati kapatılamadı');
    }
  }

  const booked = slots.filter((s) => s.booking && s.status === 'BOOKED');
  const openSlots = slots.filter((s) => s.status === 'OPEN' && joinState(s.startTime, s.endTime) !== 'ended');
  const upcoming = booked
    .filter((s) => joinState(s.startTime, s.endTime) !== 'ended')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const done = booked
    .filter((s) => joinState(s.startTime, s.endTime) === 'ended')
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const nextLesson = upcoming[0];

  function LessonRow({ s, past = false }: { s: GridSlot; past?: boolean }) {
    return (
      <li className="s-row">
        <div>
          <div className="s-row-main">{formatTimeRange(s.startTime, s.endTime)}</div>
          <div className="muted small">
            {s.booking?.child.name}
            {s.booking?.topic ? ` · ${s.booking.topic.name}` : ''} (veli: {s.booking?.child.parent.name})
          </div>
        </div>
        {past ? (
          <span className="badge">Bitti</span>
        ) : (
          <LessonJoin
            bookingId={s.booking!.id}
            start={s.startTime}
            end={s.endTime}
            onJoin={(id) => navigate(`/room/${id}`)}
          />
        )}
      </li>
    );
  }

  function Calendar() {
    return (
      <div className="s-card">
        <div className="cal-toolbar">
          <h3 className="s-card-title" style={{ margin: 0 }}>
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
    <div className="student-shell">
      {/* Sol menü */}
      <aside className="s-side">
        <div className="s-brand">
          <img
            src="/lumiko-logo.png"
            alt="Lumiko"
            className="s-logo"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
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
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
            Çıkış yap
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

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-ok">{ok}</div>}

        {/* ---------- Panelim ---------- */}
        {tab === 'home' && (
          <>
            <div className="s-stats">
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#a5d8ff' }} />
                <div className="s-stat-num">{upcoming.length}</div>
                <div className="s-stat-label">Yaklaşan Ders</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#b2f2bb' }} />
                <div className="s-stat-num">{openSlots.length}</div>
                <div className="s-stat-label">Açık Saat</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#ffd8a8' }} />
                <div className="s-stat-num">{done.length}</div>
                <div className="s-stat-label">Tamamlanan Ders</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#d0bfff' }} />
                <div className="s-stat-num">{booked.length}</div>
                <div className="s-stat-label">Toplam Rezerve</div>
              </div>
            </div>

            {nextLesson && nextLesson.booking ? (
              <div className="s-next">
                <div>
                  <span className="s-next-label">Sıradaki ders</span>
                  <div className="s-next-time">
                    {formatTimeRange(nextLesson.startTime, nextLesson.endTime)}
                  </div>
                  <div className="muted small">
                    {nextLesson.booking.child.name}
                    {nextLesson.booking.topic ? ` · ${nextLesson.booking.topic.name}` : ''} (veli:{' '}
                    {nextLesson.booking.child.parent.name})
                  </div>
                </div>
                <LessonJoin
                  bookingId={nextLesson.booking.id}
                  start={nextLesson.startTime}
                  end={nextLesson.endTime}
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

            <Calendar />
          </>
        )}

        {/* ---------- Takvim ---------- */}
        {tab === 'calendar' && <Calendar />}

        {/* ---------- Yaklaşan dersler ---------- */}
        {tab === 'lessons' && (
          <div className="s-card">
            <h3 className="s-card-title">Yaklaşan dersler ({upcoming.length})</h3>
            {upcoming.length === 0 ? (
              <p className="empty">Rezerve edilmiş yaklaşan dersin yok.</p>
            ) : (
              <ul className="s-list">
                {upcoming.map((s) => (
                  <LessonRow key={s.id} s={s} />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---------- Geçmiş dersler ---------- */}
        {tab === 'past' && (
          <div className="s-card">
            <h3 className="s-card-title">Geçmiş dersler ({done.length})</h3>
            {done.length === 0 ? (
              <p className="empty">Henüz tamamlanmış ders yok.</p>
            ) : (
              <ul className="s-list">
                {done.map((s) => (
                  <LessonRow key={s.id} s={s} past />
                ))}
              </ul>
            )}
          </div>
        )}
        {/* ---------- Ayarlar ---------- */}
        {tab === 'settings' && (
          <div className="s-cols s-cols-wide-first">
            <div className="s-card">
              <h3 className="s-card-title">Kişisel bilgiler</h3>
              {!me ? (
                <p className="muted">Yükleniyor…</p>
              ) : (
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
                    Ana sayfadaki ünvan, fotoğraf ve görünürlük ayarları yönetim tarafından yapılır.
                  </p>
                </form>
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
