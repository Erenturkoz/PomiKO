import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';

interface ChildRow {
  name: string;
  age: string;
  birthDate: string;
}

/** Basit parola gücü: uzunluk + çeşitlilik (0-4) */
function passStrength(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-zğüşöçı]/i.test(p) && /\d/.test(p)) s++;
  if (/[^a-z0-9ğüşöçı]/i.test(p)) s++;
  return s;
}

const STRENGTH_LABEL = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [kvkk, setKvkk] = useState(false);
  const [children, setChildren] = useState<ChildRow[]>([{ name: '', age: '', birthDate: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const strength = passStrength(password);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

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

    const cleanPhone = phone.replace(/[\s()-]/g, '');
    if (!/^(\+90|0)?5\d{9}$/.test(cleanPhone)) {
      setError('Geçerli bir cep telefonu gir (örn. 05xx xxx xx xx)');
      return;
    }
    if (password.length < 8) {
      setError('Parola en az 8 karakter olmalı');
      return;
    }
    if (/^\d+$/.test(password)) {
      setError('Parola yalnızca rakamlardan oluşamaz');
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
        name: name.trim(),
        email: email.trim(),
        phone: cleanPhone,
        password,
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
    <AuthShell
      wide
      title="Veli hesabı oluştur"
      subtitle="Hesabı sen yönetirsin; her çocuğun kendi profili ve kredisi olur."
    >
      {error && (
        <div className="auth-alert" ref={errorRef}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="auth-field">
          <span>Ad soyad</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            minLength={2}
          />
        </label>

        <label className="auth-field">
          <span>E-posta</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@eposta.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-field">
          <span>Cep telefonu</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xx xxx xx xx"
            autoComplete="tel"
            required
          />
          <small className="auth-hint">Ders hatırlatmaları ve iletişim için kullanılır.</small>
        </label>

        <label className="auth-field">
          <span>Parola</span>
          <div className="auth-pass">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              className="auth-pass-toggle"
              onClick={() => setShowPass((s) => !s)}
              aria-label={showPass ? 'Parolayı gizle' : 'Parolayı göster'}
            >
              {showPass ? 'Gizle' : 'Göster'}
            </button>
          </div>
          <div className={`auth-strength s${strength}`} aria-hidden>
            <i /><i /><i /><i />
          </div>
          {password.length > 0 && (
            <span className="sr-only">Parola gücü: {STRENGTH_LABEL[strength]}</span>
          )}
          <small className="auth-hint">
            En az 8 karakter; harf ve rakam karışımı öneririz. Çocuk profillerinden hesaba dönüşte de
            bu parola sorulur.
          </small>
        </label>

        <div className="authx-children">
          <div className="authx-children-head">
            <span>Çocuk profilleri</span>
            <button type="button" className="authx-add" onClick={addChild} disabled={children.length >= 2}>
              + Çocuk ekle
            </button>
          </div>
          <small className="auth-hint">
            En fazla 2 çocuk ekleyebilirsin; daha fazlası için bizimle iletişime geç.
          </small>
          {children.map((c, i) => (
            <div key={i} className="authx-child-row">
              <label className="auth-field">
                <span>Ad</span>
                <input value={c.name} onChange={(e) => updateChild(i, { name: e.target.value })} required />
              </label>
              <label className="auth-field sm">
                <span>Yaş</span>
                <input
                  inputMode="numeric"
                  value={c.age}
                  onChange={(e) => updateChild(i, { age: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                  required
                />
              </label>
              <label className="auth-field">
                <span>Doğum tarihi (isteğe bağlı)</span>
                <input
                  type="date"
                  value={c.birthDate}
                  onChange={(e) => updateChild(i, { birthDate: e.target.value })}
                />
              </label>
              {children.length > 1 && (
                <button type="button" className="authx-remove" onClick={() => removeChild(i)}>
                  Kaldır
                </button>
              )}
            </div>
          ))}
        </div>

        <label className="auth-consent">
          <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
          <span>
            Çocuğuma ait kişisel verilerin işlenmesine ilişkin KVKK aydınlatma metnini okudum ve
            onaylıyorum.
          </span>
        </label>

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Hesap oluşturuluyor…' : 'Hesap oluştur'}
        </button>
      </form>

      <p className="auth-alt">
        Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
      </p>
    </AuthShell>
  );
}
