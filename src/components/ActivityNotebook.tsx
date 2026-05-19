import React, { useEffect, useMemo, useState } from 'react';
import {
  ClockIcon,
  UsersIcon,
  SproutIcon,
  FlagTriangleRightIcon,
  UserPlusIcon,
  CornerUpRightIcon,
  PlusIcon,
  HelpCircleIcon,
  PencilIcon,
  TagIcon,
  XIcon,
} from 'lucide-react';
import {
  listEntriesForActivity,
  listThemesForNucleus,
  createActivityEntry,
  updateActivityEntry,
  addThemesToEntry,
  removeThemeFromEntry,
  proposeTheme,
  THEME_COLORS,
  type NewActivityEntry,
} from '../lib/db/journal';
import type { JournalEntry, LearningTheme } from '../types';
import { ThemeTag, themePalette } from './ThemeTag';
import { ConfirmDialog } from './ConfirmDialog';

interface ActivityNotebookProps {
  activityId: string;
  nucleusId: string;
  readOnly: boolean;
}

const PROMPTS = [
  { key: 'whatHappened',      label: 'What happened?',     Icon: UsersIcon,             color: 'text-violet-700' },
  { key: 'encouragingSigns',  label: 'Encouraging signs',  Icon: SproutIcon,            color: 'text-emerald-700' },
  { key: 'challenges',        label: 'Challenges',         Icon: FlagTriangleRightIcon, color: 'text-rose-700' },
  { key: 'peopleEmerging',    label: 'People emerging',    Icon: UserPlusIcon,          color: 'text-sky-700' },
  { key: 'followUp',          label: 'Follow-up needed',   Icon: CornerUpRightIcon,     color: 'text-amber-700' },
] as const;
type PromptKey = typeof PROMPTS[number]['key'];

function formatEntryDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
function formatEntryTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ActivityNotebook({ activityId, nucleusId, readOnly }: ActivityNotebookProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [themes, setThemes] = useState<LearningTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  // ID of the entry currently being edited (mutually exclusive with composerOpen).
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  // ID of the entry whose tags are being adjusted inline.
  const [taggingEntryId, setTaggingEntryId] = useState<string | null>(null);
  // The user has acknowledged that they're about to overwrite an
  // existing entry — gates the actual edit composer until they say
  // yes. Reset every time editing ends.
  const [editConfirmFor, setEditConfirmFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [e, t] = await Promise.all([
        listEntriesForActivity(activityId),
        listThemesForNucleus(nucleusId),
      ]);
      setEntries(e);
      setThemes(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activityId, nucleusId]);

  return (
    <div className="rounded-2xl overflow-hidden shadow-xl">
      <div className="notebook-spiral-band" />

      <div className="bg-notebook-paper px-5 sm:px-9 pt-6 pb-7 relative">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <h3 className="font-handwritten text-4xl text-stone-800 leading-none tracking-wide">
            Activity Notebook
          </h3>
          {!readOnly && !composerOpen && !editingEntryId && (
            <button
              onClick={() => setComposerOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700 bg-white/70 hover:bg-white border border-amber-900/25 rounded-lg px-3 py-1.5 transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" /> New entry
            </button>
          )}
        </div>
        <p className="font-journal italic text-stone-600 text-base mb-5">
          Capture what happened while it is fresh.
        </p>

        {composerOpen && (
          <EntryComposer
            mode="create"
            themes={themes}
            onCancel={() => setComposerOpen(false)}
            onSubmit={async (entry, newThemes) => {
              const created: LearningTheme[] = [];
              for (const nt of newThemes) {
                created.push(await proposeTheme(nucleusId, { name: nt.name, color: nt.color }));
              }
              const allThemeIds = [...entry.themeIds, ...created.map(t => t.id)];
              await createActivityEntry(nucleusId, activityId, { ...entry, themeIds: allThemeIds });
              setComposerOpen(false);
              await load();
            }}
          />
        )}

        <div className="mt-4 space-y-5">
          {loading && (
            <p className="text-sm text-stone-500 italic font-journal">Opening the notebook…</p>
          )}
          {!loading && entries.length === 0 && !composerOpen && (
            <p className="text-sm text-stone-500 italic font-journal">
              No entries yet. {readOnly ? '' : 'Write the first reflection from this activity.'}
            </p>
          )}
          {entries.map(entry => (
            editingEntryId === entry.id ? (
              <EntryComposer
                key={entry.id}
                mode="edit"
                initial={entry}
                themes={themes}
                onCancel={() => setEditingEntryId(null)}
                onSubmit={async (patch) => {
                  await updateActivityEntry(entry.id, patch);
                  setEditingEntryId(null);
                  await load();
                }}
              />
            ) : (
              <EntryView
                key={entry.id}
                entry={entry}
                themes={themes}
                readOnly={readOnly}
                tagging={taggingEntryId === entry.id}
                onStartEdit={() => setEditConfirmFor(entry.id)}
                onStartTag={() => setTaggingEntryId(entry.id)}
                onStopTag={() => setTaggingEntryId(null)}
                onTagAdded={load}
                onTagRemoved={load}
                onProposeTheme={async ({ name, color }) => {
                  const t = await proposeTheme(nucleusId, { name, color });
                  await addThemesToEntry(entry.id, [t.id]);
                  await load();
                }}
              />
            )
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!editConfirmFor}
        title="Edit this entry?"
        message={
          <>
            Edits overwrite the previous text and are visible to anyone who reads
            the notebook. The entry will be marked as edited and stamped with
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


// ─── Read view of an entry, with edit + retag affordances ────

interface EntryViewProps {
  entry: JournalEntry;
  themes: LearningTheme[];
  readOnly: boolean;
  tagging: boolean;
  onStartEdit: () => void;
  onStartTag: () => void;
  onStopTag: () => void;
  onTagAdded: () => Promise<void> | void;
  onTagRemoved: () => Promise<void> | void;
  onProposeTheme: (args: { name: string; color: string }) => Promise<void>;
}

function EntryView({
  entry, themes, readOnly, tagging,
  onStartEdit, onStartTag, onStopTag,
  onTagAdded, onTagRemoved, onProposeTheme,
}: EntryViewProps) {
  const taggedIds = useMemo(() => new Set(entry.themes.map(t => t.id)), [entry.themes]);
  const visibleThemes = useMemo(
    () => themes.filter(t => t.status !== 'archived'),
    [themes],
  );
  return (
    <article className="bg-white/60 border border-amber-900/15 rounded-xl px-4 sm:px-5 py-4 shadow-sm">
      <header className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2 text-stone-600">
          <ClockIcon className="w-4 h-4 text-stone-400" />
          <span className="font-medium text-sm">{formatEntryTime(entry.occurredAt)}</span>
          <span className="text-stone-400">·</span>
          <span className="font-journal italic text-sm">{formatEntryDate(entry.occurredAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          {entry.authorName && (
            <span className="font-journal italic text-xs text-stone-500">— {entry.authorName}</span>
          )}
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                onClick={onStartTag}
                title="Adjust tags"
                className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition"
              >
                <TagIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onStartEdit}
                title="Edit entry"
                className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="space-y-3">
        {PROMPTS.map(p => {
          const value = entry[p.key as PromptKey];
          if (!value) return null;
          return (
            <div key={p.key} className="flex gap-3">
              <p.Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${p.color}`} />
              <div>
                <div className={`font-handwritten text-lg leading-none ${p.color}`}>{p.label}</div>
                <p className="font-journal text-stone-700 mt-1 whitespace-pre-wrap">{value}</p>
              </div>
            </div>
          );
        })}
        {entry.body && !PROMPTS.some(p => entry[p.key as PromptKey]) && (
          <p className="font-journal text-stone-700 whitespace-pre-wrap">{entry.body}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-amber-900/10">
        {entry.themes.map(t => (
          <span key={t.id} className="inline-flex items-center gap-1">
            <ThemeTag theme={t} size="sm" />
            {tagging && (
              <button
                onClick={async () => { await removeThemeFromEntry(entry.id, t.id); await onTagRemoved(); }}
                title="Remove tag"
                className="text-stone-400 hover:text-rose-600"
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {tagging && (
          <InlineTagAdder
            allThemes={visibleThemes}
            taggedIds={taggedIds}
            onAdd={async (ids) => { await addThemesToEntry(entry.id, ids); await onTagAdded(); }}
            onPropose={onProposeTheme}
            onDone={onStopTag}
          />
        )}
        {!tagging && entry.themes.length === 0 && (
          <span className="text-xs italic text-stone-400 font-journal">No themes yet</span>
        )}
      </div>

      {entry.editedAt && (
        <p className="font-journal italic text-[11px] text-stone-400 mt-2">
          Edited {formatEntryDate(entry.editedAt)}
          {entry.editedByName ? ` by ${entry.editedByName}` : ''}
        </p>
      )}
    </article>
  );
}


// ─── Inline theme adder used by both the composer and edit flow ─

interface InlineTagAdderProps {
  allThemes: LearningTheme[];
  taggedIds: Set<string>;
  onAdd: (themeIds: string[]) => Promise<void> | void;
  onPropose: (args: { name: string; color: string }) => Promise<void> | void;
  onDone: () => void;
}

function InlineTagAdder({ allThemes, taggedIds, onAdd, onPropose, onDone }: InlineTagAdderProps) {
  const [proposing, setProposing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('amber');
  const available = allThemes.filter(t => !taggedIds.has(t.id));
  return (
    <div className="inline-flex flex-wrap items-center gap-2 bg-amber-50/50 border border-amber-900/15 rounded-md px-2 py-1.5">
      {available.map(t => (
        <ThemeTag
          key={t.id}
          theme={t}
          size="sm"
          onClick={() => onAdd([t.id])}
        />
      ))}
      {!proposing ? (
        <button
          onClick={() => setProposing(true)}
          className="text-xs font-medium text-stone-600 hover:text-stone-900 px-1.5"
        >+ Propose</button>
      ) : (
        <span className="inline-flex items-center gap-1.5 bg-white border border-stone-300 rounded-md px-2 py-0.5">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Theme name"
            className="text-xs bg-transparent focus:outline-none w-28"
          />
          <select value={newColor} onChange={e => setNewColor(e.target.value)} className="text-xs bg-transparent">
            {THEME_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className={`w-3 h-3 rounded-sm ${themePalette(newColor).dot}`} />
          <button
            onClick={async () => {
              if (!newName.trim()) return;
              await onPropose({ name: newName.trim(), color: newColor });
              setNewName(''); setProposing(false);
            }}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >Add</button>
        </span>
      )}
      <button
        onClick={onDone}
        className="text-xs text-stone-500 hover:text-stone-900 ml-1"
      >Done</button>
    </div>
  );
}


// ─── Composer (create + edit) ────────────────────────────────

interface ComposerProps {
  mode: 'create' | 'edit';
  initial?: JournalEntry;
  themes: LearningTheme[];
  onCancel: () => void;
  onSubmit: (
    entry: NewActivityEntry,
    newThemes: { name: string; color: string }[],
  ) => Promise<void>;
}

function EntryComposer({ mode, initial, themes, onCancel, onSubmit }: ComposerProps) {
  const [values, setValues] = useState<Record<PromptKey, string>>({
    whatHappened: initial?.whatHappened ?? '',
    encouragingSigns: initial?.encouragingSigns ?? '',
    challenges: initial?.challenges ?? '',
    peopleEmerging: initial?.peopleEmerging ?? '',
    followUp: initial?.followUp ?? '',
  });
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(
    new Set(initial?.themes.map(t => t.id) ?? []),
  );
  const [draftThemes, setDraftThemes] = useState<{ name: string; color: string }[]>([]);
  const [proposing, setProposing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>('amber');
  const [saving, setSaving] = useState(false);

  const visibleThemes = useMemo(
    () => themes.filter(t => t.status !== 'archived'),
    [themes],
  );

  const hasContent = Object.values(values).some(v => v.trim().length > 0);

  const toggleTheme = (id: string) => {
    setSelectedThemeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addDraftTheme = () => {
    const name = newName.trim();
    if (!name) return;
    if (visibleThemes.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
    if (draftThemes.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
    setDraftThemes(prev => [...prev, { name, color: newColor }]);
    setNewName('');
    setProposing(false);
  };

  const handleSave = async () => {
    if (!hasContent || saving) return;
    setSaving(true);
    try {
      await onSubmit(
        { ...values, themeIds: Array.from(selectedThemeIds) },
        draftThemes,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/85 border border-amber-900/25 rounded-xl px-4 sm:px-5 py-4 mb-2 shadow-sm">
      {mode === 'edit' && (
        <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold mb-3">
          Editing entry
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROMPTS.map(p => (
          <div key={p.key} className="flex gap-3">
            <p.Icon className={`w-5 h-5 mt-1.5 flex-shrink-0 ${p.color}`} />
            <div className="flex-1">
              <label className={`font-handwritten text-lg leading-none ${p.color}`}>{p.label}</label>
              <textarea
                value={values[p.key as PromptKey]}
                onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))}
                rows={2}
                className="mt-1 w-full font-journal text-stone-800 bg-transparent border-b border-dashed border-stone-300 focus:outline-none focus:border-stone-500 resize-none placeholder:text-stone-400 placeholder:italic"
                placeholder="…"
              />
            </div>
          </div>
        ))}
      </div>

      {mode === 'create' && (
        <div className="mt-5 pt-4 border-t border-amber-900/10">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Tag with learning themes
            </span>
            <HelpCircleIcon className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {visibleThemes.map(t => (
              <ThemeTag
                key={t.id}
                theme={t}
                selected={selectedThemeIds.has(t.id)}
                onClick={() => toggleTheme(t.id)}
                size="sm"
              />
            ))}
            {draftThemes.map((d, i) => (
              <ThemeTag
                key={`draft-${i}`}
                theme={{
                  id: `draft-${i}`, nucleusId: '', name: d.name, color: d.color,
                  status: 'emerging', proposedAt: new Date(),
                }}
                size="sm"
              />
            ))}
            {!proposing ? (
              <button
                type="button"
                onClick={() => setProposing(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-white/40 border border-dashed border-stone-300 rounded-md px-2.5 py-1 hover:bg-white/80"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Propose new theme
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-md px-2 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addDraftTheme(); }}
                  placeholder="Theme name"
                  className="text-xs bg-transparent focus:outline-none w-32"
                />
                <select
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="text-xs bg-transparent focus:outline-none"
                >
                  {THEME_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className={`w-3 h-3 rounded-sm ${themePalette(newColor).dot}`} aria-hidden />
                <button onClick={addDraftTheme} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">Add</button>
                <button onClick={() => { setProposing(false); setNewName(''); }} className="text-xs text-stone-500 hover:text-stone-700">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={handleSave}
          disabled={!hasContent || saving}
          className="px-4 py-2 bg-stone-800 text-amber-50 text-sm font-semibold rounded-lg hover:bg-stone-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save entry'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          Cancel
        </button>
        {mode === 'create' && (
          <span className="text-xs text-stone-500 italic font-journal ml-auto">
            Entries are timestamped and kept as part of the notebook.
          </span>
        )}
        {mode === 'edit' && (
          <span className="text-xs text-amber-700 italic font-journal ml-auto">
            Editing will overwrite the previous text.
          </span>
        )}
      </div>
    </div>
  );
}
