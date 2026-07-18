import { Fragment, useState } from 'react';
import { TIME_ROWS, WEEKDAYS, addDays, cellKey, sameDay } from '../lib/week';
import { now as serverNow } from '../lib/serverTime';

export interface BookingSlot {
  id: string;
  startTime: string;
  endTime: string;
  status?: 'OPEN' | 'BOOKED';
  mine?: boolean;
  topicName?: string | null;
}

interface Props {
  weekStart: Date;
  slots: BookingSlot[];
  selectedSlotIds: string[];
  onToggleSlot: (slot: BookingSlot) => void;
}

// Öğrencinin bir öğretmenin müsait saatlerini görüp (birden fazla) seçtiği salt-okunur takvim.
// Görsel dil TeacherDashboard'daki AvailabilityGrid ile aynı (cal-* sınıfları),
// yalnızca etkileşim farklı: burada tek yapılabilecek şey açık saatleri seçip/bırakmak.
// Dış sarmalayıcı (.bk-cal-scroll) bu bileşenin dışında; gün başlığı orada sticky kalır.
export function BookingCalendar({ weekStart, slots, selectedSlotIds, onToggleSlot }: Props) {
  const now = new Date(serverNow());
  const [hoverRow, setHoverRow] = useState<string | null>(null);

  const slotMap = new Map<string, BookingSlot>();
  for (const s of slots) {
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
                const isMine = !!slot && slot.status === 'BOOKED' && !!slot.mine;
                const bookable = !!slot && slot.status === 'OPEN' && !past;
                const selected = !!slot && selectedSlotIds.includes(slot.id);

                let cls = 'cal-cell';
                if (isMine) cls += ' is-booked';
                else if (bookable) cls += ' is-open';
                else cls += ' is-past';
                if (selected) cls += ' is-selected';
                if (rowActive) cls += ' is-row-hover';

                const label = isMine
                  ? `${WEEKDAYS[i]} ${row.label} · senin dersin${slot?.topicName ? ` · ${slot.topicName}` : ''}`
                  : bookable
                    ? `${WEEKDAYS[i]} ${row.label} · ${selected ? 'seçimi kaldır' : 'seç'}`
                    : `${WEEKDAYS[i]} ${row.label} · kapalı`;

                return (
                  <button
                    key={i}
                    type="button"
                    className={cls}
                    disabled={!bookable}
                    onClick={bookable ? () => onToggleSlot(slot!) : undefined}
                    onMouseEnter={() => setHoverRow(row.label)}
                    onMouseLeave={() => setHoverRow((r) => (r === row.label ? null : r))}
                    aria-label={label}
                    aria-pressed={selected}
                    title={isMine ? `Senin dersin${slot?.topicName ? ` · ${slot.topicName}` : ''}` : undefined}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
