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
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_R = 22;
const WIDTH = 800;
const HEIGHT = 500;

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
function simulateStep(nodes: SimNode[], edges: { source: string; target: string }[], steps: number) {
  for (let s = 0; s < steps; s++) {
    // Center gravity
    nodes.forEach(n => {
      n.vx += (WIDTH / 2 - n.x) * 0.0015;
      n.vy += (HEIGHT / 2 - n.y) * 0.0015;
    });

    // Node repulsion (O(n²))
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x || 0.1;
        const dy = b.y - a.y || 0.1;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2) || 1;
        const force = 4000 / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Edge spring attraction
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    edges.forEach(({ source, target }) => {
      const s = nodeMap.get(source);
      const t = nodeMap.get(target);
      if (!s || !t) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = 120;
      const k = 0.04;
      const force = (dist - ideal) * k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    });

    // Integrate + damp + clamp
    nodes.forEach(n => {
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(NODE_R + 4, Math.min(WIDTH - NODE_R - 4, n.x));
      n.y = Math.max(NODE_R + 4, Math.min(HEIGHT - NODE_R - 4, n.y));
    });
  }
}

function initNodes(enrollments: NucleusEnrollmentEntry[]): SimNode[] {
  return enrollments.map((e, i) => {
    // Deterministic random-ish start positions spread across the canvas
    const angle = (2 * Math.PI * i) / enrollments.length;
    const r = Math.min(WIDTH, HEIGHT) * 0.3;
    return {
      id: e.personId,
      name: e.name,
      level: (e.engagementLevel ?? 'unplaced') as Level | 'unplaced',
      primaryContactId: e.primaryContactId,
      x: WIDTH / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: HEIGHT / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
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
  const MAX_ITER = 300;

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [enrollments, setEnrollments] = useState<NucleusEnrollmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Panel state
  const [panel, setPanel] = useState<SimNode | null>(null);
  const [panelActivities, setPanelActivities] = useState<PanelActivity[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelContactId, setPanelContactId] = useState<string | null>(null);
  const [panelContactSaving, setPanelContactSaving] = useState(false);

  const startSimulation = useCallback((nodes: SimNode[], edges: { source: string; target: string }[]) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    iterRef.current = 0;
    nodesRef.current = nodes;
    edgesRef.current = edges;

    function tick() {
      if (iterRef.current >= MAX_ITER) return;
      simulateStep(nodesRef.current, edgesRef.current, 5);
      iterRef.current += 5;
      setPositions(Object.fromEntries(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y }])));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchNucleusEnrollmentsWithNames(nucleusId)
      .then(data => {
        setEnrollments(data);
        const nodes = initNodes(data);
        const edges = buildEdges(nodes);
        startSimulation(nodes, edges);
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
      startSimulation(nodesRef.current, edgesRef.current);
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
    positions[id] ?? { x: nodesRef.current.find(n => n.id === id)?.x ?? WIDTH / 2, y: nodesRef.current.find(n => n.id === id)?.y ?? HEIGHT / 2 };

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

      <div className="relative rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden" style={{ height: '520px' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: 'default' }}
        >
          {/* Edges */}
          {edges.map(edge => {
            const sp = getPos(edge.source);
            const tp = getPos(edge.target);
            const isHighlighted = hoveredId === edge.source || hoveredId === edge.target ||
              selectedId === edge.source || selectedId === edge.target;
            const isDimmed = hoveredId !== null && !isHighlighted;
            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={sp.x} y1={sp.y}
                x2={tp.x} y2={tp.y}
                stroke={isHighlighted ? '#6366f1' : '#d1d5db'}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                strokeOpacity={isDimmed ? 0.2 : 1}
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
            const scale = isHovered ? 1.2 : isSelected ? 1.15 : 1;
            const initials = getInitials(node.name);

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x},${pos.y}) scale(${scale})`}
                style={{
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.3 : 1,
                  transition: 'opacity 0.2s, transform 0.15s',
                  transformOrigin: `${pos.x}px ${pos.y}px`,
                }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => openPanel(node)}
              >
                {/* Selection / hover ring */}
                {(isHovered || isSelected) && (
                  <circle
                    cx={0} cy={0} r={NODE_R + 5}
                    fill="none"
                    stroke={isSelected ? '#6366f1' : colors.border}
                    strokeWidth={2}
                    strokeOpacity={0.6}
                  />
                )}

                {/* Avatar circle */}
                <circle
                  cx={0} cy={0} r={NODE_R}
                  fill={colors.avatar}
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={2.5}
                />

                {/* Initials */}
                <text
                  x={0} y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={NODE_R * 0.65}
                  fontWeight="700"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {initials}
                </text>

                {/* Hover tooltip */}
                {isHovered && (
                  <g transform={`translate(0,${-(NODE_R + 18)})`}>
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
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
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
                        className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
                        style={{ backgroundColor: colors.avatar }}
                      >
                        {getInitials(panel.name)}
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
