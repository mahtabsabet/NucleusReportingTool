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
import { ShieldCheckIcon, SproutIcon, TrendingUpIcon, XIcon } from 'lucide-react';
import { fetchCrossNucleusPersons, type CrossNucleusPerson } from '../lib/db/reports';

// ---------- Types & layout constants ----------

type Tier = 'established' | 'growing' | 'emerging';

interface NucleusShape {
  id: string;
  name: string;
  engagementCounts: { coordinating: number; supporting: number; participating: number; aware: number };
}

interface NetworkViewProps {
  nuclei: NucleusShape[];
  clusterId: string | null;
}

const TIER_ORDER: Tier[] = ['established', 'growing', 'emerging'];

const TIER_META: Record<Tier, {
  title: string;
  blurb: string;
  band: string;        // tailwind bg
  border: string;      // tailwind border
  accent: string;      // text/icon color
  cardBorder: string;  // nucleus card border tailwind
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  established: {
    title: 'ESTABLISHED NUCLEI',
    blurb: 'Strong, stable nuclei with consistent activity.',
    band: 'bg-violet-50/60',
    border: 'border-violet-200',
    accent: 'text-violet-700',
    cardBorder: 'border-violet-400',
    Icon: ShieldCheckIcon,
  },
  growing: {
    title: 'GROWING NUCLEI',
    blurb: 'Nuclei with steady growth and increasing connections.',
    band: 'bg-blue-50/50',
    border: 'border-blue-200',
    accent: 'text-blue-700',
    cardBorder: 'border-blue-300',
    Icon: TrendingUpIcon,
  },
  emerging: {
    title: 'EMERGING NUCLEI',
    blurb: 'New or developing nuclei with early connections.',
    band: 'bg-emerald-50/50',
    border: 'border-emerald-200',
    accent: 'text-emerald-700',
    cardBorder: 'border-emerald-300',
    Icon: SproutIcon,
  },
};

const LANE_LABEL_WIDTH = 220;
const LANE_HEIGHT = 240;
const LANE_GAP = 32;
const NUCLEUS_W = 168;
const NUCLEUS_H = 64;
const NUCLEUS_SPACING = 280; // horizontal distance between nucleus centers
const LANE_PADDING_X = 80;

function totalPeople(n: NucleusShape): number {
  return Object.values(n.engagementCounts).reduce((a, b) => a + b, 0);
}

// Heuristic tier classification — there is no `tier` field in the schema yet,
// so we derive it from engagement counts. This matches the developmental
// reading: established nuclei have multiple coordinators, growing nuclei have
// at least one coordinator or a meaningful body of supporters/participants,
// and everything else is emerging.
function tierFor(n: NucleusShape): Tier {
  const { coordinating, supporting, participating } = n.engagementCounts;
  if (coordinating >= 2 && totalPeople(n) >= 8) return 'established';
  if (coordinating >= 1 || supporting + participating >= 4) return 'growing';
  return 'emerging';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
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
  light:    { stroke: '#10b981', width: 1.5, pillBg: 'bg-emerald-50',  pillBorder: 'border-emerald-300' },
};

// ---------- Custom nodes ----------

const TierLaneNode = ({ data }: NodeProps) => {
  const tier = data.tier as Tier;
  const meta = TIER_META[tier];
  const Icon = meta.Icon;
  const width = data.width as number;
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`rounded-2xl ${meta.band} ${meta.border} border-2 border-dashed`}
      style={{ width, height: LANE_HEIGHT, pointerEvents: 'none' }}
    >
      <div className="flex h-full">
        <div className="w-[220px] shrink-0 p-5 flex flex-col gap-2">
          <div
            className={`relative inline-flex items-center gap-2 ${meta.accent}`}
            style={{ pointerEvents: 'auto', cursor: 'help', alignSelf: 'flex-start' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <Icon className="w-5 h-5" />
            <span className="text-base font-bold tracking-wider">{meta.title}</span>
            {hovered && (
              <div
                className="absolute left-0 top-full mt-1.5 z-50 w-[260px] bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs text-gray-700 leading-snug"
                style={{ pointerEvents: 'none' }}
              >
                {meta.blurb}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const RING_BY_TIER: Record<Tier, string> = {
  established: 'ring-violet-300',
  growing: 'ring-blue-300',
  emerging: 'ring-emerald-300',
};

const NucleusCardNode = ({ data, selected }: NodeProps) => {
  const tier = data.tier as Tier;
  const meta = TIER_META[tier];
  const dimmed = data.dimmed as boolean;
  const highlighted = data.highlighted as boolean;
  const peopleCount = data.peopleCount as number;
  const ringClass = highlighted || selected ? `shadow-xl ring-2 ring-offset-1 ${RING_BY_TIER[tier]}` : '';
  // On hover, scale the card up so its label is easier to read. The scale
  // is applied to the card's content layer so it pops over neighbouring cards
  // without changing its anchored bounding rect (which routing relies on).
  const scaleStyle = highlighted
    ? { transform: 'scale(1.18)', zIndex: 50 }
    : { transform: 'scale(1)', zIndex: 'auto' as const };
  return (
    <div
      className={`relative bg-white border-2 ${meta.cardBorder} rounded-xl shadow-sm transition-all duration-150 ${ringClass} ${dimmed ? 'opacity-30' : 'opacity-100'}`}
      style={{
        width: NUCLEUS_W,
        height: NUCLEUS_H,
        transformOrigin: 'center center',
        ...scaleStyle,
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <div className="flex flex-col items-center justify-center text-center px-3 py-2 h-full gap-0.5">
        <div className="font-semibold text-gray-900 text-sm leading-tight">{data.label as string}</div>
        <div className="text-[11px] font-medium text-gray-500">
          {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        </div>
      </div>
    </div>
  );
};

const nodeTypes = { tierLane: TierLaneNode, nucleusCard: NucleusCardNode };

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
  // Magnitude scales with the deepest obstacle's reach perpendicular to the line.
  const candidates: { offset: number; cx: number; cy: number; crossed: { id: string; rect: Rect }[] }[] = [];
  for (const sign of [1, -1]) {
    // Magnitude: enough to clear the worst-case obstacle's far corner from the chord.
    let mag = 0;
    for (const o of blocking) {
      const corners = [
        { x: o.rect.x, y: o.rect.y },
        { x: o.rect.x + o.rect.w, y: o.rect.y },
        { x: o.rect.x, y: o.rect.y + o.rect.h },
        { x: o.rect.x + o.rect.w, y: o.rect.y + o.rect.h },
      ];
      for (const c of corners) {
        const proj = (c.x - mx) * nx + (c.y - my) * ny; // signed perpendicular distance from chord
        const reach = sign > 0 ? proj : -proj;
        if (reach > mag) mag = reach;
      }
    }
    // Bezier apex sits at half the control-point offset from the chord, so double the push.
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
  obstructed: boolean; // hovered card is blocked by this band → fade so card is readable
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

  // When the band is being focused (one of its endpoints is hovered, or the
  // band itself is hovered), draw a thicker line and enlarge the pill so the
  // people on the connector are easier to read.
  const focused = d.highlighted;
  const strokeWidth = focused ? style.width + 3 : style.width;
  const avatarSize = focused ? 30 : 22;
  const showNames = d.people.length <= 3;
  const visible = d.people.slice(0, focused ? 6 : 4);
  const overflow = d.people.length - visible.length;
  const labelScale = focused ? 1.15 : 1;

  return (
    <>
      {/* A wide, transparent hit-area path on top of the visible stroke so
          mousing anywhere along the line registers as a hover on the edge. */}
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
  const [hoveredNucleus, setHoveredNucleus] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedBand, setSelectedBand] = useState<SelectedBand | null>(null);

  useEffect(() => {
    const ids = nuclei.map((n) => n.id);
    if (ids.length === 0) { setCrossPeople([]); return; }
    fetchCrossNucleusPersons(ids)
      .then(setCrossPeople)
      .catch((err) => console.error('Failed to load cross-nucleus persons:', err));
  }, [nuclei]);

  // Tier-grouped nuclei + position map.
  const { nucleusPos, tierOf, laneWidth } = useMemo(() => {
    const tierOf = new Map<string, Tier>();
    const grouped: Record<Tier, NucleusShape[]> = { established: [], growing: [], emerging: [] };
    nuclei.forEach((n) => {
      const t = tierFor(n);
      tierOf.set(n.id, t);
      grouped[t].push(n);
    });
    TIER_ORDER.forEach((t) => grouped[t].sort((a, b) => b.engagementCounts.coordinating - a.engagementCounts.coordinating || a.name.localeCompare(b.name)));

    const maxCount = Math.max(1, ...TIER_ORDER.map((t) => grouped[t].length));
    const laneWidth = LANE_LABEL_WIDTH + LANE_PADDING_X * 2 + Math.max(1, maxCount) * NUCLEUS_SPACING;

    const pos = new Map<string, { x: number; y: number }>();
    TIER_ORDER.forEach((t, ti) => {
      const rowY = ti * (LANE_HEIGHT + LANE_GAP) + LANE_HEIGHT / 2;
      const list = grouped[t];
      const rowStart = LANE_LABEL_WIDTH + LANE_PADDING_X + (Math.max(1, maxCount) - list.length) * NUCLEUS_SPACING / 2;
      list.forEach((n, i) => {
        const cx = rowStart + i * NUCLEUS_SPACING + NUCLEUS_SPACING / 2;
        pos.set(n.id, { x: cx - NUCLEUS_W / 2, y: rowY - NUCLEUS_H / 2 });
      });
    });

    return { nucleusPos: pos, tierOf, laneWidth };
  }, [nuclei]);

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

    // Build obstacle index once, then compute a routed path per band.
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

  // Highlight set: nucleus + connected nuclei + bands touching it. Hovering
  // a connector itself highlights the connector and its two endpoint nuclei.
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

  // Build ReactFlow nodes & edges.
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];

    TIER_ORDER.forEach((t, ti) => {
      nodes.push({
        id: `lane-${t}`,
        type: 'tierLane',
        position: { x: 0, y: ti * (LANE_HEIGHT + LANE_GAP) },
        data: { tier: t, width: laneWidth },
        draggable: false,
        selectable: false,
        zIndex: -1,
      });
    });

    nuclei.forEach((n) => {
      const p = nucleusPos.get(n.id);
      if (!p) return;
      const tier = tierOf.get(n.id)!;
      const dimmed = !!highlightSet && !highlightSet.nucleusIds.has(n.id);
      const highlighted = !!highlightSet && highlightSet.nucleusIds.has(n.id);
      nodes.push({
        id: n.id,
        type: 'nucleusCard',
        position: p,
        data: {
          label: n.name,
          peopleCount: totalPeople(n),
          tier,
          dimmed,
          highlighted,
          isNucleus: true,
        },
        // Cards stay fixed: routed paths depend on the deterministic tier
        // layout, so dragging would invalidate the obstacle avoidance.
        draggable: false,
        zIndex: 1,
      });
    });

    const edges: Edge[] = bands.map((b) => {
      const key = `${b.aId}__${b.bId}`;
      const strength = strengthFor(b.people.length);
      const dimmed = !!highlightSet && !highlightSet.bandKeys.has(key);
      const highlighted = !!highlightSet && highlightSet.bandKeys.has(key);
      // If the user is hovering a card that this band passes over (and the band is
      // not connected to it), fade the band so the card is readable.
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
  }, [nuclei, bands, nucleusPos, tierOf, laneWidth, highlightSet, hoveredNucleus]);

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

  // Derived data for the selected-band panel.
  return (
    <div className="w-full h-full bg-slate-50/50 relative network-view-root">
      {/* Lift connector lines and avatar pills above nucleus cards so a line that
          must pass through a card stays visible. xyflow's defaults render nodes
          on top of both the edges svg and the EdgeLabelRenderer portal. */}
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
    <div className="absolute top-3 right-3 bg-white/95 border border-gray-200 rounded-xl shadow-sm p-3 text-xs w-[220px] pointer-events-none">
      <div className="font-bold text-gray-900 tracking-wider text-[11px] mb-2">LEGEND</div>
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
