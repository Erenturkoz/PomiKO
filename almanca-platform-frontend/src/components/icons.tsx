import { ReactNode } from 'react';

// Paylaşılan, sade çizgi ikon seti. Tüm panellerde aynı görsel dil için:
// viewBox 24x24, stroke=currentColor, strokeWidth=2, yuvarlak uçlar.
// Her ikon `size` (varsayılan 16) ve `className` kabul eder.

interface IconProps {
  size?: number;
  className?: string;
}

function base(children: ReactNode, { size = 16, className }: IconProps = {}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IcCalendar(props: IconProps) {
  return base(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>,
    props
  );
}

export function IcClock(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>,
    props
  );
}

export function IcDashboard(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </>,
    props
  );
}

export function IcBook(props: IconProps) {
  return base(
    <>
      <path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v18H5.5c-.8 0-1.5-.7-1.5-1.5v-15Z" />
      <path d="M20 4.5c0-.8-.7-1.5-1.5-1.5H12v18h6.5c.8 0 1.5-.7 1.5-1.5v-15Z" />
    </>,
    props
  );
}

export function IcWallet(props: IconProps) {
  return base(
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M15 13.5h3.5" />
    </>,
    props
  );
}

export function IcSettings(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.3-2-3.4-2.2.7a7.7 7.7 0 0 0-2.6-1.5L14 2h-4l-.5 2.3a7.7 7.7 0 0 0-2.6 1.5l-2.2-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 14.8l2 3.4 2.2-.7c.75.66 1.63 1.17 2.6 1.5L10 22h4l.5-2.3a7.7 7.7 0 0 0 2.6-1.5l2.2.7 2-3.4-1.9-1.3Z" />
    </>,
    props
  );
}

export function IcLogout(props: IconProps) {
  return base(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>,
    props
  );
}

export function IcCheck(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>,
    props
  );
}

export function IcX(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </>,
    props
  );
}

export function IcCamera(props: IconProps) {
  return base(
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.3" />
    </>,
    props
  );
}

export function IcCoin(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.3 9.3c0-1.3 1.2-2.3 2.7-2.3s2.7.9 2.7 2c0 2.3-5.4 1.4-5.4 3.7 0 1.1 1.2 2 2.7 2s2.7-1 2.7-2.3" />
    </>,
    props
  );
}

export function IcUsers(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M16 4.8c1.4.4 2.5 1.7 2.5 3.2 0 1.5-1 2.8-2.5 3.2M18 14.6c2 .5 3.5 2.3 3.5 4.4" />
    </>,
    props
  );
}

export function IcChevronRight(props: IconProps) {
  return base(<path d="M9 6l6 6-6 6" />, props);
}

export function IcOpenSlot(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>,
    props
  );
}

export function IcTasks(props: IconProps) {
  return base(
    <>
      <path d="M4.5 6.5l1.5 1.5 2.5-2.5M4.5 13.5l1.5 1.5 2.5-2.5M4.5 20.5l1.5 1.5 2.5-2.5" />
      <path d="M12 6h7.5M12 13h7.5M12 20h7.5" />
    </>,
    props
  );
}

export function IcBadge(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="9.5" r="6" />
      <path d="M8.5 14.5L7 21l5-2.5L17 21l-1.5-6.5" />
    </>,
    props
  );
}

export function IcGraduation(props: IconProps) {
  return base(
    <>
      <path d="M2 8.5L12 4l10 4.5-10 4.5-10-4.5Z" />
      <path d="M6 10.5v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5" />
      <path d="M21 8.5v6" />
    </>,
    props
  );
}

export function IcGlobe(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
    </>,
    props
  );
}

export function IcMessage(props: IconProps) {
  return base(
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" />
    </>,
    props
  );
}

export function IcList(props: IconProps) {
  return base(
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>,
    props
  );
}
