import { Fragment, useState } from 'react';
import { TIME_ROWS, WEEKDAYS, addDays, cellKey, sameDay } from '../lib/week';

export interface GridSlot {
  id: string;
  startTime: string;
  endTime: string;
  status: 'OPEN' | 'BOOKED' | 'CANCELLED';
  booking: {
    id: string;
    status: string;
    topic?: { name: string } | null;
    child: { id: string; name: string; parent: { name: string } };
  } | null;
}

interface Props {
  weekStart: Date;
  slots: GridSlot[];
  onOpenCell: (iso: string) => void;
  onCloseSlot: (slotId: string) => void;
}

export function AvailabilityGrid({ weekStart, slots, onOpenCell, onCloseSlot }: Props) {
  const now = new Date();
  // Fare hangi satırda (saatte) ise o satırı hafifçe aydınlatmak için
  const [hoverRow, setHoverRow] = useState<string | null>(null);

  const slotMap = new Map<string, GridSlot>();
  for (const s of slots) {
    if (s.status === 'CANCELLED') continue;
    slotMap.set(cellKey(new Date(s.startTime)), s);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="cal-wrap">
      <div className="cal-grid">
        <div className="cal-corner" />
        {days.map((d, i) => (
          <div key={i} className={`cal-dayhead ${sameDay(d, now) ? 'is-today' : ''}`}>
            <span className="cal-dow">{WEEKDAYS[i]}</span>
            <span className="cal-dom">
              {d.getDate()}.{d.getMonth() + 1}
            </span>
          </div>
        ))}

        {TIME_ROWS.map((row) => {
          const rowActive = hoverRow === row.label;
          return (
            <Fragment key={row.label}>
              <div className={`cal-time${rowActive ? ' is-row-active' : ''}`}>{row.label}</div>
              {days.map((d, i) => {
                const cell = new Date(d);
                cell.setHours(row.h, row.m, 0, 0);
                const slot = slotMap.get(cellKey(cell));
                const past = cell.getTime() <= now.getTime();
                const isBooked = slot?.status === 'BOOKED';
                const isOpen = slot?.status === 'OPEN';

                let cls = 'cal-cell';
                let onClick: (() => void) | undefined;
                let label = `${WEEKDAYS[i]} ${row.label}`;

                const b = slot?.booking;

                if (isBooked && past) {
                  // bitmiş ders: görünür ama tıklanamaz
                  cls += ' is-done';
                  label = `${row.label} · bitti · ${b?.child.name ?? ''}${b?.topic ? ` · ${b.topic.name}` : ''}`;
                } else if (isBooked) {
                  cls += ' is-booked';
                  label = `${row.label} · rezerve · ${b?.child.name ?? ''}${b?.topic ? ` · ${b.topic.name}` : ''}`;
                } else if (isOpen && !past) {
                  cls += ' is-open';
                  onClick = () => onCloseSlot(slot!.id);
                  label = `${row.label} · açık (kapatmak için tıkla)`;
                } else if (past) {
                  cls += ' is-past';
                } else {
                  cls += ' is-empty';
                  onClick = () => onOpenCell(cell.toISOString());
                  label = `${row.label} · aç`;
                }

                if (rowActive) cls += ' is-row-hover';

                return (
                  <button
                    key={i}
                    type="button"
                    className={cls}
                    disabled={!onClick}
                    onClick={onClick}
                    onMouseEnter={() => setHoverRow(row.label)}
                    onMouseLeave={() => setHoverRow((r) => (r === row.label ? null : r))}
                    aria-label={label}
                    title={b ? `${b.child.name}${b.topic ? ` · ${b.topic.name}` : ''}` : undefined}
                  >
                    {isBooked && b && (
                      <span className="cal-inline">
                        <span className="cal-inline-name">{b.child.name}</span>
                        {b.topic && <span className="cal-inline-topic">{b.topic.name}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
