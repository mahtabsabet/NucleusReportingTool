import React, { useEffect, useMemo, useState } from 'react';
import { useUnsavedChanges } from '../lib/unsavedChanges';
import {
  ClockIcon,
  PlusIcon,
  ChevronLeftIcon,
  UsersIcon,
  SproutIcon,
  HomeIcon,
  FlameIcon,
  BusIcon,
  BookOpenIcon,
  PencilIcon,
  LockIcon,
  ArchiveRestoreIcon,
} from 'lucide-react';
import {
  listNucleusJournalEntries,
  listEntriesByTheme,
  listThemesForNucleus,
  createNucleusEntry,
  updateNucleusEntry,
  createEstablishedTheme,
  promoteTheme,
  archiveTheme,
  unarchiveTheme,
  addThemesToEntry,
  removeThemeFromEntry,
  listSiblingClusterThemeSuggestions,
  THEME_COLORS,
} from '../lib/db/journal';
import type { JournalEntry, LearningTheme } from '../types';
import { ThemeTag, themePalette } from './ThemeTag';
import { ThemeTagEditor } from './ThemeTagEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { EntryTabs } from './EntryTabs';
import { HeadingFlourish, HeaderDivider } from './JournalDecorations';

interface NucleusJournalProps {
  nucleusId: string;
  readOnly: boolean;
  canCurate: boolean;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDayOfWeekEvening(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: 'long' });
  const hour = d.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `${day} ${part}`;
}

// Icon by color so the right page reads as visually varied without
// requiring an icon column on the table.
const THEME_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  amber: UsersIcon,
  green: SproutIcon,
  red: BusIcon,
  blue: HomeIcon,
  purple: FlameIcon,
  pink: BookOpenIcon,
};
const themeIconFor = (color: string) => THEME_ICON[color] ?? UsersIcon;

export function NucleusJournal({ nucleusId, readOnly, canCurate }: NucleusJournalProps) {
  const [themes, setThemes] = useState<LearningTheme[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [themeComposerOpen, setThemeComposerOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editConfirmFor, setEditConfirmFor] = useState<string | null>(null);
  const [showArchivedThemes, setShowArchivedThemes] = useState(false);
  const [archivedThemes, setArchivedThemes] = useState<LearningTheme[]>([]);

  const selectedTheme = useMemo(
    () => themes.find(t => t.id === selectedThemeId) ?? null,
    [themes, selectedThemeId],
  );

  // When viewing a theme's entries, label each individual-entry tab
  // with the activity it came from (if any), so the tab conveys
  // provenance, not just a date.
  const tabbedEntries = useMemo(
    () => entries.map(e => ({
      ...e,
      tabSuffix: selectedThemeId && e.activityName ? e.activityName : undefined,
    })),
    [entries, selectedThemeId],
  );

  const loadThemes = async () => setThemes(await listThemesForNucleus(nucleusId));
  const loadArchivedThemes = async () =>
    setArchivedThemes(
      (await listThemesForNucleus(nucleusId, { includeArchived: true }))
        .filter(t => t.status === 'archived'),
    );
  const loadEntries = async () => {
    if (selectedThemeId) setEntries(await listEntriesByTheme(nucleusId, selectedThemeId));
    else setEntries(await listNucleusJournalEntries(nucleusId));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadThemes(), loadEntries()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nucleusId, selectedThemeId]);

  return (
    // Outer wrapper carries the stacked page-edge shadows (left
    // and right). We use a flex/grid spread inside so the shadows
    // sit on the actual outer edges of the book, not inside the
    // border.
    <div className="rounded-md bg-journal-paper border border-amber-900/30 shadow-2xl book-edge-left book-edge-right journal-spine">
      <div className="grid grid-cols-1 lg:grid-cols-2 relative">
        {/* ─── LEFT PAGE ──────────────────────────────────────────── */}
        <div className="journal-page p-7 sm:p-12 min-h-[640px] relative">
          <div className="mb-5">
            {selectedTheme ? (
              <>
                <button
                  onClick={() => setSelectedThemeId(null)}
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-amber-800/80 hover:text-amber-900 mb-2"
                >
                  <ChevronLeftIcon className="w-3.5 h-3.5" /> Back to journal
                </button>
                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
                  Theme · {selectedTheme.status}
                </p>
                <h2 className="font-journal font-normal text-[2.4rem] sm:text-[2.7rem] text-stone-800 leading-[1.1]">
                  {selectedTheme.name}
                </h2>
                {selectedTheme.description && (
                  <p className="font-journal italic text-stone-600 mt-2">
                    {selectedTheme.description}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-journal font-normal text-[2.4rem] sm:text-[2.7rem] text-stone-800 leading-[1.1] flex items-baseline gap-2">
                    <HeadingFlourish className="w-12 h-7 text-amber-800/60 self-end -mb-1" />
                    Our Journey Together
                  </h2>
                  {!readOnly && canCurate && !composerOpen && (
                    <button
                      onClick={() => setComposerOpen(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-journal text-stone-700 bg-transparent hover:bg-white/60 border border-stone-400/60 rounded-md px-3.5 py-1.5 transition flex-shrink-0"
                    >
                      <PlusIcon className="w-3.5 h-3.5" /> New Entry
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <HeaderDivider className="text-amber-800/55 mb-7" />

          {composerOpen && !selectedTheme && (
            <NucleusEntryComposer
              mode="create"
              themes={themes.filter(t => t.status !== 'archived')}
              onCancel={() => setComposerOpen(false)}
              onSubmit={async ({ body, themeIds }) => {
                await createNucleusEntry(nucleusId, { body, themeIds });
                setComposerOpen(false);
                await loadEntries();
                await loadThemes();
              }}
            />
          )}

          {loading && (
            <p className="font-journal italic text-stone-500">Turning the page…</p>
          )}
          {!loading && (
            <EntryTabs
              entries={tabbedEntries}
              emptyLabel={selectedTheme
                ? 'No entries connected to this theme yet.'
                : 'No journal entries yet. The story begins with the first reflection.'}
              activeClass="bg-amber-800 text-amber-50"
              inactiveClass="bg-white/50 text-stone-600 hover:bg-white"
              renderEntry={(entry) =>
                editingEntryId === entry.id ? (
                  <NucleusEntryComposer
                    mode="edit"
                    initial={entry}
                    themes={themes.filter(t => t.status !== 'archived')}
                    onCancel={() => setEditingEntryId(null)}
                    onSubmit={async ({ body }) => {
                      await updateNucleusEntry(entry.id, body);
                      setEditingEntryId(null);
                      await loadEntries();
                    }}
                  />
                ) : (
                  <JournalEntryView
                    entry={entry}
                    allThemes={themes}
                    readOnly={readOnly}
                    canEdit={!readOnly && (canCurate || entry.source === 'activity')}
                    onStartEdit={() => setEditConfirmFor(entry.id)}
                    onTagsChanged={loadEntries}
                  />
                )
              }
            />
          )}

        </div>

        {/* ─── RIGHT PAGE ─────────────────────────────────────────── */}
        <div className="journal-page p-7 sm:p-12 min-h-[640px] relative">
          <div className="mb-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-journal font-normal text-[2.4rem] sm:text-[2.7rem] text-stone-800 leading-[1.1] flex items-baseline gap-2">
                Our Objects of Learning
                <span className="self-end -mb-1 inline-block" style={{ transform: 'scaleX(-1)' }}>
                  <HeadingFlourish className="w-12 h-7 text-amber-800/60" />
                </span>
              </h2>
              {!readOnly && canCurate && !themeComposerOpen && (
                <button
                  onClick={() => setThemeComposerOpen(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-journal text-stone-700 bg-transparent hover:bg-white/60 border border-stone-400/60 rounded-md px-3.5 py-1.5 transition flex-shrink-0"
                >
                  <PlusIcon className="w-3.5 h-3.5" /> New Learning
                </button>
              )}
            </div>
            <p className="font-journal italic text-stone-600 mt-2">
              Click a theme to see all related journal entries.
            </p>
          </div>

          <HeaderDivider className="text-amber-800/55 mb-7" />

          {themeComposerOpen && (
            <ThemeComposer
              nucleusId={nucleusId}
              onCancel={() => setThemeComposerOpen(false)}
              onSubmit={async ({ name, color, description }) => {
                await createEstablishedTheme(nucleusId, { name, color, description });
                setThemeComposerOpen(false);
                await loadThemes();
              }}
            />
          )}

          <div className="space-y-4">
            {themes.length === 0 && !themeComposerOpen && (
              <p className="font-journal italic text-stone-500">
                No themes yet. They emerge as the nucleus reflects together.
              </p>
            )}
            {themes.map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={theme.id === selectedThemeId}
                canCurate={canCurate}
                onSelect={() => setSelectedThemeId(theme.id)}
                onPromote={async () => { await promoteTheme(theme.id); await loadThemes(); }}
                onArchive={async () => {
                  await archiveTheme(theme.id);
                  await loadThemes();
                  if (showArchivedThemes) await loadArchivedThemes();
                }}
              />
            ))}
          </div>

          {canCurate && (
            <div className="mt-6">
              <button
                onClick={async () => {
                  const next = !showArchivedThemes;
                  setShowArchivedThemes(next);
                  if (next) await loadArchivedThemes();
                }}
                className="text-xs text-stone-500 hover:text-stone-800 underline underline-offset-2"
              >
                {showArchivedThemes ? 'Hide archived themes' : 'Show archived themes'}
              </button>

              {showArchivedThemes && (
                <div className="mt-3 space-y-2">
                  {archivedThemes.length === 0 && (
                    <p className="font-journal italic text-stone-400 text-sm">No archived themes.</p>
                  )}
                  {archivedThemes.map(t => {
                    const p = themePalette(t.color);
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-900/10 bg-white/40 px-3 py-2 opacity-75"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full ${p.dot} flex-shrink-0`} />
                          <span className="font-journal text-stone-700 truncate">{t.name}</span>
                          <span className="text-xs text-stone-400 flex-shrink-0">
                            {t.entryCount ?? 0} {t.entryCount === 1 ? 'moment' : 'moments'}
                          </span>
                        </div>
                        {t.pushedFromCluster ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-stone-400" title="Managed by the cluster Learning Hub.">
                            <LockIcon className="w-3 h-3" /> from cluster
                          </span>
                        ) : (
                          <button
                            onClick={async () => {
                              await unarchiveTheme(t.id);
                              await Promise.all([loadThemes(), loadArchivedThemes()]);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-emerald-700 flex-shrink-0"
                          >
                            <ArchiveRestoreIcon className="w-3.5 h-3.5" /> Restore
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {themes.length > 0 && (
            <p className="text-center font-journal italic text-stone-500 mt-10">
              Our learning grows as we walk this path together.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!editConfirmFor}
        title="Edit this entry?"
        message={
          <>
            Edits overwrite the previous text and are visible to anyone who reads
            the journal. The entry will be marked as edited and stamped with
            your name. Continue?
          </>
        }
        confirmLabel="Yes, edit"
        onCancel={() => setEditConfirmFor(null)}
        onConfirm={() => {
          if (editConfirmFor) setEditingEntryId(editConfirmFor);
          setEditConfirmFor(null);
        }}
      />
    </div>
  );
}


// ─── Entry view (read mode, with edit + tag affordances) ────

interface JournalEntryViewProps {
  entry: JournalEntry;
  allThemes: LearningTheme[];
  readOnly: boolean;
  canEdit: boolean;
  onStartEdit: () => void;
  onTagsChanged: () => Promise<void> | void;
}

function JournalEntryView({
  entry, allThemes, readOnly, canEdit, onStartEdit, onTagsChanged,
}: JournalEntryViewProps) {
  const promptKeys = [
    ['whatHappened', entry.whatHappened],
    ['encouragingSigns', entry.encouragingSigns],
    ['challenges', entry.challenges],
    ['peopleEmerging', entry.peopleEmerging],
    ['followUp', entry.followUp],
  ] as const;
  const hasPrompts = promptKeys.some(([, v]) => v);
  const taggedIds = useMemo(() => new Set(entry.themes.map(t => t.id)), [entry.themes]);
  const availableThemes = useMemo(
    () => allThemes.filter(t => t.status !== 'archived' && !taggedIds.has(t.id)),
    [allThemes, taggedIds],
  );

  return (
    <article>
      <div className="flex items-baseline gap-3 mb-1 group flex-wrap">
        <ClockIcon className="w-4 h-4 text-stone-500" />
        <span className="font-journal text-stone-800 text-base">
          {formatDateLong(entry.occurredAt)}
        </span>
        <span className="font-journal italic text-stone-600 text-base">
          {formatDayOfWeekEvening(entry.occurredAt)}
        </span>
        {entry.activityName && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 bg-amber-100/60 border border-amber-200 rounded-full px-2.5 py-0.5">
            from {entry.activityName}
          </span>
        )}
        {!readOnly && canEdit && entry.source === 'nucleus' && (
          <button
            onClick={onStartEdit}
            title="Edit entry"
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="font-journal text-stone-800 text-lg leading-relaxed pl-7">
        {hasPrompts ? (
          <div className="space-y-2">
            {promptKeys.map(([k, v]) => v && (
              <p key={k} className="whitespace-pre-wrap">
                <em className="text-stone-500 not-italic text-xs uppercase tracking-wider mr-2">
                  {labelForPrompt(k)}:
                </em>
                {v}
              </p>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{entry.body}</p>
        )}
      </div>

      <div className="pl-7 mt-3">
        <ThemeTagEditor
          applied={entry.themes}
          available={availableThemes}
          canEdit={!readOnly}
          onAdd={async (themeId) => { await addThemesToEntry(entry.id, [themeId]); await onTagsChanged(); }}
          onRemove={async (themeId) => { await removeThemeFromEntry(entry.id, themeId); await onTagsChanged(); }}
        />
      </div>

      {entry.editedAt && (
        <p className="pl-7 font-journal italic text-[11px] text-stone-400 mt-2">
          Edited {formatDateLong(entry.editedAt)}
          {entry.editedByName ? ` by ${entry.editedByName}` : ''}
        </p>
      )}
    </article>
  );
}

function labelForPrompt(key: string): string {
  switch (key) {
    case 'whatHappened': return 'What happened';
    case 'encouragingSigns': return 'Encouraging signs';
    case 'challenges': return 'Challenges';
    case 'peopleEmerging': return 'People emerging';
    case 'followUp': return 'Follow-up';
    default: return key;
  }
}


// ─── Theme card (right page) — with highlighter ribbon ──────

interface ThemeCardProps {
  theme: LearningTheme;
  active: boolean;
  canCurate: boolean;
  onSelect: () => void;
  onPromote: () => void | Promise<void>;
  onArchive: () => void | Promise<void>;
}

function ThemeCard({ theme, active, canCurate, onSelect, onPromote, onArchive }: ThemeCardProps) {
  const p = themePalette(theme.color);
  const Icon = themeIconFor(theme.color);
  const emerging = theme.status === 'emerging';
  return (
    <div
      className={`relative group flex items-start gap-4 rounded-2xl border ${p.border} ${active ? p.bgSoft : 'bg-white/55'} ${emerging ? 'border-dashed' : ''} px-4 py-4 cursor-pointer hover:bg-white/80 transition shadow-sm`}
      onClick={onSelect}
    >
      {/* Highlighter ribbon — the colored flag sticking off the right edge */}
      <div className={`theme-ribbon ${p.dot}`} aria-hidden />

      <div className={`flex-shrink-0 w-12 h-12 rounded-full ${p.bgSoft} ${p.text} flex items-center justify-center border ${p.border}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-journal text-stone-800 text-xl leading-tight truncate">
            {theme.name}
          </h3>
          <span className="text-xs text-stone-500 font-journal italic flex-shrink-0">
            {theme.entryCount ?? 0} {theme.entryCount === 1 ? 'moment' : 'moments'}
          </span>
        </div>
        {theme.description && (
          <p className="font-journal text-stone-600 text-sm mt-1 leading-relaxed">
            {theme.description}
          </p>
        )}
        {canCurate && (
          <div className="mt-2 flex items-center gap-3">
            {emerging && (
              <>
                <span className="text-[10px] uppercase tracking-wider text-stone-500">Proposed theme</span>
                <button
                  onClick={e => { e.stopPropagation(); onPromote(); }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                >Promote</button>
              </>
            )}
            {theme.pushedFromCluster ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-stone-400"
                title="This theme was sent down from the cluster Learning Hub and is managed there. It can't be archived here."
              >
                <LockIcon className="w-3 h-3" /> from cluster
              </span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onArchive(); }}
                className="text-xs text-stone-500 hover:text-rose-700"
              >Archive</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Nucleus entry composer (left page) ─────────────────────

function NucleusEntryComposer({
  mode, initial, themes, onCancel, onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: JournalEntry;
  themes: LearningTheme[];
  onCancel: () => void;
  onSubmit: (args: { body: string; themeIds: string[] }) => Promise<void>;
}) {
  const [body, setBody] = useState(initial?.body ?? '');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.themes.map(t => t.id) ?? []),
  );
  const [saving, setSaving] = useState(false);

  // Unsaved-changes guard: warn before leaving with an in-progress entry.
  // (Cancel is a deliberate discard, so it is not guarded.)
  const initialThemeSig = useMemo(
    () => (initial?.themes.map(t => t.id) ?? []).slice().sort().join(','),
    [initial],
  );
  const entryDirty =
    body !== (initial?.body ?? '') || [...selected].sort().join(',') !== initialThemeSig;
  useUnsavedChanges(entryDirty);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSave = async () => {
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({ body, themeIds: Array.from(selected) });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white/75 border border-amber-900/20 rounded-xl p-4 mb-6 shadow-sm">
      {mode === 'edit' && (
        <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold mb-2">
          Editing entry
        </div>
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={5}
        placeholder="What is our learning together today?"
        className="w-full bg-transparent font-journal text-lg text-stone-800 leading-relaxed focus:outline-none placeholder:italic placeholder:text-stone-400 resize-y"
      />
      {mode === 'create' && themes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {themes.map(t => (
            <ThemeTag key={t.id} theme={t} selected={selected.has(t.id)} onClick={() => toggle(t.id)} size="sm" />
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={!body.trim() || saving}
          className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg hover:bg-stone-900 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Record entry'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900">
          Cancel
        </button>
        {mode === 'edit' && (
          <span className="text-xs text-amber-700 italic font-journal ml-auto">
            Editing will overwrite the previous text.
          </span>
        )}
      </div>
    </div>
  );
}


// ─── Theme composer (right page) ────────────────────────────

function ThemeComposer({
  nucleusId, onCancel, onSubmit,
}: {
  nucleusId: string;
  onCancel: () => void;
  onSubmit: (args: { name: string; color: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('amber');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { id: string; name: string; description?: string; color: string }[]
  >([]);

  // Unsaved-changes guard: warn before leaving with an in-progress theme.
  const themeDirty = name.trim().length > 0 || description.trim().length > 0;
  useUnsavedChanges(themeDirty);

  useEffect(() => {
    listSiblingClusterThemeSuggestions(nucleusId).then(setSuggestions).catch(() => setSuggestions([]));
  }, [nucleusId]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try { await onSubmit({ name, color, description: description || undefined }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white/75 border border-amber-900/20 rounded-xl p-4 mb-6 space-y-3 shadow-sm">
      {suggestions.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200/70 rounded-lg p-3">
          <p className="font-journal italic text-stone-600 text-sm mb-2">
            Other nuclei in the cluster are already learning about these. If one
            fits, choose it instead of making a new Object of Learning:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button
                key={s.id}
                type="button"
                disabled={saving}
                title={s.description}
                onClick={async () => {
                  setSaving(true);
                  try { await onSubmit({ name: s.name, color: s.color, description: s.description }); }
                  finally { setSaving(false); }
                }}
                className="text-xs font-medium rounded-md border border-amber-900/20 bg-white/70 hover:bg-white px-2.5 py-1 disabled:opacity-50"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Or name a new theme"
        className="w-full bg-transparent font-journal text-2xl text-stone-800 focus:outline-none border-b border-stone-300 pb-1 placeholder:text-stone-400"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={2}
        placeholder="Why is this a learning theme for us?"
        className="w-full bg-transparent font-journal italic text-stone-700 focus:outline-none placeholder:text-stone-400 resize-none"
      />
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-stone-500">Highlighter</span>
        {THEME_COLORS.map(c => {
          const p = themePalette(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={`w-6 h-6 rounded-full ${p.dot} ring-2 ${color === c ? 'ring-stone-800' : 'ring-transparent'} transition`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg hover:bg-stone-900 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Add theme'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900">
          Cancel
        </button>
      </div>
    </div>
  );
}
