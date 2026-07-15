import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      navigate(`/${user.role.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Tekrar hoş geldin"
      subtitle="Çocuğunun öğrenme yolculuğuna kaldığın yerden devam et."
    >
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
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
          <span>Parola</span>
          <div className="auth-pass">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
        </label>

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>

      <p className="auth-alt">
        Hesabın yok mu? <Link to="/register">Ücretsiz kayıt ol</Link>
      </p>
    </AuthShell>
  );
}
