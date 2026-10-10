import { type ReactNode, useMemo, useRef, useState } from 'react';
import { KIT, useText } from './text';

/* =====================================================================
 *  GraphCanvas — the one SVG renderer every graph visualizer uses.
 *
 *  - directed / undirected, weighted, multigraph (parallel edges + loops)
 *  - antiparallel arcs u→v / v→u curve apart instead of overlapping
 *  - circle nodes for letters, pill nodes for named places
 *  - optional editing: click empty space, click / drag nodes, click edges
 *  - every state is styled through `nodeLook` / `edgeLook` callbacks
 * ===================================================================== */

export interface GNode {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface GEdge {
  u: string;
  v: string;
  w?: number;
}

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

export interface NodeLook {
  fill?: string;
  stroke?: string;
  ink?: string;
  strokeWidth?: number;
  /** Halo around the node, e.g. "the current vertex". */
  ring?: string;
  dim?: boolean;
  /** Small pill under the node (a distance, a degree …). */
  sub?: string | null;
  subTone?: Tone;
  /** Small round badge at the top-right (an order number …). */
  badge?: string | null;
  badgeColor?: string;
}

export interface EdgeLook {
  stroke?: string;
  width?: number;
  dash?: string;
  dim?: boolean;
  label?: string | null;
  labelTone?: Tone;
  /** Moving dashes along the edge — "something flows here". */
  animated?: boolean;
  /** Draw this edge on top of the others. */
  front?: boolean;
}

interface Props {
  nodes: GNode[];
  edges: GEdge[];
  directed?: boolean;
  width?: number;
  height?: number;
  shape?: 'circle' | 'pill';
  radius?: number;
  nodeLook?: (n: GNode) => NodeLook;
  edgeLook?: (e: GEdge, index: number) => EdgeLook;
  /** Default label for an edge when `edgeLook` gives none. */
  showWeights?: boolean;
  onBackgroundClick?: (x: number, y: number) => void;
  onNodeClick?: (id: string) => void;
  onEdgeClick?: (index: number) => void;
  onNodeMove?: (id: string, x: number, y: number) => void;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
  /** Extra SVG drawn under the graph (regions, cut lines …). */
  underlay?: ReactNode;
  maxHeight?: string;
}

const ARROW_L = 10;
const ARROW_W = 8;
const FONT = 12.5;

interface Geo {
  x: number;
  y: number;
  hw: number;
  hh: number;
  circle: boolean;
}

const textWidth = (s: string, size = FONT) => s.length * size * 0.6;

/** Enter and Space press a vertex or an edge that acts as a button. */
const pressKeys = (press: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    press();
  }
};

function boundary(g: Geo, dx: number, dy: number) {
  if (g.circle) return g.hw;
  const ax = Math.abs(dx),
    ay = Math.abs(dy);
  const tx = ax > 1e-6 ? g.hw / ax : Infinity;
  const ty = ay > 1e-6 ? g.hh / ay : Infinity;
  return Math.min(tx, ty);
}

const toneFill: Record<Tone, string> = {
  default: 'var(--foreground)',
  muted: 'var(--muted)',
  accent: 'var(--viz-active)',
  success: 'var(--viz-done)',
  warning: 'var(--viz-compare)',
  danger: 'var(--viz-reject)',
};

export function GraphCanvas({
  nodes,
  edges,
  directed = false,
  width = 720,
  height = 420,
  shape = 'circle',
  radius = 21,
  nodeLook,
  edgeLook,
  showWeights = true,
  onBackgroundClick,
  onNodeClick,
  onEdgeClick,
  onNodeMove,
  ariaLabel,
  className = '',
  children,
  underlay,
  maxHeight = '560px',
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const k = useText(KIT);
  const drag = useRef<{ id: string; x0: number; y0: number; moved: boolean; pointer: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const geo = useMemo(() => {
    const m = new Map<string, Geo>();
    for (const n of nodes) {
      const label = n.label ?? n.id;
      if (shape === 'pill') {
        const w = Math.max(textWidth(label) + 22, 2 * radius);
        m.set(n.id, { x: n.x, y: n.y, hw: w / 2, hh: 15, circle: false });
      } else {
        m.set(n.id, { x: n.x, y: n.y, hw: radius, hh: radius, circle: true });
      }
    }
    return m;
  }, [nodes, shape, radius]);

  /* ---- edge geometry: parallel and antiparallel edges fan out ---- */
  const edgeGeo = useMemo(() => {
    const groups = new Map<string, number[]>();
    edges.forEach((e, i) => {
      if (e.u === e.v) return;
      const k = e.u < e.v ? `${e.u}\u0000${e.v}` : `${e.v}\u0000${e.u}`;
      const group = groups.get(k);
      if (group) group.push(i);
      else groups.set(k, [i]);
    });
    const loops = new Map<string, number>();

    return edges.map((e, i) => {
      const a = geo.get(e.u),
        b = geo.get(e.v);
      if (!a || !b) return null;

      if (e.u === e.v) {
        const k = loops.get(e.u) ?? 0;
        loops.set(e.u, k + 1);
        const h = 46 + k * 18;
        const top = a.y - a.hh;
        const d = `M ${a.x - 9} ${top + 2} C ${a.x - 30 - k * 6} ${a.y - h - a.hh} ${a.x + 30 + k * 6} ${a.y - h - a.hh} ${a.x + 9} ${top + 2}`;
        return { d, lx: a.x, ly: a.y - a.hh - h * 0.62, arrow: null as null | string };
      }

      const lo = e.u < e.v ? a : b;
      const hi = e.u < e.v ? b : a;
      const group = groups.get(e.u < e.v ? `${e.u}\u0000${e.v}` : `${e.v}\u0000${e.u}`) ?? [i];
      const m = group.length;
      const idx = group.indexOf(i);
      const spacing = 34;
      const offCanon = m === 1 ? 0 : (idx - (m - 1) / 2) * spacing;

      const cdx = hi.x - lo.x,
        cdy = hi.y - lo.y;
      const clen = Math.hypot(cdx, cdy) || 1;
      const nx = -cdy / clen,
        ny = cdx / clen;
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const cx = mx + nx * offCanon,
        cy = my + ny * offCanon;

      // leave each endpoint at the node boundary
      let sdx = cx - a.x,
        sdy = cy - a.y;
      const sl = Math.hypot(sdx, sdy) || 1;
      sdx /= sl;
      sdy /= sl;
      const sx = a.x + sdx * (boundary(a, sdx, sdy) + 1);
      const sy = a.y + sdy * (boundary(a, sdx, sdy) + 1);

      let edx = b.x - cx,
        edy = b.y - cy;
      const el = Math.hypot(edx, edy) || 1;
      edx /= el;
      edy /= el;
      const tipD = boundary(b, -edx, -edy) + 1.5;
      const tx = b.x - edx * tipD,
        ty = b.y - edy * tipD;
      const ex = directed ? tx - edx * ARROW_L * 0.7 : tx;
      const ey = directed ? ty - edy * ARROW_L * 0.7 : ty;

      const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
      let arrow: string | null = null;
      if (directed) {
        const px = -edy,
          py = edx;
        const bx = tx - edx * ARROW_L,
          by = ty - edy * ARROW_L;
        arrow = `${tx},${ty} ${bx + (px * ARROW_W) / 2},${by + (py * ARROW_W) / 2} ${bx - (px * ARROW_W) / 2},${by - (py * ARROW_W) / 2}`;
      }
      // label at the curve's midpoint
      const lx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
      const ly = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
      return { d, lx, ly, arrow };
    });
  }, [edges, geo, directed]);

  /* ---- pointer handling ---- */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const interactive = Boolean(onBackgroundClick || onNodeClick || onEdgeClick || onNodeMove);

  const onNodeDown = (e: React.PointerEvent, id: string) => {
    if (!onNodeClick && !onNodeMove) return;
    e.stopPropagation();
    drag.current = { id, x0: e.clientX, y0: e.clientY, moved: false, pointer: e.pointerId };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) {
      d.moved = true;
      setDragging(d.id);
    }
    if (d.moved && onNodeMove) {
      const p = toSvg(e.clientX, e.clientY);
      onNodeMove(d.id, Math.max(24, Math.min(width - 24, p.x)), Math.max(24, Math.min(height - 24, p.y)));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (d && !d.moved) onNodeClick?.(d.id);
  };

  const order = edges.map((_, i) => i);
  const looks = edges.map((e, i) => edgeLook?.(e, i) ?? {});
  order.sort((a, b) => Number(!!looks[a].front) - Number(!!looks[b].front));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      // An image hides its children from screen readers, so a canvas with buttons in it is a group.
      role={interactive ? 'group' : 'img'}
      aria-label={ariaLabel}
      // Only a canvas with draggable vertices keeps the finger; otherwise a swipe scrolls the page.
      className={`block h-auto w-full select-none ${onNodeMove ? 'touch-none' : ''} ${className}`}
      style={{ maxHeight }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: placing a vertex where you click is a pointer gesture; the presets and every step work from the keyboard */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        fill="transparent"
        className={onBackgroundClick ? 'cursor-crosshair' : undefined}
        onClick={(e) => {
          if (!onBackgroundClick) return;
          const p = toSvg(e.clientX, e.clientY);
          onBackgroundClick(p.x, p.y);
        }}
      />
      {underlay}

      {/* edges */}
      <g>
        {order.map((i) => {
          const e = edges[i];
          const g = edgeGeo[i];
          if (!g) return null;
          const lk = looks[i];
          const stroke = lk.stroke ?? 'var(--viz-line)';
          const w = lk.width ?? 2;
          const label = lk.label !== undefined ? lk.label : showWeights && e.w !== undefined ? String(e.w) : null;
          const opacity = lk.dim ? 0.28 : 1;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: whenever an edge has a handler it is a button that the keyboard can press
            <g
              key={i}
              opacity={opacity}
              className={onEdgeClick ? 'cursor-pointer' : undefined}
              onClick={onEdgeClick ? () => onEdgeClick(i) : undefined}
              role={onEdgeClick ? 'button' : undefined}
              tabIndex={onEdgeClick ? 0 : undefined}
              aria-label={onEdgeClick ? k.edge(String(e.u), String(e.v)) : undefined}
              onKeyDown={onEdgeClick ? pressKeys(() => onEdgeClick(i)) : undefined}
            >
              {onEdgeClick && <path d={g.d} stroke="transparent" strokeWidth={16} fill="none" />}
              <path
                d={g.d}
                fill="none"
                stroke={stroke}
                strokeWidth={w}
                strokeLinecap="round"
                strokeDasharray={lk.animated ? '7 9' : lk.dash}
                className={lk.animated ? 'viz-flow' : undefined}
                style={{ transition: 'stroke 0.25s, stroke-width 0.25s' }}
              />
              {g.arrow && <polygon points={g.arrow} fill={stroke} style={{ transition: 'fill 0.25s' }} />}
              {label != null && label !== '' && (
                <g transform={`translate(${g.lx} ${g.ly})`}>
                  <rect
                    x={-(textWidth(label, 11.5) + 12) / 2}
                    y={-10.5}
                    width={textWidth(label, 11.5) + 12}
                    height={21}
                    rx={10.5}
                    fill="var(--surface)"
                    stroke={lk.labelTone && lk.labelTone !== 'default' ? toneFill[lk.labelTone] : 'var(--border)'}
                    strokeWidth={1.2}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11.5}
                    fontWeight={600}
                    fontFamily="var(--font-mono)"
                    fill={lk.labelTone ? toneFill[lk.labelTone] : 'var(--muted)'}
                  >
                    {label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>

      {/* nodes */}
      <g>
        {nodes.map((n) => {
          const g = geo.get(n.id);
          if (!g) return null;
          const lk = nodeLook?.(n) ?? {};
          const label = n.label ?? n.id;
          const fill = lk.fill ?? 'var(--surface)';
          const stroke = lk.stroke ?? 'var(--viz-line)';
          const ink = lk.ink ?? 'var(--foreground)';
          const clickable = Boolean(onNodeClick || onNodeMove);
          const fs = shape === 'circle' && label.length > 2 ? Math.max(9.5, FONT - (label.length - 2) * 1.3) : FONT;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: a vertex that does something is a button the keyboard can press; dragging only rearranges the drawing
            <g
              key={n.id}
              transform={`translate(${g.x} ${g.y})`}
              opacity={lk.dim ? 0.35 : 1}
              className={clickable ? (dragging === n.id ? 'cursor-grabbing' : 'cursor-pointer') : undefined}
              onPointerDown={clickable ? (e) => onNodeDown(e, n.id) : undefined}
              role={onNodeClick ? 'button' : undefined}
              tabIndex={onNodeClick ? 0 : undefined}
              aria-label={onNodeClick ? k.vertex(label) : undefined}
              onKeyDown={onNodeClick ? pressKeys(() => onNodeClick(n.id)) : undefined}
              style={{ transition: 'opacity 0.25s' }}
            >
              {lk.ring &&
                (g.circle ? (
                  <circle
                    r={g.hw + 6}
                    fill="none"
                    stroke={lk.ring}
                    strokeWidth={3}
                    opacity={0.55}
                    className="viz-pulse"
                  />
                ) : (
                  <rect
                    x={-g.hw - 6}
                    y={-g.hh - 6}
                    width={2 * g.hw + 12}
                    height={2 * g.hh + 12}
                    rx={g.hh + 6}
                    fill="none"
                    stroke={lk.ring}
                    strokeWidth={3}
                    opacity={0.55}
                    className="viz-pulse"
                  />
                ))}
              {g.circle ? (
                <circle
                  r={g.hw}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={lk.strokeWidth ?? 2}
                  style={{ transition: 'fill 0.25s, stroke 0.25s' }}
                />
              ) : (
                <rect
                  x={-g.hw}
                  y={-g.hh}
                  width={2 * g.hw}
                  height={2 * g.hh}
                  rx={g.hh}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={lk.strokeWidth ?? 2}
                  style={{ transition: 'fill 0.25s, stroke 0.25s' }}
                />
              )}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fs}
                fontWeight={650}
                fill={ink}
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
              {lk.badge && (
                <g transform={`translate(${g.hw * 0.78} ${-g.hh * 0.86})`}>
                  <circle r={9} fill={lk.badgeColor ?? 'var(--viz-active)'} stroke="var(--surface)" strokeWidth={2} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9.5}
                    fontWeight={700}
                    fill="white"
                    style={{ pointerEvents: 'none' }}
                  >
                    {lk.badge}
                  </text>
                </g>
              )}
              {lk.sub != null && lk.sub !== '' && (
                <g transform={`translate(0 ${g.hh + 15})`}>
                  <rect
                    x={-(textWidth(lk.sub, 11) + 12) / 2}
                    y={-10}
                    width={textWidth(lk.sub, 11) + 12}
                    height={20}
                    rx={6}
                    fill={
                      lk.subTone && lk.subTone !== 'default' && lk.subTone !== 'muted'
                        ? toneFill[lk.subTone]
                        : 'var(--surface-secondary)'
                    }
                    stroke={lk.subTone && lk.subTone !== 'default' && lk.subTone !== 'muted' ? 'none' : 'var(--border)'}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="var(--font-mono)"
                    fill={
                      lk.subTone && lk.subTone !== 'default' && lk.subTone !== 'muted' ? 'white' : 'var(--foreground)'
                    }
                    style={{ pointerEvents: 'none' }}
                  >
                    {lk.sub}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
      {children}
      {interactive && <title>{ariaLabel}</title>}
    </svg>
  );
}

/** Scale arbitrary preset coordinates into a canvas, keeping the aspect ratio. */
export function fitLayout<T extends { x: number; y: number }>(
  items: T[],
  width: number,
  height: number,
  pad = 56,
  flipY = false,
): T[] {
  if (!items.length) return items;
  const xs = items.map((p) => p.x),
    ys = items.map((p) => (flipY ? -p.y : p.y));
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const sw = maxX - minX || 1,
    sh = maxY - minY || 1;
  const s = Math.min((width - 2 * pad) / sw, (height - 2 * pad) / sh);
  const ox = (width - sw * s) / 2,
    oy = (height - sh * s) / 2;
  return items.map((p) => ({ ...p, x: ox + (p.x - minX) * s, y: oy + ((flipY ? -p.y : p.y) - minY) * s }));
}
