import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

interface Child {
  id: string;
  name: string;
  age: number | null;
  credits: number;
}

const TOPUP_OPTIONS = [1, 5, 10];
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4dabf7, #748ffc)',
  'linear-gradient(135deg, #51cf66, #38d9a9)',
  'linear-gradient(135deg, #f783ac, #da77f2)',
  'linear-gradient(135deg, #ffa94d, #ff8787)',
];

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
  const { user, selectProfile, logout } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupChild, setTopupChild] = useState<Child | null>(null);
  const [entering, setEntering] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState(false);

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
    if (entering) return;
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
    <div className="ph-screen">
      {/* Üst şerit: logo + veli + çıkış */}
      <header className="ph-top">
        {logoErr ? (
          <span className="s-brand-text">Pomiko</span>
        ) : (
          <img src="/pomiko-logo.png" alt="Pomiko" className="ph-logo" onError={() => setLogoErr(true)} />
        )}
        <div className="ph-top-right">
          <span className="muted small">{user?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
            Çıkış yap
          </button>
        </div>
      </header>

      {/* Orta: profil seçimi */}
      <main className="ph-center">
        <h1 className="ph-title">Kim ders çalışacak?</h1>
        <p className="ph-sub">Profiline dokun ve öğrenmeye başla.</p>

        {error && <div className="alert alert-error ph-alert">{error}</div>}

        {loading ? (
          <p className="muted">Yükleniyor…</p>
        ) : children.length === 0 ? (
          <div className="ph-empty">
            <p className="empty">Bu hesaba bağlı çocuk profili yok. Yeni çocuk için bizimle iletişime geç.</p>
            <Link to="/#faq" className="btn btn-ghost btn-sm">
              Sık sorulan sorulara bak
            </Link>
          </div>
        ) : (
          <div className="ph-cards">
            {children.map((c, i) => (
              <div
                key={c.id}
                className={`ph-card ${entering === c.id ? 'is-entering' : ''} ${
                  entering !== null && entering !== c.id ? 'is-dimmed' : ''
                }`}
              >
                <button
                  className="ph-avatar"
                  style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
                  onClick={() => enterProfile(c.id)}
                  disabled={entering !== null}
                  aria-label={`${c.name} profiline gir`}
                >
                  <span className="ph-initials">{initials(c.name)}</span>
                  <span className="ph-enter-hint">{entering === c.id ? '…' : '▶'}</span>
                </button>
                <div className="ph-name">{c.name}</div>
                {c.age != null && <div className="ph-age">{c.age} yaş</div>}
                <button
                  className="ph-credit"
                  onClick={() => setTopupChild(c)}
                  title="Kredi yükle"
                  aria-label={`${c.name} için kredi yükle`}
                >
                  ★ {c.credits} kredi <span className="ph-credit-plus">+</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="ph-foot muted small">Daha fazla çocuk profili için bizimle iletişime geç.</p>
      </main>

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
    </div>
  );
}
