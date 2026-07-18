import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, getAccessToken, API_URL } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { formatTimeRange, joinState } from '../lib/format';

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
interface ParentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  children: { id: string; name: string; age: number | null; credits: number }[];
}
interface ParentDetail {
  parent: Omit<ParentRow, 'children'> & {
    children: { id: string; name: string; age: number | null; birthDate: string | null; credits: number }[];
  };
  bookings: {
    id: string;
    status: string;
    slot: { startTime: string; endTime: string };
    child: { name: string };
    teacher: { user: { name: string } };
    topic: { name: string } | null;
  }[];
}
interface TeacherDetail {
  teacher: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    profile: {
      bio: string | null;
      phone: string | null;
      birthDate: string | null;
      education: string | null;
      experienceYears: number | null;
      specialties: string | null;
      iban: string | null;
      startDate: string | null;
      adminNote: string | null;
      initialPassword: string | null;
    };
  };
  slots: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    booking: { id: string; child: { name: string }; topic: { name: string } | null } | null;
  }[];
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

type Tab = 'home' | 'topics' | 'teachers' | 'parents' | 'site' | 'testimonials' | 'lessons' | 'logs';
const TABS: Tab[] = ['home', 'topics', 'teachers', 'parents', 'site', 'testimonials', 'lessons', 'logs'];

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
  { key: 'parents', label: 'Veliler', dot: '#0ca678' },
  { key: 'site', label: 'Ana Sayfa', dot: '#9775fa' },
  { key: 'testimonials', label: 'Yorumlar', dot: '#f06595' },
  { key: 'lessons', label: 'Dersler', dot: '#868e96' },
  { key: 'logs', label: 'Kayıtlar', dot: '#c92a2a' },
];

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  // Sekme URL'de tutulur (?tab=...): yenilemede korunur, geri tuşu çalışır, link paylaşılabilir
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = urlTab && TABS.includes(urlTab) ? urlTab : 'home';
  const setTab = (t: Tab) => setSearchParams(t === 'home' ? {} : { tab: t });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [homeTeachers, setHomeTeachers] = useState<HomeTeacher[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [parentDetail, setParentDetail] = useState<ParentDetail | null>(null);
  const [teacherDetail, setTeacherDetail] = useState<TeacherDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acName, setAcName] = useState('');
  const [acAge, setAcAge] = useState('');
  const [acBusy, setAcBusy] = useState(false);
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
      const [t, b, tp, ht, ts, sc, pr] = await Promise.all([
        apiFetch<{ teachers: Teacher[] }>('/api/admin/teachers'),
        apiFetch<{ bookings: AdminBooking[] }>('/api/admin/bookings'),
        apiFetch<{ topics: Topic[] }>('/api/admin/topics'),
        apiFetch<{ teachers: HomeTeacher[] }>('/api/admin/site/teachers'),
        apiFetch<{ testimonials: Testimonial[] }>('/api/admin/site/testimonials'),
        apiFetch<{ content: Record<string, any> }>('/api/admin/site/content'),
        apiFetch<{ parents: ParentRow[] }>('/api/admin/parents'),
      ]);
      setTeachers(t.teachers);
      setBookings(b.bookings);
      setTopics(tp.topics);
      setHomeTeachers(ht.teachers);
      setTestimonials(ts.testimonials);
      setHeroTitle(sc.content?.hero?.title ?? '');
      setHeroText(sc.content?.hero?.text ?? '');
      setParents(pr.parents);
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
  const [tPhone, setTPhone] = useState('');
  const [tBirth, setTBirth] = useState('');
  const [tEdu, setTEdu] = useState('');
  const [tExp, setTExp] = useState('');
  const [tSpec, setTSpec] = useState('');
  const [tIban, setTIban] = useState('');
  const [tStart, setTStart] = useState('');
  const [tNote, setTNote] = useState('');
  const [tBusy, setTBusy] = useState(false);

  async function createTeacher(e: FormEvent) {
    e.preventDefault();
    setTBusy(true);
    setError(null);
    try {
      await apiFetch('/api/admin/teachers', {
        method: 'POST',
        body: {
          name: tName,
          email: tEmail,
          password: tPass,
          bio: tBio || undefined,
          phone: tPhone || undefined,
          birthDate: tBirth ? new Date(tBirth).toISOString() : undefined,
          education: tEdu || undefined,
          experienceYears: tExp ? Number(tExp) : undefined,
          specialties: tSpec || undefined,
          iban: tIban || undefined,
          startDate: tStart ? new Date(tStart).toISOString() : undefined,
          adminNote: tNote || undefined,
        },
      });
      setTName('');
      setTEmail('');
      setTPass('');
      setTBio('');
      setTPhone('');
      setTBirth('');
      setTEdu('');
      setTExp('');
      setTSpec('');
      setTIban('');
      setTStart('');
      setTNote('');
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

  async function openTeacherDetail(userId: string) {
    setDetailBusy(true);
    setCopied(false);
    try {
      const data = await apiFetch<TeacherDetail>(`/api/admin/teachers/${userId}/detail`);
      setTeacherDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öğretmen bilgisi alınamadı');
    } finally {
      setDetailBusy(false);
    }
  }

  async function openParentDetail(userId: string) {
    setDetailBusy(true);
    setAcName('');
    setAcAge('');
    try {
      const data = await apiFetch<ParentDetail>(`/api/admin/parents/${userId}/detail`);
      setParentDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veli bilgisi alınamadı');
    } finally {
      setDetailBusy(false);
    }
  }

  async function copyCredentials() {
    if (!teacherDetail) return;
    const pw = teacherDetail.teacher.profile.initialPassword;
    const text = pw
      ? `${teacherDetail.teacher.email} - ${pw}`
      : teacherDetail.teacher.email;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Kopyalanamadı — tarayıcı izin vermedi');
    }
  }

  async function adminAddChild(e: FormEvent) {
    e.preventDefault();
    if (!parentDetail) return;
    setAcBusy(true);
    try {
      await apiFetch(`/api/admin/parents/${parentDetail.parent.id}/children`, {
        method: 'POST',
        body: { name: acName, age: Number(acAge) },
      });
      flash('Çocuk profili eklendi.');
      await openParentDetail(parentDetail.parent.id);
      await loadAll();
      setAcName('');
      setAcAge('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setAcBusy(false);
    }
  }

  function fmtDate(iso: string | null) {
    return iso ? new Date(iso).toLocaleDateString('tr-TR') : '—';
  }

  return (
    <div className="student-shell">
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
          <div className="s-cols">
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
          </div>
        )}

        {/* ---------- Öğretmenler ---------- */}
        {tab === 'teachers' && (
          <div className="s-cols">
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

                <div className="hr-grid">
                  <label className="field">
                    <span>Telefon</span>
                    <input value={tPhone} onChange={(e) => setTPhone(e.target.value)} placeholder="05xx…" />
                  </label>
                  <label className="field">
                    <span>Doğum tarihi</span>
                    <input type="date" value={tBirth} onChange={(e) => setTBirth(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>İşe başlama</span>
                    <input type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Deneyim (yıl)</span>
                    <input
                      inputMode="numeric"
                      value={tExp}
                      onChange={(e) => setTExp(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    />
                  </label>
                  <label className="field detail-full">
                    <span>Eğitim (okul / bölüm)</span>
                    <input value={tEdu} onChange={(e) => setTEdu(e.target.value)} />
                  </label>
                  <label className="field detail-full">
                    <span>Uzmanlık alanları</span>
                    <input
                      value={tSpec}
                      onChange={(e) => setTSpec(e.target.value)}
                      placeholder="örn. çocuk almancası, sınav hazırlık"
                    />
                  </label>
                  <label className="field detail-full">
                    <span>IBAN</span>
                    <input value={tIban} onChange={(e) => setTIban(e.target.value)} placeholder="TR…" />
                  </label>
                  <label className="field detail-full">
                    <span>Dahili not</span>
                    <textarea value={tNote} onChange={(e) => setTNote(e.target.value)} rows={2} />
                  </label>
                </div>

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
                    <li key={t.id} className="s-row s-row-click" onClick={() => openTeacherDetail(t.id)}>
                      <div>
                        <div className="s-row-main">{t.name}</div>
                        <div className="muted small">{t.email}</div>
                      </div>
                      <span className="muted small">Detay ›</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ---------- Veliler ---------- */}
        {tab === 'parents' && (
          <div className="s-card">
            <h3 className="s-card-title">Veliler ({parents.length})</h3>
            <p className="muted small" style={{ marginTop: 0 }}>
              Bir veliye tıklayıp çocuklarını, kredilerini ve ders geçmişini görebilir, çocuk
              ekleyebilirsin.
            </p>
            {parents.length === 0 ? (
              <p className="empty">Henüz kayıtlı veli yok.</p>
            ) : (
              <ul className="s-list">
                {parents.map((pr) => (
                  <li key={pr.id} className="s-row s-row-click" onClick={() => openParentDetail(pr.id)}>
                    <div>
                      <div className="s-row-main">{pr.name}</div>
                      <div className="muted small">
                        {pr.email}
                        {pr.phone ? ` · ${pr.phone}` : ''}
                      </div>
                      <div className="muted small">
                        {pr.children.length === 0
                          ? 'Çocuk yok'
                          : pr.children.map((c) => `${c.name} (${c.credits} kredi)`).join(' · ')}
                      </div>
                    </div>
                    <span className="muted small">Detay ›</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---------- Ana sayfa (CMS) ---------- */}
        {tab === 'site' && (
          <div className="s-cols">
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
          </div>
        )}

        {/* ---------- Yorumlar ---------- */}
        {tab === 'testimonials' && (
          <div className="s-cols">
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
          </div>
        )}

        {/* ---------- Dersler (gizli izleme) ---------- */}
        {tab === 'lessons' && (() => {
          // Aktif = ders fiilen başlamış ve bitmemiş (lobi penceresi sayılmaz)
          const live = bookings.filter(
            (b) => joinState(b.slot.startTime, b.slot.endTime, 0) === 'open'
          );
          const upcoming = bookings.filter(
            (b) => joinState(b.slot.startTime, b.slot.endTime, 0) === 'future'
          );
          const past = bookings
            .filter((b) => joinState(b.slot.startTime, b.slot.endTime) === 'ended')
            .reverse();
          return (
            <>
              <div className="s-card">
                <h3 className="s-card-title">Aktif dersler ({live.length})</h3>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Yalnızca şu an devam eden dersler denetlenebilir. Denetimde görünmez ve duyulmaz
                  olarak izlersin.
                </p>
                {live.length === 0 ? (
                  <p className="empty">Şu an devam eden ders yok.</p>
                ) : (
                  <ul className="s-list">
                    {live.map((b) => (
                      <li key={b.id} className="s-row">
                        <div>
                          <div className="s-row-main">
                            <span className="live-dot" /> {formatTimeRange(b.slot.startTime, b.slot.endTime)}
                          </div>
                          <div className="muted small">
                            {b.child.name} (veli: {b.child.parent.name}) · Öğretmen: {b.teacher.user.name}
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/room/${b.id}`)}>
                          Denetle
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {upcoming.length > 0 && (
                <div className="s-card">
                  <h3 className="s-card-title">Yaklaşan dersler ({upcoming.length})</h3>
                  <ul className="s-list">
                    {upcoming.map((b) => (
                      <li key={b.id} className="s-row">
                        <div>
                          <div className="s-row-main">{formatTimeRange(b.slot.startTime, b.slot.endTime)}</div>
                          <div className="muted small">
                            {b.child.name} (veli: {b.child.parent.name}) · Öğretmen: {b.teacher.user.name}
                          </div>
                        </div>
                        <span className="badge">Planlandı</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="s-card">
                <h3 className="s-card-title">Geçmiş dersler ({past.length})</h3>
                {past.length === 0 ? (
                  <p className="empty">Henüz tamamlanmış ders yok.</p>
                ) : (
                  <ul className="s-list">
                    {past.map((b) => (
                      <li key={b.id} className="s-row">
                        <div>
                          <div className="s-row-main">{formatTimeRange(b.slot.startTime, b.slot.endTime)}</div>
                          <div className="muted small">
                            {b.child.name} (veli: {b.child.parent.name}) · Öğretmen: {b.teacher.user.name}
                          </div>
                        </div>
                        <span className="badge">Bitti</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          );
        })()}
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

      {/* ---------- Öğretmen detay popup ---------- */}
      <Modal
        open={teacherDetail !== null}
        title={teacherDetail ? teacherDetail.teacher.name : 'Öğretmen'}
        onClose={() => setTeacherDetail(null)}
        wide
      >
        {teacherDetail && (
          <div className="detail-pop">
            <div className="detail-grid">
              <div><span className="detail-k">E-posta</span><span>{teacherDetail.teacher.email}</span></div>
              <div><span className="detail-k">Telefon</span><span>{teacherDetail.teacher.profile.phone ?? '—'}</span></div>
              <div><span className="detail-k">Doğum tarihi</span><span>{fmtDate(teacherDetail.teacher.profile.birthDate)}</span></div>
              <div><span className="detail-k">İşe başlama</span><span>{fmtDate(teacherDetail.teacher.profile.startDate)}</span></div>
              <div><span className="detail-k">Deneyim</span><span>{teacherDetail.teacher.profile.experienceYears != null ? `${teacherDetail.teacher.profile.experienceYears} yıl` : '—'}</span></div>
              <div><span className="detail-k">Eğitim</span><span>{teacherDetail.teacher.profile.education ?? '—'}</span></div>
              <div className="detail-full"><span className="detail-k">Uzmanlık</span><span>{teacherDetail.teacher.profile.specialties ?? '—'}</span></div>
              <div className="detail-full"><span className="detail-k">IBAN</span><span>{teacherDetail.teacher.profile.iban ?? '—'}</span></div>
              {teacherDetail.teacher.profile.adminNote && (
                <div className="detail-full"><span className="detail-k">Not</span><span>{teacherDetail.teacher.profile.adminNote}</span></div>
              )}
            </div>

            <div className="detail-cred">
              <div>
                <span className="detail-k">Hesap bilgileri</span>
                <code className="detail-code">
                  {teacherDetail.teacher.email}
                  {teacherDetail.teacher.profile.initialPassword
                    ? ` - ${teacherDetail.teacher.profile.initialPassword}`
                    : ''}
                </code>
                {!teacherDetail.teacher.profile.initialPassword && (
                  <div className="muted small">Bu öğretmen için kayıtlı geçici parola yok.</div>
                )}
              </div>
              <button className="btn btn-primary btn-sm" onClick={copyCredentials}>
                {copied ? 'Kopyalandı ✓' : 'Bilgileri kopyala'}
              </button>
            </div>

            <h4 className="detail-sub">Takvim (yaklaşan)</h4>
            {teacherDetail.slots.length === 0 ? (
              <p className="empty">Yaklaşan ders saati yok.</p>
            ) : (
              <ul className="s-list detail-slots">
                {teacherDetail.slots.map((sl) => (
                  <li key={sl.id} className="s-row">
                    <div>
                      <div className="s-row-main">{formatTimeRange(sl.startTime, sl.endTime)}</div>
                      {sl.booking && (
                        <div className="muted small">
                          {sl.booking.child.name}
                          {sl.booking.topic ? ` · ${sl.booking.topic.name}` : ''}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${sl.booking ? 'badge-green' : ''}`}>
                      {sl.booking ? 'Rezerve' : 'Açık'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {/* ---------- Veli detay popup ---------- */}
      <Modal
        open={parentDetail !== null}
        title={parentDetail ? parentDetail.parent.name : 'Veli'}
        onClose={() => setParentDetail(null)}
        wide
      >
        {parentDetail && (
          <div className="detail-pop">
            <div className="detail-grid">
              <div><span className="detail-k">E-posta</span><span>{parentDetail.parent.email}</span></div>
              <div><span className="detail-k">Telefon</span><span>{parentDetail.parent.phone ?? '—'}</span></div>
              <div><span className="detail-k">Kayıt tarihi</span><span>{fmtDate(parentDetail.parent.createdAt)}</span></div>
            </div>

            <h4 className="detail-sub">Çocuklar ({parentDetail.parent.children.length})</h4>
            <ul className="s-list">
              {parentDetail.parent.children.map((c) => (
                <li key={c.id} className="s-row">
                  <div>
                    <div className="s-row-main">{c.name}</div>
                    <div className="muted small">
                      {c.age != null ? `${c.age} yaş · ` : ''}doğum: {fmtDate(c.birthDate)}
                    </div>
                  </div>
                  <span className="credit-badge">{c.credits} kredi</span>
                </li>
              ))}
            </ul>

            <form onSubmit={adminAddChild} className="detail-addchild">
              <label className="field">
                <span>Yeni çocuk adı</span>
                <input value={acName} onChange={(e) => setAcName(e.target.value)} required minLength={2} />
              </label>
              <label className="field field-sm">
                <span>Yaş</span>
                <input
                  inputMode="numeric"
                  value={acAge}
                  onChange={(e) => setAcAge(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  required
                />
              </label>
              <button className="btn btn-primary btn-sm" type="submit" disabled={acBusy}>
                {acBusy ? 'Ekleniyor…' : 'Çocuk ekle'}
              </button>
            </form>

            <h4 className="detail-sub">Ders geçmişi / takvimi</h4>
            {parentDetail.bookings.length === 0 ? (
              <p className="empty">Henüz rezervasyon yok.</p>
            ) : (
              <ul className="s-list detail-slots">
                {parentDetail.bookings.map((b) => (
                  <li key={b.id} className="s-row">
                    <div>
                      <div className="s-row-main">{formatTimeRange(b.slot.startTime, b.slot.endTime)}</div>
                      <div className="muted small">
                        {b.child.name}
                        {b.topic ? ` · ${b.topic.name}` : ''} · Öğretmen: {b.teacher.user.name}
                      </div>
                    </div>
                    <span className={`badge ${b.status === 'CANCELLED' ? 'badge-red' : ''}`}>
                      {b.status === 'CANCELLED' ? 'İptal' : joinState(b.slot.startTime, b.slot.endTime, 0) === 'ended' ? 'Bitti' : 'Planlandı'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

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
