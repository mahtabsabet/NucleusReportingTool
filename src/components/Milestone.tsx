import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  TargetIcon,
  SaveIcon,
  Loader2Icon,
  InfoIcon,
  CheckIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { fetchNucleus } from '../lib/db/nucleus';
import {
  MILESTONE_THREE_FEATURES,
  MILESTONE_THREE_MAX,
  MILESTONE_STAGES,
  computeComposite,
  milestoneLevel,
  milestoneStageDescriptor,
  progressColor,
  type MilestoneStage,
  type MilestoneThreeFeature,
} from '../lib/milestoneThree';
import {
  fetchNucleusMilestoneThree,
  saveNucleusMilestoneScore,
  clearNucleusMilestoneScore,
  saveNucleusMilestoneOverallNote,
  canEditNucleusMilestone,
  fetchNucleusMilestoneStage,
  saveNucleusMilestoneStage,
} from '../lib/db/milestoneThree';

// Local per-feature editing state. `scored: false` means "not yet
// assessed" — kept distinct from a score of 0, which means the feature
// is genuinely not present.
interface FeatureState {
  value: number;
  scored: boolean;
  note: string;
}

// ── Composite meter shared by the page banner and the dashboard strip ──

function CompositeMeter({ composite }: { composite: number | null }) {
  const level = milestoneLevel(composite);
  const pct = composite === null ? 0 : (composite / MILESTONE_THREE_MAX) * 100;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: level.color }}
          />
        </div>
      </div>
      <span className={`text-sm font-bold whitespace-nowrap ${level.text}`}>
        {composite === null ? level.label : `${composite.toFixed(1)} · ${level.label}`}
      </span>
    </div>
  );
}

// ============================================================
// Dashboard strip — a compact, full-width band that lives above the
// module grid (mirroring CompressedTimelineStrip). Shows the current
// milestone stage; when the nucleus is at Milestone 3 it also shows
// the composite and eight per-feature ticks. Opens the editor on click.
// ============================================================

export function MilestoneStrip({
  nucleusId,
  onOpen,
}: {
  nucleusId: string;
  onOpen: () => void;
}) {
  const [stage, setStage] = useState<MilestoneStage>(0);
  const [scores, setScores] = useState<Map<string, number>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchNucleusMilestoneStage(nucleusId)
      .then(async s => {
        if (!alive) return;
        setStage(s);
        if (s === 3) {
          const data = await fetchNucleusMilestoneThree(nucleusId);
          if (!alive) return;
          setScores(new Map(data.scores.map(f => [f.featureKey, f.score])));
        }
        setLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load milestone data:', err);
        if (alive) setLoaded(true);
      });
    return () => { alive = false; };
  }, [nucleusId]);

  const composite = useMemo(
    () => computeComposite([...scores.values()].map(score => ({ score }))),
    [scores],
  );
  const level = milestoneLevel(composite);
  const descriptor = milestoneStageDescriptor(stage);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-4 bg-white/95 border border-gray-200/80 rounded-2xl px-4 sm:px-5 py-3 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left"
    >
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stage === 3 ? level.bg : 'bg-slate-100'} ${stage === 3 ? level.text : 'text-slate-500'}`}>
          <TargetIcon className="w-5 h-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
            Milestone
          </div>
          {stage === 3 ? (
            <div className={`text-sm font-bold ${level.text}`}>
              {composite === null ? `${descriptor.label} · ${level.label}` : `${descriptor.label} · ${composite.toFixed(1)}/10`}
            </div>
          ) : (
            <div className="text-sm font-bold text-slate-700">{descriptor.label}</div>
          )}
        </div>
      </div>

      {/* Per-feature ticks — only meaningful at Milestone 3 */}
      {stage === 3 && (
        <div className="hidden sm:flex items-end gap-1 flex-1 min-w-0 h-8">
          {MILESTONE_THREE_FEATURES.map(f => {
            const s = scores.get(f.key);
            const featureLevel = milestoneLevel(s ?? null);
            const h = s === undefined ? 20 : 20 + (s / MILESTONE_THREE_MAX) * 80;
            return (
              <div
                key={f.key}
                title={`${f.label}: ${s === undefined ? 'not yet scored' : `${s}/10`}`}
                className="flex-1 min-w-0 rounded-sm"
                style={{
                  height: `${h}%`,
                  backgroundColor: s === undefined ? '#e2e8f0' : featureLevel.color,
                  opacity: s === undefined ? 0.7 : 1,
                }}
              />
            );
          })}
        </div>
      )}
      {stage !== 3 && (
        <div className="hidden sm:block flex-1 min-w-0 text-xs text-gray-500 truncate">
          {descriptor.blurb}
        </div>
      )}

      <div className="flex items-center gap-1 flex-shrink-0 text-gray-400">
        <span className="hidden md:inline text-xs font-semibold text-gray-500">
          {loaded ? 'View & edit' : 'Loading…'}
        </span>
        <ChevronRightIcon className="w-5 h-5" />
      </div>
    </button>
  );
}

// ============================================================
// Stage picker — four options, sliders only apply to Milestone 3.
// ============================================================

function StagePicker({
  stage,
  canEdit,
  onSelect,
}: {
  stage: MilestoneStage;
  canEdit: boolean;
  onSelect: (next: MilestoneStage) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {MILESTONE_STAGES.map(s => {
        const d = milestoneStageDescriptor(s);
        const active = s === stage;
        return (
          <button
            key={s}
            type="button"
            disabled={!canEdit || active}
            onClick={() => onSelect(s)}
            className={`text-left rounded-2xl border p-4 transition-all ${
              active
                ? 'border-blue-400 bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            } ${!canEdit && !active ? 'opacity-60 cursor-not-allowed' : ''} ${canEdit && !active ? 'cursor-pointer' : ''}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`text-sm font-bold ${active ? 'text-blue-700' : 'text-gray-900'}`}>{d.label}</span>
              {active && (
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <CheckIcon className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-snug">{d.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Full-page editor
// ============================================================

export function MilestonePage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const nucleusId = id!;

  const [nucleusName, setNucleusName] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<MilestoneStage>(0);
  const [stageSaving, setStageSaving] = useState(false);
  const [pendingDowngrade, setPendingDowngrade] = useState<MilestoneStage | null>(null);

  // Editing state, keyed by feature key. Initialised from the DB.
  // Only relevant while stage === 3, but kept loaded regardless so
  // switching back to Milestone 3 doesn't need a re-fetch.
  const [features, setFeatures] = useState<Record<string, FeatureState>>({});
  const [overallNote, setOverallNote] = useState('');
  // Snapshot of what's persisted, so Save only writes what changed and
  // the dirty indicator is accurate.
  const [baseline, setBaseline] = useState<{
    features: Record<string, FeatureState>;
    overallNote: string;
  }>({ features: {}, overallNote: '' });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchNucleus(nucleusId),
      fetchNucleusMilestoneStage(nucleusId),
      fetchNucleusMilestoneThree(nucleusId),
      canEditNucleusMilestone(nucleusId),
    ])
      .then(([nucleus, currentStage, data, editable]) => {
        if (!alive) return;
        setNucleusName(nucleus?.name ?? '');
        setStage(currentStage);
        setCanEdit(editable);
        const byKey = new Map(data.scores.map(s => [s.featureKey, s]));
        const initial: Record<string, FeatureState> = {};
        for (const f of MILESTONE_THREE_FEATURES) {
          const row = byKey.get(f.key);
          initial[f.key] = row
            ? { value: row.score, scored: true, note: row.note }
            : { value: 5, scored: false, note: '' };
        }
        setFeatures(initial);
        setOverallNote(data.overallNote);
        setBaseline({
          features: JSON.parse(JSON.stringify(initial)),
          overallNote: data.overallNote,
        });
      })
      .catch(err => {
        console.error('Failed to load milestone data:', err);
        if (alive) setError('Could not load Milestone data.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [nucleusId]);

  const composite = useMemo(() => {
    const scored = Object.values(features).filter(f => f.scored);
    return computeComposite(scored.map(f => ({ score: f.value })));
  }, [features]);

  const scoredCount = Object.values(features).filter(f => f.scored).length;

  const dirty = useMemo(() => {
    if (overallNote.trim() !== baseline.overallNote.trim()) return true;
    for (const f of MILESTONE_THREE_FEATURES) {
      const cur = features[f.key];
      const base = baseline.features[f.key];
      if (!cur || !base) continue;
      if (cur.scored !== base.scored) return true;
      if (cur.scored && cur.value !== base.value) return true;
      if (cur.note.trim() !== base.note.trim()) return true;
    }
    return false;
  }, [features, overallNote, baseline]);

  function updateFeature(key: string, patch: Partial<FeatureState>) {
    setFeatures(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const f of MILESTONE_THREE_FEATURES) {
        const cur = features[f.key];
        const base = baseline.features[f.key];
        if (!cur) continue;
        const scoreChanged =
          cur.scored !== base?.scored ||
          (cur.scored && cur.value !== base?.value) ||
          cur.note.trim() !== (base?.note ?? '').trim();
        if (!scoreChanged) continue;

        if (cur.scored) {
          await saveNucleusMilestoneScore(nucleusId, f.key, cur.value, cur.note);
        } else if (base?.scored) {
          // Was scored, now cleared back to "not yet assessed".
          await clearNucleusMilestoneScore(nucleusId, f.key);
        }
      }
      if (overallNote.trim() !== baseline.overallNote.trim()) {
        await saveNucleusMilestoneOverallNote(nucleusId, overallNote);
      }
      setBaseline({
        features: JSON.parse(JSON.stringify(features)),
        overallNote,
      });
      setSavedAt(Date.now());
    } catch (err) {
      console.error('Failed to save milestone data:', err);
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function applyStage(next: MilestoneStage) {
    setStageSaving(true);
    setError(null);
    try {
      await saveNucleusMilestoneStage(nucleusId, next);
      setStage(next);
    } catch (err) {
      console.error('Failed to save milestone stage:', err);
      setError('Could not update the milestone stage. Please try again.');
    } finally {
      setStageSaving(false);
    }
  }

  function handleSelectStage(next: MilestoneStage) {
    if (next === stage) return;
    // Downgrading away from Milestone 3 doesn't delete anything — the
    // sliders below are just hidden until the nucleus returns to
    // Milestone 3 — but it should still be a deliberate choice.
    if (stage === 3 && next !== 3) {
      setPendingDowngrade(next);
      return;
    }
    applyStage(next);
  }

  const level = milestoneLevel(composite);
  const descriptor = milestoneStageDescriptor(stage);

  return (
    <div className="min-h-screen bg-nucleus-pattern font-sans">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-8 py-5 sm:py-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-3">
            <button
              onClick={() => navigate(`/nucleus/${nucleusId}`)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              {nucleusName ? `Back to ${nucleusName}` : 'Back to Nucleus'}
            </button>
            <div className="flex-1 max-w-sm">
              <GlobalSearch />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${stage === 3 ? level.bg : 'bg-slate-100'} ${stage === 3 ? level.text : 'text-slate-500'}`}>
              <TargetIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Milestone
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                {nucleusName ? `${nucleusName} · ` : ''}Currently at {descriptor.label}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2Icon className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {!canEdit && (
              <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
                <InfoIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>You have view-only access. Nucleus collaborators can update the milestone.</span>
              </div>
            )}

            <div>
              <div className="text-[11px] font-bold tracking-wider text-gray-500 uppercase mb-2">
                Milestone stage
              </div>
              <StagePicker stage={stage} canEdit={canEdit && !stageSaving} onSelect={handleSelectStage} />
            </div>

            {stage === 3 ? (
              <>
                {/* Composite banner */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <div className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                        Overall progress
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Average of {scoredCount} of {MILESTONE_THREE_FEATURES.length} features scored
                      </div>
                    </div>
                  </div>
                  <CompositeMeter composite={composite} />
                </div>

                {/* Feature sliders */}
                <div className="space-y-4">
                  {MILESTONE_THREE_FEATURES.map(f => (
                    <FeatureCard
                      key={f.key}
                      feature={f}
                      state={features[f.key]}
                      canEdit={canEdit}
                      onChange={patch => updateFeature(f.key, patch)}
                    />
                  ))}
                </div>

                {/* Holistic overall note */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <label className="block text-sm font-bold text-gray-900 mb-1">
                    Holistic note
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    An overall, qualitative read on where this nucleus stands — beyond the individual scores.
                  </p>
                  <textarea
                    value={overallNote}
                    onChange={e => { setOverallNote(e.target.value); setSavedAt(null); }}
                    disabled={!canEdit}
                    rows={4}
                    placeholder={canEdit ? 'Add a holistic reflection…' : 'No note yet.'}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 resize-y"
                  />
                </div>
              </>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="text-[11px] font-bold tracking-wider text-gray-500 uppercase mb-1">
                  {descriptor.label}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{descriptor.blurb}</p>
              </div>
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </div>
            )}
          </>
        )}
      </main>

      {/* Sticky save bar — only meaningful for the Milestone 3 sliders;
          stage changes save immediately from the picker. */}
      {canEdit && !loading && stage === 3 && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-gray-200/80 px-4 sm:px-8 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
          <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
            {savedAt && !dirty && (
              <span className="text-sm font-medium text-emerald-600">Saved</span>
            )}
            {dirty && (
              <span className="text-sm font-medium text-amber-600">Unsaved changes</span>
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SaveIcon className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        </div>
      )}

      {/* Downgrade confirmation — only shown moving away from Milestone 3 */}
      {pendingDowngrade !== null && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangleIcon className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Move to {milestoneStageDescriptor(pendingDowngrade).label}?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This nucleus currently has Milestone 3 scores recorded. Moving to {milestoneStageDescriptor(pendingDowngrade).label.toLowerCase()} won't
              delete them — the sliders will just be hidden until this nucleus returns to Milestone 3, at which point your scores will still be here.
            </p>
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setPendingDowngrade(null)}
                disabled={stageSaving}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const next = pendingDowngrade;
                  setPendingDowngrade(null);
                  if (next !== null) applyStage(next);
                }}
                disabled={stageSaving}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white font-medium rounded-xl hover:bg-amber-700 shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stageSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Redirects the old /nucleus/:id/milestone-three URL to the
// generalized /nucleus/:id/milestone page.
export function MilestoneThreeRedirect() {
  const { id } = useParams<{ id?: string }>();
  return <Navigate to={`/nucleus/${id}/milestone`} replace />;
}

// ── One feature: slider + anchors + note ──

function FeatureCard({
  feature,
  state,
  canEdit,
  onChange,
}: {
  feature: MilestoneThreeFeature;
  state: FeatureState | undefined;
  canEdit: boolean;
  onChange: (patch: Partial<FeatureState>) => void;
}) {
  if (!state) return null;
  const barColor = state.scored ? progressColor(state.value) : '#94a3b8';

  const anchorRow: { label: string; text: string }[] = [
    { label: '0', text: feature.anchors.none },
    { label: '5', text: feature.anchors.emerging },
    { label: '10', text: feature.anchors.established },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900">{feature.label}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{feature.blurb}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          {state.scored ? (
            <span className="text-sm font-bold" style={{ color: barColor }}>
              {state.value}/10
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400">Not yet scored</span>
          )}
        </div>
      </div>

      {/* Slider */}
      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={MILESTONE_THREE_MAX}
          step={1}
          value={state.value}
          disabled={!canEdit}
          onChange={e => onChange({ value: Number(e.target.value), scored: true })}
          className={`w-full cursor-pointer disabled:cursor-not-allowed ${state.scored ? '' : 'opacity-50'}`}
          style={{ accentColor: barColor }}
          aria-label={feature.label}
        />
        {/* Signpost ticks aligned to the anchors below */}
        <div className="relative h-2 mt-0.5 px-[2px]">
          {[0, 5, 10].map(n => (
            <div
              key={n}
              className="absolute top-0"
              style={{ left: `${(n / MILESTONE_THREE_MAX) * 100}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-2 bg-gray-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Anchor descriptors — static signposts (0 / 5 / 10), always legible */}
      <div className="grid grid-cols-3 gap-2 mt-1">
        {anchorRow.map(a => (
          <div
            key={a.label}
            className="text-[11px] leading-snug rounded-lg px-2 py-1.5 border bg-gray-50 border-gray-100 text-gray-600"
          >
            <span className="font-bold text-gray-800">{a.label}</span> — {a.text}
          </div>
        ))}
      </div>

      {/* Controls + note */}
      <div className="flex items-center gap-3 mt-3">
        {canEdit && state.scored && (
          <button
            type="button"
            onClick={() => onChange({ scored: false, value: 5 })}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear score
          </button>
        )}
      </div>

      {(canEdit || state.note) && (
        <textarea
          value={state.note}
          onChange={e => onChange({ note: e.target.value })}
          disabled={!canEdit}
          rows={2}
          placeholder={canEdit ? 'Why this score? (optional)' : ''}
          className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 resize-y"
        />
      )}
    </div>
  );
}
