import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { Layout } from '../components/Layout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { LessonJoin } from '../components/LessonJoin';
import { formatTimeRange, joinState, minutesUntil } from '../lib/format';

interface Child {
  id: string;
  name: string;
  age: number | null;
  credits: number;
  createdAt: string;
  hasConsent: boolean;
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

const TOPUP_OPTIONS = [1, 5, 10];

export function ParentDashboard() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [openSlots, setOpenSlots] = useState<OpenSlot[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedChild, setSelectedChild] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [topupChild, setTopupChild] = useState<Child | null>(null);

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [childRes, slotRes, topicRes, bookingRes] = await Promise.all([
        apiFetch<{ children: Child[] }>('/api/children'),
        apiFetch<{ slots: OpenSlot[] }>('/api/slots/open'),
        apiFetch<{ topics: Topic[] }>('/api/topics'),
        apiFetch<{ bookings: Booking[] }>('/api/bookings'),
      ]);
      setChildren(childRes.children);
      setOpenSlots(slotRes.slots);
      setTopics(topicRes.topics);
      setBookings(bookingRes.bookings);
      setSelectedChild((prev) => prev || childRes.children[0]?.id || '');
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

  async function topup(childId: string, amount: number) {
    setError(null);
    try {
      await apiFetch(`/api/children/${childId}/credits`, {
        method: 'POST',
        body: { amount },
      });
      setTopupChild(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kredi yüklenemedi');
    }
  }

  async function book(slotId: string) {
    if (!selectedChild || !selectedTopic) return;
    setError(null);
    try {
      await apiFetch('/api/bookings', {
        method: 'POST',
        body: { slotId, childProfileId: selectedChild, topicId: selectedTopic },
      });
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

  const selectedChildObj = children.find((c) => c.id === selectedChild);
  const canBook = !!selectedChildObj && selectedChildObj.credits >= 1 && !!selectedTopic;

  const activeBookings = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
  const upcoming = activeBookings.filter((b) => joinState(b.slot.startTime, b.slot.endTime) !== 'ended');
  const nextLesson = upcoming[0];

  // 30 dk kuralı: başlangıca 30 dakikadan az kaldıysa iptal edilemez
  function canCancel(startIso: string) {
    return minutesUntil(startIso) > 30;
  }

  return (
    <Layout>
      <div className="page-head">
        <h1>Veli paneli</h1>
        <p className="muted">
          Her çocuğun kendi profili ve kredisi var. Ders için 1 kredi gerekir. (Çocuk profillerine ayrı
          giriş ve profil seçimi bir sonraki adımda gelecek.)
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {nextLesson && (
        <section className="next-lesson">
          <div>
            <span className="next-lesson-label">Sıradaki ders</span>
            <div className="next-lesson-time">
              {formatTimeRange(nextLesson.slot.startTime, nextLesson.slot.endTime)}
            </div>
            <div className="muted small">
              {nextLesson.child.name}
              {nextLesson.topic ? ` · ${nextLesson.topic.name}` : ''} · Öğretmen:{' '}
              {nextLesson.teacher.user.name}
            </div>
          </div>
          <LessonJoin
            bookingId={nextLesson.id}
            start={nextLesson.slot.startTime}
            end={nextLesson.slot.endTime}
            onJoin={(id) => navigate(`/room/${id}`)}
          />
        </section>
      )}

      <section className="card">
        <div className="card-head-row">
          <h2 className="card-title" style={{ margin: 0 }}>
            Çocuk profilleri
          </h2>
          <span className="muted small">Yeni çocuk için bizimle iletişime geç.</span>
        </div>
        {loading ? (
          <p className="muted">Yükleniyor…</p>
        ) : children.length === 0 ? (
          <p className="empty">Bu hesaba bağlı çocuk profili yok.</p>
        ) : (
          <ul className="list">
            {children.map((child) => (
              <li key={child.id} className="list-row">
                <div>
                  <strong>{child.name}</strong>
                  {child.age != null && <span className="muted"> · {child.age} yaş</span>}
                  <div className="credit-line">
                    <span className="credit-badge">{child.credits} kredi</span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTopupChild(child)}>
                  Kredi yükle
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Ders al</h2>
        {children.length === 0 ? (
          <p className="empty">Rezervasyon için önce bir çocuk profili ekle.</p>
        ) : (
          <>
            <div className="booking-bar">
              <label className="field">
                <span>Hangi çocuk için?</span>
                <select value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)}>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.credits} kredi)
                    </option>
                  ))}
                </select>
              </label>
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

            {selectedChildObj && selectedChildObj.credits < 1 && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {selectedChildObj.name} için kredi yok. Rezervasyon için önce kredi yükle.
              </div>
            )}
            {topics.length === 0 && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                Henüz ders konusu tanımlanmamış.
              </div>
            )}

            {openSlots.length === 0 ? (
              <p className="empty">Şu an açık ders saati yok.</p>
            ) : (
              <ul className="list">
                {openSlots.map((slot) => (
                  <li key={slot.id} className="list-row">
                    <div>
                      <div>{formatTimeRange(slot.startTime, slot.endTime)}</div>
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
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Derslerim</h2>
        {activeBookings.length === 0 ? (
          <p className="empty">Henüz rezervasyonun yok.</p>
        ) : (
          <ul className="list">
            {activeBookings.map((b) => (
              <li key={b.id} className="list-row">
                <div>
                  <div>{formatTimeRange(b.slot.startTime, b.slot.endTime)}</div>
                  <div className="muted small">
                    {b.child.name}
                    {b.topic ? ` · ${b.topic.name}` : ''} · Öğretmen: {b.teacher.user.name}
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
                      <span className="join-soon" title="Başlangıca 30 dakikadan az kaldı">
                        iptal edilemez
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kredi yükleme (şimdilik sahte — ödeme yok) */}
      <Modal
        open={topupChild !== null}
        title={topupChild ? `${topupChild.name} · kredi yükle` : 'Kredi yükle'}
        onClose={() => setTopupChild(null)}
      >
        <p className="muted small" style={{ marginTop: 0 }}>
          Şu an ödeme altyapısı yok; seçtiğin kadar kredi doğrudan yüklenir. 1 kredi = 1 ders.
        </p>
        <div className="topup-options">
          {TOPUP_OPTIONS.map((amt) => (
            <button
              key={amt}
              className="btn btn-primary"
              onClick={() => topupChild && topup(topupChild.id, amt)}
            >
              +{amt} kredi
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingCancelId !== null}
        title="Dersi iptal et"
        message="Bu ders rezervasyonunu iptal etmek istediğine emin misin? Kredin iade edilir ve saat tekrar açılır."
        confirmLabel="Evet, iptal et"
        cancelLabel="Vazgeç"
        danger
        onConfirm={() => pendingCancelId && cancelBooking(pendingCancelId)}
        onCancel={() => setPendingCancelId(null)}
      />
    </Layout>
  );
}
