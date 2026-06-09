import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUnsavedChanges, useGuardedNavigate } from '../lib/unsavedChanges';
import {
  UserIcon,
  CheckIcon,
  XIcon,
  ExternalLinkIcon,
  BookOpenIcon,
  UsersIcon,
  HeartIcon,
  StarIcon,
  ChevronDownIcon,
  ZoomInIcon,
  ZoomOutIcon,
  Maximize2Icon,
  SearchIcon,
} from 'lucide-react';
import {
  fetchNucleusEnrollmentsWithNames,
  updateEngagementLevel,
  updatePrimaryContact,
} from '../lib/db/nucleus';
import { getUnplacedPersonIds, clearPersonUnplaced } from '../lib/unplacedTracker';
import { supabase } from '../lib/supabase';

interface ConcentricCirclesProps {
  nucleusId: string;
  compact?: boolean;
  canEdit?: boolean;
}

type Level = 'coordinating' | 'participating' | 'supporting' | 'aware';

const LEVEL_COLORS: Record<Level, { bg: string; border: string; highlight: string; avatar: string }> = {
  aware:        { bg: '#f3f4f6', border: '#d1d5db', highlight: 'rgba(156,163,175,0.35)', avatar: '#9ca3af' },
  supporting:   { bg: '#fef3c7', border: '#fbbf24', highlight: 'rgba(251,191,36,0.30)',  avatar: '#f59e0b' },
  participating:{ bg: '#d1fae5', border: '#34d399', highlight: 'rgba(52,211,153,0.30)',  avatar: '#10b981' },
  coordinating: { bg: '#bfdbfe', border: '#60a5fa', highlight: 'rgba(96,165,250,0.35)',  avatar: '#3b82f6' },
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

const LEVEL_DISPLAY: Record<Level, string> = {
  coordinating: 'Core',
  supporting:   'Supporting',
  participating:'Participating',
  aware:        'Aware',
};

const LEVEL_LABEL_COLOR: Record<Level, string> = {
  aware:         '#6b7280',
  participating: '#059669',
  supporting:    '#b45309',
  coordinating:  '#2563eb',
};

interface NameEntry {
  id: string;
  name: string;
  primaryContactId: string | null;
  photoUrl: string | null;
}

interface PanelActivity {
  id: string;
  name: string;
  type: string;
  schedule?: string;
  role: string;
}

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

// ── Arc layout constants ───────────────────────────────────────────────────────
const ARC_VB_W = 740;
const ARC_VB_H = 390;
const ARC_CX   = ARC_VB_W / 2;   // 370
const ARC_CY   = ARC_VB_H - 10;  // 380

const ARC_MARGIN_RAD = 0.08;
const ARC_START = -(Math.PI - ARC_MARGIN_RAD);
const ARC_END   = -ARC_MARGIN_RAD;
const ARC_SPAN  = ARC_END - ARC_START;

const ARC_BANDS: Record<Level, { innerR: number; outerR: number }> = {
  coordinating: { innerR: 50,  outerR: 108 },
  supporting:   { innerR: 122, outerR: 182 },
  participating:{ innerR: 196, outerR: 256 },
  aware:        { innerR: 270, outerR: 330 },
};

// Avatar badge layout (SVG layout units vs rendered CSS px)
const NODE_SVG_R       = 17;
const NODE_CSS_PX      = 40;
const NODE_SPACING_SVG = NODE_SVG_R * 2 + 8; // min arc-length per badge slot

// Dot mode: rendered when the tier is too crowded for badges at current zoom
const DOT_R_SVG = 4; // dot radius in SVG units

const ARC_ASPECT = `${ARC_VB_W} / ${ARC_VB_H}`;
const ORDERED_LEVELS: Level[] = ['coordinating', 'supporting', 'participating', 'aware'];

// ── Pure geometry helpers ─────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
}

/**
 * How many avatar badges fit along an arc at the current zoom scale.
 * At higher zoom the user-space arc is the same but the counter-scaled badges
 * are physically smaller, so more fit.
 */
function arcCapacityAtScale(level: Level, scale: number): number {
  const { innerR, outerR } = ARC_BANDS[level];
  const midR = (innerR + outerR) / 2;
  return Math.max(3, Math.floor((midR * ARC_SPAN * scale) / NODE_SPACING_SVG));
}

/** Evenly space `count` badge avatars along the arc mid-radius. */
function layoutArcBadges(count: number, level: Level): { x: number; y: number }[] {
  if (count === 0) return [];
  const { innerR, outerR } = ARC_BANDS[level];
  const midR = (innerR + outerR) / 2;
  const margin = 0.04 * ARC_SPAN;
  const sa = ARC_START + margin, ea = ARC_END - margin;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = sa + t * (ea - sa);
    return { x: ARC_CX + midR * Math.cos(a), y: ARC_CY + midR * Math.sin(a) };
  });
}

/** Evenly space `count` dots along the arc mid-radius (tighter margin than badges). */
function layoutArcDots(count: number, level: Level): { x: number; y: number }[] {
  if (count === 0) return [];
  const { innerR, outerR } = ARC_BANDS[level];
  const midR = (innerR + outerR) / 2;
  const margin = 0.02 * ARC_SPAN;
  const sa = ARC_START + margin, ea = ARC_END - margin;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = sa + t * (ea - sa);
    return { x: ARC_CX + midR * Math.cos(a), y: ARC_CY + midR * Math.sin(a) };
  });
}

/** SVG donut-sector path for an arc band. */
function arcBandPath(innerR: number, outerR: number): string {
  const sa = ARC_START, ea = ARC_END;
  const ox1 = ARC_CX + outerR * Math.cos(sa), oy1 = ARC_CY + outerR * Math.sin(sa);
  const ox2 = ARC_CX + outerR * Math.cos(ea), oy2 = ARC_CY + outerR * Math.sin(ea);
  const ix1 = ARC_CX + innerR * Math.cos(ea), iy1 = ARC_CY + innerR * Math.sin(ea);
  const ix2 = ARC_CX + innerR * Math.cos(sa), iy2 = ARC_CY + innerR * Math.sin(sa);
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 0 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 1 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** CSS polygon clip-path matching the arc band shape (% units, for drop zones). */
function arcClipPath(innerR: number, outerR: number, steps = 24): string {
  const pct = (x: number, y: number) =>
    `${((x / ARC_VB_W) * 100).toFixed(3)}% ${((y / ARC_VB_H) * 100).toFixed(3)}%`;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ARC_START + (i / steps) * ARC_SPAN;
    pts.push(pct(ARC_CX + outerR * Math.cos(a), ARC_CY + outerR * Math.sin(a)));
  }
  for (let i = steps; i >= 0; i--) {
    const a = ARC_START + (i / steps) * ARC_SPAN;
    pts.push(pct(ARC_CX + innerR * Math.cos(a), ARC_CY + innerR * Math.sin(a)));
  }
  return `polygon(${pts.join(', ')})`;
}

function placementSignature(circles: Record<Level, NameEntry[]>, unplaced: NameEntry[]): string {
  const pairs: [string, string][] = [];
  for (const level of ORDERED_LEVELS) for (const e of circles[level]) pairs.push([e.id, level]);
  for (const e of unplaced) pairs.push([e.id, 'unplaced']);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(pairs);
}

function getAllPlaced(circles: Record<Level, NameEntry[]>): { id: string; name: string; level: Level }[] {
  const result: { id: string; name: string; level: Level }[] = [];
  for (const level of Object.keys(circles) as Level[])
    for (const entry of circles[level]) result.push({ id: entry.id, name: entry.name, level });
  return result;
}

function validContacts(
  allPlaced: { id: string; name: string; level: Level }[],
  personId: string,
  personLevel: Level | null,
): { id: string; name: string }[] {
  return allPlaced.filter(p => {
    if (p.id === personId) return false;
    if (personLevel === null) return true;
    return LEVEL_RANK[p.level] >= LEVEL_RANK[personLevel];
  });
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

// ── Component ─────────────────────────────────────────────────────────────────

export function ConcentricCircles({ nucleusId, compact, canEdit = true }: ConcentricCirclesProps) {
  const readOnly = !canEdit;
  const guardedNavigate = useGuardedNavigate();
  const baselineSigRef = useRef<string | null>(null);

  const [circles, setCircles] = useState<Record<Level, NameEntry[]>>({
    coordinating: [], supporting: [], participating: [], aware: [],
  });
  const [unplaced, setUnplaced] = useState<NameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [dragOverLevel, setDragOverLevel] = useState<string | null>(null);
  const [dragOverUnplaced, setDragOverUnplaced] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Per-person side-panel
  const [panel, setPanel] = useState<{ entry: NameEntry; level: Level | 'unplaced' } | null>(null);
  const [panelActivities, setPanelActivities] = useState<PanelActivity[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelContactId, setPanelContactId] = useState<string | null>(null);
  const [panelContactSaving, setPanelContactSaving] = useState(false);

  // Full-screen tier expand overlay
  const [expandedTier, setExpandedTier] = useState<Level | null>(null);
  const [expandSearch, setExpandSearch] = useState('');

  // "Assign primary contact" prompt after drop from unplaced
  const [contactPrompt, setContactPrompt] = useState<{
    entry: NameEntry; targetLevel: Level; selectedId: string;
  } | null>(null);

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [zoomReady, setZoomReady] = useState(false);
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const vizContainerRef = useRef<HTMLDivElement | null>(null);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const zoomStorageKey = `nucleus-circle-zoom:${nucleusId}`;

  // ── Data load ──────────────────────────────────────────────────────────────
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
          const entry: NameEntry = { id: e.personId, name: e.name, primaryContactId: e.primaryContactId, photoUrl: e.photoUrl };
          if (e.engagementLevel === null || unplacedIds.has(e.personId)) newUnplaced.push(entry);
          else result[e.engagementLevel].push(entry);
        });
        setCircles(result);
        setUnplaced(newUnplaced);
        baselineSigRef.current = placementSignature(result, newUnplaced);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [nucleusId]);

  const placementSig = useMemo(() => placementSignature(circles, unplaced), [circles, unplaced]);
  const isDirty = !readOnly && baselineSigRef.current !== null && placementSig !== baselineSigRef.current;
  useUnsavedChanges(isDirty);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const updates: Promise<void>[] = [];
    for (const level of ORDERED_LEVELS)
      for (const entry of circles[level]) updates.push(updateEngagementLevel(entry.id, nucleusId, level));
    try {
      await Promise.all(updates);
      baselineSigRef.current = placementSignature(circles, unplaced);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save engagement levels:', err);
    }
  };

  // ── Per-person panel ───────────────────────────────────────────────────────
  const openPanel = useCallback((entry: NameEntry, level: Level | 'unplaced') => {
    setExpandedTier(null);
    setPanel({ entry, level });
    setPanelContactId(entry.primaryContactId ?? null);
    setPanelLoading(true);
    setPanelActivities([]);
    fetchPanelActivities(entry.id)
      .then(acts => { setPanelActivities(acts); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  }, []);

  const closePanel = () => setPanel(null);

  const handlePanelContactSave = async (newContactId: string | null) => {
    if (!panel) return;
    setPanelContactSaving(true);
    try {
      await updatePrimaryContact(panel.entry.id, nucleusId, newContactId);
      setPanelContactId(newContactId);
      const upd = (e: NameEntry) => e.id === panel.entry.id ? { ...e, primaryContactId: newContactId } : e;
      setCircles(prev => {
        const next = { ...prev };
        for (const l of Object.keys(next) as Level[]) next[l] = next[l].map(upd);
        return next;
      });
      setUnplaced(prev => prev.map(upd));
      setPanel(prev => prev ? { ...prev, entry: { ...prev.entry, primaryContactId: newContactId } } : null);
    } catch (err) {
      console.error('Failed to update primary contact:', err);
    } finally {
      setPanelContactSaving(false);
    }
  };

  // ── Tier expand overlay ────────────────────────────────────────────────────
  const openExpandedTier = useCallback((level: Level) => {
    setPanel(null);
    setExpandedTier(level);
    setExpandSearch('');
  }, []);

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string, sourceLevel: Level | 'unplaced') => {
    e.dataTransfer.setData('participantId', id);
    e.dataTransfer.setData('sourceLevel', sourceLevel);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = useCallback((e: React.DragEvent, level: string) => {
    e.preventDefault(); e.stopPropagation(); setDragOverLevel(level);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, level: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      if (dragOverLevel === level) setDragOverLevel(null);
  }, [dragOverLevel]);

  const handleDrop = (e: React.DragEvent, targetLevel: Level) => {
    e.preventDefault(); e.stopPropagation(); setDragOverLevel(null);
    const participantId = e.dataTransfer.getData('participantId');
    const sourceLevel = e.dataTransfer.getData('sourceLevel') as Level | 'unplaced';
    if (sourceLevel === targetLevel) return;
    if (sourceLevel === 'unplaced') {
      const entry = unplaced.find(p => p.id === participantId);
      if (!entry) return;
      clearPersonUnplaced(nucleusId, participantId);
      setUnplaced(prev => prev.filter(p => p.id !== participantId));
      setCircles(prev => ({ ...prev, [targetLevel]: [...prev[targetLevel], entry] }));
      setContactPrompt({ entry, targetLevel, selectedId: '' });
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
    if (panel?.entry.id === participantId) setPanel(prev => prev ? { ...prev, level: targetLevel } : null);
  };

  // ── Contact prompt ─────────────────────────────────────────────────────────
  const handleContactPromptAssign = async () => {
    if (!contactPrompt) return;
    const contactId = contactPrompt.selectedId || null;
    if (contactId) {
      try {
        await updatePrimaryContact(contactPrompt.entry.id, nucleusId, contactId);
        const upd = (e: NameEntry) => e.id === contactPrompt.entry.id ? { ...e, primaryContactId: contactId } : e;
        setCircles(prev => {
          const next = { ...prev };
          for (const l of Object.keys(next) as Level[]) next[l] = next[l].map(upd);
          return next;
        });
      } catch (err) {
        console.error('Failed to save primary contact:', err);
      }
    }
    setContactPrompt(null);
  };

  // ── Zoom & pan ─────────────────────────────────────────────────────────────
  const zoomIn    = useCallback(() => setZoom(z => Math.min(ZOOM_MAX, z * 1.2)), []);
  const zoomOut   = useCallback(() => setZoom(z => Math.max(ZOOM_MIN, z / 1.2)), []);
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const boxScale   = Math.min(1, zoom);
  const innerScale = Math.max(1, zoom);

  useEffect(() => {
    setZoomReady(false);
    let restored = 1;
    try {
      const stored = localStorage.getItem(zoomStorageKey);
      if (stored != null) { const v = parseFloat(stored); if (!isNaN(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) restored = v; }
    } catch { /* ignore */ }
    setZoom(restored); setZoomReady(true);
  }, [zoomStorageKey]);

  useEffect(() => {
    if (!zoomReady) return;
    try { localStorage.setItem(zoomStorageKey, String(zoom)); } catch { /* ignore */ }
  }, [zoom, zoomReady, zoomStorageKey]);

  const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]') || target.closest('[data-pan-skip]')) return;
    setIsPanning(true);
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan.x, pan.y]);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      if (!panStartRef.current) return;
      setPan({ x: panStartRef.current.px + e.clientX - panStartRef.current.mx, y: panStartRef.current.py + e.clientY - panStartRef.current.my });
    };
    const onUp = () => { setIsPanning(false); panStartRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isPanning]);

  useEffect(() => {
    const el = vizContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * Math.exp(-e.deltaY * 0.0015))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const allPlaced = useMemo(() => getAllPlaced(circles), [circles]);

  // ── Arc node data (zoom-aware badge vs dot mode) ───────────────────────────
  const nodeData = useMemo(() =>
    Object.fromEntries(ORDERED_LEVELS.map(level => {
      const count = circles[level].length;
      const capacity = arcCapacityAtScale(level, innerScale);
      const mode: 'badges' | 'dots' = count <= capacity ? 'badges' : 'dots';
      const positions = mode === 'badges'
        ? layoutArcBadges(count, level)
        : layoutArcDots(count, level);
      return [level, { count, mode, positions, capacity }];
    })) as Record<Level, { count: number; mode: 'badges' | 'dots'; positions: { x: number; y: number }[]; capacity: number }>,
  [circles, innerScale]);

  // Pre-computed drop-zone clip paths (stable — don't depend on zoom/data)
  const clipPaths = useMemo(() =>
    Object.fromEntries(ORDERED_LEVELS.map(level => {
      const { innerR, outerR } = ARC_BANDS[level];
      return [level, arcClipPath(innerR, outerR)];
    })) as Record<Level, string>,
  []);

  // ── Badge node renderer ────────────────────────────────────────────────────
  const renderBadge = (entry: NameEntry, level: Level | 'unplaced', x: number, y: number) => {
    const isHovered = hoveredId === entry.id;
    const avatarColor = level !== 'unplaced' ? LEVEL_COLORS[level].avatar : '#9ca3af';
    return (
      <div
        key={entry.id}
        data-node="true"
        aria-label={entry.name}
        draggable={!readOnly}
        onDragStart={readOnly ? undefined : e => handleDragStart(e, entry.id, level)}
        onClick={e => { e.stopPropagation(); openPanel(entry, level); }}
        onMouseEnter={() => setHoveredId(entry.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          position: 'absolute',
          left: `${(x / ARC_VB_W) * 100}%`,
          top:  `${(y / ARC_VB_H) * 100}%`,
          width:  `${NODE_CSS_PX}px`,
          height: `${NODE_CSS_PX}px`,
          transform: `translate(-50%, -50%) scale(${(isHovered ? 1.18 : 1) / innerScale})`,
          zIndex: isHovered ? 30 : 20,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          backgroundColor: avatarColor,
          backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined,
          backgroundSize: 'cover', backgroundPosition: 'center',
          border: '2.5px solid rgba(255,255,255,0.9)',
          boxShadow: isHovered ? '0 4px 14px rgba(0,0,0,0.25)' : '0 2px 5px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}>
          {!entry.photoUrl && (
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700, lineHeight: 1, pointerEvents: 'none' }}>
              {getInitials(entry.name)}
            </span>
          )}
        </div>
        {isHovered && (
          <div style={{
            position: 'absolute', bottom: '115%', left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(17,24,39,0.92)', color: '#fff',
            padding: '4px 9px', borderRadius: '6px',
            fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 50,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            {entry.name}
            <div style={{
              position: 'absolute', top: '100%', left: '50%',
              transform: 'translateX(-50%)', width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: '5px solid rgba(17,24,39,0.92)',
            }} />
          </div>
        )}
      </div>
    );
  };

  // ── Compact mode ──────────────────────────────────────────────────────────
  if (compact) {
    if (loading) return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
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
            { label: 'AWARE',         count: circles.aware.length,         textColor: 'text-gray-500'    },
            { label: 'PARTICIPATING', count: circles.participating.length,  textColor: 'text-emerald-600' },
            { label: 'SUPPORTING',    count: circles.supporting.length,     textColor: 'text-amber-600'   },
            { label: 'CORE',          count: circles.coordinating.length,   textColor: 'text-blue-600'    },
          ] as const).map(({ label, count, textColor }) => (
            <div key={label} className="flex items-center gap-4">
              <span className={`text-xs font-semibold uppercase tracking-wide ${textColor}`} style={{ minWidth: '90px' }}>{label}</span>
              <span className="text-xl font-bold text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Per-person side-panel ─────────────────────────────────────────────────
  const renderPanel = () => {
    if (!panel) return null;
    const { entry, level } = panel;
    const badge = LEVEL_BADGE[level];
    const avatarColor = level !== 'unplaced' ? LEVEL_COLORS[level as Level].avatar : '#9ca3af';
    const personLevel = level !== 'unplaced' ? (level as Level) : null;
    const contacts = validContacts(allPlaced, entry.id, personLevel);
    const currentContactName = panelContactId ? allPlaced.find(p => p.id === panelContactId)?.name ?? null : null;

    return (
      <>
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.08)' }} onClick={closePanel} />
        <div className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl overflow-y-auto"
          style={{ width: '360px', maxWidth: '100vw', animation: 'slideInRight 0.25s ease' }}>
          <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md overflow-hidden"
                style={{ backgroundColor: avatarColor, backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                {!entry.photoUrl && getInitials(entry.name)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 leading-tight">{entry.name}</h2>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
                <p className="text-sm text-gray-500 mt-0.5">Engagement level: {badge.label}</p>
              </div>
            </div>
            <button onClick={closePanel} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Primary contact</h3>
            {readOnly ? (
              <p className="text-sm text-gray-700">
                {currentContactName
                  ? <span className="font-medium">{currentContactName}</span>
                  : <span className="text-gray-400 italic">No primary contact assigned.</span>}
              </p>
            ) : contacts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {personLevel === 'coordinating' ? "Core members can be anyone's primary contact." : 'No eligible contacts at this level or higher.'}
              </p>
            ) : (
              <>
                <div className="relative">
                  <select value={panelContactId ?? ''} onChange={e => handlePanelContactSave(e.target.value || null)}
                    disabled={panelContactSaving}
                    className="w-full appearance-none pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50">
                    <option value="">— No primary contact —</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                      <UserIcon className="w-3 h-3 text-gray-500" />
                    </div>
                  </div>
                  <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Primary contact must be at the same level or higher.</p>
                {currentContactName && <p className="text-xs text-blue-600 mt-0.5 font-medium">Currently: {currentContactName}</p>}
              </>
            )}
          </div>

          <div className="flex-1 px-6 py-5">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Activities</h3>
            <p className="text-sm text-gray-500 mb-4">{entry.name.split(' ')[0]} is involved in the following activities:</p>
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
                    <div key={`${act.id}-${act.role}`} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5" style={{ backgroundColor: `${color}18` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{typeLabel}</p>
                        {act.schedule && <p className="text-xs text-gray-500 mt-0.5">{act.schedule}</p>}
                      </div>
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                        {formatRole(act.role)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-6 pb-6 pt-2 border-t border-gray-100">
            <button onClick={() => { closePanel(); guardedNavigate(`/individual/${entry.id}`); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-blue-500 text-blue-600 font-semibold hover:bg-blue-50 transition-colors">
              <UserIcon className="w-4 h-4" />View Full Profile<ExternalLinkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  };

  // ── Tier expand overlay ────────────────────────────────────────────────────
  const renderExpandedOverlay = () => {
    if (!expandedTier) return null;
    const level = expandedTier;
    const badge  = LEVEL_BADGE[level];
    const colors = LEVEL_COLORS[level];
    const members = circles[level];
    const query   = expandSearch.toLowerCase();
    const filtered = query ? members.filter(m => m.name.toLowerCase().includes(query)) : members;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
        style={{ backgroundColor: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={() => setExpandedTier(null)}
      >
        <div
          className="flex flex-col rounded-2xl shadow-2xl overflow-hidden w-full"
          style={{ maxWidth: '900px', maxHeight: '88vh', backgroundColor: 'rgba(255,255,255,0.98)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b-2 flex-shrink-0"
            style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="flex items-center gap-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest"
                  style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold leading-none" style={{ color: LEVEL_LABEL_COLOR[level] }}>
                    {members.length}
                  </span>
                  <span className="text-sm font-medium text-gray-500">
                    {members.length === 1 ? 'person' : 'people'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpandedTier(null)}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-black/10 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={expandSearch}
                onChange={e => setExpandSearch(e.target.value)}
                placeholder={`Search ${badge.label} members…`}
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Avatar grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-12">
                {query ? 'No matches found.' : 'No one in this tier yet.'}
              </p>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}
              >
                {filtered.map(entry => {
                  const avatarColor = colors.avatar;
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer hover:bg-gray-100 active:bg-gray-200 transition-colors select-none"
                      onClick={() => { setExpandedTier(null); openPanel(entry, level); }}
                    >
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden shadow-sm flex-shrink-0"
                        style={{
                          backgroundColor: avatarColor,
                          backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined,
                          backgroundSize: 'cover', backgroundPosition: 'center',
                        }}
                      >
                        {!entry.photoUrl && getInitials(entry.name)}
                      </div>
                      <span className="text-xs text-center font-medium text-gray-700 leading-tight w-full"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {entry.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50/80">
            <p className="text-xs text-gray-400 text-center">
              Click any person to view their full profile
              {!readOnly ? ' · Drag from the visualization to reassign tiers' : ''}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ── Contact prompt ─────────────────────────────────────────────────────────
  const renderContactPrompt = () => {
    if (!contactPrompt) return null;
    const { entry, targetLevel, selectedId } = contactPrompt;
    const candidates = validContacts(allPlaced, entry.id, targetLevel);
    return (
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: LEVEL_COLORS[targetLevel].avatar }}>
              {getInitials(entry.name)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{entry.name}</h2>
              <p className="text-xs text-gray-500">Placed in <span className="font-semibold">{LEVEL_DISPLAY[targetLevel]}</span></p>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Assign a primary contact</h3>
          <p className="text-xs text-gray-500 mb-3">
            Who is {entry.name.split(' ')[0]}'s primary connection? Optional but encouraged.
          </p>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-4">No eligible contacts yet. Assign later from their profile.</p>
          ) : (
            <div className="relative mb-4">
              <select value={selectedId} onChange={e => setContactPrompt(prev => prev ? { ...prev, selectedId: e.target.value } : null)}
                className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Skip for now —</option>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setContactPrompt(null)}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm">Skip</button>
            <button onClick={handleContactPromptAssign}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-all text-sm shadow-sm">
              {selectedId ? 'Assign' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main visualization ────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      <div className="flex flex-col gap-8">
        <p className="text-xs text-gray-400 text-center -mb-4">
          {readOnly
            ? 'Hover a badge for name · Click a badge or tier band for details · Scroll to zoom'
            : 'Hover a badge for name · Click a badge or tier band for details · Drag to assign · Scroll to zoom'}
        </p>

        {/* Arc visualization */}
        <div
          ref={vizContainerRef}
          className="relative mx-auto overflow-hidden rounded-2xl select-none"
          style={{
            width: `${boxScale * 100}%`,
            maxWidth: '100%',
            aspectRatio: ARC_ASPECT,
            cursor: isPanning ? 'grabbing' : 'grab',
            touchAction: 'none',
            transition: isPanning ? 'none' : 'width 0.18s ease-out',
          }}
          onMouseDown={handlePanMouseDown}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${innerScale})`,
              transformOrigin: '50% 50%',
              transition: isPanning ? 'none' : 'transform 0.18s ease-out',
              willChange: 'transform',
            }}
          >
            {/* ── SVG layer: arc bands, dots, labels ── */}
            <svg
              viewBox={`0 0 ${ARC_VB_W} ${ARC_VB_H}`}
              className="absolute inset-0 w-full h-full z-0 pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              {/* Arc band fills (outermost first) */}
              {[...ORDERED_LEVELS].reverse().map(level => {
                const { innerR, outerR } = ARC_BANDS[level];
                const isActive = dragOverLevel === level || expandedTier === level;
                return (
                  <path
                    key={level}
                    d={arcBandPath(innerR, outerR)}
                    fill={LEVEL_COLORS[level].bg}
                    stroke={isActive ? LEVEL_COLORS[level].border : 'rgba(0,0,0,0.06)'}
                    strokeWidth={isActive ? 2.5 : 1}
                    className="transition-all duration-200"
                  />
                );
              })}

              {/* Subtle separator arcs at band boundaries */}
              {ORDERED_LEVELS.slice(1).map(level => {
                const { innerR } = ARC_BANDS[level];
                const x1 = ARC_CX + innerR * Math.cos(ARC_START), y1 = ARC_CY + innerR * Math.sin(ARC_START);
                const x2 = ARC_CX + innerR * Math.cos(ARC_END),   y2 = ARC_CY + innerR * Math.sin(ARC_END);
                return (
                  <path key={`sep-${level}`}
                    d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
                    fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                );
              })}

              {/* Dots for tiers in dot mode */}
              {ORDERED_LEVELS.map(level => {
                const { mode, positions } = nodeData[level];
                if (mode !== 'dots') return null;
                const color = LEVEL_COLORS[level].avatar;
                return (
                  <g key={`dots-${level}`}>
                    {positions.map((pos, i) => (
                      <circle key={i} cx={pos.x.toFixed(2)} cy={pos.y.toFixed(2)}
                        r={DOT_R_SVG} fill={color} opacity={0.72} />
                    ))}
                  </g>
                );
              })}

              {/* Tier labels: prominent count + name at 12-o'clock of each band */}
              {ORDERED_LEVELS.map(level => {
                const { innerR, outerR } = ARC_BANDS[level];
                // Position the label group in the upper third of the band at 12-o'clock
                const labelCenterR = outerR - (outerR - innerR) * 0.28;
                const lx = ARC_CX;
                const ly = ARC_CY - labelCenterR;
                const color = LEVEL_LABEL_COLOR[level];
                const isDotMode = nodeData[level].mode === 'dots';
                return (
                  <g key={`label-${level}`}>
                    {/* Tier name (small, above count) */}
                    <text x={lx} y={ly - 8} textAnchor="middle"
                      fontSize="8" fontWeight="700" letterSpacing="1.4"
                      fill={color} opacity={0.7} style={{ userSelect: 'none' }}>
                      {LEVEL_DISPLAY[level].toUpperCase()}
                    </text>
                    {/* Count (large, bold) */}
                    <text x={lx} y={ly + 10} textAnchor="middle"
                      fontSize="20" fontWeight="800"
                      fill={color} style={{ userSelect: 'none' }}>
                      {circles[level].length}
                    </text>
                    {/* "tap to expand" hint in dot mode */}
                    {isDotMode && (
                      <text x={lx} y={ly + 21} textAnchor="middle"
                        fontSize="7" fill={color} opacity={0.45} style={{ userSelect: 'none' }}>
                        tap to expand ↓
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* ── Drop-zone + tier-click overlay (arc-shaped, outermost first) ── */}
            <div className="absolute inset-0 z-10">
              {[...ORDERED_LEVELS].reverse().map(level => (
                <div
                  key={level}
                  className="absolute inset-0 transition-colors duration-200"
                  style={{
                    clipPath: clipPaths[level],
                    cursor: 'pointer',
                    ...(dragOverLevel === level ? {
                      backgroundColor: LEVEL_COLORS[level].highlight,
                    } : {}),
                  }}
                  onClick={() => openExpandedTier(level)}
                  onDragOver={readOnly ? undefined : e => handleDragOver(e, level)}
                  onDragLeave={readOnly ? undefined : e => handleDragLeave(e, level)}
                  onDrop={readOnly ? undefined : e => handleDrop(e, level)}
                />
              ))}
            </div>

            {/* ── Badge avatar layer (only for tiers in badge mode) ── */}
            <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
              {ORDERED_LEVELS.map(level => {
                const { mode, positions } = nodeData[level];
                if (mode !== 'badges') return null;
                return circles[level].map((entry, i) => {
                  const pos = positions[i];
                  return pos ? renderBadge(entry, level, pos.x, pos.y) : null;
                });
              })}
            </div>
          </div>

          {/* Zoom controls */}
          <div
            data-pan-skip="true"
            className="absolute top-3 right-3 z-40 flex flex-col gap-1 bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-gray-100 p-1"
            onMouseDown={e => e.stopPropagation()}
          >
            <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX - 1e-3}
              aria-label="Zoom in" title="Zoom in"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">
              <ZoomInIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN + 1e-3}
              aria-label="Zoom out" title="Zoom out"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={resetView} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              aria-label="Reset view" title="Reset view"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">
              <Maximize2Icon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Unplaced / new participants */}
        <div
          className={`rounded-2xl border-2 border-dashed px-6 py-5 transition-all duration-200 ${
            dragOverUnplaced ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
          }`}
          onDragOver={readOnly ? undefined : e => { e.preventDefault(); setDragOverUnplaced(true); }}
          onDragLeave={readOnly ? undefined : e => {
            const r = e.currentTarget.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setDragOverUnplaced(false);
          }}
          onDrop={readOnly ? undefined : e => {
            e.preventDefault(); setDragOverUnplaced(false);
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
            {readOnly ? 'New participants' : 'New participants — drag onto a tier to assign engagement level'}
          </p>
          <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
            {unplaced.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No unplaced participants</p>
            ) : (
              unplaced.map(entry => {
                const isHovered = hoveredId === entry.id;
                return (
                  <div key={entry.id} aria-label={entry.name}
                    draggable={!readOnly}
                    onDragStart={readOnly ? undefined : e => handleDragStart(e, entry.id, 'unplaced')}
                    onClick={() => openPanel(entry, 'unplaced')}
                    onMouseEnter={() => setHoveredId(entry.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="relative flex items-center gap-2 px-3 py-1.5 bg-white border rounded-full cursor-pointer select-none transition-all duration-150"
                    style={{
                      border: isHovered ? '1.5px solid #9ca3af' : '1.5px solid #e5e7eb',
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.07)',
                      transform: isHovered ? 'translateY(-1px)' : 'none',
                    }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
                      style={{ backgroundColor: '#9ca3af', fontSize: '10px', fontWeight: 700 }}>
                      {getInitials(entry.name)}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{entry.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Save */}
        {!readOnly && (
          <div className="flex justify-center">
            <button onClick={handleSave}
              className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
              {saved ? <><CheckIcon className="w-4 h-4" /> Saved Successfully</> : 'Save Engagement Levels'}
            </button>
          </div>
        )}
      </div>

      {renderPanel()}
      {renderExpandedOverlay()}
      {renderContactPrompt()}
    </>
  );
}
