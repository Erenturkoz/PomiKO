import { useEffect, useState } from 'react';
import { apiFetch, API_URL } from '../api/client';
import { BookingCalendar, BookingSlot } from './BookingCalendar';
import { formatTimeRange } from '../lib/format';
import { now as serverNow } from '../lib/serverTime';
import { addWeeks, formatWeekRange, startOfWeek } from '../lib/week';

interface Teacher {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  openSlotCount: number;
  isFavorite: boolean;
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
}

type Step = 'teacher' | 'time' | 'topic' | 'done';

interface BookingResult {
  slot: BookingSlot;
  ok: boolean;
  message?: string;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4dabf7, #748ffc)',
  'linear-gradient(135deg, #51cf66, #38d9a9)',
  'linear-gradient(135deg, #f783ac, #da77f2)',
  'linear-gradient(135deg, #ffa94d, #ff8787)',
];

const chipDateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const chipTimeFmt = new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short' });
function chipLabel(s: BookingSlot) {
  return `${chipDateFmt.format(new Date(s.startTime))} · ${chipTimeFmt.format(new Date(s.startTime))}`;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function TeacherAvatar({ teacher, index }: { teacher: Teacher; index: number }) {
  const [err, setErr] = useState(false);
  if (teacher.photoUrl && !err) {
    return (
      <img
        src={`${API_URL}${teacher.photoUrl}`}
        alt={teacher.name}
        className="bk-teacher-photo"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <span
      className="bk-teacher-photo bk-teacher-initials"
      style={{ background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length] }}
    >
      {initials(teacher.name)}
    </span>
  );
}

interface Props {
  topics: Topic[];
  credits: number;
  onBooked: () => void;
}

export function BookingWizard({ topics, credits, onBooked }: Props) {
  const [step, setStep] = useState<Step>('teacher');

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(serverNow())));
  const [selectedSlots, setSelectedSlots] = useState<BookingSlot[]>([]);

  const [lessonTopics, setLessonTopics] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BookingResult[] | null>(null);

  useEffect(() => {
    (async () => {
      setTeachersLoading(true);
      try {
        const data = await apiFetch<{ teachers: Teacher[] }>('/api/teachers');
        setTeachers(data.teachers);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Öğretmenler yüklenemedi');
      } finally {
        setTeachersLoading(false);
      }
    })();
  }, []);

  const query = search.trim().toLocaleLowerCase('tr');
  const visibleTeachers = teachers
    .filter((t) => !favoritesOnly || t.isFavorite)
    .filter((t) => !query || t.name.toLocaleLowerCase('tr').includes(query))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  async function toggleFavorite(t: Teacher) {
    const next = !t.isFavorite;
    setFavoriteBusyId(t.id);
    setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, isFavorite: next } : x)));
    try {
      await apiFetch(`/api/teachers/${t.id}/favorite`, { method: next ? 'POST' : 'DELETE' });
    } catch (err) {
      setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, isFavorite: !next } : x)));
      setError(err instanceof Error ? err.message : 'Favori güncellenemedi');
    } finally {
      setFavoriteBusyId(null);
    }
  }

  async function pickTeacher(t: Teacher) {
    setError(null);
    setSelectedTeacher(t);
    setSelectedSlots([]);
    setWeekStart(startOfWeek(new Date(serverNow())));
    setStep('time');
    setSlotsLoading(true);
    try {
      const data = await apiFetch<{ slots: BookingSlot[] }>(
        `/api/slots/open?teacherId=${encodeURIComponent(t.id)}`
      );
      setSlots(data.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Müsait saatler yüklenemedi');
    } finally {
      setSlotsLoading(false);
    }
  }

  function toggleSlot(slot: BookingSlot) {
    setSelectedSlots((prev) =>
      prev.some((s) => s.id === slot.id) ? prev.filter((s) => s.id !== slot.id) : [...prev, slot]
    );
  }

  function backToTeachers() {
    setStep('teacher');
  }

  function backToTime() {
    setStep('time');
  }

  const selectedSlotsSorted = [...selectedSlots].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  function continueToTopic() {
    setLessonTopics((prev) => {
      const next = { ...prev };
      for (const s of selectedSlots) {
        if (!next[s.id]) next[s.id] = topics[0]?.id ?? '';
      }
      return next;
    });
    setStep('topic');
  }

  const canBook =
    selectedSlots.length > 0 &&
    selectedSlots.length <= credits &&
    selectedSlotsSorted.every((s) => !!lessonTopics[s.id]);

  async function confirmBooking() {
    if (selectedSlots.length === 0) return;
    setBusy(true);
    setError(null);
    const outcome: BookingResult[] = [];
    for (const s of selectedSlotsSorted) {
      try {
        await apiFetch('/api/bookings', {
          method: 'POST',
          body: { slotId: s.id, topicId: lessonTopics[s.id] },
        });
        outcome.push({ slot: s, ok: true });
      } catch (err) {
        outcome.push({ slot: s, ok: false, message: err instanceof Error ? err.message : 'Yapılamadı' });
      }
    }
    const bookedCount = outcome.filter((r) => r.ok).length;
    setTeachers((prev) =>
      prev.map((t) =>
        t.id === selectedTeacher?.id ? { ...t, openSlotCount: Math.max(0, t.openSlotCount - bookedCount) } : t
      )
    );
    setResults(outcome);
    setStep('done');
    setBusy(false);
    onBooked();
  }

  function startOver() {
    setStep('teacher');
    setSelectedTeacher(null);
    setSelectedSlots([]);
    setLessonTopics({});
    setResults(null);
    setError(null);
  }

  const isCurrentWeek = weekStart.getTime() <= startOfWeek(new Date(serverNow())).getTime();

  return (
    <div className="bk-wizard">
      {error && <div className="alert alert-error">{error}</div>}

      {/* ---------- Adım 1: öğretmen seç ---------- */}
      {step === 'teacher' && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Önce bir öğretmen seç, sonra müsait saatlerini görüp dersini ayırtırsın.
          </p>

          <div className="bk-toolbar">
            <label className="bk-search">
              <span className="bk-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="text"
                placeholder="Öğretmen ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`bk-filter-chip ${favoritesOnly ? 'is-on' : ''}`}
              onClick={() => setFavoritesOnly((v) => !v)}
              aria-pressed={favoritesOnly}
            >
              <span aria-hidden="true">★</span> Favorilerim
            </button>
          </div>

          {teachersLoading ? (
            <p className="muted">Yükleniyor…</p>
          ) : teachers.length === 0 ? (
            <p className="empty">Şu an kayıtlı öğretmen yok.</p>
          ) : visibleTeachers.length === 0 ? (
            <p className="empty">Aramanla eşleşen öğretmen yok.</p>
          ) : (
            <div className="bk-teacher-scroll">
              <div className="bk-teacher-grid">
                {visibleTeachers.map((t, i) => (
                  <div key={t.id} className="bk-teacher-card">
                    <button
                      type="button"
                      className={`bk-teacher-fav ${t.isFavorite ? 'is-on' : ''}`}
                      onClick={() => toggleFavorite(t)}
                      disabled={favoriteBusyId === t.id}
                      aria-label={t.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                      aria-pressed={t.isFavorite}
                    >
                      {t.isFavorite ? '★' : '☆'}
                    </button>
                    <button type="button" className="bk-teacher-main" onClick={() => pickTeacher(t)}>
                      <TeacherAvatar teacher={t} index={i} />
                      <span className="bk-teacher-name">{t.name}</span>
                      {t.headline && <span className="bk-teacher-headline">{t.headline}</span>}
                      <span className={`bk-teacher-badge ${t.openSlotCount === 0 ? 'is-empty' : ''}`}>
                        {t.openSlotCount === 0 ? 'Şu an uygun saat yok' : `${t.openSlotCount} uygun saat`}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- Adım 2: saat(ler) seç ---------- */}
      {step === 'time' && selectedTeacher && (
        <>
          <div className="bk-step-head">
            <button type="button" className="btn btn-ghost btn-sm" onClick={backToTeachers}>
              ‹ Öğretmenler
            </button>
            <span className="bk-step-title">{selectedTeacher.name}</span>
          </div>

          <div className="cal-toolbar">
            <h4 className="bk-week-label">{formatWeekRange(weekStart)}</h4>
            <div className="cal-nav">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setWeekStart((w) => addWeeks(w, -1))}
                disabled={isCurrentWeek}
              >
                ‹ Önceki
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setWeekStart(startOfWeek(new Date(serverNow())))}
              >
                Bu hafta
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
                Sonraki ›
              </button>
            </div>
          </div>

          {slotsLoading ? (
            <p className="muted">Yükleniyor…</p>
          ) : (
            <>
              <div className="bk-cal-scroll">
                <BookingCalendar
                  weekStart={weekStart}
                  slots={slots}
                  selectedSlotIds={selectedSlots.map((s) => s.id)}
                  onToggleSlot={toggleSlot}
                />
              </div>
              <div className="cal-legend">
                <span>
                  <i className="dot dot-open" /> Açık
                </span>
                <span>
                  <i className="dot dot-booked" /> Senin dersin
                </span>
                <span>
                  <i className="dot dot-past" /> Kapalı
                </span>
              </div>
            </>
          )}

          {selectedSlots.length > 0 && (
            <div className="bk-summary-bar">
              <div className="bk-summary-chips">
                {selectedSlotsSorted.map((s) => (
                  <span key={s.id} className="bk-chip">
                    {chipLabel(s)}
                    <button type="button" onClick={() => toggleSlot(s)} aria-label="Seçimi kaldır">
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="bk-summary-actions">
                <span className={`bk-credit-note ${selectedSlots.length > credits ? 'is-warn' : ''}`}>
                  {selectedSlots.length} ders seçildi · {credits} kredin var
                </span>
                <button className="btn btn-primary btn-sm" onClick={continueToTopic}>
                  Devam et →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- Adım 3: her ders için konu seç ve rezerve et ---------- */}
      {step === 'topic' && selectedTeacher && selectedSlots.length > 0 && (
        <>
          <div className="bk-step-head">
            <button type="button" className="btn btn-ghost btn-sm" onClick={backToTime}>
              ‹ Saatleri değiştir
            </button>
            <span className="bk-step-title">
              {selectedTeacher.name} · {selectedSlots.length} ders
            </span>
          </div>

          <p className="muted small">Her ders için bir konu seç.</p>
          {topics.length === 0 ? (
            <p className="empty">Konu bulunamadı.</p>
          ) : (
            <ul className="bk-lesson-list">
              {selectedSlotsSorted.map((s) => (
                <li key={s.id} className="bk-lesson-row">
                  <span className="bk-lesson-time">{formatTimeRange(s.startTime, s.endTime)}</span>
                  <select
                    value={lessonTopics[s.id] ?? ''}
                    onChange={(e) => setLessonTopics((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}

          {selectedSlots.length > credits && (
            <div className="alert alert-error">
              Kredin yetmiyor: {selectedSlots.length} ders için {selectedSlots.length} kredi gerekir, {credits}{' '}
              kredin var.
            </div>
          )}

          <button className="btn btn-primary" onClick={confirmBooking} disabled={!canBook || busy}>
            {busy ? 'Rezerve ediliyor…' : `Rezerve et (${selectedSlots.length} kredi)`}
          </button>
        </>
      )}

      {/* ---------- Bitti ---------- */}
      {step === 'done' && results && (
        <div className="bk-done">
          {results.every((r) => r.ok) ? (
            <>
              <span className="bk-done-icon">🎉</span>
              <h4>{results.length > 1 ? `${results.length} ders rezerve edildi!` : 'Ders rezerve edildi!'}</h4>
            </>
          ) : results.some((r) => r.ok) ? (
            <>
              <span className="bk-done-icon">⚠️</span>
              <h4>
                {results.filter((r) => r.ok).length}/{results.length} ders rezerve edildi
              </h4>
            </>
          ) : (
            <>
              <span className="bk-done-icon">😕</span>
              <h4>Rezervasyon yapılamadı</h4>
            </>
          )}
          {results.length > 1 && (
            <ul className="bk-result-list">
              {results.map((r) => (
                <li key={r.slot.id} className={r.ok ? 'is-ok' : 'is-fail'}>
                  <span>{chipLabel(r.slot)}</span>
                  <span>{r.ok ? '✓' : r.message}</span>
                </li>
              ))}
            </ul>
          )}
          {results.some((r) => r.ok) && (
            <p className="muted small">Başarılı derslerini "Yaklaşan derslerim" listesinde görebilirsin.</p>
          )}
          <button className="btn btn-primary btn-sm" onClick={startOver}>
            Yeni ders al
          </button>
        </div>
      )}
    </div>
  );
}
