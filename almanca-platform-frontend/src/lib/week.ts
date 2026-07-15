export interface TimeRow {
  h: number;
  m: number;
  label: string;
}

// Pazartesi başlangıçlı haftanın ilk günü (00:00)
export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7; // Pazartesi = 0
  date.setDate(date.getDate() - day);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

// 10:00 – 22:00 arası yarım saatlik satırlar (son ders 21:30–22:00)
export const TIME_ROWS: TimeRow[] = (() => {
  const rows: TimeRow[] = [];
  for (let h = 10; h < 22; h++) {
    for (const m of [0, 30]) {
      rows.push({
        h,
        m,
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      });
    }
  }
  return rows;
})();

export const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function cellKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
  return `${fmt.format(weekStart)} – ${fmt.format(end)}`;
}
