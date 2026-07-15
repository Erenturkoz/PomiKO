import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { Layout } from '../components/Layout';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

interface Child {
  id: string;
  name: string;
  age: number | null;
  credits: number;
}

const TOPUP_OPTIONS = [1, 5, 10];

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AccountHome() {
  const navigate = useNavigate();
  const { selectProfile } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupChild, setTopupChild] = useState<Child | null>(null);
  const [entering, setEntering] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ children: Child[] }>('/api/children');
      setChildren(data.children);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function enterProfile(childId: string) {
    setEntering(childId);
    setError(null);
    try {
      await selectProfile(childId);
      navigate('/student');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile geçilemedi');
      setEntering(null);
    }
  }

  async function topup(childId: string, amount: number) {
    setError(null);
    try {
      await apiFetch(`/api/children/${childId}/credits`, { method: 'POST', body: { amount } });
      setTopupChild(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kredi yüklenemedi');
    }
  }

  return (
    <Layout>
      <div className="page-head">
        <h1>Profil seç</h1>
        <p className="muted">
          Girmek istediğin çocuğun profilini seç. Kredi yüklemesini buradan (hesap modunda) yaparsın.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="muted">Yükleniyor…</p>
      ) : children.length === 0 ? (
        <p className="empty">Bu hesaba bağlı çocuk profili yok. Yeni çocuk için bizimle iletişime geç.</p>
      ) : (
        <div className="profile-grid">
          {children.map((c) => (
            <div key={c.id} className="profile-card">
              <button
                className="profile-avatar"
                onClick={() => enterProfile(c.id)}
                disabled={entering !== null}
                title={`${c.name} profiline gir`}
              >
                {initials(c.name)}
              </button>
              <div className="profile-name">{c.name}</div>
              <div className="profile-meta">
                {c.age != null ? `${c.age} yaş · ` : ''}
                <span className="credit-badge">{c.credits} kredi</span>
              </div>
              <div className="profile-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => enterProfile(c.id)}
                  disabled={entering !== null}
                >
                  {entering === c.id ? 'Giriliyor…' : 'Profile gir'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setTopupChild(c)}>
                  Kredi yükle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 20 }}>
        Daha fazla çocuk profili için bizimle iletişime geç.
      </p>

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
    </Layout>
  );
}
