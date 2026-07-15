import { useEffect, useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { VideoTile } from './VideoTile';

interface Device {
  deviceId: string;
  label: string;
}

interface Props {
  co: DailyCall;
  role: 'TEACHER' | 'PARENT' | 'ADMIN';
  local?: DailyParticipant | null;
  micOn: boolean;
  camOn: boolean;
  joining: boolean;
  waiting?: boolean; // ders henüz başlamadı
  autoJoin?: boolean;
  onToggleAutoJoin?: (v: boolean) => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onJoin: () => void;
}

export function PreJoin({
  co,
  role,
  local,
  micOn,
  camOn,
  joining,
  waiting = false,
  autoJoin = true,
  onToggleAutoJoin,
  onToggleMic,
  onToggleCam,
  onJoin,
}: Props) {
  const isObserver = role === 'ADMIN';
  const [cams, setCams] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Admin dışı: kamerayı başlat (önizleme) + cihazları listele
  useEffect(() => {
    if (isObserver) return;
    let cancelled = false;
    (async () => {
      try {
        await co.startCamera();
        const { devices } = await co.enumerateDevices();
        if (cancelled) return;
        setCams(
          devices
            .filter((d) => d.kind === 'videoinput' && d.deviceId)
            .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Kamera' }))
        );
        setMics(
          devices
            .filter((d) => d.kind === 'audioinput' && d.deviceId)
            .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Mikrofon' }))
        );
      } catch {
        if (!cancelled) setErr('Kamera/mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [co, isObserver]);

  async function changeCam(id: string) {
    setSelectedCam(id);
    try {
      await co.setInputDevicesAsync({ videoDeviceId: id });
    } catch {
      /* yok say */
    }
  }
  async function changeMic(id: string) {
    setSelectedMic(id);
    try {
      await co.setInputDevicesAsync({ audioDeviceId: id });
    } catch {
      /* yok say */
    }
  }

  if (isObserver) {
    return (
      <div className="prejoin">
        <div className="prejoin-card">
          <h1 className="prejoin-title">Gizli izleme</h1>
          <p className="muted">
            Derse görünmez gözlemci olarak katılacaksın. Öğretmen ve öğrenci seni görmez, duymaz.
          </p>
          <button className="btn btn-primary prejoin-join" onClick={onJoin} disabled={joining}>
            {joining ? 'Katılınıyor…' : 'Gizli izlemeye başla'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="prejoin">
      <div className="prejoin-card">
        <h1 className="prejoin-title">Derse hazırlan</h1>
        <p className="muted">Kamera ve mikrofonunu kontrol et, sonra derse bağlan.</p>

        <div className="prejoin-preview">
          <VideoTile participant={local ?? undefined} label="Sen" mirror />
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        <div className="prejoin-controls">
          <button className={`btn btn-sm ${micOn ? 'btn-ghost' : 'btn-danger'}`} onClick={onToggleMic}>
            {micOn ? 'Mikrofon açık' : 'Mikrofon kapalı'}
          </button>
          <button className={`btn btn-sm ${camOn ? 'btn-ghost' : 'btn-danger'}`} onClick={onToggleCam}>
            {camOn ? 'Kamera açık' : 'Kamera kapalı'}
          </button>
        </div>

        <div className="prejoin-devices">
          <label className="field">
            <span>Kamera</span>
            <select value={selectedCam} onChange={(e) => changeCam(e.target.value)}>
              {cams.length === 0 && <option value="">Varsayılan kamera</option>}
              {cams.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mikrofon</span>
            <select value={selectedMic} onChange={(e) => changeMic(e.target.value)}>
              {mics.length === 0 && <option value="">Varsayılan mikrofon</option>}
              {mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          className="btn btn-primary prejoin-join"
          onClick={onJoin}
          disabled={joining || waiting}
        >
          {joining ? 'Bağlanılıyor…' : waiting ? 'Ders başlayınca bağlan' : 'Derse bağlan'}
        </button>

        <label className="autojoin">
          <input
            type="checkbox"
            checked={autoJoin}
            onChange={(e) => onToggleAutoJoin?.(e.target.checked)}
          />
          <span>
            Ders saati gelince <strong>otomatik bağlan</strong>
            <small className="hint">
              Kapatırsan ders başlayınca "Derse bağlan" butonuna kendin basarsın.
            </small>
          </span>
        </label>
      </div>
    </div>
  );
}
