import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getAccessToken, API_URL } from '../api/client';
import { LessonJoin } from '../components/LessonJoin';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import { formatTimeRange } from '../lib/format';

/* ---------------- tipler ---------------- */
interface Teacher {
  id: string;
  email: string;
  name: string;
  teacherProfile: { id: string; bio: string | null; languages: string[] } | null;
}
interface HomeTeacher {
  id: string;
  name: string;
  email: string;
  bio: string | null;
  headline: string | null;
  photoUrl: string | null;
  showOnHome: boolean;
  sortOrder: number;
}
interface AdminBooking {
  id: string;
  slot: { startTime: string; endTime: string };
  child: { name: string; parent: { name: string } };
  teacher: { user: { name: string } };
}
interface Topic {
  id: string;
  name: string;
  description: string | null;
  materialFilename: string | null;
}
interface Testimonial {
  id: string;
  name: string;
  role: string | null;
  text: string;
  rating: number;
  active: boolean;
  sortOrder: number;
}

interface LogRow {
  id: string;
  type: string;
  bookingId: string | null;
  actorName: string | null;
  role: string | null;
  meta: Record<string, any> | null;
  createdAt: string;
}

type Tab = 'home' | 'topics' | 'teachers' | 'site' | 'testimonials' | 'lessons' | 'logs';

// Olay türleri: etiket + renk
const EVENT_META: Record<string, { label: string; color: string }> = {
  'room.lobby': { label: 'Ders ekranına girdi', color: '#868e96' },
  'room.connect': { label: 'Derse bağlandı', color: '#2f9e44' },
  'room.leave': { label: 'Dersten ayrıldı', color: '#e8590c' },
  'room.ended': { label: 'Ders süresi doldu', color: '#c92a2a' },
  'room.blocked_duplicate': { label: 'Çift giriş engellendi', color: '#c92a2a' },
  'room.media': { label: 'Kamera/mikrofon', color: '#1971c2' },
  'booking.create': { label: 'Ders rezerve etti', color: '#2f9e44' },
  'booking.cancel': { label: 'Dersi iptal etti', color: '#e8590c' },
  'credit.topup': { label: 'Kredi yükledi', color: '#0ca678' },
  'auth.login': { label: 'Giriş yaptı', color: '#4c6ef5' },
  'auth.register': { label: 'Kayıt oldu', color: '#4c6ef5' },
  'profile.select': { label: 'Profile geçti', color: '#7048e8' },
  'profile.unlock_ok': { label: 'PIN doğru', color: '#0ca678' },
  'profile.unlock_fail': { label: 'PIN hatalı', color: '#c92a2a' },
  'admin.topic_create': { label: 'Konu ekledi', color: '#1971c2' },
};

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Öğretmen',
  PARENT: 'Öğrenci/Veli',
  ADMIN: 'Yönetici',
};

function describeMeta(l: LogRow): string | null {
  const m = l.meta;
  if (!m) return null;
  if (l.type === 'room.media') {
    return `mikrofon ${m.mic ? 'açık' : 'kapalı'} · kamera ${m.cam ? 'açık' : 'kapalı'}`;
  }
  if (l.type === 'booking.create' && m.topic) return `Konu: ${m.topic}`;
  if (l.type === 'credit.topup') return `+${m.amount} kredi (bakiye: ${m.balanceAfter})`;
  if (l.type === 'booking.cancel') return 'kredi iade edildi';
  if (l.type === 'room.leave' && m.reason === 'unload') return 'sekme kapatıldı';
  return null;
}

const NAV: { key: Tab; label: string; dot: string }[] = [
  { key: 'home', label: 'Panel', dot: '#3b5bdb' },
  { key: 'topics', label: 'Ders Konuları', dot: '#2f9e44' },
  { key: 'teachers', label: 'Öğretmenler', dot: '#f08c00' },
  { key: 'site', label: 'Ana Sayfa', dot: '#9775fa' },
  { key: 'testimonials', label: 'Yorumlar', dot: '#f06595' },
  { key: 'lessons', label: 'Dersler', dot: '#868e96' },
  { key: 'logs', label: 'Kayıtlar', dot: '#c92a2a' },
];

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [homeTeachers, setHomeTeachers] = useState<HomeTeacher[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logType, setLogType] = useState('');
  const [logQ, setLogQ] = useState('');
  const [logSkip, setLogSkip] = useState(0);
  const [logBusy, setLogBusy] = useState(false);
  const [heroTitle, setHeroTitle] = useState('');
  const [heroText, setHeroText] = useState('');
  const [siteBusy, setSiteBusy] = useState(false);

  /* ---------------- yükleme ---------------- */
  async function loadAll() {
    setError(null);
    try {
      const [t, b, tp, ht, ts, sc] = await Promise.all([
        apiFetch<{ teachers: Teacher[] }>('/api/admin/teachers'),
        apiFetch<{ bookings: AdminBooking[] }>('/api/admin/bookings'),
        apiFetch<{ topics: Topic[] }>('/api/admin/topics'),
        apiFetch<{ teachers: HomeTeacher[] }>('/api/admin/site/teachers'),
        apiFetch<{ testimonials: Testimonial[] }>('/api/admin/site/testimonials'),
        apiFetch<{ content: Record<string, any> }>('/api/admin/site/content'),
      ]);
      setTeachers(t.teachers);
      setBookings(b.bookings);
      setTopics(tp.topics);
      setHomeTeachers(ht.teachers);
      setTestimonials(ts.testimonials);
      setHeroTitle(sc.content?.hero?.title ?? '');
      setHeroText(sc.content?.hero?.text ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
    }
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function loadLogs(skip = 0) {
    setLogBusy(true);
    try {
      const params = new URLSearchParams({ take: '60', skip: String(skip) });
      if (logType) params.set('type', logType);
      if (logQ) params.set('q', logQ);
      const data = await apiFetch<{ logs: LogRow[]; total: number }>(
        `/api/admin/logs?${params.toString()}`
      );
      setLogs(data.logs);
      setLogTotal(data.total);
      setLogSkip(skip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıtlar yüklenemedi');
    } finally {
      setLogBusy(false);
    }
  }

  useEffect(() => {
    if (tab === 'logs') loadLogs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, logType]);

  function flash(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(null), 2500);
  }

  /* ---------------- öğretmen oluştur ---------------- */
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tPass, setTPass] = useState('');
  const [tBio, setTBio] = useState('');
  const [tBusy, setTBusy] = useState(false);

  async function createTeacher(e: FormEvent) {
    e.preventDefault();
    setTBusy(true);
    setError(null);
    try {
      await apiFetch('/api/admin/teachers', {
        method: 'POST',
        body: { name: tName, email: tEmail, password: tPass, bio: tBio || undefined },
      });
      setTName('');
      setTEmail('');
      setTPass('');
      setTBio('');
      flash('Öğretmen oluşturuldu.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öğretmen oluşturulamadı');
    } finally {
      setTBusy(false);
    }
  }

  /* ---------------- konu oluştur ---------------- */
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cFile, setCFile] = useState<File | null>(null);
  const [cBusy, setCBusy] = useState(false);
  const [delTopic, setDelTopic] = useState<string | null>(null);

  async function createTopic(e: FormEvent) {
    e.preventDefault();
    if (!cFile) {
      setError('Konu için bir PDF materyali seç');
      return;
    }
    setCBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', cName);
      form.append('description', cDesc);
      form.append('file', cFile);
      const res = await fetch(`${API_URL}/api/admin/topics`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Konu oluşturulamadı');
      setCName('');
      setCDesc('');
      setCFile(null);
      flash('Konu eklendi.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konu oluşturulamadı');
    } finally {
      setCBusy(false);
    }
  }

  async function deleteTopic(id: string) {
    try {
      await apiFetch(`/api/admin/topics/${id}`, { method: 'DELETE' });
      flash('Konu silindi.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konu silinemedi');
    } finally {
      setDelTopic(null);
    }
  }

  /* ---------------- ana sayfa: öğretmen ayarları ---------------- */
  async function saveHomeTeacher(t: HomeTeacher, patch: Partial<HomeTeacher>) {
    setError(null);
    try {
      await apiFetch(`/api/admin/site/teachers/${t.id}`, {
        method: 'PUT',
        body: {
          showOnHome: patch.showOnHome ?? t.showOnHome,
          headline: patch.headline ?? t.headline,
          bio: patch.bio ?? t.bio,
          sortOrder: patch.sortOrder ?? t.sortOrder,
        },
      });
      await loadAll();
      flash('Kaydedildi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    }
  }

  async function uploadPhoto(teacherId: string, file: File) {
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/admin/site/teachers/${teacherId}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Fotoğraf yüklenemedi');
      flash('Fotoğraf yüklendi.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi');
    }
  }

  async function saveHero() {
    setSiteBusy(true);
    setError(null);
    try {
      await apiFetch('/api/admin/site/content/hero', {
        method: 'PUT',
        body: { value: { title: heroTitle, text: heroText } },
      });
      flash('Ana sayfa metinleri kaydedildi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setSiteBusy(false);
    }
  }

  /* ---------------- yorumlar ---------------- */
  const [yName, setYName] = useState('');
  const [yRole, setYRole] = useState('');
  const [yText, setYText] = useState('');
  const [yBusy, setYBusy] = useState(false);
  const [delTesti, setDelTesti] = useState<string | null>(null);

  async function createTestimonial(e: FormEvent) {
    e.preventDefault();
    setYBusy(true);
    setError(null);
    try {
      await apiFetch('/api/admin/site/testimonials', {
        method: 'POST',
        body: { name: yName, role: yRole || null, text: yText, rating: 5, active: true, sortOrder: 0 },
      });
      setYName('');
      setYRole('');
      setYText('');
      flash('Yorum eklendi.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yorum eklenemedi');
    } finally {
      setYBusy(false);
    }
  }

  async function toggleTestimonial(t: Testimonial) {
    try {
      await apiFetch(`/api/admin/site/testimonials/${t.id}`, {
        method: 'PUT',
        body: { active: !t.active },
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi');
    }
  }

  async function deleteTestimonial(id: string) {
    try {
      await apiFetch(`/api/admin/site/testimonials/${id}`, { method: 'DELETE' });
      flash('Yorum silindi.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
    } finally {
      setDelTesti(null);
    }
  }

  const shownOnHome = homeTeachers.filter((t) => t.showOnHome).length;

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
            <h1 className="s-hello">Yönetim paneli</h1>
            <p className="muted">Merhaba {user?.name} — platformu buradan yönetiyorsun.</p>
          </div>
        </header>

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-ok">{ok}</div>}

        {/* ---------- Panel ---------- */}
        {tab === 'home' && (
          <>
            <div className="s-stats">
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#b2f2bb' }} />
                <div className="s-stat-num">{topics.length}</div>
                <div className="s-stat-label">Ders Konusu</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#ffd8a8' }} />
                <div className="s-stat-num">{teachers.length}</div>
                <div className="s-stat-label">Öğretmen</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#d0bfff' }} />
                <div className="s-stat-num">{shownOnHome}</div>
                <div className="s-stat-label">Ana Sayfada</div>
              </div>
              <div className="s-stat">
                <span className="s-stat-icon" style={{ background: '#a5d8ff' }} />
                <div className="s-stat-num">{bookings.length}</div>
                <div className="s-stat-label">Planlanan Ders</div>
              </div>
            </div>
            <div className="s-card">
              <h3 className="s-card-title">Hızlı erişim</h3>
              <div className="row-actions">
                <button className="btn btn-primary btn-sm" onClick={() => setTab('topics')}>
                  Ders konusu ekle
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setTab('teachers')}>
                  Öğretmen ekle
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setTab('site')}>
                  Ana sayfayı düzenle
                </button>
              </div>
            </div>
          </>
        )}

        {/* ---------- Ders konuları ---------- */}
        {tab === 'topics' && (
          <>
            <div className="s-card">
              <h3 className="s-card-title">Yeni ders konusu</h3>
              <form onSubmit={createTopic} className="form">
                <label className="field">
                  <span>Konu adı</span>
                  <input value={cName} onChange={(e) => setCName(e.target.value)} required minLength={2} />
                </label>
                <label className="field">
                  <span>Açıklama (isteğe bağlı)</span>
                  <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} />
                </label>
                <label className="field">
                  <span>Materyal (PDF)</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setCFile(e.target.files?.[0] ?? null)}
                    required
                  />
                  <small className="hint">Ders odasında bu PDF otomatik gösterilir.</small>
                </label>
                <button className="btn btn-primary" type="submit" disabled={cBusy}>
                  {cBusy ? 'Ekleniyor…' : 'Konuyu ekle'}
                </button>
              </form>
            </div>

            <div className="s-card">
              <h3 className="s-card-title">Konular ({topics.length})</h3>
              {topics.length === 0 ? (
                <p className="empty">Henüz konu yok.</p>
              ) : (
                <ul className="s-list">
                  {topics.map((t) => (
                    <li key={t.id} className="s-row">
                      <div>
                        <div className="s-row-main">{t.name}</div>
                        {t.description && <div className="muted small">{t.description}</div>}
                        {t.materialFilename && (
                          <div className="muted small">Materyal: {t.materialFilename}</div>
                        )}
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDelTopic(t.id)}>
                        Sil
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ---------- Öğretmenler ---------- */}
        {tab === 'teachers' && (
          <>
            <div className="s-card">
              <h3 className="s-card-title">Yeni öğretmen</h3>
              <form onSubmit={createTeacher} className="form">
                <label className="field">
                  <span>Ad soyad</span>
                  <input value={tName} onChange={(e) => setTName(e.target.value)} required minLength={2} />
                </label>
                <label className="field">
                  <span>E-posta</span>
                  <input type="email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Geçici parola</span>
                  <input
                    type="text"
                    value={tPass}
                    onChange={(e) => setTPass(e.target.value)}
                    minLength={8}
                    required
                  />
                  <small className="hint">En az 8 karakter.</small>
                </label>
                <label className="field">
                  <span>Kısa tanıtım (isteğe bağlı)</span>
                  <textarea value={tBio} onChange={(e) => setTBio(e.target.value)} rows={2} />
                </label>
                <button className="btn btn-primary" type="submit" disabled={tBusy}>
                  {tBusy ? 'Oluşturuluyor…' : 'Öğretmeni oluştur'}
                </button>
              </form>
            </div>

            <div className="s-card">
              <h3 className="s-card-title">Öğretmenler ({teachers.length})</h3>
              {teachers.length === 0 ? (
                <p className="empty">Henüz öğretmen yok.</p>
              ) : (
                <ul className="s-list">
                  {teachers.map((t) => (
                    <li key={t.id} className="s-row">
                      <div>
                        <div className="s-row-main">{t.name}</div>
                        <div className="muted small">{t.email}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ---------- Ana sayfa (CMS) ---------- */}
        {tab === 'site' && (
          <>
            <div className="s-card">
              <h3 className="s-card-title">Hero metinleri</h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                Boş bırakırsan ana sayfadaki varsayılan metinler kullanılır.
              </p>
              <div className="form">
                <label className="field">
                  <span>Başlık</span>
                  <input
                    value={heroTitle}
                    onChange={(e) => setHeroTitle(e.target.value)}
                    placeholder="Çocuklar İçin Eğlenceli ve Etkili Online Almanca Dersleri"
                  />
                </label>
                <label className="field">
                  <span>Açıklama</span>
                  <textarea
                    value={heroText}
                    onChange={(e) => setHeroText(e.target.value)}
                    rows={3}
                    placeholder="Canlı dersler, oyunlaştırılmış etkinlikler…"
                  />
                </label>
                <button className="btn btn-primary" onClick={saveHero} disabled={siteBusy}>
                  {siteBusy ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>

            <div className="s-card">
              <h3 className="s-card-title">Ana sayfadaki öğretmenler</h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                Sistemdeki öğretmenlerden hangilerinin ana sayfada görüneceğini seç. Sıra numarası küçük
                olan önce görünür.
              </p>
              {homeTeachers.length === 0 ? (
                <p className="empty">Önce bir öğretmen oluştur.</p>
              ) : (
                <ul className="s-list">
                  {homeTeachers.map((t) => (
                    <li key={t.id} className="cms-teacher">
                      <div className="cms-teacher-photo">
                        {t.photoUrl ? (
                          <img src={`${API_URL}${t.photoUrl}`} alt={t.name} />
                        ) : (
                          <span>foto yok</span>
                        )}
                      </div>
                      <div className="cms-teacher-body">
                        <div className="s-row-main">{t.name}</div>
                        <div className="cms-fields">
                          <label className="field">
                            <span>Ünvan</span>
                            <input
                              defaultValue={t.headline ?? ''}
                              placeholder="Çocuk Almancası Uzmanı"
                              onBlur={(e) => saveHomeTeacher(t, { headline: e.target.value })}
                            />
                          </label>
                          <label className="field field-sm">
                            <span>Sıra</span>
                            <input
                              type="number"
                              min={0}
                              defaultValue={t.sortOrder}
                              onBlur={(e) => saveHomeTeacher(t, { sortOrder: Number(e.target.value) })}
                            />
                          </label>
                        </div>
                        <label className="field">
                          <span>Tanıtım</span>
                          <textarea
                            rows={2}
                            defaultValue={t.bio ?? ''}
                            placeholder="Kısa tanıtım metni"
                            onBlur={(e) => saveHomeTeacher(t, { bio: e.target.value })}
                          />
                        </label>
                        <div className="row-actions">
                          <label className="checkbox-field" style={{ margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={t.showOnHome}
                              onChange={(e) => saveHomeTeacher(t, { showOnHome: e.target.checked })}
                            />
                            <span>Ana sayfada göster</span>
                          </label>
                          <label className="btn btn-ghost btn-sm">
                            Fotoğraf yükle
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => e.target.files?.[0] && uploadPhoto(t.id, e.target.files[0])}
                            />
                          </label>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ---------- Yorumlar ---------- */}
        {tab === 'testimonials' && (
          <>
            <div className="s-card">
              <h3 className="s-card-title">Yeni yorum</h3>
              <form onSubmit={createTestimonial} className="form">
                <label className="field">
                  <span>Ad</span>
                  <input value={yName} onChange={(e) => setYName(e.target.value)} required minLength={2} />
                </label>
                <label className="field">
                  <span>Kim (isteğe bağlı)</span>
                  <input
                    value={yRole}
                    onChange={(e) => setYRole(e.target.value)}
                    placeholder="Mira'nın annesi"
                  />
                </label>
                <label className="field">
                  <span>Yorum</span>
                  <textarea value={yText} onChange={(e) => setYText(e.target.value)} rows={3} required />
                </label>
                <button className="btn btn-primary" type="submit" disabled={yBusy}>
                  {yBusy ? 'Ekleniyor…' : 'Yorumu ekle'}
                </button>
              </form>
            </div>

            <div className="s-card">
              <h3 className="s-card-title">Yorumlar ({testimonials.length})</h3>
              {testimonials.length === 0 ? (
                <p className="empty">Henüz yorum yok.</p>
              ) : (
                <ul className="s-list">
                  {testimonials.map((t) => (
                    <li key={t.id} className="s-row">
                      <div>
                        <div className="s-row-main">
                          {t.name}
                          {t.role ? <span className="muted"> · {t.role}</span> : null}
                        </div>
                        <div className="muted small">{t.text}</div>
                      </div>
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleTestimonial(t)}>
                          {t.active ? 'Gizle' : 'Göster'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDelTesti(t.id)}>
                          Sil
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ---------- Dersler (gizli izleme) ---------- */}
        {tab === 'lessons' && (
          <div className="s-card">
            <h3 className="s-card-title">Dersler — gizli izleme</h3>
            {bookings.length === 0 ? (
              <p className="empty">Şu an planlanmış ders yok.</p>
            ) : (
              <ul className="s-list">
                {bookings.map((b) => (
                  <li key={b.id} className="s-row">
                    <div>
                      <div className="s-row-main">
                        {formatTimeRange(b.slot.startTime, b.slot.endTime)}
                      </div>
                      <div className="muted small">
                        {b.child.name} (veli: {b.child.parent.name}) · Öğretmen: {b.teacher.user.name}
                      </div>
                    </div>
                    <LessonJoin
                      bookingId={b.id}
                      start={b.slot.startTime}
                      end={b.slot.endTime}
                      observe
                      onJoin={(id) => navigate(`/room/${id}`)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* ---------- Kayıtlar ---------- */}
        {tab === 'logs' && (
          <>
            <div className="s-card">
              <h3 className="s-card-title">Filtreler</h3>
              <div className="log-filters">
                <label className="field">
                  <span>Olay türü</span>
                  <select value={logType} onChange={(e) => setLogType(e.target.value)}>
                    <option value="">Tümü</option>
                    {Object.entries(EVENT_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Kişi ara</span>
                  <input
                    value={logQ}
                    onChange={(e) => setLogQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadLogs(0)}
                    placeholder="Ad ile ara…"
                  />
                </label>
                <button className="btn btn-primary btn-sm" onClick={() => loadLogs(0)} disabled={logBusy}>
                  {logBusy ? 'Aranıyor…' : 'Ara'}
                </button>
              </div>
            </div>

            <div className="s-card">
              <div className="card-head-row">
                <h3 className="s-card-title" style={{ margin: 0 }}>
                  Olay kayıtları ({logTotal})
                </h3>
                <span className="muted small">
                  {logSkip + 1}–{Math.min(logSkip + logs.length, logTotal)} arası
                </span>
              </div>

              {logs.length === 0 ? (
                <p className="empty">Kayıt bulunamadı.</p>
              ) : (
                <ul className="log-list">
                  {logs.map((l) => {
                    const meta = EVENT_META[l.type] ?? { label: l.type, color: '#868e96' };
                    const extra = describeMeta(l);
                    const d = new Date(l.createdAt);
                    return (
                      <li key={l.id} className="log-item">
                        <span className="log-dot" style={{ background: meta.color }} />
                        <div className="log-body">
                          <div className="log-top">
                            <strong className="log-label">{meta.label}</strong>
                            {l.actorName && <span className="log-actor">{l.actorName}</span>}
                            {l.role && <span className="log-role">{ROLE_LABEL[l.role] ?? l.role}</span>}
                          </div>
                          {extra && <div className="log-extra">{extra}</div>}
                        </div>
                        <time className="log-time" title={d.toLocaleString('tr-TR')}>
                          {d.toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}

              {logTotal > 60 && (
                <div className="row-actions" style={{ marginTop: 14 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={logSkip === 0 || logBusy}
                    onClick={() => loadLogs(Math.max(0, logSkip - 60))}
                  >
                    ‹ Önceki
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={logSkip + 60 >= logTotal || logBusy}
                    onClick={() => loadLogs(logSkip + 60)}
                  >
                    Sonraki ›
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={delTopic !== null}
        title="Konuyu sil"
        message="Bu ders konusunu silmek istediğine emin misin?"
        confirmLabel="Evet, sil"
        cancelLabel="Vazgeç"
        danger
        onConfirm={() => delTopic && deleteTopic(delTopic)}
        onCancel={() => setDelTopic(null)}
      />
      <ConfirmDialog
        open={delTesti !== null}
        title="Yorumu sil"
        message="Bu yorumu silmek istediğine emin misin?"
        confirmLabel="Evet, sil"
        cancelLabel="Vazgeç"
        danger
        onConfirm={() => delTesti && deleteTestimonial(delTesti)}
        onCancel={() => setDelTesti(null)}
      />
    </div>
  );
}
