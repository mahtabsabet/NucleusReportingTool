import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserIcon,
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
  UsersIcon,
  HeartIcon,
  StarIcon,
  ChevronDownIcon,
} from 'lucide-react';
import {
  fetchNucleusEnrollmentsWithNames,
  updatePrimaryContact,
  type NucleusEnrollmentEntry,
} from '../lib/db/nucleus';
import { supabase } from '../lib/supabase';

type Level = 'coordinating' | 'participating' | 'supporting' | 'aware';

const LEVEL_COLORS: Record<Level, { border: string; avatar: string; bg: string }> = {
  aware:        { border: '#d1d5db', avatar: '#9ca3af', bg: '#f3f4f6' },
  supporting:   { border: '#fbbf24', avatar: '#f59e0b', bg: '#fef3c7' },
  participating:{ border: '#34d399', avatar: '#10b981', bg: '#d1fae5' },
  coordinating: { border: '#60a5fa', avatar: '#3b82f6', bg: '#bfdbfe' },
};

const LEVEL_BADGE: Record<Level | 'unplaced', { bg: string; text: string; label: string }> = {
  coordinating: { bg: '#dbeafe', text: '#1d4ed8', label: 'Core' },
  supporting:   { bg: '#fef3c7', text: '#78350f', label: 'Supporting' },
  participating:{ bg: '#d1fae5', text: '#065f46', label: 'Participating' },
  aware:        { bg: '#f3f4f6', text: '#374151', label: 'Aware' },
  unplaced:     { bg: '#f3f4f6', text: '#374151', label: 'Unplaced' },
};

const LEVEL_RANK: Record<Level, number> = {
  coordinating: 4,
  supporting:   3,
  participating:2,
  aware:        1,
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  children_class: "Children's Class",
  junior_youth:   'Junior Youth',
  study_circle:   'Study Circle',
  devotional:     'Devotional Gathering',
  fireside:       'Fireside',
  other:          'Activity',
};

const ACTIVITY_ICON_COLORS: Record<string, { icon: React.ElementType; color: string }> = {
  children_class: { icon: UsersIcon,    color: '#7c3aed' },
  study_circle:   { icon: BookOpenIcon, color: '#059669' },
  devotional:     { icon: HeartIcon,    color: '#d97706' },
  junior_youth:   { icon: StarIcon,     color: '#2563eb' },
  fireside:       { icon: UsersIcon,    color: '#6b7280' },
  other:          { icon: UsersIcon,    color: '#6b7280' },
};

interface PanelActivity {
  id: string;
  name: string;
  type: string;
  schedule?: string;
  role: string;
}

interface SimNode {
  id: string;
  name: string;
  level: Level | 'unplaced';
  primaryContactId: string | null;
  photoUrl: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DEFAULT_NODE_R = 22;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;

interface LayoutConfig {
  width: number;
  height: number;
  nodeR: number;
  idealEdge: number;
  repulsion: number;
  iterations: number;
}

// Density-aware layout config. Avatars stay clickable (min 14px) and the
// logical canvas grows with node count so dense nuclei have more breathing room.
function computeLayoutConfig(count: number): LayoutConfig {
  const n = Math.max(count, 1);
  // Canvas grows with sqrt(count) so area scales roughly linearly with nodes.
  const factor = Math.max(1, Math.min(2.0, Math.sqrt(n / 12)));
  return {
    width: Math.round(DEFAULT_WIDTH * factor),
    height: Math.round(DEFAULT_HEIGHT * factor),
    nodeR: Math.round(Math.max(14, Math.min(DEFAULT_NODE_R, 26 - n * 0.18))),
    idealEdge: Math.round(120 * Math.min(factor, 1.5)),
    repulsion: Math.round(4000 * factor),
    iterations: Math.min(600, 300 + Math.max(0, n - 12) * 8),
  };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
}

async function fetchPanelActivities(personId: string): Promise<PanelActivity[]> {
  const { data, error } = await supabase
    .from('activity_participants')
    .select('role, activities(id, name, type, schedule_notes)')
    .eq('person_id', personId)
    .is('deleted_at', null);
  if (error || !data) return [];
  return (data as any[])
    .filter((ap: any) => ap.activities)
    .map((ap: any) => ({
      id: ap.activities.id,
      name: ap.activities.name,
      type: ap.activities.type ?? 'other',
      schedule: ap.activities.schedule_notes ?? undefined,
      role: ap.role,
    }));
}

// Run force simulation synchronously for `steps` iterations, mutating nodes in place
function simulateStep(
  nodes: SimNode[],
  edges: { source: string; target: string }[],
  steps: number,
  cfg: LayoutConfig,
) {
  const minSep = cfg.nodeR * 2 + 6;
  for (let s = 0; s < steps; s++) {
    nodes.forEach(n => {
      n.vx += (cfg.width / 2 - n.x) * 0.0015;
      n.vy += (cfg.height / 2 - n.y) * 0.0015;
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.1;
        const dy = b.y - a.y || 0.1;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2) || 1;
        // Sharp short-range repulsion when avatars overlap, falling off with 1/r²
        const overlap = Math.max(0, minSep - dist);
        const force = cfg.repulsion / dist2 + overlap * 0.6;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    edges.forEach(({ source, target }) => {
      const s = nodeMap.get(source);
      const t = nodeMap.get(target);
      if (!s || !t) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - cfg.idealEdge) * 0.04;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    });

    nodes.forEach(n => {
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(cfg.nodeR + 4, Math.min(cfg.width - cfg.nodeR - 4, n.x));
      n.y = Math.max(cfg.nodeR + 4, Math.min(cfg.height - cfg.nodeR - 4, n.y));
    });
  }
}

function initNodes(enrollments: NucleusEnrollmentEntry[], cfg: LayoutConfig): SimNode[] {
  return enrollments.map((e, i) => {
    const angle = (2 * Math.PI * i) / Math.max(enrollments.length, 1);
    const r = Math.min(cfg.width, cfg.height) * 0.3;
    return {
      id: e.personId,
      name: e.name,
      level: (e.engagementLevel ?? 'unplaced') as Level | 'unplaced',
      primaryContactId: e.primaryContactId,
      photoUrl: e.photoUrl,
      x: cfg.width / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: cfg.height / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
    };
  });
}

function buildEdges(nodes: SimNode[]): { source: string; target: string }[] {
  const ids = new Set(nodes.map(n => n.id));
  const edges: { source: string; target: string }[] = [];
  nodes.forEach(n => {
    if (n.primaryContactId && ids.has(n.primaryContactId)) {
      edges.push({ source: n.id, target: n.primaryContactId });
    }
  });
  return edges;
}

function validContacts(
  nodes: SimNode[],
  personId: string,
  personLevel: Level | 'unplaced'
): { id: string; name: string }[] {
  return nodes.filter(n => {
    if (n.id === personId) return false;
    if (n.level === 'unplaced') return false;
    if (personLevel === 'unplaced') return true;
    return LEVEL_RANK[n.level as Level] >= LEVEL_RANK[personLevel as Level];
  });
}

interface Props {
  nucleusId: string;
}

export function InNucleusNetworkView({ nucleusId }: Props) {
  const navigate = useNavigate();
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<{ source: string; target: string }[]>([]);
  const iterRef = useRef(0);
  const layoutRef = useRef<LayoutConfig>(computeLayoutConfig(0));
  // Mirror of hoveredId so the simulation tick can pause without React re-renders
  const hoveredRef = useRef<string | null>(null);

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [enrollments, setEnrollments] = useState<NucleusEnrollmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = React.useMemo(
    () => computeLayoutConfig(enrollments.length),
    [enrollments.length],
  );

  const setHovered = useCallback((id: string | null) => {
    hoveredRef.current = id;
    setHoveredId(id);
  }, []);

  // Panel state
  const [panel, setPanel] = useState<SimNode | null>(null);
  const [panelActivities, setPanelActivities] = useState<PanelActivity[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelContactId, setPanelContactId] = useState<string | null>(null);
  const [panelContactSaving, setPanelContactSaving] = useState(false);

  const startSimulation = useCallback(
    (nodes: SimNode[], edges: { source: string; target: string }[], cfg: LayoutConfig) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      iterRef.current = 0;
      nodesRef.current = nodes;
      edgesRef.current = edges;
      layoutRef.current = cfg;
      const maxIter = cfg.iterations;

      function tick() {
        if (iterRef.current >= maxIter) {
          rafRef.current = null;
          return;
        }
        // Pause physics while a node is hovered so positions don't shift under the cursor
        if (hoveredRef.current !== null) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        simulateStep(nodesRef.current, edgesRef.current, 5, cfg);
        iterRef.current += 5;
        setPositions(Object.fromEntries(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y }])));
        rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    fetchNucleusEnrollmentsWithNames(nucleusId)
      .then(data => {
        setEnrollments(data);
        const cfg = computeLayoutConfig(data.length);
        layoutRef.current = cfg;
        const nodes = initNodes(data, cfg);
        const edges = buildEdges(nodes);
        startSimulation(nodes, edges, cfg);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [nucleusId, startSimulation]);

  const openPanel = (node: SimNode) => {
    setSelectedId(node.id);
    setPanel(node);
    setPanelContactId(node.primaryContactId);
    setPanelLoading(true);
    setPanelActivities([]);
    fetchPanelActivities(node.id)
      .then(acts => { setPanelActivities(acts); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  };

  const closePanel = () => {
    setPanel(null);
    setSelectedId(null);
  };

  const handleContactChange = async (newContactId: string | null) => {
    if (!panel) return;
    setPanelContactSaving(true);
    try {
      await updatePrimaryContact(panel.id, nucleusId, newContactId);
      setPanelContactId(newContactId);
      // Update enrollments and nodes in ref
      setEnrollments(prev => prev.map(e =>
        e.personId === panel.id ? { ...e, primaryContactId: newContactId } : e
      ));
      nodesRef.current = nodesRef.current.map(n =>
        n.id === panel.id ? { ...n, primaryContactId: newContactId } : n
      );
      edgesRef.current = buildEdges(nodesRef.current);
      // Restart simulation with updated edges
      startSimulation(nodesRef.current, edgesRef.current, layoutRef.current);
    } catch (err) {
      console.error('Failed to update primary contact:', err);
    } finally {
      setPanelContactSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));
  const edges = edgesRef.current;

  const getPos = (id: string) =>
    positions[id] ?? {
      x: nodesRef.current.find(n => n.id === id)?.x ?? layout.width / 2,
      y: nodesRef.current.find(n => n.id === id)?.y ?? layout.height / 2,
    };

  const contactCandidates = panel
    ? validContacts(nodesRef.current, panel.id, panel.level)
    : [];

  const currentContactName = panel && panelContactId
    ? nodeMap.get(panelContactId)?.name ?? null
    : null;

  // Determine connected nodes for hover highlight
  const connectedToHovered = new Set<string>();
  if (hoveredId) {
    edges.forEach(e => {
      if (e.source === hoveredId) connectedToHovered.add(e.target);
      if (e.target === hoveredId) connectedToHovered.add(e.source);
    });
  }

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <p className="text-xs text-gray-400 text-center mb-4">
        Hover over any person to see their name. Click to view details and manage connections.
      </p>

      <div
        className="relative rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden"
        style={{ height: `${Math.max(520, Math.min(900, layout.height + 40))}px` }}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          style={{ cursor: 'default' }}
        >
          {/* Edges - subtle curved paths to reduce visual clutter when many connections cross */}
          {edges.map(edge => {
            const sp = getPos(edge.source);
            const tp = getPos(edge.target);
            const dx = tp.x - sp.x;
            const dy = tp.y - sp.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const offset = Math.min(dist * 0.12, 26);
            const mx = (sp.x + tp.x) / 2 - (dy / dist) * offset;
            const my = (sp.y + tp.y) / 2 + (dx / dist) * offset;
            const d = `M ${sp.x} ${sp.y} Q ${mx} ${my} ${tp.x} ${tp.y}`;
            const isHighlighted =
              hoveredId === edge.source || hoveredId === edge.target ||
              selectedId === edge.source || selectedId === edge.target;
            const isDimmed = hoveredId !== null && !isHighlighted;
            return (
              <path
                key={`${edge.source}-${edge.target}`}
                d={d}
                fill="none"
                stroke={isHighlighted ? '#6366f1' : '#9ca3af'}
                strokeWidth={isHighlighted ? 2.25 : 1.25}
                strokeOpacity={isHighlighted ? 0.9 : isDimmed ? 0.1 : 0.4}
                strokeLinecap="round"
                style={{ transition: 'stroke-opacity 0.2s, stroke-width 0.2s' }}
              />
            );
          })}

          {/* Nodes */}
          {nodesRef.current.map(node => {
            const pos = getPos(node.id);
            const colors = node.level !== 'unplaced'
              ? LEVEL_COLORS[node.level as Level]
              : { border: '#d1d5db', avatar: '#9ca3af', bg: '#f3f4f6' };
            const isHovered = hoveredId === node.id;
            const isSelected = selectedId === node.id;
            const isDimmed = hoveredId !== null && hoveredId !== node.id && !connectedToHovered.has(node.id);
            const initials = getInitials(node.name);
            const nodeR = layout.nodeR;

            return (
              <g
                key={node.id}
                // Translate only - no scale on hover. Scaling caused hit-area to grow
                // and animate, which made mouseenter/leave fire repeatedly (jitter).
                transform={`translate(${pos.x},${pos.y})`}
                style={{
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.35 : 1,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => openPanel(node)}
              >
                {/* Static hover/selection ring - drawn outside the avatar but at fixed
                    radius so it doesn't change the pointer hit-area of the avatar circle. */}
                {(isHovered || isSelected) && (
                  <>
                    <circle
                      cx={0} cy={0} r={nodeR + 8}
                      fill="none"
                      stroke={isSelected ? '#6366f1' : colors.border}
                      strokeWidth={2}
                      strokeOpacity={0.35}
                      style={{ pointerEvents: 'none' }}
                    />
                    <circle
                      cx={0} cy={0} r={nodeR + 4}
                      fill="none"
                      stroke={isSelected ? '#6366f1' : colors.border}
                      strokeWidth={2.5}
                      strokeOpacity={0.85}
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
                )}

                {/* Clip path for photo */}
                {node.photoUrl && (
                  <defs>
                    <clipPath id={`clip-${node.id}`}>
                      <circle cx={0} cy={0} r={nodeR} />
                    </clipPath>
                  </defs>
                )}

                {/* Avatar circle - this is the hit target. Its size never changes on hover. */}
                <circle
                  cx={0} cy={0} r={nodeR}
                  fill={node.photoUrl ? 'transparent' : colors.avatar}
                  stroke={isHovered || isSelected ? colors.border : 'rgba(255,255,255,0.9)'}
                  strokeWidth={2.5}
                  style={{ transition: 'stroke 0.15s' }}
                />

                {/* Photo or initials */}
                {node.photoUrl ? (
                  <image
                    href={node.photoUrl}
                    x={-nodeR} y={-nodeR}
                    width={nodeR * 2} height={nodeR * 2}
                    clipPath={`url(#clip-${node.id})`}
                    preserveAspectRatio="xMidYMid slice"
                    style={{ pointerEvents: 'none' }}
                  />
                ) : (
                  <text
                    x={0} y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={nodeR * 0.65}
                    fontWeight="700"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {initials}
                  </text>
                )}

                {/* Hover tooltip */}
                {isHovered && (
                  <g transform={`translate(0,${-(nodeR + 20)})`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={-node.name.length * 3.5 - 8}
                      y={-11}
                      width={node.name.length * 7 + 16}
                      height={22}
                      rx={6}
                      fill="rgba(17,24,39,0.92)"
                    />
                    <text
                      x={0} y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize={12}
                      fontWeight={500}
                      style={{ userSelect: 'none' }}
                    >
                      {node.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {([
            { label: 'Core',          color: '#3b82f6' },
            { label: 'Supporting',    color: '#f59e0b' },
            { label: 'Participating', color: '#10b981' },
            { label: 'Aware',         color: '#9ca3af' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-gray-200 shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs font-medium text-gray-600">{label}</span>
            </div>
          ))}
        </div>

        <div className="absolute bottom-3 right-3 text-xs text-gray-400 bg-white/70 px-2 py-1 rounded-lg backdrop-blur-sm">
          Hover over any person to see their name.
        </div>
      </div>

      {/* Side panel */}
      {panel && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.08)' }}
            onClick={closePanel}
          />
          <div
            className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl overflow-y-auto"
            style={{ width: '360px', maxWidth: '100vw', animation: 'slideInRight 0.25s ease' }}
          >
            {/* header */}
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                {(() => {
                  const colors = panel.level !== 'unplaced'
                    ? LEVEL_COLORS[panel.level as Level]
                    : { avatar: '#9ca3af' };
                  const badge = LEVEL_BADGE[panel.level];
                  return (
                    <>
                      <div
                        className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md overflow-hidden"
                        style={{
                          backgroundColor: colors.avatar,
                          backgroundImage: panel.photoUrl ? `url(${panel.photoUrl})` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      >
                        {!panel.photoUrl && getInitials(panel.name)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 leading-tight">{panel.name}</h2>
                        <span
                          className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                        <p className="text-sm text-gray-500 mt-0.5">Engagement level: {badge.label}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
              <button
                onClick={closePanel}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* primary contact */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800 mb-1">Primary contact</h3>
              {contactCandidates.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  {panel.level === 'coordinating'
                    ? 'Core members can be anyone\'s primary contact.'
                    : 'No eligible contacts at this level or higher.'}
                </p>
              ) : (
                <>
                  <div className="relative">
                    <select
                      value={panelContactId ?? ''}
                      onChange={e => handleContactChange(e.target.value || null)}
                      disabled={panelContactSaving}
                      className="w-full appearance-none pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    >
                      <option value="">— No primary contact —</option>
                      {contactCandidates.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                        <UserIcon className="w-3 h-3 text-gray-500" />
                      </div>
                    </div>
                    <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Primary contact must be at the same level or higher.
                  </p>
                  {currentContactName && (
                    <p className="text-xs text-blue-600 mt-0.5 font-medium">
                      Currently: {currentContactName}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* activities */}
            <div className="flex-1 px-6 py-5">
              <h3 className="text-base font-semibold text-gray-800 mb-1">Activities</h3>
              <p className="text-sm text-gray-500 mb-4">
                {panel.name.split(' ')[0]} is involved in the following activities:
              </p>
              {panelLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : panelActivities.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No activities found.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {panelActivities.map(act => {
                    const typeKey = act.type ?? 'other';
                    const { icon: Icon, color } = ACTIVITY_ICON_COLORS[typeKey] ?? ACTIVITY_ICON_COLORS.other;
                    const typeLabel = ACTIVITY_TYPE_LABELS[typeKey] ?? act.name;
                    return (
                      <div
                        key={`${act.id}-${act.role}`}
                        className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60"
                      >
                        <div
                          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                          style={{ backgroundColor: `${color}18` }}
                        >
                          <Icon className="w-4 h-4" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-tight">{typeLabel}</p>
                          {act.schedule && (
                            <p className="text-xs text-gray-500 mt-0.5">{act.schedule}</p>
                          )}
                        </div>
                        <span
                          className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: `${color}1a`, color }}
                        >
                          {formatRole(act.role)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="px-6 pb-6 pt-2 border-t border-gray-100">
              <button
                onClick={() => { closePanel(); navigate(`/individual/${panel.id}`); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-blue-500 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
              >
                <UserIcon className="w-4 h-4" />
                View Full Profile
                <ExternalLinkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
