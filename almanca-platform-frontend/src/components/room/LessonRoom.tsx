import { useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { VideoTile, ParticipantAudio } from './VideoTile';
import { MaterialStage } from './MaterialStage';
import { Toolbox } from './Toolbox';
import { Tool } from './drawTypes';

interface Material {
  name: string;
  fileUrl: string;
  filename: string | null;
}


/* --- Kontrol ikonları (SVG) --- */
const IcMic = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21" />
    {off && <line x1="4" y1="4" x2="20" y2="20" stroke="#fff" strokeWidth="2.4" />}
  </svg>
);
const IcCam = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="12" height="12" rx="2.5" />
    <path d="M15 10.5 21 7v10l-6-3.5" />
    {off && <line x1="3" y1="4" x2="21" y2="20" stroke="#fff" strokeWidth="2.4" />}
  </svg>
);
const IcLeave = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 9c-2.9 0-5.6.6-8 1.7-.6.3-1 .9-1 1.6v2.3c0 .8.7 1.4 1.5 1.3l3.6-.5c.7-.1 1.2-.6 1.3-1.3l.2-1.5c.8-.2 1.6-.3 2.4-.3s1.6.1 2.4.3l.2 1.5c.1.7.6 1.2 1.3 1.3l3.6.5c.8.1 1.5-.5 1.5-1.3v-2.3c0-.7-.4-1.3-1-1.6C17.6 9.6 14.9 9 12 9z" />
  </svg>
);

interface Props {
  co: DailyCall;
  role: 'TEACHER' | 'PARENT' | 'ADMIN';
  participants: Record<string, DailyParticipant>;
  material: Material | null;
  micOn: boolean;
  camOn: boolean;
  remainingMs: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
}

export function LessonRoom({
  co,
  role,
  participants,
  material,
  micOn,
  camOn,
  remainingMs,
  onToggleMic,
  onToggleCam,
  onLeave,
}: Props) {
  const all = Object.values(participants);
  // Rol token'a user_id olarak gömülü → öğretmen hep üstte, öğrenci hep altta
  const teacher = all.find((p) => p.user_id === 'TEACHER') ?? null;
  const student = all.find((p) => p.user_id === 'PARENT') ?? null;
  const remotes = all.filter((p) => !p.local);
  const isObserver = role === 'ADMIN';
  const isTeacher = role === 'TEACHER';

  const [tool, setTool] = useState<Tool>('none');
  const [color, setColor] = useState('#e03131');
  const [size, setSize] = useState(4);
  const [clearNonce, setClearNonce] = useState(0);

  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec <= 300; // son 5 dakika

  return (
    <div className="room-stage">
      {/* Sol üst: kameralar + kontroller */}
      <div className="rs-left">
        <VideoTile participant={teacher} label="Öğretmen" mirror={!!teacher?.local} />
        <VideoTile participant={student} label="Öğrenci" mirror={!!student?.local} />
        {!isObserver && (
          <div className="rs-controls">
            <button
              className={`ctl-btn ${micOn ? '' : 'is-off'}`}
              onClick={onToggleMic}
              title={micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
              aria-label={micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
            >
              <IcMic off={!micOn} />
            </button>
            <button
              className={`ctl-btn ${camOn ? '' : 'is-off'}`}
              onClick={onToggleCam}
              title={camOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
              aria-label={camOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
            >
              <IcCam off={!camOn} />
            </button>
          </div>
        )}
      </div>

      {/* Orta: ekranı kaplayan materyal + çizim */}
      <div className="rs-center">
        {material ? (
          <MaterialStage
            co={co}
            fileUrl={material.fileUrl}
            isTeacher={isTeacher}
            canDraw={!isObserver}
            tool={tool}
            color={color}
            size={size}
            clearNonce={clearNonce}
          />
        ) : (
          <div className="pdf-msg">Bu ders için materyal tanımlanmamış.</div>
        )}
      </div>

      {/* Sağ: sayaç + araç kutusu */}
      <div className="rs-right">
        <button className="ctl-btn ctl-leave" onClick={onLeave} title="Dersten ayrıl" aria-label="Dersten ayrıl">
          <IcLeave />
        </button>
        <div className={`lesson-timer ${urgent ? 'is-urgent' : ''}`}>
          <span className="lesson-timer-time">
            {mm}:{ss}
          </span>
        </div>
        <Toolbox
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          size={size}
          setSize={setSize}
          canDraw={!isObserver}
          canClear={isTeacher}
          onClear={() => setClearNonce((n) => n + 1)}
        />
      </div>

      {/* Uzak katılımcı sesleri */}
      {remotes.map((p) => (
        <ParticipantAudio key={p.session_id} participant={p} />
      ))}
    </div>
  );
}
