/* Small dependency-free SVG line chart for the visualizers. */

export interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
  dash?: string;
  width?: number;
}

/** 1, 2 or 5 × a power of ten, so the axis reads 0 · 500 · 1000 … */
function niceStep(top: number, count = 4) {
  const raw = Math.max(top, 1e-9) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

const fmtTick = (v: number) => {
  if (v >= 1e9) return `${+(v / 1e9).toFixed(1)}mld`;
  if (v >= 1e6) return `${+(v / 1e6).toFixed(1)}mln`;
  if (v >= 1e3) return `${+(v / 1e3).toFixed(1)}k`;
  return `${+v.toFixed(v < 10 ? 1 : 0)}`;
};

export function LineChart({
  series,
  width = 640,
  height = 300,
  logY = false,
  xLabel,
  yLabel,
  markerX,
  ariaLabel,
  yMax,
}: {
  series: Series[];
  width?: number;
  height?: number;
  logY?: boolean;
  xLabel?: string;
  yLabel?: string;
  markerX?: number;
  ariaLabel: string;
  yMax?: number;
}) {
  const pad = { l: 52, r: 16, t: 14, b: 38 };
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs);
  const ysRaw = all.map((p) => p.y).filter((y) => Number.isFinite(y));
  const rawTop = yMax ?? Math.max(...ysRaw, 1);
  const step = niceStep(rawTop);
  const yTop = logY ? rawTop : Math.ceil(rawTop / step) * step;
  const yBottom = logY ? Math.max(1, Math.min(...ysRaw.filter((y) => y > 0), 1)) : 0;

  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  // Coordinates are rounded: Math.log10 & co. may differ in the last digit between
  // Node (server render) and the browser, which would break hydration.
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const sx = (x: number) => r2(pad.l + ((x - x0) / (x1 - x0 || 1)) * W);
  const sy = (y: number) => {
    const v = Math.min(Math.max(y, yBottom), yTop);
    if (logY) {
      const a = Math.log10(yBottom),
        b = Math.log10(yTop);
      return r2(pad.t + H - ((Math.log10(v) - a) / (b - a || 1)) * H);
    }
    return r2(pad.t + H - ((v - yBottom) / (yTop - yBottom || 1)) * H);
  };

  const yTicks: number[] = [];
  if (logY) {
    for (let e = Math.floor(Math.log10(yBottom)); e <= Math.ceil(Math.log10(yTop)); e++) {
      const v = 10 ** e;
      if (v >= yBottom && v <= yTop) yTicks.push(v);
    }
  } else {
    for (let v = 0; v <= yTop + 1e-9; v += step) yTicks.push(v);
  }
  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--separator)" />
          <text
            x={pad.l - 8}
            y={sy(t)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={10.5}
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {fmtTick(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text
          key={`x${t}`}
          x={sx(t)}
          y={height - pad.b + 16}
          textAnchor="middle"
          fontSize={10.5}
          fill="var(--muted)"
          fontFamily="var(--font-mono)"
        >
          {fmtTick(Math.round(t))}
        </text>
      ))}
      <line x1={pad.l} x2={width - pad.r} y1={pad.t + H} y2={pad.t + H} stroke="var(--border)" />
      {xLabel && (
        <text x={pad.l + W / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={12}
          y={pad.t + H / 2}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted)"
          transform={`rotate(-90 12 ${pad.t + H / 2})`}
        >
          {yLabel}
        </text>
      )}
      {markerX !== undefined && markerX >= x0 && markerX <= x1 && (
        <line
          x1={sx(markerX)}
          x2={sx(markerX)}
          y1={pad.t}
          y2={pad.t + H}
          stroke="var(--accent)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
      )}
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width ?? 2.5}
          strokeDasharray={s.dash}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={s.points
            .filter((p) => Number.isFinite(p.y))
            .map((p) => `${sx(p.x)},${sy(p.y)}`)
            .join(' ')}
        />
      ))}
    </svg>
  );
}

export function ChartLegend({ series }: { series: Pick<Series, 'label' | 'color' | 'dash'>[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden="true">
            <line
              x1="1"
              y1="3"
              x2="19"
              y2="3"
              stroke={s.color}
              strokeWidth="3"
              strokeDasharray={s.dash}
              strokeLinecap="round"
            />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}
