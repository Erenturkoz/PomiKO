import { useEffect, useState } from 'react';
import { apiFetch, API_URL } from '../api/client';
import { BookingCalendar, BookingSlot } from './BookingCalendar';
import { formatTimeRange } from '../lib/format';
import { now as serverNow } from '../lib/serverTime';
import { addWeeks, formatWeekRange, startOfWeek } from '../lib/week';

function IcSearch() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

interface Teacher {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  openSlotCount: number;
  isFavorite: boolean;
}

type MaterialStateName = 'EXEMPT' | 'COMPLETED' | 'SCHEDULED' | 'NEXT' | 'LOCKED';

interface Material {
  topicId: string;
  sequenceOrder: number;
  state: MaterialStateName;
  name: string;
  description: string | null;
  unitNumber: number;
  orderInUnit: number;
}

interface UnitSummary {
  unitNumber: number;
  total: number;
  completed: number;
}

interface MaterialsResponse {
  materials: Material[];
  units: UnitSummary[];
  currentUnit: UnitSummary | null;
  next: Material | null;
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
  credits: number;
  onBooked: () => void;
}

export function BookingWizard({ credits, onBooked }: Props) {
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

  // Müfredat ilerlemesi
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [currentUnit, setCurrentUnit] = useState<UnitSummary | null>(null);
  const [nextMaterial, setNextMaterial] = useState<Material | null>(null);
  // Seçili saat başına: varsayılan olarak sıradaki materyal otomatik atanır (zincirleme).
  // Bir saat "tekrar dersi"ne çevrilirse burada topicId tutulur ve o saat zincirden çıkar.
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, string>>({});
  const [reviewOpenSlots, setReviewOpenSlots] = useState<Set<string>>(new Set());

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

  async function loadMaterials() {
    setMaterialsLoading(true);
    try {
      const data = await apiFetch<MaterialsResponse>('/api/materials');
      setMaterials(data.materials);
      setCurrentUnit(data.currentUnit);
      setNextMaterial(data.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ders programı yüklenemedi');
    } finally {
      setMaterialsLoading(false);
    }
  }

  useEffect(() => {
    loadMaterials();
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
    setStep('topic');
  }

  // Zincirleme atama: NEXT + henüz kapsanmamış (LOCKED) materyaller sırayla, tekrara
  // çevrilmemiş her saate bir tane düşer — bir saat tekrara çevrilince zincirden çıkar,
  // sonraki saatler otomatik bir öne kayar.
  const chainMaterials = materials.filter((m) => m.state === 'NEXT' || m.state === 'LOCKED');
  const reviewCandidates = materials.filter((m) => m.state === 'EXEMPT' || m.state === 'COMPLETED');
  const lockedMaterials = materials.filter((m) => m.state === 'LOCKED');

  const progressionSlots = selectedSlotsSorted.filter((s) => !reviewOverrides[s.id]);
  const progressionAssignment = new Map<string, Material>();
  progressionSlots.forEach((s, i) => {
    if (chainMaterials[i]) progressionAssignment.set(s.id, chainMaterials[i]);
  });

  function topicIdFor(slot: BookingSlot): string | null {
    if (reviewOverrides[slot.id]) return reviewOverrides[slot.id];
    return progressionAssignment.get(slot.id)?.topicId ?? null;
  }

  function openReview(slotId: string) {
    setReviewOpenSlots((prev) => new Set(prev).add(slotId));
  }
  function closeReviewPanel(slotId: string) {
    setReviewOpenSlots((prev) => {
      const next = new Set(prev);
      next.delete(slotId);
      return next;
    });
  }
  function discardReview(slotId: string) {
    closeReviewPanel(slotId);
    setReviewOverrides((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }
  function setReviewChoice(slotId: string, topicId: string) {
    setReviewOverrides((prev) => ({ ...prev, [slotId]: topicId }));
  }

  const missingTopicCount = selectedSlotsSorted.filter((s) => !topicIdFor(s)).length;
  const canBook = selectedSlots.length > 0 && selectedSlots.length <= credits && missingTopicCount === 0;

  async function confirmBooking() {
    if (selectedSlots.length === 0) return;
    setBusy(true);
    setError(null);
    const outcome: BookingResult[] = [];
    for (const s of selectedSlotsSorted) {
      const topicId = topicIdFor(s);
      if (!topicId) {
        outcome.push({ slot: s, ok: false, message: 'Bu ders için materyal seçilmedi' });
        continue;
      }
      try {
        await apiFetch('/api/bookings', { method: 'POST', body: { slotId: s.id, topicId } });
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
    loadMaterials();
  }

  function startOver() {
    setStep('teacher');
    setSelectedTeacher(null);
    setSelectedSlots([]);
    setReviewOverrides({});
    setReviewOpenSlots(new Set());
    setResults(null);
    setError(null);
  }

  const isCurrentWeek = weekStart.getTime() <= startOfWeek(new Date(serverNow())).getTime();

  return (
    <div className="bk-wizard">
      {error && <div className="alert alert-error">{error}</div>}

      {/* ---------- Adım 1: öğretmen seç ---------- */}
      {step === 'teacher' && (
        <div className="bk-step-pane">
          <p className="muted small" style={{ marginTop: 0 }}>
            Önce bir öğretmen seç, sonra müsait saatlerini görüp dersini ayırtırsın.
          </p>

          <div className="bk-toolbar">
            <label className="bk-search">
              <span className="bk-search-icon" aria-hidden="true">
                <IcSearch />
              </span>
              <input
                type="text"
                placeholder="Öğretmen ara…"
                aria-label="Öğretmen ara"
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
        </div>
      )}

      {/* ---------- Adım 2: saat(ler) seç ---------- */}
      {step === 'time' && selectedTeacher && (
        <div className="bk-step-pane">
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
        </div>
      )}

      {/* ---------- Adım 3: müfredat — sıradaki ders / tekrar / yol haritası ---------- */}
      {step === 'topic' && selectedTeacher && selectedSlots.length > 0 && (
        <div className="bk-step-pane">
          <div className="bk-step-head">
            <button type="button" className="btn btn-ghost btn-sm" onClick={backToTime}>
              ‹ Saatleri değiştir
            </button>
            <span className="bk-step-title">
              {selectedTeacher.name} · {selectedSlots.length} ders
            </span>
          </div>

          {materialsLoading ? (
            <p className="muted">Yükleniyor…</p>
          ) : (
            <>
              {currentUnit && (
                <div className="bk-unit-progress">
                  <div className="bk-unit-progress-head">
                    <span>Ünite {currentUnit.unitNumber}</span>
                    <span>
                      {currentUnit.completed}/{currentUnit.total} tamamlandı
                    </span>
                  </div>
                  <div className="bk-progress-track">
                    <div
                      className="bk-progress-fill"
                      style={{ width: `${(currentUnit.completed / currentUnit.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 1. Büyük "Sıradaki dersiniz" kartı */}
              <div className={`bk-next-card ${!nextMaterial ? 'is-done' : ''}`}>
                <span className="bk-next-icon" aria-hidden="true">
                  {nextMaterial ? '🎯' : '🎉'}
                </span>
                <div className="bk-next-body">
                  {nextMaterial ? (
                    <>
                      <span className="bk-next-label">Sıradaki dersiniz</span>
                      <span className="bk-next-name">
                        Ünite {nextMaterial.unitNumber} – {nextMaterial.name}
                      </span>
                      {nextMaterial.description && <p className="bk-next-desc">{nextMaterial.description}</p>}
                    </>
                  ) : (
                    <>
                      <span className="bk-next-label">Tebrikler</span>
                      <span className="bk-next-name">Müfredattaki tüm dersleri tamamladın!</span>
                    </>
                  )}
                </div>
              </div>

              {/* Seçili her saat: varsayılan atama + isteğe bağlı tekrar dersi (2. katman) */}
              <ul className="bk-lesson-list">
                {selectedSlotsSorted.map((s, i) => {
                  const assigned = progressionAssignment.get(s.id) ?? null;
                  const reviewTopicId = reviewOverrides[s.id];
                  const reviewMaterial = reviewTopicId
                    ? (reviewCandidates.find((m) => m.topicId === reviewTopicId) ?? null)
                    : null;
                  const isOpen = reviewOpenSlots.has(s.id);

                  return (
                    <li key={s.id} className="bk-lesson-card">
                      <div className="bk-lesson-card-head">
                        <span className={`bk-lesson-badge ${reviewMaterial ? 'is-review' : ''}`}>{i + 1}</span>
                        <div className="bk-lesson-card-main">
                          <span className="bk-lesson-time">{formatTimeRange(s.startTime, s.endTime)}</span>
                          {!isOpen &&
                            (reviewMaterial ? (
                              <span className="bk-lesson-assigned is-review">
                                <span className="topic-pill">Tekrar</span> Ünite {reviewMaterial.unitNumber} –{' '}
                                {reviewMaterial.name}
                              </span>
                            ) : assigned ? (
                              <span className="bk-lesson-assigned">
                                Ünite {assigned.unitNumber} – {assigned.name}
                              </span>
                            ) : (
                              <span className="bk-lesson-assigned is-empty">
                                {reviewCandidates.length > 0
                                  ? 'Müfredatın sonuna geldin — tekrar dersi seç'
                                  : 'Müfredatın sonuna geldin — konu ataması için bizimle iletişime geç'}
                              </span>
                            ))}
                        </div>
                        {!isOpen && reviewCandidates.length > 0 && (
                          <button
                            type="button"
                            className="bk-lesson-review-chip"
                            onClick={() => openReview(s.id)}
                          >
                            🔄 {reviewMaterial ? 'Değiştir' : 'Tekrar'}
                          </button>
                        )}
                      </div>

                      {isOpen && (
                        <div className="bk-lesson-review-panel">
                          <select
                            value={reviewTopicId ?? ''}
                            onChange={(e) => setReviewChoice(s.id, e.target.value)}
                          >
                            <option value="">Konu seç…</option>
                            {reviewCandidates.map((m) => (
                              <option key={m.topicId} value={m.topicId}>
                                Ünite {m.unitNumber} – {m.name}
                              </option>
                            ))}
                          </select>
                          {reviewMaterial && (
                            <p className="bk-review-note">
                              Bu ders tekrar amaçlıdır ve ilerlemenizi değiştirmez. Sıradaki dersiniz:{' '}
                              {assigned ? `Ünite ${assigned.unitNumber} – ${assigned.name}` : '—'}.
                            </p>
                          )}
                          <div className="bk-lesson-review-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={!reviewTopicId}
                              onClick={() => closeReviewPanel(s.id)}
                            >
                              Tekrar dersi al
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => discardReview(s.id)}
                            >
                              Sıradakine geç
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* 3. LOCKED yol haritası — hiç gizlenmez */}
              {lockedMaterials.length > 0 && (
                <details className="bk-roadmap" open>
                  <summary className="bk-roadmap-title">
                    Yol haritan ({lockedMaterials.length} materyal daha)
                  </summary>
                  <ul className="bk-roadmap-list">
                    {lockedMaterials.map((m) => {
                      const idx = materials.findIndex((x) => x.topicId === m.topicId);
                      const prev = idx > 0 ? materials[idx - 1] : null;
                      return (
                        <li key={m.topicId} className="bk-roadmap-item">
                          <span className="bk-roadmap-lock" aria-hidden="true">
                            🔒
                          </span>
                          <div>
                            <span className="bk-roadmap-name">
                              Ünite {m.unitNumber} – {m.name}
                            </span>
                            {prev && (
                              <span className="bk-roadmap-hint">
                                Bu derse geçmek için önce {prev.name} tamamlanmalı
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </>
          )}

          {selectedSlots.length > credits && (
            <div className="alert alert-error">
              Kredin yetmiyor: {selectedSlots.length} ders için {selectedSlots.length} kredi gerekir, {credits}{' '}
              kredin var.
            </div>
          )}
          {selectedSlots.length > 0 && selectedSlots.length <= credits && missingTopicCount > 0 && (
            <div className="alert alert-error">
              {missingTopicCount} ders için konu seçilmedi. Rezerve etmeden önce yukarıdan her ders için bir
              konu seç.
            </div>
          )}

          <button className="btn btn-primary" onClick={confirmBooking} disabled={!canBook || busy}>
            {busy ? 'Rezerve ediliyor…' : `Rezerve et (${selectedSlots.length} kredi)`}
          </button>
        </div>
      )}

      {/* ---------- Bitti ---------- */}
      {step === 'done' && results && (
        <div className="bk-done bk-step-pane">
          {results.every((r) => r.ok) ? (
            <>
              <span className="bk-done-icon" aria-hidden="true">🎉</span>
              <h4>{results.length > 1 ? `${results.length} ders rezerve edildi!` : 'Ders rezerve edildi!'}</h4>
            </>
          ) : results.some((r) => r.ok) ? (
            <>
              <span className="bk-done-icon" aria-hidden="true">⚠️</span>
              <h4>
                {results.filter((r) => r.ok).length}/{results.length} ders rezerve edildi
              </h4>
            </>
          ) : (
            <>
              <span className="bk-done-icon" aria-hidden="true">😕</span>
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
