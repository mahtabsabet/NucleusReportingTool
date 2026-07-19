import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate } from 'react-router-dom';
import { XIcon } from 'lucide-react';
import { fetchCrossNucleusPersons, type CrossNucleusPerson } from '../lib/db/reports';
import { fetchMilestoneCompositesForNuclei, type NucleusComposite } from '../lib/db/milestoneThree';
import { MILESTONE_THREE_MAX, milestoneLevel } from '../lib/milestoneThree';

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

// Card geometry.
const NUCLEUS_W = 176;
const NUCLEUS_H = 78;

// Progress-axis geometry. Nuclei are positioned left→right by their
// Milestone Three composite (0→10). Those with no scores yet sit in a
// dedicated "not yet assessed" column to the left of the axis origin.
const LEFT_PAD = 40;
const TOP_PAD = 56;
const UNASSESSED_W = 170;
const ZONE_GAP = 120;
const SCORED_AXIS_W = 880;
const H_GAP = 26;                        // min horizontal gap between cards in a row
const ROW_H = NUCLEUS_H + 46;
const AXIS_X0 = LEFT_PAD + UNASSESSED_W + ZONE_GAP; // x-center at composite 0
const UNASSESSED_CX = LEFT_PAD + UNASSESSED_W / 2;

function axisCenterX(composite: number): number {
  return AXIS_X0 + (composite / MILESTONE_THREE_MAX) * SCORED_AXIS_W;
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

const NucleusCardNode = ({ data, selected }: NodeProps) => {
  const composite = data.composite as number | null;
  const level = milestoneLevel(composite);
  const dimmed = data.dimmed as boolean;
  const highlighted = data.highlighted as boolean;
  const peopleCount = data.peopleCount as number;
  const ringClass = highlighted || selected ? 'shadow-xl ring-2 ring-offset-1' : '';
  const scaleStyle = highlighted
    ? { transform: 'scale(1.12)', zIndex: 50 }
    : { transform: 'scale(1)', zIndex: 'auto' as const };
  const pct = composite === null ? 0 : (composite / MILESTONE_THREE_MAX) * 100;
  return (
    <div
      className={`relative bg-white border-2 rounded-xl shadow-sm transition-all duration-150 ${ringClass} ${dimmed ? 'opacity-30' : 'opacity-100'}`}
      style={{
        width: NUCLEUS_W,
        height: NUCLEUS_H,
        transformOrigin: 'center center',
        borderColor: level.color,
        ...(highlighted || selected ? { boxShadow: `0 0 0 3px ${level.color}33` } : {}),
        ...scaleStyle,
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <div className="flex flex-col justify-center px-3 py-2 h-full gap-1">
        <div className="font-semibold text-gray-900 text-sm leading-tight truncate">{data.label as string}</div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: level.color }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold" style={{ color: level.color }}>
            {composite === null ? level.label : `${composite.toFixed(1)} · ${level.label}`}
          </span>
          <span className="text-[10px] font-medium text-gray-400">
            {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>
    </div>
  );
};

// The progress ruler along the bottom: a gradient track from "not
// present" through to "established", with anchor ticks.
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
      <div className="relative mt-1" style={{ height: 34 }}>
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
        <div className="absolute left-0 top-5 text-[10px] font-semibold text-amber-600">Not present</div>
        <div className="absolute top-5 text-[10px] font-semibold text-blue-600" style={{ left: '50%', transform: 'translateX(-50%)' }}>Emerging</div>
        <div className="absolute right-0 top-5 text-[10px] font-semibold text-violet-600">Established</div>
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

const nodeTypes = { nucleusCard: NucleusCardNode, axis: AxisNode, zoneLabel: ZoneLabelNode };

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

// ---------- Routing helpers (curve edges around obstacle cards) ----------

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

// Move a point at the rect's center toward (toX, toY) until it hits the rect's edge,
// so that lines start/end on the card boundary rather than its center.
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
  crossedIds: string[]; // ids of obstacle cards the rendered curve still passes over
}

// Compute a curved path from source-card to target-card, bending around obstacle cards
// when the straight line would pass through them. Falls back to a straight line if clear.
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
  const nx = -dy / len; // perpendicular unit
  const ny = dx / len;
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;

  // Try both perpendicular directions and pick the one that clears more obstacles.
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
  const baseOpacity = d.obstructed ? 0.12 : d.dimmed ? 0.15 : d.highlighted ? 1 : 0.85;

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
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${d.labelX}px, ${d.labelY}px) scale(${labelScale})`,
            transformOrigin: 'center center',
            opacity: d.obstructed ? 0.15 : d.dimmed ? 0.35 : 1,
            transition: 'opacity 150ms ease, transform 150ms ease',
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
            <div
              className="text-gray-700 text-center mt-1 font-medium whitespace-nowrap"
              style={{ fontSize: focused ? 12 : 10 }}
            >
              {visible.map((p) => shortName(p.name)).join(' • ')}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { connectionBand: ConnectionBandEdge };

// ---------- Layout ----------

// Greedy row packing: place cards left→right by their axis center-x,
// dropping each into the first row where it won't horizontally overlap
// the previous card. Cards with similar progress therefore stack
// vertically instead of colliding — a progress scatter, not lanes.
function packPositions(
  items: { id: string; centerX: number; name: string }[],
): { pos: Map<string, { x: number; y: number }>; rows: number } {
  const sorted = [...items].sort((a, b) => a.centerX - b.centerX || a.name.localeCompare(b.name));
  const rowRight: number[] = [];
  const pos = new Map<string, { x: number; y: number }>();
  for (const it of sorted) {
    const left = it.centerX - NUCLEUS_W / 2 - H_GAP;
    let row = rowRight.findIndex((r) => r <= left);
    if (row === -1) { row = rowRight.length; rowRight.push(0); }
    rowRight[row] = it.centerX + NUCLEUS_W / 2;
    pos.set(it.id, { x: it.centerX - NUCLEUS_W / 2, y: TOP_PAD + row * ROW_H });
  }
  return { pos, rows: rowRight.length };
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

  // Positions along the progress axis (assessed) or in the left column
  // (unassessed).
  const { nucleusPos, rows, hasUnassessed } = useMemo(() => {
    const items = nuclei.map((n) => {
      const c = compositeOf(n.id);
      return {
        id: n.id,
        name: n.name,
        centerX: c === null ? UNASSESSED_CX : axisCenterX(c),
      };
    });
    const { pos, rows } = packPositions(items);
    const hasUnassessed = nuclei.some((n) => compositeOf(n.id) === null);
    return { nucleusPos: pos, rows, hasUnassessed };
  }, [nuclei, compositeOf]);

  const contentHeight = TOP_PAD + Math.max(1, rows) * ROW_H;

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
      allRects.set(id, { x: p.x, y: p.y, w: NUCLEUS_W, h: NUCLEUS_H });
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

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];

    // Progress-axis ruler along the bottom.
    nodes.push({
      id: 'axis',
      type: 'axis',
      position: { x: AXIS_X0, y: contentHeight + 4 },
      data: { width: SCORED_AXIS_W },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });
    if (hasUnassessed) {
      nodes.push({
        id: 'zone-unassessed',
        type: 'zoneLabel',
        position: { x: LEFT_PAD, y: TOP_PAD - 30 },
        data: { width: UNASSESSED_W, label: 'Not yet assessed' },
        draggable: false,
        selectable: false,
        zIndex: -1,
      });
    }

    nuclei.forEach((n) => {
      const p = nucleusPos.get(n.id);
      if (!p) return;
      const dimmed = !!highlightSet && !highlightSet.nucleusIds.has(n.id);
      const highlighted = !!highlightSet && highlightSet.nucleusIds.has(n.id);
      nodes.push({
        id: n.id,
        type: 'nucleusCard',
        position: p,
        data: {
          label: n.name,
          peopleCount: totalPeople(n),
          composite: compositeOf(n.id),
          dimmed,
          highlighted,
          isNucleus: true,
        },
        draggable: false,
        zIndex: 1,
      });
    });

    const edges: Edge[] = bands.map((b) => {
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
    });

    return { nodes, edges };
  }, [nuclei, bands, nucleusPos, compositeOf, highlightSet, hoveredNucleus, contentHeight, hasUnassessed]);

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
    <div className="w-full h-full bg-slate-50/50 relative network-view-root">
      <style>{`
        .network-view-root .react-flow__edges,
        .network-view-root .react-flow__edgelabel-renderer {
          z-index: 10;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        fitViewOptions={{ padding: 0.15 }}
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

function Legend() {
  return (
    <div className="absolute top-3 right-3 bg-white/95 border border-gray-200 rounded-xl shadow-sm p-3 text-xs w-[240px] pointer-events-none">
      <div className="font-bold text-gray-900 tracking-wider text-[11px] mb-1">MILESTONE THREE PROGRESS</div>
      <p className="text-gray-500 leading-snug mb-2">
        Cards sit left→right by how far the nucleus has developed the features of a Milestone Three cluster.
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
