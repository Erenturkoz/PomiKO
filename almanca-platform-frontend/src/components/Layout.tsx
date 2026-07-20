import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const roleLabel: Record<string, string> = {
  PARENT: 'Veli',
  TEACHER: 'Öğretmen',
  ADMIN: 'Yönetici',
};

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, session, logout } = useAuth();
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          {logoError ? (
            <span className="brand-text">Pomiko</span>
          ) : (
            <img
              src="/pomiko-logo.png"
              alt="Pomiko"
              className="topbar-logo"
              onError={() => setLogoError(true)}
            />
          )}
          {user && session.mode === 'profile' && session.child ? (
            <span className="role-pill">{session.child.name}</span>
          ) : (
            user && <span className="role-pill">{roleLabel[user.role]}</span>
          )}
        </div>
        {user && (
          <div className="topbar-user">
            {user.role === 'ADMIN' && (
              <Link className="btn btn-ghost btn-sm" to="/room/test">
                Test dersi
              </Link>
            )}
            <span>{user.name}</span>
            <button className="btn btn-ghost" onClick={() => logout()}>
              Çıkış yap
            </button>
          </div>
        )}
      </header>
      <main className={`content ${wide ? 'content-wide' : ''}`}>{children}</main>
    </div>
  );
}
