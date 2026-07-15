import { joinState, humanCountdown, opensAtIso } from '../lib/format';

interface Props {
  bookingId: string;
  start: string;
  end: string;
  observe?: boolean; // admin gizli izleme: her zaman açık
  onJoin: (bookingId: string) => void;
}

export function LessonJoin({ bookingId, start, end, observe = false, onJoin }: Props) {
  const state = observe ? 'open' : joinState(start, end);

  if (state === 'ended') {
    return <span className="badge">Bitti</span>;
  }
  if (state === 'open') {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => onJoin(bookingId)}>
        {observe ? 'Gizli izle' : 'Ders ekranına gir'}
      </button>
    );
  }
  // future
  return (
    <span className="join-soon" title="Ders ekranı başlangıçtan 10 dk önce açılır">
      {humanCountdown(opensAtIso(start))} sonra açılır
    </span>
  );
}
