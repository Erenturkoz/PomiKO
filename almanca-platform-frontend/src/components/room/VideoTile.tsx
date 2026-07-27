import { useEffect, useRef } from 'react';
import type { DailyParticipant } from '@daily-co/daily-js';

interface Props {
  participant?: DailyParticipant | null;
  /** Katılımcı henüz gelmediğinde gösterilecek rol etiketi (ör. "Öğretmen"). */
  label: string;
  mirror?: boolean;
}

// Bir katılımcının kamera akışını <video>'ya bağlar (Daily call object, ham track)
export function VideoTile({ participant, label, mirror = false }: Props) {
  // Token'daki user_name gerçek adı taşır (öğretmen adı / çocuk adı). Katılımcı
  // varsa adını, yoksa rol etiketini göster.
  const displayName = participant?.user_name?.trim() || label;
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoState = participant?.tracks?.video?.state;
  const track = participant?.tracks?.video?.persistentTrack ?? null;
  const on = videoState === 'playable' && !!track;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (on && track) {
      el.srcObject = new MediaStream([track]);
    } else {
      el.srcObject = null;
    }
  }, [on, track]);

  return (
    <div className="cam-tile">
      {on ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={mirror ? 'cam-video mirror' : 'cam-video'}
        />
      ) : (
        <div className="cam-off">{participant ? 'Kamera kapalı' : 'Bekleniyor…'}</div>
      )}
      <span className="cam-name">{displayName}</span>
    </div>
  );
}

// Uzak katılımcının sesini çalar (yerel ses çalınmaz — yankı olmasın)
export function ParticipantAudio({ participant }: { participant: DailyParticipant }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const state = participant?.tracks?.audio?.state;
  const track = participant?.tracks?.audio?.persistentTrack ?? null;
  const on = state === 'playable' && !!track;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (on && track) {
      el.srcObject = new MediaStream([track]);
    } else {
      el.srcObject = null;
    }
  }, [on, track]);

  return <audio ref={audioRef} autoPlay playsInline />;
}
