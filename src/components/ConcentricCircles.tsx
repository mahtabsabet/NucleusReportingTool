import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserIcon,
  CheckIcon,
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
  UsersIcon,
  HeartIcon,
  StarIcon,
} from 'lucide-react';
import {
  fetchNucleusEnrollmentsWithNames,
  updateEngagementLevel,
} from '../lib/db/nucleus';
import { getUnplacedPersonIds, clearPersonUnplaced } from '../lib/unplacedTracker';
import { supabase } from '../lib/supabase';

interface ConcentricCirclesProps {
  nucleusId: string;
  compact?: boolean;
}

type Level = 'coordinating' | 'participating' | 'supporting' | 'aware';

const LEVEL_COLORS: Record<Level, { bg: string; border: string; highlight: string; avatar: string }> = {
  aware:        { bg: '#f3f4f6', border: '#d1d5db', highlight: 'rgba(156,163,175,0.4)', avatar: '#9ca3af' },
  supporting:   { bg: '#fef3c7', border: '#fbbf24', highlight: 'rgba(251,191,36,0.35)',  avatar: '#f59e0b' },
  participating:{ bg: '#d1fae5', border: '#34d399', highlight: 'rgba(52,211,153,0.35)',  avatar: '#10b981' },
  coordinating: { bg: '#bfdbfe', border: '#60a5fa', highlight: 'rgba(96,165,250,0.4)',   avatar: '#3b82f6' },
};

const LEVEL_BADGE: Record<Level | 'unplaced', { bg: string; text: string; label: string }> = {
  coordinating: { bg: '#dbeafe', text: '#1d4ed8', label: 'Core' },
  supporting:   { bg: '#fef3c7', text: '#78350f', label: 'Supporting' },
  participating:{ bg: '#d1fae5', text: '#065f46', label: 'Participating' },
  aware:        { bg: '#f3f4f6', text: '#374151', label: 'Aware' },
  unplaced:     { bg: '#f3f4f6', text: '#374151', label: 'Unplaced' },
};

interface NameEntry {
  id: string;
  name: string;
}

interface PanelActivity {
  id: string;
  name: string;
  type: string;
  schedule?: string;
  role: string;
}

// Band boundaries in SVG coordinate space (viewBox 0 0 400 400, center 200,200)
const BANDS: Record<Level, { innerR: number; outerR: number }> = {
  coordinating: { innerR: 4,   outerR: 62  },
  supporting:   { innerR: 68,  outerR: 102 },
  participating:{ innerR: 108, outerR: 147 },
  aware:        { innerR: 153, outerR: 192 },
};

const NODE_R = 16; // SVG units — radius of each person node
const MIN_SPACING = NODE_R * 2 + 5;

// Drop zone insets (concentric divs layered over the SVG)
const RING_CONFIG: { level: Level; inset: string }[] = [
  { level: 'aware',         inset: '0%'    },
  { level: 'participating', inset: '12.5%' },
  { level: 'supporting',    inset: '25%'   },
  { level: 'coordinating',  inset: '37.5%' },
];

// SVG label y-positions (top of each visible band)
const LABEL_CONFIG: { level: Level; y: number; color: string }[] = [
  { level: 'aware',         y: 8,   color: '#6b7280' },
  { level: 'participating', y: 57,  color: '#059669' },
  { level: 'supporting',    y: 102, color: '#b45309' },
  { level: 'coordinating',  y: 145, color: '#2563eb' },
];

const LEVEL_DISPLAY: Record<Level, string> = {
  coordinating: 'Core',
  supporting:   'Supporting',
  participating:'Participating',
  aware:        'Aware',
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

function layoutRing(count: number, r: number, angleOffset = 0): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2 + angleOffset;
    return { x: 200 + r * Math.cos(angle), y: 200 + r * Math.sin(angle) };
  });
}

function computePositions(count: number, innerR: number, outerR: number): { x: number; y: number }[] {
  if (count === 0) return [];
  const midR = (innerR + outerR) / 2;
  const perRingAtMid = Math.max(1, Math.floor((2 * Math.PI * midR) / MIN_SPACING));

  if (count <= perRingAtMid) {
    return layoutRing(count, midR);
  }

  // Distribute across two sub-rings within the band
  const r1 = innerR + (outerR - innerR) * 0.3;
  const r2 = innerR + (outerR - innerR) * 0.7;
  const maxR1 = Math.max(1, Math.floor((2 * Math.PI * Math.max(r1, 1)) / MIN_SPACING));
  const maxR2 = Math.max(1, Math.floor((2 * Math.PI * r2) / MIN_SPACING));
  const c1 = Math.min(Math.ceil(count / 2), maxR1);
  const c2 = Math.min(count - c1, maxR2);
  const extra = count - c1 - c2;

  const positions = [
    ...layoutRing(c1, r1),
    ...layoutRing(c2, r2, c2 > 0 ? Math.PI / c2 : 0),
  ];
  if (extra > 0) {
    positions.push(...layoutRing(extra, outerR - NODE_R - 1));
  }
  return positions;
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

export function ConcentricCircles({ nucleusId, compact }: ConcentricCirclesProps) {
  const navigate = useNavigate();

  const [circles, setCircles] = useState<Record<Level, NameEntry[]>>({
    coordinating: [], supporting: [], participating: [], aware: [],
  });
  const [unplaced, setUnplaced] = useState<NameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [dragOverLevel, setDragOverLevel] = useState<string | null>(null);
  const [dragOverUnplaced, setDragOverUnplaced] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ entry: NameEntry; level: Level | 'unplaced' } | null>(null);
  const [panelActivities, setPanelActivities] = useState<PanelActivity[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchNucleusEnrollmentsWithNames(nucleusId)
      .then(enrollments => {
        const result: Record<Level, NameEntry[]> = {
          coordinating: [], supporting: [], participating: [], aware: [],
        };
        const newUnplaced: NameEntry[] = [];
        const unplacedIds = new Set(getUnplacedPersonIds(nucleusId));
        enrollments.forEach(e => {
          if (e.engagementLevel === null || unplacedIds.has(e.personId)) {
            newUnplaced.push({ id: e.personId, name: e.name });
          } else {
            result[e.engagementLevel].push({ id: e.personId, name: e.name });
          }
        });
        setCircles(result);
        setUnplaced(newUnplaced);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [nucleusId]);

  const handleSave = async () => {
    const updates: Promise<void>[] = [];
    for (const level of ['coordinating', 'supporting', 'participating', 'aware'] as Level[]) {
      for (const entry of circles[level]) {
        updates.push(updateEngagementLevel(entry.id, nucleusId, level));
      }
    }
    try {
      await Promise.all(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save engagement levels:', err);
    }
  };

  const openPanel = (entry: NameEntry, level: Level | 'unplaced') => {
    setPanel({ entry, level });
    setPanelLoading(true);
    setPanelActivities([]);
    fetchPanelActivities(entry.id)
      .then(acts => { setPanelActivities(acts); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  };

  const closePanel = () => setPanel(null);

  const handleDragStart = (e: React.DragEvent, id: string, sourceLevel: Level | 'unplaced') => {
    e.dataTransfer.setData('participantId', id);
    e.dataTransfer.setData('sourceLevel', sourceLevel);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = useCallback((e: React.DragEvent, level: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLevel(level);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, level: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      if (dragOverLevel === level) setDragOverLevel(null);
    }
  }, [dragOverLevel]);

  const handleDrop = (e: React.DragEvent, targetLevel: Level) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLevel(null);
    const participantId = e.dataTransfer.getData('participantId');
    const sourceLevel = e.dataTransfer.getData('sourceLevel') as Level | 'unplaced';
    if (sourceLevel === targetLevel) return;

    if (sourceLevel === 'unplaced') {
      const entry = unplaced.find(p => p.id === participantId);
      if (!entry) return;
      clearPersonUnplaced(nucleusId, participantId);
      setUnplaced(prev => prev.filter(p => p.id !== participantId));
      setCircles(prev => ({ ...prev, [targetLevel]: [...prev[targetLevel], entry] }));
    } else {
      setCircles(prev => {
        const entry = prev[sourceLevel].find(p => p.id === participantId);
        if (!entry) return prev;
        return {
          ...prev,
          [sourceLevel]: prev[sourceLevel].filter(p => p.id !== participantId),
          [targetLevel]: [...prev[targetLevel], entry],
        };
      });
    }
    // Update panel if the dragged person's panel is open
    if (panel?.entry.id === participantId) {
      setPanel(prev => prev ? { ...prev, level: targetLevel } : null);
    }
  };

  // Compute node positions for each level
  const nodePositions = useMemo(() => {
    const result: Record<Level, { x: number; y: number }[]> = {
      coordinating: [], supporting: [], participating: [], aware: [],
    };
    for (const level of Object.keys(BANDS) as Level[]) {
      const { innerR, outerR } = BANDS[level];
      result[level] = computePositions(circles[level].length, innerR, outerR);
    }
    return result;
  }, [circles]);

  const renderNode = (entry: NameEntry, level: Level | 'unplaced', x: number, y: number) => {
    const isHovered = hoveredId === entry.id;
    const avatarColor = level !== 'unplaced' ? LEVEL_COLORS[level].avatar : '#9ca3af';
    const scale = isHovered ? 1.2 : 1;
    const initials = getInitials(entry.name);
    // Position as percentage of the 400-unit viewBox
    const leftPct = (x / 400) * 100;
    const topPct = (y / 400) * 100;
    const sizePct = (NODE_R * 2 / 400) * 100; // diameter as %

    return (
      <div
        key={entry.id}
        draggable
        onDragStart={e => handleDragStart(e, entry.id, level)}
        onClick={() => openPanel(entry, level)}
        onMouseEnter={() => setHoveredId(entry.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${sizePct}%`,
          height: `${sizePct}%`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          zIndex: isHovered ? 30 : 20,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: avatarColor,
            border: '2.5px solid rgba(255,255,255,0.9)',
            boxShadow: isHovered
              ? '0 4px 14px rgba(0,0,0,0.25)'
              : '0 2px 5px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700, lineHeight: 1, pointerEvents: 'none' }}>
            {initials}
          </span>
        </div>
        {/* Hover tooltip */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              bottom: '115%',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(17,24,39,0.92)',
              color: '#fff',
              padding: '4px 9px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 50,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {entry.name}
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid rgba(17,24,39,0.92)',
            }} />
          </div>
        )}
      </div>
    );
  };

  // ── Compact mode (unchanged) ──────────────────────────────────────────────
  if (compact) {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-6 py-2">
        <div className="flex-shrink-0" style={{ width: 110, height: 110 }}>
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-sm">
            <circle cx="100" cy="100" r="98" fill={LEVEL_COLORS.aware.bg} />
            <circle cx="100" cy="100" r="75" fill={LEVEL_COLORS.participating.bg} />
            <circle cx="100" cy="100" r="52" fill={LEVEL_COLORS.supporting.bg} />
            <circle cx="100" cy="100" r="29" fill={LEVEL_COLORS.coordinating.bg} />
          </svg>
        </div>
        <div className="flex flex-col gap-2.5">
          {([
            { label: 'AWARE',         count: circles.aware.length,         textColor: 'text-gray-500'   },
            { label: 'PARTICIPATING', count: circles.participating.length,  textColor: 'text-emerald-600'},
            { label: 'SUPPORTING',    count: circles.supporting.length,     textColor: 'text-amber-600'  },
            { label: 'CORE',          count: circles.coordinating.length,   textColor: 'text-blue-600'   },
          ] as const).map(({ label, count, textColor }) => (
            <div key={label} className="flex items-center gap-4">
              <span className={`text-xs font-semibold uppercase tracking-wide ${textColor}`} style={{ minWidth: '90px' }}>
                {label}
              </span>
              <span className="text-xl font-bold text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Side panel ─────────────────────────────────────────────────────────────
  const renderPanel = () => {
    if (!panel) return null;
    const { entry, level } = panel;
    const badge = LEVEL_BADGE[level];
    const initials = getInitials(entry.name);
    const avatarColor = level !== 'unplaced' ? LEVEL_COLORS[level as Level].avatar : '#9ca3af';

    return (
      <>
        {/* backdrop */}
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.08)' }}
          onClick={closePanel}
        />
        {/* panel */}
        <div
          className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl overflow-y-auto"
          style={{ width: '360px', maxWidth: '100vw', animation: 'slideInRight 0.25s ease' }}
        >
          {/* header */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div
                className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 leading-tight">{entry.name}</h2>
                <span
                  className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: badge.bg, color: badge.text }}
                >
                  {badge.label}
                </span>
                <p className="text-sm text-gray-500 mt-0.5">Engagement level: {badge.label}</p>
              </div>
            </div>
            <button
              onClick={closePanel}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* activities */}
          <div className="flex-1 px-6 py-5">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Activities</h3>
            <p className="text-sm text-gray-500 mb-4">
              {entry.name.split(' ')[0]} is involved in the following activities:
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
              onClick={() => { closePanel(); navigate(`/individual/${entry.id}`); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-blue-500 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              View Full Profile
              <ExternalLinkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  };

  // ── Main visualization ────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <div className="flex flex-col gap-8">
        {/* Hint text */}
        <p className="text-xs text-gray-400 text-center -mb-4">
          Hover over any person to see their name. Click to view details. Drag to reassign.
        </p>

        {/* Circles visualization */}
        <div className="relative mx-auto w-full" style={{ maxWidth: '500px', aspectRatio: '1/1' }}>

          {/* SVG: background circles + labels */}
          <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full z-0 pointer-events-none drop-shadow-sm">
            {/* Circle fills */}
            {(['aware', 'participating', 'supporting', 'coordinating'] as Level[]).map((level, i) => {
              const radii = [195, 150, 105, 65];
              return (
                <circle
                  key={level}
                  cx="200" cy="200" r={radii[i]}
                  fill={LEVEL_COLORS[level].bg}
                  stroke={dragOverLevel === level ? LEVEL_COLORS[level].border : 'transparent'}
                  strokeWidth={dragOverLevel === level ? 3 : 0}
                  className="transition-all duration-200"
                />
              );
            })}

            {/* No fill here — band highlight handled by HTML overlay below */}

            {/* Ring labels */}
            {LABEL_CONFIG.map(({ level, y, color }) => (
              <text
                key={level}
                x="200"
                y={y + 12}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                letterSpacing="1"
                fill={color}
                style={{ textTransform: 'uppercase' }}
              >
                {LEVEL_DISPLAY[level].toUpperCase()} ({circles[level].length})
              </text>
            ))}
          </svg>

          {/* Drop zones + band highlight (transparent overlays per band, for drag-and-drop) */}
          <div className="absolute inset-0 z-10">
            {RING_CONFIG.map(({ level, inset }) => (
              <div
                key={level}
                className="absolute rounded-full transition-all duration-200"
                style={{
                  inset,
                  ...(dragOverLevel === level ? {
                    border: `3px dashed ${LEVEL_COLORS[level].border}`,
                    backgroundColor: LEVEL_COLORS[level].highlight,
                  } : {}),
                }}
                onDragOver={e => handleDragOver(e, level)}
                onDragLeave={e => handleDragLeave(e, level)}
                onDrop={e => handleDrop(e, level)}
              />
            ))}
          </div>

          {/* Node layer: person avatar nodes */}
          <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
            {(Object.keys(BANDS) as Level[]).map(level =>
              circles[level].map((entry, i) => {
                const pos = nodePositions[level][i];
                if (!pos) return null;
                return (
                  <div key={entry.id} style={{ pointerEvents: 'auto' }}>
                    {renderNode(entry, level, pos.x, pos.y)}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Unplaced / new participants area */}
        <div
          className={`rounded-2xl border-2 border-dashed px-6 py-5 transition-all duration-200 ${
            dragOverUnplaced ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOverUnplaced(true); }}
          onDragLeave={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
              setDragOverUnplaced(false);
            }
          }}
          onDrop={e => {
            e.preventDefault();
            setDragOverUnplaced(false);
            const participantId = e.dataTransfer.getData('participantId');
            const sourceLevel = e.dataTransfer.getData('sourceLevel') as Level | 'unplaced';
            if (sourceLevel === 'unplaced') return;
            setCircles(prev => {
              const entry = prev[sourceLevel].find(p => p.id === participantId);
              if (!entry) return prev;
              setUnplaced(u => [...u, entry]);
              return { ...prev, [sourceLevel]: prev[sourceLevel].filter(p => p.id !== participantId) };
            });
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            New participants — drag into a circle to assign engagement level
          </p>
          <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
            {unplaced.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No unplaced participants</p>
            ) : (
              unplaced.map(entry => {
                const isHovered = hoveredId === entry.id;
                const initials = getInitials(entry.name);
                return (
                  <div
                    key={entry.id}
                    draggable
                    onDragStart={e => handleDragStart(e, entry.id, 'unplaced')}
                    onClick={() => openPanel(entry, 'unplaced')}
                    onMouseEnter={() => setHoveredId(entry.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="relative flex items-center gap-2 px-3 py-1.5 bg-white border rounded-full cursor-pointer select-none transition-all duration-150"
                    style={{
                      border: isHovered ? '1.5px solid #9ca3af' : '1.5px solid #e5e7eb',
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.07)',
                      transform: isHovered ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
                      style={{ backgroundColor: '#9ca3af', fontSize: '10px', fontWeight: 700 }}
                    >
                      {initials}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{entry.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-center">
          <button
            onClick={handleSave}
            className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {saved ? (
              <><CheckIcon className="w-4 h-4" /> Saved Successfully</>
            ) : (
              'Save Engagement Levels'
            )}
          </button>
        </div>
      </div>

      {/* Side panel (fixed overlay) */}
      {renderPanel()}
    </>
  );
}
