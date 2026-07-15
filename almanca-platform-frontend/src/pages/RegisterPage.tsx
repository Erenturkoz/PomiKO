import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface ChildRow {
  name: string;
  age: string;
  birthDate: string;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [kvkk, setKvkk] = useState(false);
  const [children, setChildren] = useState<ChildRow[]>([{ name: '', age: '', birthDate: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateChild(i: number, patch: Partial<ChildRow>) {
    setChildren((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addChild() {
    setChildren((prev) => (prev.length >= 2 ? prev : [...prev, { name: '', age: '', birthDate: '' }]));
  }
  function removeChild(i: number) {
    setChildren((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN 4 haneli rakam olmalı');
      return;
    }
    if (!kvkk) {
      setError('KVKK onayını işaretlemelisin');
      return;
    }
    const parsedChildren = children.map((c) => ({
      name: c.name.trim(),
      age: Number(c.age),
      birthDate: c.birthDate ? new Date(c.birthDate).toISOString() : undefined,
    }));
    for (const c of parsedChildren) {
      if (c.name.length < 2) {
        setError('Her çocuk için geçerli bir ad gir');
        return;
      }
      if (!Number.isInteger(c.age) || c.age < 3 || c.age > 18) {
        setError('Her çocuk için 3–18 arası bir yaş gir');
        return;
      }
    }

    setBusy(true);
    try {
      const user = await register({
        name,
        email,
        password,
        pin,
        kvkkConsent: kvkk,
        children: parsedChildren,
      });
      navigate(`/${user.role.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card-wide">
        <h1 className="auth-title">Veli kaydı</h1>
        <p className="auth-subtitle">Hesabı sen yönetirsin; her çocuğun kendi profili ve kredisi olur.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Ad soyad</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="field">
            <span>E-posta</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Parola</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <small className="hint">En az 8 karakter.</small>
          </label>
          <label className="field">
            <span>Veli PIN'i (4 haneli)</span>
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              required
            />
            <small className="hint">Kredi yükleme ve hesap ayarlarına geçişi korur.</small>
          </label>

          <div className="reg-children">
            <div className="reg-children-head">
              <span>Çocuk profilleri</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addChild}
                disabled={children.length >= 2}
              >
                + Çocuk ekle
              </button>
            </div>
            <p className="muted small" style={{ margin: '0 0 8px' }}>
              En fazla 2 çocuk ekleyebilirsin. Daha fazlası için bizimle iletişime geç.
            </p>
            {children.map((c, i) => (
              <div key={i} className="reg-child-row">
                <label className="field">
                  <span>Ad</span>
                  <input value={c.name} onChange={(e) => updateChild(i, { name: e.target.value })} required />
                </label>
                <label className="field field-sm">
                  <span>Yaş</span>
                  <input
                    inputMode="numeric"
                    value={c.age}
                    onChange={(e) => updateChild(i, { age: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                    required
                  />
                </label>
                <label className="field">
                  <span>Doğum tarihi (isteğe bağlı)</span>
                  <input
                    type="date"
                    value={c.birthDate}
                    onChange={(e) => updateChild(i, { birthDate: e.target.value })}
                  />
                </label>
                {children.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm reg-child-remove"
                    onClick={() => removeChild(i)}
                    aria-label="Kaldır"
                  >
                    Kaldır
                  </button>
                )}
              </div>
            ))}
          </div>

          <label className="checkbox-field">
            <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
            <span>
              Çocuğuma ait kişisel verilerin işlenmesine ilişkin KVKK aydınlatma metnini okudum ve onaylıyorum.
            </span>
          </label>

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Hesap oluştur'}
          </button>
        </form>

        <p className="auth-alt">
          Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
        </p>
      </div>
    </div>
  );
}
