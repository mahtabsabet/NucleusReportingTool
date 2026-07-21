import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  EdgeProps,
  NodeProps,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate } from 'react-router-dom';
import { XIcon, InfoIcon } from 'lucide-react';
import { fetchCrossNucleusPersons, type CrossNucleusPerson } from '../lib/db/reports';
import { fetchMilestoneCompositesForNuclei, type NucleusComposite } from '../lib/db/milestoneThree';
import { MILESTONE_THREE_MAX, milestoneLevel, progressColor } from '../lib/milestoneThree';

// ---------- Types & layout constants ----------

interface NucleusShape {
  id: string;
  name: string;
  engagementCounts: { coordinating: number; supporting: number; participating: number; aware: number };
}

interface NetworkViewProps {
  nuclei: NucleusShape[];
  clusterId: string | null;
}

// Small "token" geometry. The view is glanceable — like the map, it shows
// how many nuclei there are and roughly how their progress is distributed,
// with details revealed on hover — so each nucleus is a compact pill
// (colour dot + abbreviated name), not a full card.
const TOKEN_W = 120;
const TOKEN_H = 26;
const TOP_PAD = 44;
const OUTER_PAD = 36;
const H_GAP = 10;                 // min horizontal gap between tokens
const V_GAP = 8;                  // min vertical gap between tokens
const CELL_W = TOKEN_W + H_GAP;
const CELL_H = TOKEN_H + V_GAP;
const UNASSESSED_COLS = 2;
const UNASSESSED_W = CELL_W * UNASSESSED_COLS;
const ZONE_GAP = 56;

interface Geom {
  axisX0: number;       // x-center at composite 0
  scoredW: number;      // pixel span from composite 0 to 10
  unassessedCx: number; // x-center of the "not yet assessed" column
  leftZoneW: number;    // width reserved for that column (0 when none)
  totalW: number;
}

// Lay the axis out to fill the available container width so tokens sit at
// a readable size (fitView stays near zoom 1) instead of being shrunk.
function computeGeom(containerW: number, hasUnassessed: boolean): Geom {
  const usableW = Math.max(480, containerW - OUTER_PAD * 2);
  const leftZoneW = hasUnassessed ? UNASSESSED_W : 0;
  const gap = hasUnassessed ? ZONE_GAP : 0;
  const axisX0 = OUTER_PAD + leftZoneW + gap + TOKEN_W / 2;
  const axisRightCx = OUTER_PAD + usableW - TOKEN_W / 2;
  const scoredW = Math.max(200, axisRightCx - axisX0);
  const unassessedCx = OUTER_PAD + leftZoneW / 2;
  return { axisX0, scoredW, unassessedCx, leftZoneW, totalW: OUTER_PAD + usableW };
}

function axisCenterX(geom: Geom, composite: number): number {
  return geom.axisX0 + (composite / MILESTONE_THREE_MAX) * geom.scoredW;
}

function totalPeople(n: NucleusShape): number {
  return Object.values(n.engagementCounts).reduce((a, b) => a + b, 0);
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

type Strength = 'strong' | 'moderate' | 'light';

function strengthFor(count: number): Strength {
  if (count >= 5) return 'strong';
  if (count >= 2) return 'moderate';
  return 'light';
}

const STRENGTH_STYLE: Record<Strength, { stroke: string; width: number; pillBg: string; pillBorder: string }> = {
  strong:   { stroke: '#7c3aed', width: 4,   pillBg: 'bg-violet-50',   pillBorder: 'border-violet-300' },
  moderate: { stroke: '#3b82f6', width: 2.5, pillBg: 'bg-blue-50',     pillBorder: 'border-blue-300' },
  light:    { stroke: '#64748b', width: 1.5, pillBg: 'bg-slate-50',    pillBorder: 'border-slate-300' },
};

// ---------- Custom nodes ----------

// A nucleus as a compact pill: a progress-coloured dot + abbreviated name.
// The hover pop (scale + lift + tooltip) is driven entirely by CSS :hover
// so it never triggers a React re-render — setting hover state and changing
// z-index on hover reorders the DOM under the cursor and makes it flicker.
// Only `dimmed` (when another token is focused) comes from React state.
const NucleusTokenNode = ({ data }: NodeProps) => {
  const composite = data.composite as number | null;
  const color = composite === null ? '#94a3b8' : progressColor(composite);
  const peopleCount = data.peopleCount as number;
  const levelLabel = data.levelLabel as string;
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <div
        className="flex items-center gap-1.5 rounded-full bg-white border pl-1.5 pr-2.5 shadow-sm transition-transform duration-150 group-hover:scale-110 group-hover:shadow-md"
        style={{ width: TOKEN_W, height: TOKEN_H, borderColor: color }}
      >
        <span className="flex-shrink-0 rounded-full" style={{ width: 10, height: 10, background: color }} />
        <span className="text-[11px] font-semibold text-gray-800 truncate">{data.label as string}</span>
      </div>
      <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-max max-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 pointer-events-none">
        <div className="text-sm font-bold text-gray-900 leading-tight">{data.fullName as string}</div>
        <div className="text-xs font-semibold mt-0.5" style={{ color }}>
          {composite === null ? levelLabel : `${composite.toFixed(1)} / 10 · ${levelLabel}`}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        </div>
      </div>
    </div>
  );
};

// The progress ruler along the bottom: a 0→10 gradient track with numeric
// ticks and a caption naming the scale.
const AxisNode = ({ data }: NodeProps) => {
  const width = data.width as number;
  const ticks = [0, 2.5, 5, 7.5, 10];
  return (
    <div style={{ width, pointerEvents: 'none' }}>
      <div
        className="h-2 rounded-full"
        style={{
          background: 'linear-gradient(90deg, #f59e0b 0%, #10b981 40%, #3b82f6 70%, #7c3aed 100%)',
        }}
      />
      <div className="relative mt-1" style={{ height: 18 }}>
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${(t / MILESTONE_THREE_MAX) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <div className="w-px h-2 bg-gray-300" />
            <span className="text-[10px] font-bold text-gray-500 mt-0.5">{t}</span>
          </div>
        ))}
      </div>
      <div className="text-center text-[11px] font-semibold text-gray-600 mt-1 leading-snug">
        Development of Milestone Three Cluster Features
        <span className="block font-normal text-gray-400">
          (cf. 31 December 2025 letter, paragraph 3)
        </span>
      </div>
    </div>
  );
};

const ZoneLabelNode = ({ data }: NodeProps) => (
  <div
    className="text-[11px] font-bold tracking-wider text-slate-400 uppercase text-center"
    style={{ width: data.width as number, pointerEvents: 'none' }}
  >
    {data.label as string}
  </div>
);

const nodeTypes = { nucleus: NucleusTokenNode, axis: AxisNode, zoneLabel: ZoneLabelNode };

// ---------- Avatar helpers ----------

function Avatar({
  name,
  photoUrl,
  size = 22,
  ring = true,
}: { name: string; photoUrl: string | null; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  const initials = getInitials(name || '?');
  const showPhoto = !!photoUrl && !broken;
  return (
    <div
      title={name}
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-rose-300 text-[10px] font-bold text-amber-900 overflow-hidden ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        <img
          src={photoUrl!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span style={{ fontSize: Math.max(9, size * 0.4) }}>{initials}</span>
      )}
    </div>
  );
}

// ---------- Routing helpers (curve edges around obstacle tokens) ----------

interface Rect { x: number; y: number; w: number; h: number }

// Liang–Barsky: does the segment [s, t] intersect the axis-aligned rect?
function segmentIntersectsRect(sx: number, sy: number, tx: number, ty: number, r: Rect, pad = 0): boolean {
  const xMin = r.x - pad, xMax = r.x + r.w + pad, yMin = r.y - pad, yMax = r.y + r.h + pad;
  let t0 = 0, t1 = 1;
  const dx = tx - sx, dy = ty - sy;
  const p = [-dx, dx, -dy, dy];
  const q = [sx - xMin, xMax - sx, sy - yMin, yMax - sy];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 > t0;
}

// Sample a quadratic Bézier and test whether any segment intersects the rect.
function quadraticIntersectsRect(sx: number, sy: number, cx: number, cy: number, tx: number, ty: number, r: Rect, pad = 0): boolean {
  const STEPS = 16;
  let px = sx, py = sy;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    const x = u * u * sx + 2 * u * t * cx + t * t * tx;
    const y = u * u * sy + 2 * u * t * cy + t * t * ty;
    if (segmentIntersectsRect(px, py, x, y, r, pad)) return true;
    px = x; py = y;
  }
  return false;
}

function rectEdgePoint(r: Rect, toX: number, toY: number): { x: number; y: number } {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = toX - cx, dy = toY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const tx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

interface BandRoute {
  path: string;
  labelX: number;
  labelY: number;
  crossedIds: string[];
}

function routeBandPath(
  source: Rect,
  target: Rect,
  obstacles: { id: string; rect: Rect }[],
  pad = 8,
): BandRoute {
  const scx = source.x + source.w / 2, scy = source.y + source.h / 2;
  const tcx = target.x + target.w / 2, tcy = target.y + target.h / 2;
  const sEdge = rectEdgePoint(source, tcx, tcy);
  const tEdge = rectEdgePoint(target, scx, scy);
  const sx = sEdge.x, sy = sEdge.y, tx = tEdge.x, ty = tEdge.y;

  const blocking = obstacles.filter((o) => segmentIntersectsRect(sx, sy, tx, ty, o.rect, pad));
  if (blocking.length === 0) {
    return {
      path: `M ${sx},${sy} L ${tx},${ty}`,
      labelX: (sx + tx) / 2,
      labelY: (sy + ty) / 2,
      crossedIds: [],
    };
  }

  const dx = tx - sx, dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;

  const candidates: { offset: number; cx: number; cy: number; crossed: { id: string; rect: Rect }[] }[] = [];
  for (const sign of [1, -1]) {
    let mag = 0;
    for (const o of blocking) {
      const corners = [
        { x: o.rect.x, y: o.rect.y },
        { x: o.rect.x + o.rect.w, y: o.rect.y },
        { x: o.rect.x, y: o.rect.y + o.rect.h },
        { x: o.rect.x + o.rect.w, y: o.rect.y + o.rect.h },
      ];
      for (const c of corners) {
        const proj = (c.x - mx) * nx + (c.y - my) * ny;
        const reach = sign > 0 ? proj : -proj;
        if (reach > mag) mag = reach;
      }
    }
    const offset = sign * (mag + pad + 24) * 2;
    const cx = mx + nx * offset;
    const cy = my + ny * offset;
    const crossed = obstacles.filter((o) => quadraticIntersectsRect(sx, sy, cx, cy, tx, ty, o.rect, pad));
    candidates.push({ offset, cx, cy, crossed });
  }
  candidates.sort((a, b) => a.crossed.length - b.crossed.length || Math.abs(a.offset) - Math.abs(b.offset));
  const best = candidates[0];

  return {
    path: `M ${sx},${sy} Q ${best.cx},${best.cy} ${tx},${ty}`,
    labelX: 0.25 * sx + 0.5 * best.cx + 0.25 * tx,
    labelY: 0.25 * sy + 0.5 * best.cy + 0.25 * ty,
    crossedIds: best.crossed.map((o) => o.id),
  };
}

// ---------- Custom edge: connection band ----------

interface BandData {
  people: { id: string; name: string; photoUrl: string | null }[];
  strength: Strength;
  dimmed: boolean;
  highlighted: boolean;
  obstructed: boolean;
  path: string;
  labelX: number;
  labelY: number;
  onSelect: () => void;
}

function ConnectionBandEdge(props: EdgeProps) {
  const { id, data } = props;
  const d = data as unknown as BandData;
  const style = STRENGTH_STYLE[d.strength];
  // Connections are quiet until you focus a token — at a glance the view is
  // about the distribution of nuclei, not a web of lines.
  const baseOpacity = d.obstructed ? 0.1 : d.highlighted ? 1 : d.dimmed ? 0.08 : 0.35;

  const focused = d.highlighted;
  const strokeWidth = focused ? style.width + 3 : style.width;
  const avatarSize = focused ? 30 : 22;
  const showNames = d.people.length <= 3;
  const visible = d.people.slice(0, focused ? 6 : 4);
  const overflow = d.people.length - visible.length;
  const labelScale = focused ? 1.15 : 1;

  return (
    <>
      <path
        d={d.path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 18, 22)}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
      />
      <BaseEdge
        id={id}
        path={d.path}
        style={{
          stroke: style.stroke,
          strokeWidth,
          opacity: baseOpacity,
          fill: 'none',
          transition: 'opacity 150ms ease, stroke-width 150ms ease',
          pointerEvents: 'none',
        }}
      />
      {/* People pills only render for the focused connection, to keep the
          at-a-glance view uncluttered. */}
      {focused && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${d.labelX}px, ${d.labelY}px) scale(${labelScale})`,
              transformOrigin: 'center center',
            }}
            className="pointer-events-auto select-none nodrag nopan"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); d.onSelect(); }}
              className={`flex items-center gap-0.5 ${style.pillBg} ${style.pillBorder} border rounded-full pl-1 pr-1.5 py-0.5 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex -space-x-1.5">
                {visible.map((p) => (
                  <Avatar key={p.id} name={p.name} photoUrl={p.photoUrl} size={avatarSize} />
                ))}
              </div>
              {overflow > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center px-1.5 rounded-full bg-white border border-gray-200 font-bold text-gray-700"
                  style={{ minWidth: avatarSize, height: avatarSize, fontSize: Math.max(10, avatarSize * 0.4) }}
                >
                  +{overflow}
                </span>
              )}
            </button>
            {showNames && (
              <div className="text-gray-700 text-center mt-1 font-medium whitespace-nowrap" style={{ fontSize: 12 }}>
                {visible.map((p) => shortName(p.name)).join(' • ')}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { connectionBand: ConnectionBandEdge };

// ---------- Layout ----------

interface TokenItem { id: string; name: string; composite: number | null }

// Position tokens: assessed nuclei form a beeswarm along the progress axis
// (offset vertically only where they'd collide, so piles at similar scores
// fan out into a distribution), and unassessed nuclei fill a compact grid
// in the left column. Returns top-left positions plus the content height.
function layoutTokens(items: TokenItem[], geom: Geom): { pos: Map<string, { x: number; y: number }>; height: number } {
  const assessed = items
    .filter((i) => i.composite !== null)
    .map((i) => ({ id: i.id, cx: axisCenterX(geom, i.composite as number) }))
    .sort((a, b) => a.cx - b.cx);
  const unassessed = items.filter((i) => i.composite === null);

  const centers = new Map<string, { x: number; y: number }>();
  const placed: { x: number; y: number }[] = [];
  const collides = (x: number, y: number) =>
    placed.some((p) => Math.abs(p.x - x) < CELL_W && Math.abs(p.y - y) < CELL_H);

  // Beeswarm the assessed tokens around a centre line (y = 0).
  for (const a of assessed) {
    let y = 0;
    let k = 1;
    while (collides(a.cx, y)) {
      const step = Math.ceil(k / 2) * CELL_H;
      y = k % 2 === 1 ? step : -step;
      k++;
    }
    placed.push({ x: a.cx, y });
    centers.set(a.id, { x: a.cx, y });
  }

  // Grid the unassessed tokens in the left column.
  const cols = Math.max(1, Math.floor(geom.leftZoneW / CELL_W));
  unassessed.forEach((u, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    centers.set(u.id, {
      x: OUTER_PAD + col * CELL_W + TOKEN_W / 2,
      y: row * CELL_H,
    });
  });

  let minY = Infinity, maxY = -Infinity;
  centers.forEach((c) => { if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y; });
  if (!isFinite(minY)) { minY = 0; maxY = 0; }
  const shift = TOP_PAD - minY;

  const pos = new Map<string, { x: number; y: number }>();
  centers.forEach((c, id) => pos.set(id, { x: c.x - TOKEN_W / 2, y: c.y + shift - TOKEN_H / 2 }));

  return { pos, height: TOP_PAD + (maxY - minY) + TOKEN_H };
}

// ---------- Main view ----------

interface SelectedBand {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  people: { id: string; name: string; photoUrl: string | null }[];
}

export function NetworkView({ nuclei }: NetworkViewProps) {
  const navigate = useNavigate();
  const [crossPeople, setCrossPeople] = useState<CrossNucleusPerson[]>([]);
  const [composites, setComposites] = useState<Map<string, NucleusComposite>>(new Map());
  const [hoveredNucleus, setHoveredNucleus] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedBand, setSelectedBand] = useState<SelectedBand | null>(null);

  // Container width drives the axis span so tokens render at readable size.
  const wrapRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const [containerW, setContainerW] = useState(0);

  const measure = useCallback(() => {
    const w = wrapRef.current?.offsetWidth;
    if (w) setContainerW((prev) => (Math.abs(w - prev) > 1 ? w : prev));
  }, []);

  useLayoutEffect(() => { measure(); }, [measure]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const ids = nuclei.map((n) => n.id);
    if (ids.length === 0) { setCrossPeople([]); setComposites(new Map()); return; }
    fetchCrossNucleusPersons(ids)
      .then(setCrossPeople)
      .catch((err) => console.error('Failed to load cross-nucleus persons:', err));
    fetchMilestoneCompositesForNuclei(ids)
      .then(setComposites)
      .catch((err) => console.error('Failed to load milestone-three composites:', err));
  }, [nuclei]);

  const compositeOf = useCallback(
    (id: string): number | null => composites.get(id)?.composite ?? null,
    [composites],
  );

  const hasUnassessed = useMemo(
    () => nuclei.some((n) => compositeOf(n.id) === null),
    [nuclei, compositeOf],
  );

  const geom = useMemo(() => computeGeom(containerW, hasUnassessed), [containerW, hasUnassessed]);

  const { nucleusPos, contentHeight } = useMemo(() => {
    const items = nuclei.map((n) => ({ id: n.id, name: n.name, composite: compositeOf(n.id) }));
    const { pos, height } = layoutTokens(items, geom);
    return { nucleusPos: pos, contentHeight: height };
  }, [nuclei, compositeOf, geom]);

  // Re-frame when the layout/container changes. The <ReactFlow fitView> prop
  // handles the initial frame after measurement; skip the first run here so
  // we never fitView before nodes are measured (which frames blank).
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!didInitialFit.current) { didInitialFit.current = true; return; }
    if (nuclei.length === 0) return;
    const raf = requestAnimationFrame(() =>
      rfRef.current?.fitView({ padding: 0.06, maxZoom: 1, duration: 200 }),
    );
    return () => cancelAnimationFrame(raf);
  }, [containerW, contentHeight, nuclei.length, hasUnassessed]);

  // Pairwise connection bands (one band per unordered nucleus pair) with routed paths.
  const bands = useMemo(() => {
    const map = new Map<string, { aId: string; bId: string; people: { id: string; name: string; photoUrl: string | null }[] }>();
    crossPeople.forEach((p) => {
      const ids = p.nucleiIds.filter((id) => nucleusPos.has(id));
      if (ids.length < 2) return;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [aId, bId] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          const key = `${aId}__${bId}`;
          let band = map.get(key);
          if (!band) {
            band = { aId, bId, people: [] };
            map.set(key, band);
          }
          band.people.push({ id: p.id, name: p.name, photoUrl: p.photoUrl });
        }
      }
    });
    map.forEach((band) => band.people.sort((a, b) => a.name.localeCompare(b.name)));

    const allRects = new Map<string, Rect>();
    nucleusPos.forEach((p, id) => {
      allRects.set(id, { x: p.x, y: p.y, w: TOKEN_W, h: TOKEN_H });
    });
    return [...map.values()].map((b) => {
      const source = allRects.get(b.aId)!;
      const target = allRects.get(b.bId)!;
      const obstacles: { id: string; rect: Rect }[] = [];
      allRects.forEach((rect, id) => {
        if (id !== b.aId && id !== b.bId) obstacles.push({ id, rect });
      });
      const route = routeBandPath(source, target, obstacles);
      return { ...b, route };
    });
  }, [crossPeople, nucleusPos]);

  const highlightSet = useMemo(() => {
    if (!hoveredNucleus && !hoveredEdge) return null;
    const nucleusIds = new Set<string>();
    const bandKeys = new Set<string>();
    if (hoveredNucleus) {
      nucleusIds.add(hoveredNucleus);
      bands.forEach((b) => {
        if (b.aId === hoveredNucleus || b.bId === hoveredNucleus) {
          nucleusIds.add(b.aId);
          nucleusIds.add(b.bId);
          bandKeys.add(`${b.aId}__${b.bId}`);
        }
      });
    }
    if (hoveredEdge) {
      const match = bands.find((b) => `band-${b.aId}__${b.bId}` === hoveredEdge);
      if (match) {
        nucleusIds.add(match.aId);
        nucleusIds.add(match.bId);
        bandKeys.add(`${match.aId}__${match.bId}`);
      }
    }
    return { nucleusIds, bandKeys };
  }, [hoveredNucleus, hoveredEdge, bands]);

  // Nodes are intentionally INDEPENDENT of hover state: rebuilding the
  // nodes array on hover made React Flow re-render the tokens, which reset
  // the hovered element and produced a flicker loop. Hover now only rebuilds
  // the edges (below), so the token DOM — and its CSS :hover — stays put.
  const nodes = useMemo(() => {
    const nodes: Node[] = [];

    nodes.push({
      id: 'axis',
      type: 'axis',
      position: { x: geom.axisX0, y: contentHeight + 8 },
      data: { width: geom.scoredW },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });
    if (hasUnassessed) {
      nodes.push({
        id: 'zone-unassessed',
        type: 'zoneLabel',
        position: { x: OUTER_PAD, y: TOP_PAD - 26 },
        data: { width: geom.leftZoneW, label: 'Not yet assessed' },
        draggable: false,
        selectable: false,
        zIndex: -1,
      });
    }

    nuclei.forEach((n) => {
      const p = nucleusPos.get(n.id);
      if (!p) return;
      const composite = compositeOf(n.id);
      nodes.push({
        id: n.id,
        type: 'nucleus',
        position: p,
        className: 'rf-nucleus',
        data: {
          label: shortName(n.name),
          fullName: n.name,
          peopleCount: totalPeople(n),
          composite,
          levelLabel: milestoneLevel(composite).label,
          isNucleus: true,
        },
        draggable: false,
        zIndex: 1,
      });
    });

    return nodes;
  }, [nuclei, nucleusPos, compositeOf, contentHeight, hasUnassessed, geom]);

  const edges: Edge[] = useMemo(() => bands.map((b) => {
      const key = `${b.aId}__${b.bId}`;
      const strength = strengthFor(b.people.length);
      const dimmed = !!highlightSet && !highlightSet.bandKeys.has(key);
      const highlighted = !!highlightSet && highlightSet.bandKeys.has(key);
      const obstructed =
        !!hoveredNucleus &&
        b.aId !== hoveredNucleus &&
        b.bId !== hoveredNucleus &&
        b.route.crossedIds.includes(hoveredNucleus);
      const fromN = nuclei.find((n) => n.id === b.aId);
      const toN = nuclei.find((n) => n.id === b.bId);
      const data: BandData = {
        people: b.people,
        strength,
        dimmed,
        highlighted,
        obstructed,
        path: b.route.path,
        labelX: b.route.labelX,
        labelY: b.route.labelY,
        onSelect: () => setSelectedBand({
          fromId: b.aId,
          toId: b.bId,
          fromName: fromN?.name ?? '',
          toName: toN?.name ?? '',
          people: b.people,
        }),
      };
      return {
        id: `band-${key}`,
        source: b.aId,
        target: b.bId,
        type: 'connectionBand',
        data: data as unknown as Record<string, unknown>,
        zIndex: 5,
      };
    }), [bands, nuclei, highlightSet, hoveredNucleus]);

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.data.isNucleus) navigate(`/nucleus/${node.id}`);
    },
    [navigate],
  );

  const onNodeMouseEnter = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.data.isNucleus) setHoveredNucleus(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setHoveredNucleus(null), []);
  const onEdgeMouseEnter = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setHoveredEdge(edge.id);
  }, []);
  const onEdgeMouseLeave = useCallback(() => setHoveredEdge(null), []);

  return (
    <div ref={wrapRef} className="w-full h-full bg-slate-50/50 relative network-view-root">
      <style>{`
        .network-view-root .react-flow__edges,
        .network-view-root .react-flow__edgelabel-renderer {
          z-index: 10;
        }
        /* Lift a hovered token above its neighbours purely via CSS so the
           tooltip is never clipped — no z-index change in React (which would
           reorder the DOM and make hover flicker). */
        .network-view-root .react-flow__node.rf-nucleus:hover {
          z-index: 50 !important;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={20} size={1.5} />
        <Controls className="bg-white shadow-md border border-gray-200 rounded-lg overflow-hidden" />
      </ReactFlow>

      <Legend />

      {nuclei.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
            No nuclei to display.
          </div>
        </div>
      )}

      {selectedBand && (
        <BandDetailPanel band={selectedBand} onClose={() => setSelectedBand(null)} onPersonClick={(id) => navigate(`/individual/${id}`)} />
      )}
    </div>
  );
}

// ---------- Legend ----------

// A compact chip that expands the full legend on hover — kept small so it
// doesn't cover the tokens the way a persistent panel did.
function Legend() {
  return (
    <div className="absolute top-3 right-3 z-20 group">
      <button
        type="button"
        className="flex items-center gap-1.5 bg-white/95 border border-gray-200 rounded-full shadow-sm px-3 py-1.5 text-[11px] font-bold text-gray-600 tracking-wider pointer-events-auto"
      >
        <InfoIcon className="w-3.5 h-3.5 text-gray-400" />
        HOW TO READ
      </button>
      <div className="hidden group-hover:block absolute top-full right-0 mt-1.5 w-[250px] bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
        <div className="font-bold text-gray-900 tracking-wider text-[11px] mb-1">MILESTONE THREE PROGRESS</div>
        <p className="text-gray-500 leading-snug mb-2">
          Each nucleus sits left→right by how far it has developed the features of a Milestone Three cluster. Hover a token for detail, or to reveal shared people.
        </p>
        <div className="font-bold text-gray-900 tracking-wider text-[11px] mb-2 mt-2">SHARED PEOPLE</div>
        <ul className="space-y-1.5 text-gray-600">
          <li className="flex items-center gap-2">
            <span className="inline-block h-[3px] w-7 rounded-full" style={{ background: STRENGTH_STYLE.strong.stroke }} />
            <span><b className="text-gray-800">Strong</b> (5+ shared)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-[2px] w-7 rounded-full" style={{ background: STRENGTH_STYLE.moderate.stroke }} />
            <span><b className="text-gray-800">Moderate</b> (2–4 shared)</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-[1.5px] w-7 rounded-full" style={{ background: STRENGTH_STYLE.light.stroke }} />
            <span><b className="text-gray-800">Light</b> (1 shared)</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// ---------- Band detail panel ----------

function BandDetailPanel({
  band,
  onClose,
  onPersonClick,
}: {
  band: SelectedBand;
  onClose: () => void;
  onPersonClick: (id: string) => void;
}) {
  return (
    <div className="absolute top-3 left-3 w-[300px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
      <div className="flex items-start justify-between p-3 border-b border-gray-100">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-gray-500 tracking-wider">PEOPLE CONNECTING</div>
          <div className="text-sm font-semibold text-gray-900 leading-tight truncate">
            {band.fromName} <span className="text-gray-400">↔</span> {band.toName}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{band.people.length} shared {band.people.length === 1 ? 'person' : 'people'}</div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
          aria-label="Close"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
        {band.people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPersonClick(p.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <Avatar name={p.name} photoUrl={p.photoUrl} size={28} ring={false} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                <div className="text-[11px] text-gray-500">Active in both</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
