import { useEffect, useState } from 'react';
import { IcCheck, IcX } from './icons';

interface ToastItemProps {
  message: string;
  variant: 'ok' | 'error';
  onDone: () => void;
}

// Onay/hata bildirimi: sağ altta belirir, bir süre durur, kendiliğinden solup gider.
// Kalıcı bir yer kaplamaz — panel içeriğini itmez, en üst katmanda serbest durur.
function ToastItem({ message, variant, onDone }: ToastItemProps) {
  const [leaving, setLeaving] = useState(false);
  const duration = variant === 'error' ? 4500 : 2800;

  useEffect(() => {
    setLeaving(false);
    const leaveTimer = setTimeout(() => setLeaving(true), duration);
    const doneTimer = setTimeout(onDone, duration + 220);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, variant]);

  return (
    <div className={`toast toast-${variant} ${leaving ? 'toast-leaving' : ''}`}>
      {variant === 'ok' ? <IcCheck size={16} /> : <IcX size={16} />}
      <span>{message}</span>
    </div>
  );
}

interface ToastStackProps {
  ok?: string | null;
  error?: string | null;
  onCloseOk?: () => void;
  onCloseError?: () => void;
}

export function ToastStack({ ok, error, onCloseOk, onCloseError }: ToastStackProps) {
  if (!ok && !error) return null;
  return (
    <div className="toast-stack">
      {error && onCloseError && <ToastItem key={`error-${error}`} message={error} variant="error" onDone={onCloseError} />}
      {ok && onCloseOk && <ToastItem key={`ok-${ok}`} message={ok} variant="ok" onDone={onCloseOk} />}
    </div>
  );
}
