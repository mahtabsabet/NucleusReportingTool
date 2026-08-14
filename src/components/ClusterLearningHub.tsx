import React, { useEffect, useMemo, useState } from 'react';
import { useUnsavedChanges, useConfirmDiscard } from '../lib/unsavedChanges';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeftIcon,
  PlusIcon,
  SendIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  GitMergeIcon,
  ClockIcon,
  CompassIcon,
  HelpCircleIcon,
  XIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  listClusterThemes,
  listNucleiForClusterTheme,
  listRepresentativeEntries,
  listSynthesisEntries,
  createClusterTheme,
  updateConsolidationLevel,
  archiveClusterTheme,
  unarchiveClusterTheme,
  mergeClusterThemes,
  createSynthesisEntry,
  updateSynthesisEntry,
  deleteSynthesisEntry,
  pushThemeToNuclei,
  sendNoteToNucleus,
  listNucleiInCluster,
  listNucleiWithTheme,
  THEME_COLORS,
} from '../lib/db/learningHub';
import type {
  ClusterTheme,
  JournalEntry,
  NucleusContribution,
} from '../types';
import { themePalette } from './ThemeTag';
import { ConfirmDialog } from './ConfirmDialog';
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
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogTheme, setArchiveDialogTheme] = useState<ClusterTheme | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  // A note (representative entry or synthesis reflection) the user
  // is sending to a single nucleus, plus the eligible nuclei.
  const [sendNote, setSendNote] = useState<{ body: string; attribution: string } | null>(null);

  const selectedTheme = useMemo(
    () => themes.find(t => t.id === selectedThemeId) ?? null,
    [themes, selectedThemeId],
  );

  // Switching themes hides any open synthesis composer (local state, not
  // navigation), so confirm first if there are unsaved reflection edits.
  const confirmDiscard = useConfirmDiscard();
  const selectTheme = (themeId: string | null) => {
    if (confirmDiscard()) setSelectedThemeId(themeId);
  };

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
      const list = await listClusterThemes(clusterId, { archived: showArchived });
      setThemes(list);
      // Auto-select the first theme on first load.
      if (!selectedThemeId && list.length > 0) setSelectedThemeId(list[0].id);
    } finally {
      setLoadingThemes(false);
    }
  };

  useEffect(() => { reloadThemes(); /* eslint-disable-next-line */ }, [clusterId, showArchived]);

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
            showArchived={showArchived}
            onToggleArchived={() => { if (confirmDiscard()) { setSelectedThemeId(null); setShowArchived(s => !s); } }}
            onSelect={selectTheme}
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
            onRequestArchive={(theme) => setArchiveDialogTheme(theme)}
            onUnarchive={async (id) => { await unarchiveClusterTheme(id); await reloadThemes(); }}
            onOpenMerge={() => setMergeDialogOpen(true)}
          />

          <NucleiColumn
            theme={selectedTheme}
            nuclei={nuclei}
            entries={entries}
            loading={loadingTheme}
            canEdit={canEdit}
            onOpenPushDialog={() => setPushDialogOpen(true)}
            onNavigateNucleus={(id) => navigate(`/nucleus/${id}?module=journal`)}
            onSendNote={(body, attribution) => setSendNote({ body, attribution })}
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
            onSendNote={(body, attribution) => setSendNote({ body, attribution })}
            onUpdateEntry={async (entryId, body) => {
              if (!selectedTheme) return;
              await updateSynthesisEntry(entryId, body);
              setSynthesis(await listSynthesisEntries(selectedTheme.id));
            }}
            onDeleteEntry={async (entryId) => {
              if (!selectedTheme) return;
              await deleteSynthesisEntry(entryId);
              setSynthesis(await listSynthesisEntries(selectedTheme.id));
            }}
          />
        </div>
      </div>

      {pushDialogOpen && selectedTheme && (
        <PushDialog
          theme={selectedTheme}
          allNuclei={allNucleiInCluster}
          onOpen={async () => {
            if (clusterId) {
              const [all, having] = await Promise.all([
                listNucleiInCluster(clusterId),
                listNucleiWithTheme(selectedTheme.id),
              ]);
              setAllNucleiInCluster(all);
              return having.map(n => n.id);
            }
            return [];
          }}
          onClose={() => setPushDialogOpen(false)}
          onSubmit={async (nucleusIds, note) => {
            await pushThemeToNuclei(selectedTheme, nucleusIds, note);
            setPushDialogOpen(false);
            await reloadThemes();
            if (selectedTheme) setNuclei(await listNucleiForClusterTheme(selectedTheme.id));
          }}
        />
      )}

      {archiveDialogTheme && (
        <ArchiveThemeDialog
          theme={archiveDialogTheme}
          onClose={() => setArchiveDialogTheme(null)}
          onConfirm={async (notifyNuclei) => {
            const t = archiveDialogTheme;
            setArchiveDialogTheme(null);
            await archiveClusterTheme(t, { notifyNuclei });
            if (selectedThemeId === t.id) setSelectedThemeId(null);
            await reloadThemes();
          }}
        />
      )}

      {mergeDialogOpen && (
        <MergeDialog
          themes={themes.filter(t => !t.archivedAt)}
          onClose={() => setMergeDialogOpen(false)}
          onConfirm={async (sourceId, targetId, finalName) => {
            await mergeClusterThemes(sourceId, targetId, finalName);
            setMergeDialogOpen(false);
            if (selectedThemeId === sourceId) setSelectedThemeId(targetId);
            await reloadThemes();
          }}
        />
      )}

      {sendNote && selectedTheme && (
        <SendNoteDialog
          note={sendNote}
          loadEligible={() => listNucleiWithTheme(selectedTheme.id)}
          onClose={() => setSendNote(null)}
          onSend={async (nucleusId) => {
            await sendNoteToNucleus(selectedTheme.id, nucleusId, sendNote.body, sendNote.attribution);
            setSendNote(null);
          }}
        />
      )}
    </div>
  );
}


// ─── Column 1: themes list ──────────────────────────────────

function ThemesColumn({
  themes, selectedThemeId, loading, canEdit, showArchived,
  onToggleArchived, onSelect, onConsolidationChange, onAddTheme,
  onRequestArchive, onUnarchive, onOpenMerge,
}: {
  themes: ClusterTheme[];
  selectedThemeId: string | null;
  loading: boolean;
  canEdit: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  onSelect: (id: string) => void;
  onConsolidationChange: (id: string, level: number) => Promise<void>;
  onAddTheme: (params: { name: string; color: string; description?: string }) => Promise<void>;
  onRequestArchive: (theme: ClusterTheme) => void;
  onUnarchive: (id: string) => Promise<void>;
  onOpenMerge: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="bg-amber-50/40 border border-amber-900/15 rounded-2xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
          Objects of Learning
        </h2>
        {canEdit && !adding && !showArchived && (
          <div className="flex items-center gap-3">
            {themes.length >= 2 && (
              <button
                onClick={onOpenMerge}
                title="Merge two themes"
                className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-900"
              >
                <GitMergeIcon className="w-3.5 h-3.5" /> Merge
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-900"
            >
              <PlusIcon className="w-3.5 h-3.5" /> Add
            </button>
          </div>
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
          {showArchived
            ? 'No archived themes.'
            : 'No themes yet. They emerge as nuclei add learning to their journals.'}
        </p>
      )}

      <div className="space-y-3">
        {themes.map(theme => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            active={theme.id === selectedThemeId}
            canEdit={canEdit}
            archivedView={showArchived}
            onSelect={() => onSelect(theme.id)}
            onConsolidationChange={(level) => onConsolidationChange(theme.id, level)}
            onRequestArchive={() => onRequestArchive(theme)}
            onUnarchive={() => onUnarchive(theme.id)}
          />
        ))}
      </div>

      <button
        onClick={onToggleArchived}
        className="mt-5 text-xs text-stone-500 hover:text-stone-800 underline underline-offset-2"
      >
        {showArchived ? '← Back to active themes' : 'Show archived themes'}
      </button>
    </section>
  );
}

function ThemeCard({
  theme, active, canEdit, archivedView, onSelect, onConsolidationChange,
  onRequestArchive, onUnarchive,
}: {
  theme: ClusterTheme;
  active: boolean;
  canEdit: boolean;
  archivedView: boolean;
  onSelect: () => void;
  onConsolidationChange: (level: number) => Promise<void>;
  onRequestArchive: () => void;
  onUnarchive: () => Promise<void>;
}) {
  const p = themePalette(theme.color);
  const [localLevel, setLocalLevel] = useState(theme.consolidationLevel);
  useEffect(() => { setLocalLevel(theme.consolidationLevel); }, [theme.consolidationLevel]);
  return (
    <div
      className={`relative rounded-xl border ${p.border} ${active ? p.bgSoft : 'bg-white/60'} ${archivedView ? 'opacity-70' : ''} px-3.5 py-3 cursor-pointer transition hover:bg-white/85 group`}
      onClick={onSelect}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${p.dot} flex-shrink-0`} />
          <h3 className="font-journal text-stone-800 text-lg leading-tight truncate">
            {theme.name}
          </h3>
        </div>
        {canEdit && !archivedView && (
          <button
            onClick={(e) => { e.stopPropagation(); onRequestArchive(); }}
            title="Archive theme"
            className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600 transition-opacity"
          >
            <ArchiveIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {canEdit && archivedView && (
          <button
            onClick={async (e) => { e.stopPropagation(); await onUnarchive(); }}
            title="Restore theme"
            className="text-stone-400 hover:text-emerald-700"
          >
            <ArchiveRestoreIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="font-journal text-xs text-stone-500 italic mt-0.5">
        {theme.nucleusCount ?? 0} {theme.nucleusCount === 1 ? 'nucleus' : 'nuclei'}
        {theme.entryCount ? ` · ${theme.entryCount} entries` : ''}
      </p>

      {!archivedView && (
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
      )}
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

  // Unsaved-changes guard: warn before leaving with an in-progress theme.
  // (Cancel is a deliberate discard, so it is not guarded.)
  const dirty = name.trim().length > 0 || description.trim().length > 0;
  useUnsavedChanges(dirty);

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
  onOpenPushDialog, onNavigateNucleus, onSendNote,
}: {
  theme: ClusterTheme | null;
  nuclei: NucleusContribution[];
  entries: JournalEntry[];
  loading: boolean;
  canEdit: boolean;
  onOpenPushDialog: () => void;
  onNavigateNucleus: (nucleusId: string) => void;
  onSendNote: (body: string, attribution: string) => void;
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
            {entries.map(e => (
              <RepresentativeEntry
                key={e.id}
                entry={e}
                canEdit={canEdit}
                onOpenNucleus={onNavigateNucleus}
                onSendNote={onSendNote}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function RepresentativeEntry({
  entry, canEdit, onOpenNucleus, onSendNote,
}: {
  entry: JournalEntry;
  canEdit: boolean;
  onOpenNucleus: (id: string) => void;
  onSendNote: (body: string, attribution: string) => void;
}) {
  const snippet =
    entry.body
    ?? entry.whatHappened
    ?? entry.encouragingSigns
    ?? entry.challenges
    ?? entry.peopleEmerging
    ?? entry.followUp
    ?? '';
  const truncated = snippet.length > 220 ? snippet.slice(0, 218).trimEnd() + '…' : snippet;
  const attribution = entry.nucleusName
    ? `${entry.nucleusName}${entry.activityName ? ` / ${entry.activityName}` : ''}`
    : 'a nucleus entry';
  return (
    <article className="border-l-2 border-amber-700/30 pl-4 group">
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
        {canEdit && snippet && (
          <button
            onClick={() => onSendNote(snippet, attribution)}
            title="Send this moment to a nucleus that carries this theme"
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
          >
            <SendIcon className="w-3 h-3" /> Send to…
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
  onOpenComposer, onSubmit, onCancel, onSendNote, onUpdateEntry, onDeleteEntry,
}: {
  theme: ClusterTheme | null;
  entries: JournalEntry[];
  canEdit: boolean;
  composerOpen: boolean;
  onOpenComposer: () => void;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  onSendNote: (body: string, attribution: string) => void;
  onUpdateEntry: (entryId: string, body: string) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editConfirmFor, setEditConfirmFor] = useState<string | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Unsaved-changes guard: warn before leaving with an in-progress reflection.
  // (Cancel is a deliberate discard, so it is not guarded.)
  const dirty = composerOpen && body.trim().length > 0;
  useUnsavedChanges(dirty);

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
    <>
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
          editingEntryId === e.id ? (
            <SynthesisEntryEditor
              key={e.id}
              initialBody={e.body ?? ''}
              onCancel={() => setEditingEntryId(null)}
              onSubmit={async (newBody) => {
                await onUpdateEntry(e.id, newBody);
                setEditingEntryId(null);
              }}
            />
          ) : (
            <article key={e.id} className="group">
              <div className="flex items-baseline gap-2 text-xs text-stone-500 font-journal italic mb-1">
                <span>{e.occurredAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                {e.authorName && <span>· {e.authorName}</span>}
                {canEdit && (
                  <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {e.body && (
                      <button
                        onClick={() => onSendNote(e.body!, 'cluster synthesis')}
                        title="Send this reflection to a nucleus that carries this theme"
                        className="inline-flex items-center gap-1 not-italic text-stone-500 hover:text-stone-800"
                      >
                        <SendIcon className="w-3 h-3" /> Send to…
                      </button>
                    )}
                    <button
                      onClick={() => setEditConfirmFor(e.id)}
                      title="Edit reflection"
                      className="p-0.5 text-stone-400 hover:text-stone-700"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmFor(e.id)}
                      title="Delete reflection"
                      className="p-0.5 text-stone-400 hover:text-rose-600"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="font-journal text-stone-700 text-base leading-relaxed whitespace-pre-wrap">{e.body}</p>
              {e.editedAt && (
                <p className="font-journal italic text-[11px] text-stone-400 mt-1">
                  Edited {e.editedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  {e.editedByName ? ` by ${e.editedByName}` : ''}
                </p>
              )}
            </article>
          )
        ))}
      </div>
    </section>

    <ConfirmDialog
      open={!!editConfirmFor}
      title="Edit this reflection?"
      message={
        <>
          Edits overwrite the previous text and are visible to anyone who reads
          the cluster synthesis. The reflection will be marked as edited and
          stamped with your name. Continue?
        </>
      }
      confirmLabel="Yes, edit"
      onCancel={() => setEditConfirmFor(null)}
      onConfirm={() => {
        if (editConfirmFor) setEditingEntryId(editConfirmFor);
        setEditConfirmFor(null);
      }}
    />

    <ConfirmDialog
      open={!!deleteConfirmFor}
      title="Delete this reflection?"
      message={
        <>
          This permanently removes the reflection for everyone. This cannot
          be undone. Continue?
        </>
      }
      confirmLabel={deleting ? 'Deleting…' : 'Yes, delete'}
      onCancel={() => { if (!deleting) setDeleteConfirmFor(null); }}
      onConfirm={async () => {
        if (!deleteConfirmFor || deleting) return;
        setDeleting(true);
        try {
          await onDeleteEntry(deleteConfirmFor);
          setDeleteConfirmFor(null);
        } finally {
          setDeleting(false);
        }
      }}
    />
    </>
  );
}


// ─── Synthesis reflection edit composer ─────────────────────

function SynthesisEntryEditor({
  initialBody, onCancel, onSubmit,
}: {
  initialBody: string;
  onCancel: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);

  // Unsaved-changes guard: warn before leaving with an in-progress edit.
  // (Cancel is a deliberate discard, so it is not guarded.)
  const dirty = body !== initialBody;
  useUnsavedChanges(dirty);

  return (
    <div className="bg-white/80 border border-amber-900/20 rounded-xl p-3">
      <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold mb-2">
        Editing reflection
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={6}
        className="w-full bg-transparent font-journal text-stone-800 text-base leading-relaxed focus:outline-none resize-y"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          disabled={!body.trim() || saving}
          onClick={async () => {
            if (!body.trim()) return;
            setSaving(true);
            try { await onSubmit(body); }
            finally { setSaving(false); }
          }}
          className="px-3 py-1.5 bg-stone-800 text-amber-50 text-xs font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={onCancel} className="px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900">
          Cancel
        </button>
        <span className="text-xs text-amber-700 italic font-journal ml-auto">
          Editing will overwrite the previous text.
        </span>
      </div>
    </div>
  );
}


// ─── Push-to-nuclei dialog ─────────────────────────────────

function PushDialog({
  theme, allNuclei, onOpen, onClose, onSubmit,
}: {
  theme: ClusterTheme;
  allNuclei: { id: string; name: string }[];
  // Resolves the ids of nuclei that already carry the theme, so we
  // can grey them out.
  onOpen: () => Promise<string[]>;
  onClose: () => void;
  onSubmit: (nucleusIds: string[], note: string | undefined) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alreadyHave, setAlreadyHave] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    onOpen().then(ids => setAlreadyHave(new Set(ids)));
    /* eslint-disable-next-line */
  }, []);

  const toggle = (id: string) => {
    if (alreadyHave.has(id)) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-journal text-2xl text-stone-800">Share with nuclei</h2>
            <p className="text-sm text-stone-500 mt-1">
              Add "<span className="font-medium text-stone-700">{theme.name}</span>" to selected nucleus journals.
              A short note (optional) will appear as a seed entry in each. Nuclei that already
              carry it are shown checked and can't be selected.
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
          {allNuclei.map(n => {
            const has = alreadyHave.has(n.id);
            return (
              <label
                key={n.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded ${has ? 'opacity-50 cursor-default' : 'hover:bg-stone-50 cursor-pointer'}`}
                title={has ? 'This nucleus already carries this Object of Learning' : undefined}
              >
                <input
                  type="checkbox"
                  checked={has || selected.has(n.id)}
                  disabled={has}
                  onChange={() => toggle(n.id)}
                  className="accent-stone-800"
                />
                <span className="text-sm text-stone-800">{n.name}</span>
                {has && <span className="text-[11px] text-stone-400 ml-auto">already has it</span>}
              </label>
            );
          })}
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


// ─── Archive-with-notify dialog ────────────────────────────

function ArchiveThemeDialog({
  theme, onClose, onConfirm,
}: {
  theme: ClusterTheme;
  onClose: () => void;
  onConfirm: (notifyNuclei: boolean) => Promise<void>;
}) {
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="font-journal text-2xl text-stone-800 mb-2">Archive this Object of Learning?</h2>
        <p className="text-sm text-stone-600 leading-relaxed">
          "<span className="font-medium">{theme.name}</span>" will be hidden from the Hub (and findable
          under "Show archived"). The nuclei keep their own copies of the theme and their entries —
          archiving only changes what the cluster is actively tracking.
        </p>
        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="accent-stone-800 mt-0.5" />
          <span className="text-sm text-stone-700">
            Post a note in each participating nucleus's journal letting them know it's no longer
            tracked at the cluster level (and to speak up if they disagree).
          </span>
        </label>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(notify); } finally { setBusy(false); } }}
            className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {busy ? 'Archiving…' : 'Archive theme'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Merge dialog ──────────────────────────────────────────

function MergeDialog({
  themes, onClose, onConfirm,
}: {
  themes: ClusterTheme[];
  onClose: () => void;
  onConfirm: (sourceId: string, targetId: string, finalName: string) => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [finalName, setFinalName] = useState('');
  const [busy, setBusy] = useState(false);

  const source = themes.find(t => t.id === sourceId);
  const target = themes.find(t => t.id === targetId);

  // Default the unified name to the survivor's name when picked.
  useEffect(() => { if (target && !finalName) setFinalName(target.name); }, [target]);

  const valid = sourceId && targetId && sourceId !== targetId && finalName.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between mb-3">
          <h2 className="font-journal text-2xl text-stone-800">Merge two Objects of Learning</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><XIcon className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-stone-600 mb-4">
          Combine two themes that mean the same thing. All entries and contributing nuclei move
          to the survivor, and every nucleus's copy is renamed to the unified name.
        </p>

        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Merge this theme…</label>
        <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full border border-stone-300 rounded-lg p-2 mb-3 text-sm">
          <option value="">Select a theme</option>
          {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1">…into this one (survivor)</label>
        <select value={targetId} onChange={e => { setTargetId(e.target.value); const t = themes.find(x => x.id === e.target.value); if (t) setFinalName(t.name); }} className="w-full border border-stone-300 rounded-lg p-2 mb-3 text-sm">
          <option value="">Select a theme</option>
          {themes.filter(t => t.id !== sourceId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Unified name (seen by all nuclei)</label>
        <input value={finalName} onChange={e => setFinalName(e.target.value)} className="w-full border border-stone-300 rounded-lg p-2 mb-4 text-sm" placeholder="Final name" />

        {source && target && (
          <p className="text-xs text-stone-500 italic mb-4">
            "{source.name}" will be merged into "{target.name}" and both will be shown as
            "{finalName.trim() || target.name}".
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
          <button
            disabled={!valid || busy}
            onClick={async () => { setBusy(true); try { await onConfirm(sourceId, targetId, finalName.trim()); } finally { setBusy(false); } }}
            className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {busy ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Send-a-note-to-one-nucleus dialog ─────────────────────

function SendNoteDialog({
  note, loadEligible, onClose, onSend,
}: {
  note: { body: string; attribution: string };
  loadEligible: () => Promise<{ id: string; name: string }[]>;
  onClose: () => void;
  onSend: (nucleusId: string) => Promise<void>;
}) {
  const [eligible, setEligible] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadEligible().then(setEligible).finally(() => setLoading(false));
    /* eslint-disable-next-line */
  }, []);

  const preview = note.body.length > 180 ? note.body.slice(0, 178).trimEnd() + '…' : note.body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-2">
          <h2 className="font-journal text-2xl text-stone-800">Send to a nucleus</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><XIcon className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-stone-500 mb-2">
          Only nuclei that already carry this Object of Learning can receive it. To reach others,
          share the theme with them first.
        </p>
        <blockquote className="bg-amber-50/60 border-l-2 border-amber-700/40 pl-3 py-2 text-sm font-journal italic text-stone-600 mb-4">
          {preview}
          <div className="not-italic text-[11px] text-stone-400 mt-1">— {note.attribution}</div>
        </blockquote>

        {loading && <p className="text-sm text-stone-500 italic">Finding eligible nuclei…</p>}
        {!loading && eligible.length === 0 && (
          <p className="text-sm text-stone-500 italic">
            No nucleus carries this theme yet. Share the theme first, then you can send notes.
          </p>
        )}
        {!loading && eligible.length > 0 && (
          <select value={chosen} onChange={e => setChosen(e.target.value)} className="w-full border border-stone-300 rounded-lg p-2 mb-4 text-sm">
            <option value="">Select a nucleus</option>
            {eligible.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
          <button
            disabled={!chosen || busy}
            onClick={async () => { setBusy(true); try { await onSend(chosen); } finally { setBusy(false); } }}
            className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
