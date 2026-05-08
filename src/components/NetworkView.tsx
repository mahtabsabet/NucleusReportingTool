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
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useNavigate } from 'react-router-dom';
import { UsersIcon, ShieldCheckIcon, SproutIcon, TrendingUpIcon, XIcon } from 'lucide-react';
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
    blurb: 'Strong, stable nuclei with consistent activity and capacity.',
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
const NUCLEUS_W = 200;
const NUCLEUS_H = 100;
const NUCLEUS_SPACING = 320; // horizontal distance between nucleus centers
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
  return (
    <div
      className={`rounded-2xl ${meta.band} ${meta.border} border-2 border-dashed`}
      style={{ width, height: LANE_HEIGHT, pointerEvents: 'none' }}
    >
      <div className="flex h-full">
        <div className="w-[220px] shrink-0 p-5 flex flex-col gap-2">
          <div className={`flex items-center gap-2 ${meta.accent}`}>
            <Icon className="w-4 h-4" />
            <span className="text-[11px] font-bold tracking-wider">{meta.title}</span>
          </div>
          <p className="text-xs text-gray-600 leading-snug">{meta.blurb}</p>
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
  const Icon = tier === 'emerging' ? SproutIcon : UsersIcon;
  const ringClass = highlighted || selected ? `shadow-lg ring-2 ring-offset-1 ${RING_BY_TIER[tier]}` : '';
  return (
    <div
      className={`relative px-4 py-3 bg-white border-2 ${meta.cardBorder} rounded-xl shadow-sm transition-all duration-150 ${ringClass} ${dimmed ? 'opacity-30' : 'opacity-100'}`}
      style={{ width: NUCLEUS_W, minHeight: NUCLEUS_H }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <div className="flex flex-col items-center text-center gap-1">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${meta.band}`}>
          <Icon className={`w-4 h-4 ${meta.accent}`} />
        </div>
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

// ---------- Path routing ----------

interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }

function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function ccw(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentIntersectsRect(s: Pt, t: Pt, r: Rect): boolean {
  if (pointInRect(s, r) || pointInRect(t, r)) return true;
  const corners: Pt[] = [
    { x: r.x,         y: r.y },
    { x: r.x + r.w,   y: r.y },
    { x: r.x + r.w,   y: r.y + r.h },
    { x: r.x,         y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(s, t, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

interface RoutedPath { d: string; labelX: number; labelY: number; blockers: string[] }

// Pick a quadratic bezier that arcs around any nucleus rect intersected by the
// straight line between the two endpoints. The apex of the curve is offset to
// the side of the chord that requires less deflection, far enough past every
// obstructing corner that the curve clears it.
function routePath(s: Pt, t: Pt, obstacles: { id: string; rect: Rect }[], margin = 28): RoutedPath {
  const blockers = obstacles.filter((o) => segmentIntersectsRect(s, t, o.rect));
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;

  if (blockers.length === 0) {
    return { d: `M ${s.x} ${s.y} L ${t.x} ${t.y}`, labelX: mx, labelY: my, blockers: [] };
  }

  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // perpendicular unit vector to the chord
  const py = dx / len;

  let bestSide = 1;
  let bestApex = Infinity;
  for (const side of [1, -1] as const) {
    let maxPerp = 0;
    for (const b of blockers) {
      const corners: Pt[] = [
        { x: b.rect.x,           y: b.rect.y },
        { x: b.rect.x + b.rect.w, y: b.rect.y },
        { x: b.rect.x + b.rect.w, y: b.rect.y + b.rect.h },
        { x: b.rect.x,           y: b.rect.y + b.rect.h },
      ];
      for (const c of corners) {
        const signed = side * ((c.x - mx) * px + (c.y - my) * py);
        if (signed > maxPerp) maxPerp = signed;
      }
    }
    const apex = maxPerp + margin;
    if (apex < bestApex) { bestApex = apex; bestSide = side; }
  }

  // For a quadratic bezier, B(0.5) = (S + 2C + T) / 4, i.e. apex = midpoint + (C - midpoint) / 2.
  // To place the apex at distance `bestApex` from the chord on `bestSide`,
  // C must be at twice that perpendicular offset from the midpoint.
  const apexX = mx + bestSide * bestApex * px;
  const apexY = my + bestSide * bestApex * py;
  const cx = 2 * apexX - mx;
  const cy = 2 * apexY - my;

  return {
    d: `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`,
    labelX: apexX,
    labelY: apexY,
    blockers: blockers.map((b) => b.id),
  };
}

// ---------- Custom edge: connection band ----------

interface BandData {
  people: { id: string; name: string; photoUrl: string | null }[];
  strength: Strength;
  dimmed: boolean;
  highlighted: boolean;
  pathD: string;
  labelX: number;
  labelY: number;
  onSelect: () => void;
}

function ConnectionBandEdge(props: EdgeProps) {
  const { id, data } = props;
  const d = data as unknown as BandData;
  const style = STRENGTH_STYLE[d.strength];
  const baseOpacity = d.dimmed ? 0.15 : d.highlighted ? 1 : 0.85;

  const visible = d.people.slice(0, 4);
  const overflow = d.people.length - visible.length;
  const showNames = d.people.length <= 3;

  return (
    <>
      <BaseEdge
        id={id}
        path={d.pathD}
        style={{
          stroke: style.stroke,
          strokeWidth: d.highlighted ? style.width + 1.5 : style.width,
          opacity: baseOpacity,
          fill: 'none',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${d.labelX}px, ${d.labelY}px)`,
            opacity: d.dimmed ? 0.35 : 1,
          }}
          className="pointer-events-auto select-none nodrag nopan"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); d.onSelect(); }}
            className={`flex items-center gap-0.5 ${style.pillBg} ${style.pillBorder} border rounded-full pl-1 pr-1.5 py-0.5 shadow-sm hover:shadow-md hover:scale-105 transition-transform`}
          >
            <div className="flex -space-x-1.5">
              {visible.map((p) => (
                <Avatar key={p.id} name={p.name} photoUrl={p.photoUrl} size={22} />
              ))}
            </div>
            {overflow > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-700">
                +{overflow}
              </span>
            )}
          </button>
          {showNames && (
            <div className="text-[10px] text-gray-600 text-center mt-0.5 font-medium whitespace-nowrap">
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

  // Pairwise connection bands (one band per unordered nucleus pair).
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
    return [...map.values()];
  }, [crossPeople, nucleusPos]);

  // Highlight set: nucleus + connected nuclei + bands touching it.
  const highlightSet = useMemo(() => {
    if (!hoveredNucleus) return null;
    const nucleusIds = new Set<string>([hoveredNucleus]);
    const bandKeys = new Set<string>();
    bands.forEach((b) => {
      if (b.aId === hoveredNucleus || b.bId === hoveredNucleus) {
        nucleusIds.add(b.aId);
        nucleusIds.add(b.bId);
        bandKeys.add(`${b.aId}__${b.bId}`);
      }
    });
    return { nucleusIds, bandKeys };
  }, [hoveredNucleus, bands]);

  // Build ReactFlow nodes & edges.
  const { initialNodes, initialEdges } = useMemo(() => {
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
        draggable: false,
        zIndex: 1,
      });
    });

    // Rect index — used both for routing around obstacles and for centering
    // edge endpoints on each nucleus card.
    const allRects: { id: string; rect: Rect; center: Pt }[] = [];
    nucleusPos.forEach((p, id) => {
      allRects.push({
        id,
        rect: { x: p.x, y: p.y, w: NUCLEUS_W, h: NUCLEUS_H },
        center: { x: p.x + NUCLEUS_W / 2, y: p.y + NUCLEUS_H / 2 },
      });
    });

    const edges: Edge[] = bands.map((b) => {
      const key = `${b.aId}__${b.bId}`;
      const strength = strengthFor(b.people.length);
      const dimmed = !!highlightSet && !highlightSet.bandKeys.has(key);
      const highlighted = !!highlightSet && highlightSet.bandKeys.has(key);
      const fromN = nuclei.find((n) => n.id === b.aId);
      const toN = nuclei.find((n) => n.id === b.bId);

      const sCenter = allRects.find((r) => r.id === b.aId)?.center ?? { x: 0, y: 0 };
      const tCenter = allRects.find((r) => r.id === b.bId)?.center ?? { x: 0, y: 0 };
      const obstacles = allRects.filter((r) => r.id !== b.aId && r.id !== b.bId);
      const routed = routePath(sCenter, tCenter, obstacles);

      const data: BandData = {
        people: b.people,
        strength,
        dimmed,
        highlighted,
        pathD: routed.d,
        labelX: routed.labelX,
        labelY: routed.labelY,
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

    return { initialNodes: nodes, initialEdges: edges };
  }, [nuclei, bands, nucleusPos, tierOf, laneWidth, highlightSet]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

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

  // Derived data for the selected-band panel.
  return (
    <div className="network-view-root w-full h-full bg-slate-50/50 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
