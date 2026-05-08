import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDownIcon,
  ZoomInIcon,
  ZoomOutIcon,
  Maximize2Icon,
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

// Engagement level hierarchy: higher = closer to core
const LEVEL_RANK: Record<Level, number> = {
  coordinating: 4,
  supporting:   3,
  participating:2,
  aware:        1,
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

// Layout primitives — bands are planned dynamically based on participant counts.
const NODE_R = 16; // SVG units — visual radius of each person node (used for layout/spacing math)
const NODE_CSS_PX = 40; // rendered icon diameter in CSS pixels (independent of viewBox / box size)
const NODE_PADDING = 3; // padding inside band boundaries around node circles
const MIN_TANGENTIAL_SPACING = NODE_R * 2 + 6; // arc-length minimum between adjacent nodes on a sub-ring
const MIN_RADIAL_SPACING = NODE_R * 2 + 4; // radial minimum between sub-rings within a band
const BAND_GAP = 8; // breathing room between adjacent bands
const VIEW_MARGIN = 14; // margin around the outermost ring inside the viewBox
const CORE_INNER_R = 6; // inner anchor radius for the innermost (core) band
const MIN_BAND_WIDTH_CORE = 56; // minimum visible thickness for the core band
const MIN_BAND_WIDTH_OUTER = 42; // minimum visible thickness for outer bands
const BASE_VIEW_SIZE = 400; // baseline viewBox dimension (unchanged from prior)
// Viewport box max size: fill the full available width of the parent panel.
// The box stays square via aspect-ratio; on shorter viewports the user can
// scroll vertically to reach the surrounding controls.
const VIEWPORT_MAX_CSS = '100%';

// Order from innermost to outermost — used for nesting / z-ordering
const ORDERED_LEVELS: Level[] = ['coordinating', 'supporting', 'participating', 'aware'];

const LEVEL_LABEL_COLOR: Record<Level, string> = {
  aware:         '#6b7280',
  participating: '#059669',
  supporting:    '#b45309',
  coordinating:  '#2563eb',
};

interface SubRing { r: number; count: number; }
interface BandPlan {
  innerR: number;
  outerR: number;
  rings: SubRing[];
}

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

function layoutRing(count: number, r: number, cx: number, cy: number, angleOffset = 0): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2 + angleOffset;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

// Plan a band: fit `count` nodes across as many concentric sub-rings as needed
// starting at innerR, growing outward. Capacity per sub-ring is bounded by arc-length.
function planBand(count: number, innerR: number, minWidth: number): BandPlan {
  if (count === 0) {
    return { innerR, outerR: innerR + minWidth, rings: [] };
  }

  const subRings: { r: number; capacity: number }[] = [];
  let r = innerR + NODE_R + NODE_PADDING;
  for (let safety = 0; safety < 200; safety++) {
    const capacity = Math.max(1, Math.floor((2 * Math.PI * r) / MIN_TANGENTIAL_SPACING));
    subRings.push({ r, capacity });
    const total = subRings.reduce((acc, ring) => acc + ring.capacity, 0);
    if (total >= count) break;
    r += MIN_RADIAL_SPACING;
  }

  let outerR = subRings[subRings.length - 1].r + NODE_R + NODE_PADDING;
  if (outerR - innerR < minWidth) outerR = innerR + minWidth;

  // Distribute count proportional to each sub-ring's capacity; push remainders to outer rings.
  const totalCap = subRings.reduce((acc, ring) => acc + ring.capacity, 0);
  const counts = subRings.map(ring => Math.floor((count * ring.capacity) / totalCap));
  let allocated = counts.reduce((acc, n) => acc + n, 0);
  let idx = subRings.length - 1;
  while (allocated < count) {
    counts[idx]++;
    allocated++;
    idx = idx === 0 ? subRings.length - 1 : idx - 1;
  }

  return {
    innerR,
    outerR,
    rings: subRings.map((ring, i) => ({ r: ring.r, count: counts[i] })),
  };
}

function computePositionsFromPlan(plan: BandPlan, cx: number, cy: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  plan.rings.forEach((ring, idx) => {
    if (ring.count === 0) return;
    // Stagger angular offset on each sub-ring so adjacent sub-rings don't radially align.
    const offset = (idx * Math.PI) / Math.max(1, ring.count);
    positions.push(...layoutRing(ring.count, ring.r, cx, cy, offset));
  });
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

// Returns a flat list of all placed persons with their levels (for contact dropdown filtering)
function getAllPlaced(circles: Record<Level, NameEntry[]>): { id: string; name: string; level: Level }[] {
  const result: { id: string; name: string; level: Level }[] = [];
  for (const level of Object.keys(circles) as Level[]) {
    for (const entry of circles[level]) {
      result.push({ id: entry.id, name: entry.name, level });
    }
  }
  return result;
}

// Valid primary contact candidates: same or higher level than the person
function validContacts(
  allPlaced: { id: string; name: string; level: Level }[],
  personId: string,
  personLevel: Level | null
): { id: string; name: string }[] {
  return allPlaced.filter(p => {
    if (p.id === personId) return false;
    if (personLevel === null) return true;
    return LEVEL_RANK[p.level] >= LEVEL_RANK[personLevel];
  });
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
  const [panelContactId, setPanelContactId] = useState<string | null>(null);
  const [panelContactSaving, setPanelContactSaving] = useState(false);

  // State for the "assign primary contact" prompt shown after dropping from unplaced
  const [contactPrompt, setContactPrompt] = useState<{
    entry: NameEntry;
    targetLevel: Level;
    selectedId: string;
  } | null>(null);

  // Zoom & pan state (visualization is wrapped in a CSS transform).
  // Zoom is auto-persisted per nucleus so each nucleus reopens at the last-used level.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [zoomReady, setZoomReady] = useState(false);
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const vizContainerRef = useRef<HTMLDivElement | null>(null);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const zoomStorageKey = `nucleus-circle-zoom:${nucleusId}`;

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
      // Update local state
      const updateEntry = (entry: NameEntry) =>
        entry.id === panel.entry.id ? { ...entry, primaryContactId: newContactId } : entry;
      setCircles(prev => {
        const next = { ...prev };
        for (const level of Object.keys(next) as Level[]) {
          next[level] = next[level].map(updateEntry);
        }
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
      // Prompt to assign primary contact
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
    // Update panel if the dragged person's panel is open
    if (panel?.entry.id === participantId) {
      setPanel(prev => prev ? { ...prev, level: targetLevel } : null);
    }
  };

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
          for (const level of Object.keys(next) as Level[]) {
            next[level] = next[level].map(updateEntry);
          }
          return next;
        });
      } catch (err) {
        console.error('Failed to save primary contact:', err);
      }
    }
    setContactPrompt(null);
  };

  // Plan each band dynamically based on member counts.
  // Bands stack outward from CORE_INNER_R, each separated by BAND_GAP.
  const bandPlans = useMemo(() => {
    const plans: Record<Level, BandPlan> = {
      coordinating: { innerR: 0, outerR: 0, rings: [] },
      supporting:   { innerR: 0, outerR: 0, rings: [] },
      participating:{ innerR: 0, outerR: 0, rings: [] },
      aware:        { innerR: 0, outerR: 0, rings: [] },
    };
    let cursor = CORE_INNER_R;
    for (const level of ORDERED_LEVELS) {
      const minWidth = level === 'coordinating' ? MIN_BAND_WIDTH_CORE : MIN_BAND_WIDTH_OUTER;
      const plan = planBand(circles[level].length, cursor, minWidth);
      plans[level] = plan;
      cursor = plan.outerR + BAND_GAP;
    }
    return plans;
  }, [circles]);

  // viewBox dimensions grow with content. Center stays at the viewBox center.
  const viewSize = useMemo(() => {
    const outermost = bandPlans.aware.outerR + VIEW_MARGIN;
    return Math.max(BASE_VIEW_SIZE, outermost * 2);
  }, [bandPlans]);
  const center = viewSize / 2;

  // Compute node positions for each level using the dynamic plans.
  const nodePositions = useMemo(() => {
    const result: Record<Level, { x: number; y: number }[]> = {
      coordinating: [], supporting: [], participating: [], aware: [],
    };
    for (const level of ORDERED_LEVELS) {
      result[level] = computePositionsFromPlan(bandPlans[level], center, center);
    }
    return result;
  }, [bandPlans, center]);

  // Zoom & pan handlers
  const zoomIn  = useCallback(() => setZoom(z => Math.min(ZOOM_MAX, z * 1.2)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(ZOOM_MIN, z / 1.2)), []);
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Two-stage zoom so the visualization area always tracks the rings:
  //   • zoom < 1 → shrink the outer box itself (rings stay filling it; the flex
  //     layout below tucks the unplaced area right under the smaller box).
  //   • zoom > 1 → keep the box at full panel width and scale content inside
  //     (overflow:hidden clips, user pans). Icons counter-scale by innerScale.
  const boxScale = Math.min(1, zoom);
  const innerScale = Math.max(1, zoom);

  // Restore the last-used zoom for this nucleus on mount / when nucleusId changes.
  // `zoomReady` gates the auto-save effect so we don't overwrite the stored value
  // with the default `1` before the restore runs.
  useEffect(() => {
    setZoomReady(false);
    let restored = 1;
    try {
      const stored = localStorage.getItem(zoomStorageKey);
      if (stored != null) {
        const v = parseFloat(stored);
        if (!isNaN(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) restored = v;
      }
    } catch { /* ignore storage errors */ }
    setZoom(restored);
    setZoomReady(true);
  }, [zoomStorageKey]);

  // Auto-persist zoom whenever the user changes it.
  useEffect(() => {
    if (!zoomReady) return;
    try {
      localStorage.setItem(zoomStorageKey, String(zoom));
    } catch { /* ignore storage errors */ }
  }, [zoom, zoomReady, zoomStorageKey]);

  const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Skip when starting on a draggable node or a control — preserves drag/drop and clicks.
    if (target.closest('[data-node]') || target.closest('[data-pan-skip]')) return;
    setIsPanning(true);
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan.x, pan.y]);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      if (!panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.mx;
      const dy = e.clientY - panStartRef.current.my;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
    };
    const onUp = () => { setIsPanning(false); panStartRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

  // Wheel zoom — attach as a non-passive native listener so we can preventDefault.
  useEffect(() => {
    const el = vizContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setZoom(prev => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const allPlaced = useMemo(() => getAllPlaced(circles), [circles]);

  const renderNode = (entry: NameEntry, level: Level | 'unplaced', x: number, y: number) => {
    const isHovered = hoveredId === entry.id;
    const avatarColor = level !== 'unplaced' ? LEVEL_COLORS[level].avatar : '#9ca3af';
    const scale = isHovered ? 1.2 : 1;
    const initials = getInitials(entry.name);
    const leftPct = (x / viewSize) * 100;
    const topPct = (y / viewSize) * 100;

    return (
      <div
        key={entry.id}
        aria-label={entry.name}
        draggable
        onDragStart={e => handleDragStart(e, entry.id, level)}
        onClick={() => openPanel(entry, level)}
        onMouseEnter={() => setHoveredId(entry.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${NODE_CSS_PX}px`,
          height: `${NODE_CSS_PX}px`,
          // Counter-scale by 1/innerScale so icons stay a constant on-screen size
          // while the rings (parent transform) scale up at zoom > 1. At zoom <= 1
          // the inner stage isn't scaled, so the icon renders at its natural size.
          transform: `translate(-50%, -50%) scale(${scale / innerScale})`,
          zIndex: isHovered ? 30 : 20,
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: avatarColor,
            backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
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
          {!entry.photoUrl && (
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700, lineHeight: 1, pointerEvents: 'none' }}>
              {initials}
            </span>
          )}
        </div>
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

  // ── Compact mode ──────────────────────────────────────────────────────────
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
    const personLevel = level !== 'unplaced' ? (level as Level) : null;
    const contacts = validContacts(allPlaced, entry.id, personLevel);
    const currentContactName = panelContactId
      ? allPlaced.find(p => p.id === panelContactId)?.name ?? null
      : null;

    return (
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
              <div
                className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md overflow-hidden"
                style={{
                  backgroundColor: avatarColor,
                  backgroundImage: entry.photoUrl ? `url(${entry.photoUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {!entry.photoUrl && initials}
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

          {/* primary contact */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Primary contact</h3>
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {personLevel === 'coordinating'
                  ? 'Core members can be anyone\'s primary contact.'
                  : 'No eligible contacts at this level or higher.'}
              </p>
            ) : (
              <>
                <div className="relative">
                  <select
                    value={panelContactId ?? ''}
                    onChange={e => handlePanelContactSave(e.target.value || null)}
                    disabled={panelContactSaving}
                    className="w-full appearance-none pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">— No primary contact —</option>
                    {contacts.map(c => (
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

  // ── Primary contact assignment prompt (after drop from unplaced) ───────────
  const renderContactPrompt = () => {
    if (!contactPrompt) return null;
    const { entry, targetLevel, selectedId } = contactPrompt;
    const candidates = validContacts(allPlaced, entry.id, targetLevel);

    return (
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: LEVEL_COLORS[targetLevel].avatar }}
            >
              {getInitials(entry.name)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{entry.name}</h2>
              <p className="text-xs text-gray-500">
                Placed in{' '}
                <span className="font-semibold">{LEVEL_DISPLAY[targetLevel]}</span>
              </p>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-1">Assign a primary contact</h3>
          <p className="text-xs text-gray-500 mb-3">
            Who is {entry.name.split(' ')[0]}'s primary connection in this nucleus? This is optional but encouraged.
          </p>

          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-4">
              No eligible contacts yet. You can assign one later from the person's profile panel.
            </p>
          ) : (
            <div className="relative mb-4">
              <select
                value={selectedId}
                onChange={e => setContactPrompt(prev => prev ? { ...prev, selectedId: e.target.value } : null)}
                className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">— Skip for now —</option>
                {candidates.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setContactPrompt(null)}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Skip
            </button>
            <button
              onClick={handleContactPromptAssign}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-all text-sm shadow-sm"
            >
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
        {/* Hint text */}
        <p className="text-xs text-gray-400 text-center -mb-4">
          Hover for name • Click for details • Drag to reassign • Scroll to zoom • Drag empty space to pan
        </p>

        {/* Circles visualization. The outer box width tracks zoom (when zoom < 1
            the whole box shrinks so the unplaced area below stays right under
            the rings); when zoom > 1, the box stays at full panel width and the
            inner stage scales — overflow:hidden clips, the user pans. */}
        <div
          ref={vizContainerRef}
          className="relative mx-auto overflow-hidden rounded-2xl select-none"
          style={{
            width: `${boxScale * 100}%`,
            maxWidth: VIEWPORT_MAX_CSS,
            aspectRatio: '1/1',
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
            {/* SVG: background circles + labels (sized by dynamic viewBox) */}
            <svg
              viewBox={`0 0 ${viewSize} ${viewSize}`}
              className="absolute inset-0 w-full h-full z-0 pointer-events-none drop-shadow-sm"
            >
              {/* Render outermost first so inner band colors overlay */}
              {[...ORDERED_LEVELS].reverse().map((level) => (
                <circle
                  key={level}
                  cx={center}
                  cy={center}
                  r={bandPlans[level].outerR}
                  fill={LEVEL_COLORS[level].bg}
                  stroke={dragOverLevel === level ? LEVEL_COLORS[level].border : 'transparent'}
                  strokeWidth={dragOverLevel === level ? 3 : 0}
                  className="transition-all duration-200"
                />
              ))}

              {/* Ring labels positioned at the top edge of each band */}
              {ORDERED_LEVELS.map((level) => {
                const labelY = center - bandPlans[level].outerR + 14;
                return (
                  <text
                    key={level}
                    x={center}
                    y={labelY}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    letterSpacing="1"
                    fill={LEVEL_LABEL_COLOR[level]}
                    style={{ textTransform: 'uppercase' }}
                  >
                    {LEVEL_DISPLAY[level].toUpperCase()} ({circles[level].length})
                  </text>
                );
              })}
            </svg>

            {/* Drop zones — outermost first, innermost last so smaller zones sit on top */}
            <div className="absolute inset-0 z-10">
              {[...ORDERED_LEVELS].reverse().map((level) => {
                const r = bandPlans[level].outerR;
                const insetPct = ((center - r) / viewSize) * 100;
                return (
                  <div
                    key={level}
                    className="absolute rounded-full transition-all duration-200"
                    style={{
                      inset: `${insetPct}%`,
                      ...(dragOverLevel === level ? {
                        border: `3px dashed ${LEVEL_COLORS[level].border}`,
                        backgroundColor: LEVEL_COLORS[level].highlight,
                      } : {}),
                    }}
                    onDragOver={e => handleDragOver(e, level)}
                    onDragLeave={e => handleDragLeave(e, level)}
                    onDrop={e => handleDrop(e, level)}
                  />
                );
              })}
            </div>

            {/* Node layer */}
            <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
              {ORDERED_LEVELS.map(level =>
                circles[level].map((entry, i) => {
                  const pos = nodePositions[level][i];
                  if (!pos) return null;
                  return (
                    <div key={entry.id} data-node="true" style={{ pointerEvents: 'auto' }}>
                      {renderNode(entry, level, pos.x, pos.y)}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Zoom controls (outside transform so they stay fixed-size and easy to hit) */}
          <div
            data-pan-skip="true"
            className="absolute top-3 right-3 z-40 flex flex-col gap-1 bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-gray-100 p-1"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX - 1e-3}
              aria-label="Zoom in"
              title="Zoom in"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomInIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN + 1e-3}
              aria-label="Zoom out"
              title="Zoom out"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              aria-label="Reset view"
              title="Reset view"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Maximize2Icon className="w-4 h-4" />
            </button>
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
                    aria-label={entry.name}
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

      {/* Primary contact assignment prompt */}
      {renderContactPrompt()}
    </>
  );
}
