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
// The visualization is a fan/amphitheater: center anchor at the bottom,
// arcs open upward. Core (innermost) is closest to the center; Aware (outermost)
// is at the top of the fan.

const ARC_VB_W = 740;          // SVG viewBox width
const ARC_VB_H = 390;          // SVG viewBox height (slightly taller than half-width to add top margin)
const ARC_CX   = ARC_VB_W / 2; // 370 — horizontal center
const ARC_CY   = ARC_VB_H - 10; // 380 — anchor near very bottom edge

// The fan spans almost a full semicircle, with a small margin so arcs don't
// reach the exact bottom-left / bottom-right corners of the viewport.
const ARC_MARGIN_RAD = 0.08; // radians of margin on each side
const ARC_START = -(Math.PI - ARC_MARGIN_RAD); // ≈ -3.06 rad (left side, slightly above horizontal)
const ARC_END   = -ARC_MARGIN_RAD;              // ≈ -0.08 rad (right side, slightly above horizontal)
const ARC_SPAN  = ARC_END - ARC_START;          // ≈ 2.98 rad

// Fixed radial dimensions for each tier band (in SVG units)
const ARC_BANDS: Record<Level, { innerR: number; outerR: number }> = {
  coordinating: { innerR: 50,  outerR: 108 },
  supporting:   { innerR: 122, outerR: 182 },
  participating:{ innerR: 196, outerR: 256 },
  aware:        { innerR: 270, outerR: 330 },
};

// Person avatar size in SVG units (used for spacing math) and in CSS px (rendered size)
const NODE_SVG_R = 17;   // layout radius in SVG units
const NODE_CSS_PX = 40;  // rendered avatar diameter in CSS pixels
const NODE_SPACING_SVG = NODE_SVG_R * 2 + 8; // min arc-length between adjacent avatars

// Aspect ratio string for the container CSS
const ARC_ASPECT = `${ARC_VB_W} / ${ARC_VB_H}`;

// Ordered from innermost (core) to outermost (aware)
const ORDERED_LEVELS: Level[] = ['coordinating', 'supporting', 'participating', 'aware'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
}

/** Max visible avatars for a tier before overflow kicks in. */
function arcCapacity(level: Level): number {
  const { innerR, outerR } = ARC_BANDS[level];
  const midR = (innerR + outerR) / 2;
  return Math.max(3, Math.floor((midR * ARC_SPAN) / NODE_SPACING_SVG));
}

/** SVG arc band path (donut sector). */
function arcBandPath(innerR: number, outerR: number): string {
  const cos = Math.cos, sin = Math.sin;
  const cx = ARC_CX, cy = ARC_CY;
  const sa = ARC_START, ea = ARC_END;
  // span < π so large-arc-flag = 0; outer arc sweeps counterclockwise (SVG sweep=0) through top
  const ox1 = cx + outerR * cos(sa), oy1 = cy + outerR * sin(sa);
  const ox2 = cx + outerR * cos(ea), oy2 = cy + outerR * sin(ea);
  const ix1 = cx + innerR * cos(ea), iy1 = cy + innerR * sin(ea);
  const ix2 = cx + innerR * cos(sa), iy2 = cy + innerR * sin(sa);
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 0 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 1 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** CSS polygon clip-path approximating the arc band shape (using % units). */
function arcClipPath(innerR: number, outerR: number, steps = 24): string {
  const cx = ARC_CX, cy = ARC_CY;
  const pts: string[] = [];
  const pct = (x: number, y: number) =>
    `${((x / ARC_VB_W) * 100).toFixed(3)}% ${((y / ARC_VB_H) * 100).toFixed(3)}%`;
  // outer arc: start → end (counterclockwise through top)
  for (let i = 0; i <= steps; i++) {
    const a = ARC_START + (i / steps) * ARC_SPAN;
    pts.push(pct(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)));
  }
  // inner arc: end → start (clockwise through top)
  for (let i = steps; i >= 0; i--) {
    const a = ARC_START + (i / steps) * ARC_SPAN;
    pts.push(pct(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)));
  }
  return `polygon(${pts.join(', ')})`;
}

/** Evenly space `count` avatars along the arc mid-radius for a tier. */
function layoutArcNodes(count: number, level: Level): { x: number; y: number }[] {
  const { innerR, outerR } = ARC_BANDS[level];
  const midR = (innerR + outerR) / 2;
  const cx = ARC_CX, cy = ARC_CY;
  const margin = 0.04 * ARC_SPAN;
  const sa = ARC_START + margin;
  const ea = ARC_END - margin;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = sa + t * (ea - sa);
    return { x: cx + midR * Math.cos(a), y: cy + midR * Math.sin(a) };
  });
}

/** Placement signature for unsaved-changes detection. */
function placementSignature(circles: Record<Level, NameEntry[]>, unplaced: NameEntry[]): string {
  const pairs: [string, string][] = [];
  for (const level of ORDERED_LEVELS) for (const e of circles[level]) pairs.push([e.id, level]);
  for (const e of unplaced) pairs.push([e.id, 'unplaced']);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(pairs);
}

function getAllPlaced(circles: Record<Level, NameEntry[]>): { id: string; name: string; level: Level }[] {
  const result: { id: string; name: string; level: Level }[] = [];
  for (const level of Object.keys(circles) as Level[]) {
    for (const entry of circles[level]) result.push({ id: entry.id, name: entry.name, level });
  }
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

  // Person side-panel
  const [panel, setPanel] = useState<{ entry: NameEntry; level: Level | 'unplaced' } | null>(null);
  const [panelActivities, setPanelActivities] = useState<PanelActivity[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelContactId, setPanelContactId] = useState<string | null>(null);
  const [panelContactSaving, setPanelContactSaving] = useState(false);

  // Tier side-panel (shows all people in a tier)
  const [tierPanel, setTierPanel] = useState<Level | null>(null);
  const [tierSearch, setTierSearch] = useState('');

  // "Assign primary contact" prompt after drop from unplaced
  const [contactPrompt, setContactPrompt] = useState<{
    entry: NameEntry;
    targetLevel: Level;
    selectedId: string;
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

  // ── Load data ──────────────────────────────────────────────────────────────
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
          if (e.engagementLevel === null || unplacedIds.has(e.personId)) {
            newUnplaced.push(entry);
          } else {
            result[e.engagementLevel].push(entry);
          }
        });
        setCircles(result);
        setUnplaced(newUnplaced);
        baselineSigRef.current = placementSignature(result, newUnplaced);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [nucleusId]);

  // ── Unsaved-changes guard ──────────────────────────────────────────────────
  const placementSig = useMemo(() => placementSignature(circles, unplaced), [circles, unplaced]);
  const isDirty = !readOnly && baselineSigRef.current !== null && placementSig !== baselineSigRef.current;
  useUnsavedChanges(isDirty);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const updates: Promise<void>[] = [];
    for (const level of ORDERED_LEVELS) {
      for (const entry of circles[level]) updates.push(updateEngagementLevel(entry.id, nucleusId, level));
    }
    try {
      await Promise.all(updates);
      baselineSigRef.current = placementSignature(circles, unplaced);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save engagement levels:', err);
    }
  };

  // ── Person panel ───────────────────────────────────────────────────────────
  const openPanel = (entry: NameEntry, level: Level | 'unplaced') => {
    setTierPanel(null);
    setPanel({ entry, level });
    setPanelContactId(entry.primaryContactId ?? null);
    setPanelLoading(true);
    setPanelActivities([]);
    fetchPanelActivities(entry.id)
      .then(acts => { setPanelActivities(acts); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  };

  const closePanel = () => setPanel(null);

  const handlePanelContactSave = async (newContactId: string | null) => {
    if (!panel) return;
    setPanelContactSaving(true);
    try {
      await updatePrimaryContact(panel.entry.id, nucleusId, newContactId);
      setPanelContactId(newContactId);
      const updateEntry = (entry: NameEntry) =>
        entry.id === panel.entry.id ? { ...entry, primaryContactId: newContactId } : entry;
      setCircles(prev => {
        const next = { ...prev };
        for (const level of Object.keys(next) as Level[]) next[level] = next[level].map(updateEntry);
        return next;
      });
      setUnplaced(prev => prev.map(updateEntry));
      setPanel(prev => prev ? { ...prev, entry: { ...prev.entry, primaryContactId: newContactId } } : null);
    } catch (err) {
      console.error('Failed to update primary contact:', err);
    } finally {
      setPanelContactSaving(false);
    }
  };

  // ── Tier panel ─────────────────────────────────────────────────────────────
  const openTierPanel = (level: Level) => {
    setPanel(null);
    setTierPanel(level);
    setTierSearch('');
  };

  const movePersonToTier = (personId: string, fromLevel: Level, toLevel: Level) => {
    setCircles(prev => {
      const entry = prev[fromLevel].find(p => p.id === personId);
      if (!entry) return prev;
      return {
        ...prev,
        [fromLevel]: prev[fromLevel].filter(p => p.id !== personId),
        [toLevel]: [...prev[toLevel], entry],
      };
    });
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────
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

  // ── Contact prompt (after drop from unplaced) ──────────────────────────────
  const handleContactPromptAssign = async () => {
    if (!contactPrompt) return;
    const contactId = contactPrompt.selectedId || null;
    if (contactId) {
      try {
        await updatePrimaryContact(contactPrompt.entry.id, nucleusId, contactId);
        const updateEntry = (entry: NameEntry) =>
          entry.id === contactPrompt.entry.id ? { ...entry, primaryContactId: contactId } : entry;
        setCircles(prev => {
          const next = { ...prev };
          for (const level of Object.keys(next) as Level[]) next[level] = next[level].map(updateEntry);
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
      if (stored != null) {
        const v = parseFloat(stored);
        if (!isNaN(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) restored = v;
      }
    } catch { /* ignore */ }
    setZoom(restored);
    setZoomReady(true);
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

  // ── Computed clip paths (memoised so they don't recalculate on every render) ─
  const clipPaths = useMemo(() =>
    Object.fromEntries(ORDERED_LEVELS.map(level => {
      const { innerR, outerR } = ARC_BANDS[level];
      return [level, arcClipPath(innerR, outerR)];
    })) as Record<Level, string>,
  []);

  // ── Node positions per tier ────────────────────────────────────────────────
  const nodeData = useMemo(() =>
    Object.fromEntries(ORDERED_LEVELS.map(level => {
      const count = circles[level].length;
      const capacity = arcCapacity(level);
      // If overflow, show capacity-1 people + 1 overflow chip slot
      const visibleCount = count <= capacity ? count : capacity - 1;
      const overflow = count - visibleCount;
      const positions = layoutArcNodes(overflow > 0 ? visibleCount + 1 : visibleCount, level);
      return [level, { visibleCount, overflow, positions }];
    })) as Record<Level, { visibleCount: number; overflow: number; positions: { x: number; y: number }[] }>,
  [circles]);

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderAvatar = (entry: NameEntry, level: Level | 'unplaced', x: number, y: number) => {
    const isHovered = hoveredId === entry.id;
    const avatarColor = level !== 'unplaced' ? LEVEL_COLORS[level].avatar : '#9ca3af';
    const leftPct = (x / ARC_VB_W) * 100;
    const topPct  = (y / ARC_VB_H) * 100;
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
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${NODE_CSS_PX}px`,
          height: `${NODE_CSS_PX}px`,
          transform: `translate(-50%, -50%) scale(${(isHovered ? 1.18 : 1) / innerScale})`,
          zIndex: isHovered ? 30 : 20,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '100%', height: '100%', borderRadius: '50%',
            backgroundColor: avatarColor,
            backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
            border: '2.5px solid rgba(255,255,255,0.9)',
            boxShadow: isHovered ? '0 4px 14px rgba(0,0,0,0.25)' : '0 2px 5px rgba(0,0,0,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none',
          }}
        >
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

  // ── Person side-panel ─────────────────────────────────────────────────────
  const renderPanel = () => {
    if (!panel) return null;
    const { entry, level } = panel;
    const badge = LEVEL_BADGE[level];
    const initials = getInitials(entry.name);
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
                {!entry.photoUrl && initials}
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
                {personLevel === 'coordinating'
                  ? "Core members can be anyone's primary contact."
                  : 'No eligible contacts at this level or higher.'}
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
              <UserIcon className="w-4 h-4" />
              View Full Profile
              <ExternalLinkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  };

  // ── Tier side-panel ───────────────────────────────────────────────────────
  const renderTierPanel = () => {
    if (!tierPanel) return null;
    const level = tierPanel;
    const badge = LEVEL_BADGE[level];
    const colors = LEVEL_COLORS[level];
    const members = circles[level];
    const query = tierSearch.toLowerCase();
    const filtered = query ? members.filter(m => m.name.toLowerCase().includes(query)) : members;
    const otherLevels = ORDERED_LEVELS.filter(l => l !== level);

    return (
      <>
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.08)' }} onClick={() => setTierPanel(null)} />
        <div className="fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl"
          style={{ width: '380px', maxWidth: '100vw', animation: 'slideInRight 0.25s ease' }}>

          {/* header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100"
            style={{ backgroundColor: colors.bg }}>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest"
                style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
              <h2 className="text-2xl font-extrabold mt-1" style={{ color: LEVEL_LABEL_COLOR[level] }}>
                {members.length} {members.length === 1 ? 'person' : 'people'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Click a name to view full profile</p>
            </div>
            <button onClick={() => setTierPanel(null)}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors flex-shrink-0">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* search */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={tierSearch}
                onChange={e => setTierSearch(e.target.value)}
                placeholder={`Search ${badge.label} members…`}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-6 py-8 text-center">
                {query ? 'No matches found.' : 'No one in this tier yet.'}
              </p>
            ) : (
              filtered.map(entry => {
                const avatarColor = LEVEL_COLORS[level].avatar;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group transition-colors">
                    {/* avatar */}
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm cursor-pointer overflow-hidden shadow-sm"
                      style={{
                        backgroundColor: avatarColor,
                        backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                      }}
                      onClick={() => { setTierPanel(null); openPanel(entry, level); }}
                    >
                      {!entry.photoUrl && getInitials(entry.name)}
                    </div>

                    {/* name */}
                    <span
                      className="flex-1 text-sm font-medium text-gray-800 cursor-pointer hover:text-blue-600 transition-colors truncate"
                      onClick={() => { setTierPanel(null); openPanel(entry, level); }}
                    >
                      {entry.name}
                    </span>

                    {/* move-to-tier control */}
                    {!readOnly && (
                      <div className="relative flex-shrink-0">
                        <select
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) {
                              movePersonToTier(entry.id, level, e.target.value as Level);
                              // keep panel open on current tier so user sees the updated list
                            }
                            e.target.value = '';
                          }}
                          className="appearance-none text-xs pl-2 pr-6 py-1.5 border border-gray-200 rounded-lg text-gray-600 bg-white cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          title="Move to another tier"
                        >
                          <option value="" disabled>Move…</option>
                          {otherLevels.map(l => (
                            <option key={l} value={l}>{LEVEL_DISPLAY[l]}</option>
                          ))}
                        </select>
                        <ChevronDownIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* footer hint */}
          {!readOnly && (
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 text-center">
                Use "Move…" to reassign someone to a different tier. Changes are saved with the main Save button.
              </p>
            </div>
          )}
        </div>
      </>
    );
  };

  // ── Contact prompt ────────────────────────────────────────────────────────
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
            Who is {entry.name.split(' ')[0]}'s primary connection in this nucleus? This is optional but encouraged.
          </p>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-4">No eligible contacts yet. You can assign one later from the person's profile panel.</p>
          ) : (
            <div className="relative mb-4">
              <select value={selectedId} onChange={e => setContactPrompt(prev => prev ? { ...prev, selectedId: e.target.value } : null)}
                className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="">— Skip for now —</option>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setContactPrompt(null)}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm">
              Skip
            </button>
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
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <div className="flex flex-col gap-8">
        <p className="text-xs text-gray-400 text-center -mb-4">
          {readOnly
            ? 'Hover for name · Click a person for details · Click a tier band to see all members · Scroll to zoom'
            : 'Hover for name · Click a person for details · Click a tier band to see all members · Drag to assign · Scroll to zoom'}
        </p>

        {/* Arc visualization container */}
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
            {/* SVG: arc band backgrounds + tier labels */}
            <svg
              viewBox={`0 0 ${ARC_VB_W} ${ARC_VB_H}`}
              className="absolute inset-0 w-full h-full z-0 pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              {/* Render outermost first so inner bands overlap correctly */}
              {[...ORDERED_LEVELS].reverse().map(level => {
                const { innerR, outerR } = ARC_BANDS[level];
                const isActive = dragOverLevel === level || tierPanel === level;
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

              {/* Tier labels at the 12-o'clock position of each band */}
              {ORDERED_LEVELS.map(level => {
                const { innerR, outerR } = ARC_BANDS[level];
                const midR = (innerR + outerR) / 2;
                // Label sits at θ = -π/2 (straight up from center)
                const labelX = ARC_CX;
                const labelY = ARC_CY - midR;
                return (
                  <text
                    key={level}
                    x={labelX}
                    y={labelY + 5}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    letterSpacing="1.2"
                    fill={LEVEL_LABEL_COLOR[level]}
                    style={{ textTransform: 'uppercase', userSelect: 'none' }}
                  >
                    {LEVEL_DISPLAY[level].toUpperCase()} ({circles[level].length})
                  </text>
                );
              })}

              {/* Subtle radial guide lines at band boundaries */}
              {ORDERED_LEVELS.map(level => {
                const { innerR } = ARC_BANDS[level];
                if (innerR === ARC_BANDS.coordinating.innerR) return null; // skip innermost
                return (
                  <path
                    key={`sep-${level}`}
                    d={`M ${ARC_CX + innerR * Math.cos(ARC_START)} ${ARC_CY + innerR * Math.sin(ARC_START)} A ${innerR} ${innerR} 0 0 0 ${ARC_CX + innerR * Math.cos(ARC_END)} ${ARC_CY + innerR * Math.sin(ARC_END)}`}
                    fill="none"
                    stroke="rgba(0,0,0,0.08)"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>

            {/* Drop-zone overlay: arc-shaped clip-path per tier (outermost first so
                inner zones sit on top and capture drops correctly) */}
            <div className="absolute inset-0 z-10">
              {[...ORDERED_LEVELS].reverse().map(level => (
                <div
                  key={level}
                  className="absolute inset-0 transition-all duration-200"
                  style={{
                    clipPath: clipPaths[level],
                    cursor: 'pointer',
                    ...(dragOverLevel === level ? {
                      backgroundColor: LEVEL_COLORS[level].highlight,
                      outline: `2px dashed ${LEVEL_COLORS[level].border}`,
                    } : {}),
                  }}
                  onClick={() => openTierPanel(level)}
                  onDragOver={readOnly ? undefined : e => handleDragOver(e, level)}
                  onDragLeave={readOnly ? undefined : e => handleDragLeave(e, level)}
                  onDrop={readOnly ? undefined : e => handleDrop(e, level)}
                />
              ))}
            </div>

            {/* Avatar + overflow chip layer */}
            <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
              {ORDERED_LEVELS.map(level => {
                const { visibleCount, overflow, positions } = nodeData[level];
                const entries = circles[level];
                return (
                  <React.Fragment key={level}>
                    {entries.slice(0, visibleCount).map((entry, i) => {
                      const pos = positions[i];
                      if (!pos) return null;
                      return renderAvatar(entry, level, pos.x, pos.y);
                    })}
                    {overflow > 0 && (() => {
                      const chipPos = positions[visibleCount];
                      if (!chipPos) return null;
                      const leftPct = (chipPos.x / ARC_VB_W) * 100;
                      const topPct  = (chipPos.y / ARC_VB_H) * 100;
                      return (
                        <div
                          key={`overflow-${level}`}
                          data-node="true"
                          onClick={e => { e.stopPropagation(); openTierPanel(level); }}
                          style={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            transform: `translate(-50%, -50%) scale(${1 / innerScale})`,
                            zIndex: 25,
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{
                            height: `${NODE_CSS_PX}px`,
                            paddingLeft: '10px',
                            paddingRight: '10px',
                            borderRadius: '999px',
                            backgroundColor: LEVEL_COLORS[level].avatar,
                            border: '2.5px solid rgba(255,255,255,0.9)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            whiteSpace: 'nowrap',
                          }}>
                            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700, lineHeight: 1 }}>
                              +{overflow} more
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </React.Fragment>
                );
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
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ZoomInIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN + 1e-3}
              aria-label="Zoom out" title="Zoom out"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button type="button" onClick={resetView} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              aria-label="Reset view" title="Reset view"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Maximize2Icon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Unplaced / new participants area */}
        <div
          className={`rounded-2xl border-2 border-dashed px-6 py-5 transition-all duration-200 ${
            dragOverUnplaced ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
          }`}
          onDragOver={readOnly ? undefined : e => { e.preventDefault(); setDragOverUnplaced(true); }}
          onDragLeave={readOnly ? undefined : e => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
              setDragOverUnplaced(false);
          }}
          onDrop={readOnly ? undefined : e => {
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
            {readOnly ? 'New participants' : 'New participants — drag onto a tier to assign engagement level'}
          </p>
          <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
            {unplaced.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No unplaced participants</p>
            ) : (
              unplaced.map(entry => {
                const isHovered = hoveredId === entry.id;
                return (
                  <div
                    key={entry.id}
                    aria-label={entry.name}
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
                    }}
                  >
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

        {/* Save button */}
        {!readOnly && (
          <div className="flex justify-center">
            <button
              onClick={handleSave}
              className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              {saved ? <><CheckIcon className="w-4 h-4" /> Saved Successfully</> : 'Save Engagement Levels'}
            </button>
          </div>
        )}
      </div>

      {renderPanel()}
      {renderTierPanel()}
      {renderContactPrompt()}
    </>
  );
}
