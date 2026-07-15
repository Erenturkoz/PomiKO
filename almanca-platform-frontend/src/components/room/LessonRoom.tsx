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
        <div className="rs-controls">
          {!isObserver && (
            <>
              <button className={`btn btn-sm ${micOn ? 'btn-ghost' : 'btn-danger'}`} onClick={onToggleMic}>
                {micOn ? 'Mik açık' : 'Mik kapalı'}
              </button>
              <button className={`btn btn-sm ${camOn ? 'btn-ghost' : 'btn-danger'}`} onClick={onToggleCam}>
                {camOn ? 'Kamera açık' : 'Kamera kapalı'}
              </button>
            </>
          )}
          <button className="btn btn-danger btn-sm" onClick={onLeave}>
            Ayrıl
          </button>
        </div>
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
