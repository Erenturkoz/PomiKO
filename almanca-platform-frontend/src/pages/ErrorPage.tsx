import { useNavigate, Link } from 'react-router-dom';

interface Props {
  title?: string;
  message?: string;
  emoji?: string;
  /** Sadece ErrorBoundary'nin çöken durumu temizlemesi için — normal 404'te gerekmez. */
  onReset?: () => void;
}

// Herhangi bir hata durumunda (bilinmeyen sayfa, beklenmedik çökme) gösterilen tek,
// tatlı ve sakin karşılama ekranı. Panik yaratmak yerine "biz buradayız, birlikte
// çözeriz" hissi vermeyi hedefler — çocuklar için bir platform olduğundan özellikle önemli.
export function ErrorPage({
  title = 'Aaa, bir şeyler ters gitti',
  message = 'Merak etme, bu senin hatan değil. Sayfa beklenmedik bir şekilde çalışmadı. Geri dönüp tekrar deneyebilirsin.',
  emoji = '🧸',
  onReset,
}: Props) {
  const navigate = useNavigate();

  function handleBack() {
    onReset?.();
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  return (
    <div className="lp errpg">
      <div className="errpg-card">
        <span className="errpg-blob errpg-blob-1" />
        <span className="errpg-blob errpg-blob-2" />
        <div className="errpg-content">
          <span className="errpg-emoji" aria-hidden="true">
            {emoji}
          </span>
          <h1>{title}</h1>
          <p>{message}</p>
          <div className="errpg-actions">
            <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={handleBack}>
              ‹ Geri dön
            </button>
            <Link to="/" className="lp-link">
              Ana sayfaya git
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
