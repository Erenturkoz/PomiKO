import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Giriş/Kayıt ekranları için ortak kabuk.
 * Ana sayfanın estetiğini taşır: solda marka paneli, sağda form kartı.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const [logoErr, setLogoErr] = useState(false);

  return (
    <div className="authx">
      {/* Sol: marka paneli */}
      <aside className="authx-side">
        <Link to="/" className="authx-brand">
          {logoErr ? (
            <span className="authx-brand-text">Pomiko</span>
          ) : (
            <img src="/pomiko-logo.png" alt="Pomiko" onError={() => setLogoErr(true)} />
          )}
        </Link>
        <div className="authx-side-body">
          <h2>Çocuklar için canlı Almanca dersleri</h2>
          <p>Oyunlaştırılmış, güvenli ve çocuğunuza özel bir öğrenme dünyası.</p>
          <ul className="authx-points">
            <li>
              <i style={{ background: '#4dabf7' }} /> Canlı ve interaktif dersler
            </li>
            <li>
              <i style={{ background: '#51cf66' }} /> Güvenli online sınıf
            </li>
            <li>
              <i style={{ background: '#e6b800' }} /> Düzenli gelişim takibi
            </li>
          </ul>
        </div>
        <span className="authx-blob authx-blob-1" />
        <span className="authx-blob authx-blob-2" />
      </aside>

      {/* Sağ: form */}
      <main className="authx-main">
        <div className={`authx-card ${wide ? 'authx-card-wide' : ''}`}>
          <Link to="/" className="authx-back">
            ‹ Ana sayfa
          </Link>
          <h1 className="authx-title">{title}</h1>
          <p className="authx-subtitle">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
