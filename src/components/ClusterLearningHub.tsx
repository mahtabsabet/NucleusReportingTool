import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  PlusIcon,
  SendIcon,
  ArchiveIcon,
  ClockIcon,
  CompassIcon,
  HelpCircleIcon,
  XIcon,
} from 'lucide-react';
import {
  listClusterThemes,
  listNucleiForClusterTheme,
  listRepresentativeEntries,
  listSynthesisEntries,
  createClusterTheme,
  updateConsolidationLevel,
  archiveClusterTheme,
  createSynthesisEntry,
  pushThemeToNuclei,
  listNucleiInCluster,
  THEME_COLORS,
} from '../lib/db/learningHub';
import type {
  ClusterTheme,
  JournalEntry,
  NucleusContribution,
} from '../types';
import { themePalette } from './ThemeTag';
import { getCallerContext } from './../lib/db/users';
import {
  isClusterCoordinator,
  viewsOrdinaryLayerReadOnly,
} from '../lib/permissions';
import { fetchClusters } from '../lib/db/clusters';

// Three-column "consultative atlas": themes (left), nuclei +
// representative learning (center), cluster synthesis (right).
// Cluster Coordinators (and admins) can edit everything; LSA
// members / Regional viewers see a read-only mirror.

export function ClusterLearningHub() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clusterId = params.get('cluster');

  const [clusterName, setClusterName] = useState<string>('');
  const [themes, setThemes] = useState<ClusterTheme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [nuclei, setNuclei] = useState<NucleusContribution[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [synthesis, setSynthesis] = useState<JournalEntry[]>([]);
  const [allNucleiInCluster, setAllNucleiInCluster] = useState<{ id: string; name: string }[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [loadingTheme, setLoadingTheme] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);

  const selectedTheme = useMemo(
    () => themes.find(t => t.id === selectedThemeId) ?? null,
    [themes, selectedThemeId],
  );

  useEffect(() => {
    if (!clusterId) return;
    Promise.all([
      getCallerContext(),
      fetchClusters(),
    ]).then(([ctx, clusters]) => {
      const readOnly = ctx ? viewsOrdinaryLayerReadOnly(ctx) : true;
      const isCC = !!ctx && isClusterCoordinator(ctx);
      const isAdmin = !!ctx && (ctx.isAdmin || ctx.isSuperAdmin);
      setCanEdit(!readOnly && (isCC || isAdmin));
      const c = clusters.find(x => x.id === clusterId);
      setClusterName(c?.name ?? '');
    });
  }, [clusterId]);

  const reloadThemes = async () => {
    if (!clusterId) return;
    setLoadingThemes(true);
    try {
      const list = await listClusterThemes(clusterId);
      setThemes(list);
      // Auto-select the first theme on first load.
      if (!selectedThemeId && list.length > 0) setSelectedThemeId(list[0].id);
    } finally {
      setLoadingThemes(false);
    }
  };

  useEffect(() => { reloadThemes(); /* eslint-disable-next-line */ }, [clusterId]);

  useEffect(() => {
    if (!selectedThemeId) {
      setNuclei([]); setEntries([]); setSynthesis([]);
      return;
    }
    setLoadingTheme(true);
    Promise.all([
      listNucleiForClusterTheme(selectedThemeId),
      listRepresentativeEntries(selectedThemeId, 12),
      listSynthesisEntries(selectedThemeId),
    ]).then(([n, e, s]) => {
      setNuclei(n); setEntries(e); setSynthesis(s);
    }).finally(() => setLoadingTheme(false));
  }, [selectedThemeId]);

  if (!clusterId) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <CompassIcon className="w-10 h-10 mx-auto text-stone-400 mb-4" />
          <h1 className="font-journal text-2xl text-stone-700 mb-2">Cluster Learning Hub</h1>
          <p className="text-stone-500 mb-6">Choose a cluster to begin.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-stone-800 text-amber-50 rounded-lg font-medium"
          >
            Back to clusters
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50/30">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
        <header className="mb-8">
          <button
            onClick={() => navigate(`/?cluster=${clusterId}`)}
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-stone-500 hover:text-stone-800 mb-3"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" /> Back to cluster
          </button>
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
            {clusterName} · Cluster Learning Hub
          </p>
          <h1 className="font-journal font-normal text-[2.6rem] text-stone-800 leading-[1.1] mt-1">
            A learning observatory
          </h1>
          <p className="font-journal italic text-stone-600 mt-2 max-w-2xl">
            Patterns of learning rising from the nuclei. Begin from the themes on the left;
            see where each is being lived out in the cluster, and consult on what is emerging.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr_1.1fr] gap-6">
          <ThemesColumn
            themes={themes}
            selectedThemeId={selectedThemeId}
            loading={loadingThemes}
            canEdit={canEdit}
            onSelect={setSelectedThemeId}
            onConsolidationChange={async (id, level) => {
              setThemes(prev => prev.map(t => t.id === id ? { ...t, consolidationLevel: level } : t));
              await updateConsolidationLevel(id, level);
            }}
            onAddTheme={async (params) => {
              if (!clusterId) return;
              const t = await createClusterTheme(clusterId, params);
              await reloadThemes();
              setSelectedThemeId(t.id);
            }}
            onArchive={async (id) => {
              await archiveClusterTheme(id);
              if (selectedThemeId === id) setSelectedThemeId(null);
              await reloadThemes();
            }}
          />

          <NucleiColumn
            theme={selectedTheme}
            nuclei={nuclei}
            entries={entries}
            loading={loadingTheme}
            canEdit={canEdit}
            onOpenPushDialog={() => setPushDialogOpen(true)}
            onNavigateNucleus={(id) => navigate(`/nucleus/${id}`)}
          />

          <SynthesisColumn
            theme={selectedTheme}
            entries={synthesis}
            canEdit={canEdit}
            composerOpen={composerOpen}
            onOpenComposer={() => setComposerOpen(true)}
            onSubmit={async (body) => {
              if (!selectedTheme || !clusterId) return;
              await createSynthesisEntry(clusterId, selectedTheme.id, body);
              setComposerOpen(false);
              setSynthesis(await listSynthesisEntries(selectedTheme.id));
            }}
            onCancel={() => setComposerOpen(false)}
          />
        </div>
      </div>

      {pushDialogOpen && selectedTheme && (
        <PushDialog
          theme={selectedTheme}
          allNuclei={allNucleiInCluster}
          onOpen={async () => {
            if (allNucleiInCluster.length === 0 && clusterId) {
              setAllNucleiInCluster(await listNucleiInCluster(clusterId));
            }
          }}
          onClose={() => setPushDialogOpen(false)}
          onSubmit={async (nucleusIds, note) => {
            await pushThemeToNuclei(selectedTheme, nucleusIds, note);
            setPushDialogOpen(false);
            // Refresh theme aggregates to reflect new contributing nuclei.
            await reloadThemes();
            if (selectedTheme) {
              setNuclei(await listNucleiForClusterTheme(selectedTheme.id));
            }
          }}
        />
      )}
    </div>
  );
}


// ─── Column 1: themes list ──────────────────────────────────

function ThemesColumn({
  themes, selectedThemeId, loading, canEdit,
  onSelect, onConsolidationChange, onAddTheme, onArchive,
}: {
  themes: ClusterTheme[];
  selectedThemeId: string | null;
  loading: boolean;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onConsolidationChange: (id: string, level: number) => Promise<void>;
  onAddTheme: (params: { name: string; color: string; description?: string }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="bg-amber-50/40 border border-amber-900/15 rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
          Objects of Learning
        </h2>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-900"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {adding && (
        <AddThemeForm
          onCancel={() => setAdding(false)}
          onSubmit={async (p) => { await onAddTheme(p); setAdding(false); }}
        />
      )}

      {loading && <p className="font-journal italic text-stone-500 text-sm">Gathering themes…</p>}
      {!loading && themes.length === 0 && !adding && (
        <p className="font-journal italic text-stone-500 text-sm">
          No themes yet. They emerge as nuclei add learning to their journals.
        </p>
      )}

      <div className="space-y-3">
        {themes.map(theme => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            active={theme.id === selectedThemeId}
            canEdit={canEdit}
            onSelect={() => onSelect(theme.id)}
            onConsolidationChange={(level) => onConsolidationChange(theme.id, level)}
            onArchive={() => onArchive(theme.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ThemeCard({
  theme, active, canEdit, onSelect, onConsolidationChange, onArchive,
}: {
  theme: ClusterTheme;
  active: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onConsolidationChange: (level: number) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const p = themePalette(theme.color);
  const [localLevel, setLocalLevel] = useState(theme.consolidationLevel);
  useEffect(() => { setLocalLevel(theme.consolidationLevel); }, [theme.consolidationLevel]);
  return (
    <div
      className={`relative rounded-xl border ${p.border} ${active ? p.bgSoft : 'bg-white/60'} px-3.5 py-3 cursor-pointer transition hover:bg-white/85 group`}
      onClick={onSelect}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${p.dot} flex-shrink-0`} />
          <h3 className="font-journal text-stone-800 text-lg leading-tight truncate">
            {theme.name}
          </h3>
        </div>
        {canEdit && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm(`Archive "${theme.name}"? It will be hidden from the Hub.`)) {
                await onArchive();
              }
            }}
            title="Archive theme"
            className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600 transition-opacity"
          >
            <ArchiveIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="font-journal text-xs text-stone-500 italic mt-0.5">
        {theme.nucleusCount ?? 0} {theme.nucleusCount === 1 ? 'nucleus' : 'nuclei'}
        {theme.entryCount ? ` · ${theme.entryCount} entries` : ''}
      </p>

      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-500 mb-1">
          <span>Emerging</span>
          <span>Consolidated</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={localLevel}
          onChange={(e) => setLocalLevel(Number(e.target.value))}
          onMouseUp={() => onConsolidationChange(localLevel)}
          onTouchEnd={() => onConsolidationChange(localLevel)}
          disabled={!canEdit}
          onClick={(e) => e.stopPropagation()}
          className="w-full accent-amber-700 cursor-pointer disabled:cursor-default"
        />
      </div>
    </div>
  );
}

function AddThemeForm({
  onCancel, onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: { name: string; color: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('amber');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="bg-white/80 border border-amber-900/20 rounded-xl p-3 mb-4 space-y-2">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Theme name"
        className="w-full bg-transparent font-journal text-lg text-stone-800 border-b border-stone-300 focus:outline-none focus:border-stone-500"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={2}
        placeholder="What is this theme about?"
        className="w-full bg-transparent font-journal italic text-sm text-stone-700 focus:outline-none resize-none placeholder:text-stone-400"
      />
      <div className="flex items-center gap-2 flex-wrap">
        {THEME_COLORS.map(c => {
          const p = themePalette(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={`w-5 h-5 rounded-full ${p.dot} ring-2 ${color === c ? 'ring-stone-800' : 'ring-transparent'}`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          disabled={!name.trim() || saving}
          onClick={async () => {
            if (!name.trim()) return;
            setSaving(true);
            try { await onSubmit({ name, color, description: description || undefined }); }
            finally { setSaving(false); }
          }}
          className="px-3 py-1.5 bg-stone-800 text-amber-50 text-xs font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add theme'}
        </button>
        <button onClick={onCancel} className="px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900">Cancel</button>
      </div>
    </div>
  );
}


// ─── Column 2: nuclei + representative entries ──────────────

function NucleiColumn({
  theme, nuclei, entries, loading, canEdit,
  onOpenPushDialog, onNavigateNucleus,
}: {
  theme: ClusterTheme | null;
  nuclei: NucleusContribution[];
  entries: JournalEntry[];
  loading: boolean;
  canEdit: boolean;
  onOpenPushDialog: () => void;
  onNavigateNucleus: (nucleusId: string) => void;
}) {
  if (!theme) {
    return (
      <section className="bg-white/60 border border-amber-900/15 rounded-2xl p-6 min-h-[420px] flex items-center justify-center">
        <p className="font-journal italic text-stone-500">Select a theme to see contributing nuclei.</p>
      </section>
    );
  }
  return (
    <section className="bg-white/60 border border-amber-900/15 rounded-2xl p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
            Across the cluster
          </p>
          <h2 className="font-journal font-normal text-3xl text-stone-800 leading-tight">
            {theme.name}
          </h2>
          {theme.description && (
            <p className="font-journal italic text-stone-600 mt-1">{theme.description}</p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={onOpenPushDialog}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm font-journal text-stone-700 bg-transparent hover:bg-white border border-stone-400/60 rounded-md px-3 py-1.5 transition"
            title="Share this theme with selected nuclei"
          >
            <SendIcon className="w-3.5 h-3.5" /> Share with nuclei
          </button>
        )}
      </div>

      <hr className="my-5 border-amber-900/15" />

      {loading && <p className="font-journal italic text-stone-500">Reading the cluster…</p>}

      {!loading && nuclei.length === 0 && (
        <p className="font-journal italic text-stone-500">
          No nuclei have written into this theme yet.
        </p>
      )}

      {!loading && nuclei.length > 0 && (
        <>
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-stone-500 font-journal mb-2">
            Contributing nuclei
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-7">
            {nuclei.map(n => (
              <button
                key={n.nucleusId}
                onClick={() => onNavigateNucleus(n.nucleusId)}
                className="text-left bg-amber-50/50 hover:bg-amber-50 border border-amber-900/10 rounded-lg px-3 py-2 transition"
              >
                <div className="font-journal text-stone-800 text-base leading-tight">{n.nucleusName}</div>
                <div className="text-xs text-stone-500 font-journal italic mt-0.5">
                  {n.entryCount} {n.entryCount === 1 ? 'entry' : 'entries'}
                  {n.lastEntryAt && ` · last on ${n.lastEntryAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                </div>
              </button>
            ))}
          </div>

          <h3 className="text-[11px] uppercase tracking-[0.22em] text-stone-500 font-journal mb-2">
            Representative moments
          </h3>
          <div className="space-y-4">
            {entries.length === 0 && (
              <p className="font-journal italic text-stone-500 text-sm">
                Tagged entries will surface here.
              </p>
            )}
            {entries.map(e => <RepresentativeEntry key={e.id} entry={e} onOpenNucleus={onNavigateNucleus} />)}
          </div>
        </>
      )}
    </section>
  );
}

function RepresentativeEntry({
  entry, onOpenNucleus,
}: { entry: JournalEntry; onOpenNucleus: (id: string) => void }) {
  const snippet =
    entry.body
    ?? entry.whatHappened
    ?? entry.encouragingSigns
    ?? entry.challenges
    ?? entry.peopleEmerging
    ?? entry.followUp
    ?? '';
  const truncated = snippet.length > 220 ? snippet.slice(0, 218).trimEnd() + '…' : snippet;
  return (
    <article className="border-l-2 border-amber-700/30 pl-4">
      <div className="flex items-baseline gap-2 mb-1">
        <ClockIcon className="w-3.5 h-3.5 text-stone-400" />
        <span className="font-journal text-stone-700 text-sm">
          {entry.occurredAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        {entry.nucleusName && (
          <button
            onClick={() => entry.nucleusId && onOpenNucleus(entry.nucleusId)}
            className="font-journal italic text-stone-500 text-sm hover:text-stone-800"
          >
            · {entry.nucleusName}
            {entry.activityName && ` / ${entry.activityName}`}
          </button>
        )}
      </div>
      <p className="font-journal text-stone-700 leading-relaxed whitespace-pre-wrap">{truncated}</p>
    </article>
  );
}


// ─── Column 3: synthesis ────────────────────────────────────

const SYNTHESIS_PROMPTS = [
  'What patterns are emerging?',
  'What are multiple nuclei learning?',
  'What questions remain unresolved?',
  'What practices seem promising?',
  'What should be shared across the cluster?',
];

function SynthesisColumn({
  theme, entries, canEdit, composerOpen,
  onOpenComposer, onSubmit, onCancel,
}: {
  theme: ClusterTheme | null;
  entries: JournalEntry[];
  canEdit: boolean;
  composerOpen: boolean;
  onOpenComposer: () => void;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  if (!theme) {
    return (
      <section className="bg-amber-50/40 border border-amber-900/15 rounded-2xl p-5 min-h-[420px] flex items-center justify-center">
        <p className="font-journal italic text-stone-500 text-sm">
          Synthesis appears alongside a selected theme.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-amber-50/40 border border-amber-900/15 rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
          Cluster synthesis
        </h2>
        {canEdit && !composerOpen && (
          <button
            onClick={onOpenComposer}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-900"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Add reflection
          </button>
        )}
      </div>

      <div className="bg-white/60 border border-amber-900/10 rounded-xl p-3 mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <HelpCircleIcon className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-[11px] uppercase tracking-wider text-stone-500">Reflective prompts</span>
        </div>
        <ul className="space-y-1 list-none">
          {SYNTHESIS_PROMPTS.map(p => (
            <li key={p} className="font-journal italic text-stone-600 text-sm leading-relaxed">{p}</li>
          ))}
        </ul>
      </div>

      {composerOpen && (
        <div className="bg-white/80 border border-amber-900/20 rounded-xl p-3 mb-4">
          <textarea
            autoFocus
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            placeholder="What is the cluster learning here?"
            className="w-full bg-transparent font-journal text-stone-800 text-base leading-relaxed focus:outline-none placeholder:italic placeholder:text-stone-400 resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              disabled={!body.trim() || saving}
              onClick={async () => {
                if (!body.trim()) return;
                setSaving(true);
                try { await onSubmit(body); setBody(''); }
                finally { setSaving(false); }
              }}
              className="px-3 py-1.5 bg-stone-800 text-amber-50 text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Record reflection'}
            </button>
            <button onClick={onCancel} className="px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {entries.length === 0 && !composerOpen && (
          <p className="font-journal italic text-stone-500 text-sm">
            No cluster reflections yet. Begin from one of the prompts above.
          </p>
        )}
        {entries.map(e => (
          <article key={e.id}>
            <div className="flex items-baseline gap-2 text-xs text-stone-500 font-journal italic mb-1">
              <span>{e.occurredAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              {e.authorName && <span>· {e.authorName}</span>}
            </div>
            <p className="font-journal text-stone-700 text-base leading-relaxed whitespace-pre-wrap">{e.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}


// ─── Push-to-nuclei dialog ─────────────────────────────────

function PushDialog({
  theme, allNuclei, onOpen, onClose, onSubmit,
}: {
  theme: ClusterTheme;
  allNuclei: { id: string; name: string }[];
  onOpen: () => Promise<void>;
  onClose: () => void;
  onSubmit: (nucleusIds: string[], note: string | undefined) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [pushing, setPushing] = useState(false);

  useEffect(() => { onOpen(); /* eslint-disable-next-line */ }, []);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-journal text-2xl text-stone-800">Share with nuclei</h2>
            <p className="text-sm text-stone-500 mt-1">
              Add "<span className="font-medium text-stone-700">{theme.name}</span>" to selected nucleus journals.
              A short note (optional) will appear as a seed entry in each.
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-stone-200 rounded-lg p-2 mb-3">
          {allNuclei.length === 0 && (
            <p className="text-sm text-stone-500 italic p-2">Loading nuclei…</p>
          )}
          {allNuclei.map(n => (
            <label key={n.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-stone-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(n.id)}
                onChange={() => toggle(n.id)}
                className="accent-stone-800"
              />
              <span className="text-sm text-stone-800">{n.name}</span>
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="Optional: what would you like the receiving nuclei to consider?"
          className="w-full bg-amber-50/40 border border-stone-200 rounded-lg p-2.5 font-journal text-sm text-stone-800 focus:outline-none focus:border-stone-400 placeholder:italic placeholder:text-stone-400"
        />

        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">
            Cancel
          </button>
          <button
            disabled={selected.size === 0 || pushing}
            onClick={async () => {
              setPushing(true);
              try { await onSubmit(Array.from(selected), note || undefined); }
              finally { setPushing(false); }
            }}
            className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {pushing ? 'Sharing…' : `Share with ${selected.size} ${selected.size === 1 ? 'nucleus' : 'nuclei'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
