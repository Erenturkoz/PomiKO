import { Tool } from './drawTypes';

const COLORS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#1c2430', '#ffffff'];
const SIZES = [
  { label: 'İnce', value: 2, dot: 6 },
  { label: 'Orta', value: 4, dot: 10 },
  { label: 'Kalın', value: 8, dot: 15 },
];

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  size: number;
  setSize: (s: number) => void;
  canDraw: boolean;
  canClear: boolean;
  onClear: () => void;
}

const icons: Record<string, JSX.Element> = {
  cursor: (
    <path d="M4 3l7 17 2.5-6.8L20.5 11z" />
  ),
  pen: (
    <path d="M15 4l5 5L9 20l-5 1 1-5z" />
  ),
  eraser: (
    <>
      <path d="M15 4l5 5-9 9H6l-2-2z" />
      <path d="M9 18h11" />
    </>
  ),
  text: (
    <>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  name,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  name: keyof typeof icons;
}) {
  return (
    <button className={`tb-btn ${active ? 'is-on' : ''}`} onClick={onClick} title={title} aria-label={title}>
      <Icon name={name} />
    </button>
  );
}

export function Toolbox({ tool, setTool, color, setColor, size, setSize, canDraw, canClear, onClear }: Props) {
  if (!canDraw) {
    return (
      <aside className="toolbox">
        <span className="tb-title">İzleme</span>
      </aside>
    );
  }

  return (
    <aside className="toolbox">
      <ToolBtn active={tool === 'none'} onClick={() => setTool('none')} title="İmleç" name="cursor" />
      <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} title="Kalem" name="pen" />
      <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Silgi" name="eraser" />
      <ToolBtn active={tool === 'text'} onClick={() => setTool('text')} title="Metin" name="text" />

      <div className="tb-sep" />
      <div className="tb-colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`tb-color ${color === c ? 'is-on' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            title={`Renk`}
            aria-label={`Renk ${c}`}
          />
        ))}
      </div>

      <div className="tb-sep" />
      <div className="tb-sizes">
        {SIZES.map((s) => (
          <button
            key={s.value}
            className={`tb-size ${size === s.value ? 'is-on' : ''}`}
            onClick={() => setSize(s.value)}
            title={s.label}
            aria-label={s.label}
          >
            <span className="tb-dot" style={{ width: s.dot, height: s.dot }} />
          </button>
        ))}
      </div>

      {canClear && (
        <>
          <div className="tb-sep" />
          <button className="tb-btn tb-clear" onClick={onClear} title="Tümünü temizle" aria-label="Tümünü temizle">
            <Icon name="trash" />
          </button>
        </>
      )}
    </aside>
  );
}
