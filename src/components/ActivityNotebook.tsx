import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarIcon,
  LightbulbIcon,
  SproutIcon,
  FlagTriangleRightIcon,
  UserPlusIcon,
  CornerUpRightIcon,
  PlusIcon,
  HelpCircleIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  listEntriesForActivity,
  listThemesForNucleus,
  createActivityEntry,
  updateActivityEntry,
  deleteActivityEntry,
  addThemesToEntry,
  removeThemeFromEntry,
  proposeTheme,
  THEME_COLORS,
  type NewActivityEntry,
} from '../lib/db/journal';
import type { JournalEntry, LearningTheme } from '../types';
import { ThemeTag, themePalette } from './ThemeTag';
import { ThemeTagEditor } from './ThemeTagEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { NotebookSpiral } from './NotebookSpiral';
import { EntryTabs } from './EntryTabs';

interface RosterPerson {
  id: string;
  name: string;
}

interface ActivityNotebookProps {
  activityId: string;
  nucleusId: string;
  readOnly: boolean;
  // The activity's standing participant roster (deduped across
  // roles). Drives the attendance checkboxes in the composer.
  roster: RosterPerson[];
  // Fired after an entry is created, edited, or deleted, so the
  // parent can refresh anything derived from entries (e.g. the
  // attendance trends shown on the roster).
  onEntriesChanged?: () => void;
}

// The two fields the composer captures today. `learning` replaced
// the four detailed prompts below.
const COMPOSER_FIELDS = [
  {
    key: 'whatHappened',
    label: 'What happened?',
    Icon: PencilIcon,
    color: 'text-violet-700',
    placeholder: 'Describe what happened during the activity…',
  },
  {
    key: 'learning',
    label: 'Learning',
    hint: '(insights, questions, etc.)',
    Icon: LightbulbIcon,
    color: 'text-emerald-700',
    placeholder: 'What are we learning? Any insights, questions, or next steps?',
  },
] as const;
type ComposerKey = typeof COMPOSER_FIELDS[number]['key'];

// Every field rendered in the read view, in display order. The
// trailing four are legacy prompts that the composer no longer
// offers; they stay here so historical entries keep showing their
// original text.
const READ_FIELDS = [
  { key: 'whatHappened',     label: 'What happened?',    Icon: PencilIcon,            color: 'text-violet-700' },
  { key: 'learning',         label: 'Learning',          Icon: LightbulbIcon,         color: 'text-emerald-700' },
  { key: 'encouragingSigns', label: 'Encouraging signs', Icon: SproutIcon,            color: 'text-emerald-700' },
  { key: 'challenges',       label: 'Challenges',        Icon: FlagTriangleRightIcon, color: 'text-rose-700' },
  { key: 'peopleEmerging',   label: 'People emerging',   Icon: UserPlusIcon,          color: 'text-sky-700' },
  { key: 'followUp',         label: 'Follow-up needed',  Icon: CornerUpRightIcon,     color: 'text-amber-700' },
] as const;
type ReadKey = typeof READ_FIELDS[number]['key'];

function formatEntryDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
// <input type="date"> works in local time; format/parse around
// local noon so the chosen calendar day survives the UTC round-trip
// to occurred_at regardless of the viewer's timezone.
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromDateInputValue(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function ActivityNotebook({ activityId, nucleusId, readOnly, roster, onEntriesChanged }: ActivityNotebookProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [themes, setThemes] = useState<LearningTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editConfirmFor, setEditConfirmFor] = useState<string | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visibleThemes = useMemo(() => themes.filter(t => t.status !== 'archived'), [themes]);

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

  // Reload after a create/edit/delete and notify the parent so
  // entry-derived UI (attendance trends) refreshes too.
  const reload = async () => { await load(); onEntriesChanged?.(); };

  useEffect(() => { load(); }, [activityId, nucleusId]);

  return (
    <div className="relative">
      <NotebookSpiral />
      <div className="bg-notebook-paper rounded-b-2xl shadow-xl px-5 sm:px-9 pt-5 pb-7 relative">
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
            themes={visibleThemes}
            roster={roster}
            onCancel={() => setComposerOpen(false)}
            onSubmit={async (entry, newThemes) => {
              const created: LearningTheme[] = [];
              for (const nt of newThemes) {
                created.push(await proposeTheme(nucleusId, { name: nt.name, color: nt.color }));
              }
              const allThemeIds = [...entry.themeIds, ...created.map(t => t.id)];
              await createActivityEntry(nucleusId, activityId, { ...entry, themeIds: allThemeIds });
              setComposerOpen(false);
              await reload();
            }}
          />
        )}

        <div className="mt-4">
          {loading && (
            <p className="text-sm text-stone-500 italic font-journal">Opening the notebook…</p>
          )}
          {!loading && (
            <EntryTabs
              entries={entries}
              emptyLabel={readOnly ? 'No entries yet.' : 'No entries yet. Write the first reflection from this activity.'}
              activeClass="bg-stone-800 text-amber-50"
              inactiveClass="bg-white/50 text-stone-600 hover:bg-white"
              renderEntry={(entry) =>
                editingEntryId === entry.id ? (
                  <EntryComposer
                    mode="edit"
                    initial={entry}
                    themes={visibleThemes}
                    roster={roster}
                    onCancel={() => setEditingEntryId(null)}
                    onSubmit={async (patch) => {
                      await updateActivityEntry(entry.id, patch);
                      setEditingEntryId(null);
                      await reload();
                    }}
                  />
                ) : (
                  <EntryView
                    entry={entry}
                    availableThemes={visibleThemes}
                    readOnly={readOnly}
                    onStartEdit={() => setEditConfirmFor(entry.id)}
                    onStartDelete={() => setDeleteConfirmFor(entry.id)}
                    onAddTheme={async (themeId) => { await addThemesToEntry(entry.id, [themeId]); await load(); }}
                    onRemoveTheme={async (themeId) => { await removeThemeFromEntry(entry.id, themeId); await load(); }}
                    onProposeTheme={async ({ name, color }) => {
                      const t = await proposeTheme(nucleusId, { name, color });
                      await addThemesToEntry(entry.id, [t.id]);
                      await load();
                    }}
                  />
                )
              }
            />
          )}
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

      <ConfirmDialog
        open={!!deleteConfirmFor}
        title="Delete this entry?"
        message={
          <>
            This permanently removes the entry — its text, attendance, and
            theme tags — for everyone. This cannot be undone. Continue?
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Yes, delete'}
        onCancel={() => { if (!deleting) setDeleteConfirmFor(null); }}
        onConfirm={async () => {
          if (!deleteConfirmFor || deleting) return;
          setDeleting(true);
          try {
            await deleteActivityEntry(deleteConfirmFor);
            setDeleteConfirmFor(null);
            await reload();
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}


// ─── Read view of an entry ──────────────────────────────────

interface EntryViewProps {
  entry: JournalEntry;
  availableThemes: LearningTheme[];
  readOnly: boolean;
  onStartEdit: () => void;
  onStartDelete: () => void;
  onAddTheme: (themeId: string) => Promise<void> | void;
  onRemoveTheme: (themeId: string) => Promise<void> | void;
  onProposeTheme: (args: { name: string; color: string }) => Promise<void>;
}

function EntryView({
  entry, availableThemes, readOnly,
  onStartEdit, onStartDelete, onAddTheme, onRemoveTheme, onProposeTheme,
}: EntryViewProps) {
  const taggedIds = useMemo(() => new Set(entry.themes.map(t => t.id)), [entry.themes]);
  const addable = useMemo(
    () => availableThemes.filter(t => !taggedIds.has(t.id)),
    [availableThemes, taggedIds],
  );
  return (
    <article className="bg-white/60 border border-amber-900/15 rounded-xl px-4 sm:px-5 py-4 shadow-sm">
      <header className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2 text-stone-600">
          <CalendarIcon className="w-4 h-4 text-stone-400" />
          <span className="font-medium text-sm">{formatEntryDate(entry.occurredAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          {entry.authorName && (
            <span className="font-journal italic text-xs text-stone-500">— {entry.authorName}</span>
          )}
          {!readOnly && (
            <>
              <button
                onClick={onStartEdit}
                title="Edit entry"
                className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded transition"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onStartDelete}
                title="Delete entry"
                className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="space-y-3">
        {READ_FIELDS.map(p => {
          const value = entry[p.key as ReadKey];
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
        {entry.body && !READ_FIELDS.some(p => entry[p.key as ReadKey]) && (
          <p className="font-journal text-stone-700 whitespace-pre-wrap">{entry.body}</p>
        )}
        {entry.attendees.length > 0 && (
          <div className="flex gap-3">
            <UserPlusIcon className="w-5 h-5 mt-0.5 flex-shrink-0 text-sky-700" />
            <div>
              <div className="font-handwritten text-lg leading-none text-sky-700">
                Attendance
                <span className="font-journal text-sm text-stone-500 ml-2">
                  {entry.attendees.length} {entry.attendees.length === 1 ? 'person' : 'people'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {entry.attendees.map(a => (
                  <span
                    key={a.id}
                    className="inline-flex items-center text-sm font-journal text-stone-700 bg-white/70 border border-amber-900/15 rounded-full px-2.5 py-0.5"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-amber-900/10">
        <ThemeTagEditor
          applied={entry.themes}
          available={addable}
          canEdit={!readOnly}
          onAdd={onAddTheme}
          onRemove={onRemoveTheme}
          onPropose={onProposeTheme}
        />
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


// ─── Composer (create + edit) ────────────────────────────────

interface ComposerProps {
  mode: 'create' | 'edit';
  initial?: JournalEntry;
  themes: LearningTheme[];
  roster: RosterPerson[];
  onCancel: () => void;
  onSubmit: (
    entry: NewActivityEntry,
    newThemes: { name: string; color: string }[],
  ) => Promise<void>;
}

function EntryComposer({ mode, initial, themes, roster, onCancel, onSubmit }: ComposerProps) {
  const [values, setValues] = useState<Record<ComposerKey, string>>({
    whatHappened: initial?.whatHappened ?? '',
    learning: initial?.learning ?? '',
  });
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(
    new Set(initial?.themes.map(t => t.id) ?? []),
  );
  // Attendance. Create starts empty (all unchecked); edit seeds
  // from whoever was recorded on the entry.
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(
    new Set(initial?.attendees.map(a => a.id) ?? []),
  );
  // Activity date. Create defaults to today; edit seeds from the
  // entry's occurred_at.
  const [activityDate, setActivityDate] = useState<string>(
    toDateInputValue(initial?.occurredAt ?? new Date()),
  );
  const [draftThemes, setDraftThemes] = useState<{ name: string; color: string }[]>([]);
  const [proposing, setProposing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>('amber');
  const [saving, setSaving] = useState(false);

  const hasContent = Object.values(values).some(v => v.trim().length > 0);

  const toggleAttendee = (id: string) => {
    setAttendeeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // People shown as checkboxes: the live roster, plus anyone the
  // entry already recorded who has since left the roster (edit
  // mode) so we never silently drop a recorded attendee.
  const attendanceChoices = useMemo<RosterPerson[]>(() => {
    const byId = new Map<string, RosterPerson>();
    for (const p of roster) byId.set(p.id, p);
    for (const a of initial?.attendees ?? []) {
      if (!byId.has(a.id)) byId.set(a.id, { id: a.id, name: a.name });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [roster, initial]);

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
    if (themes.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
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
        {
          ...values,
          themeIds: Array.from(selectedThemeIds),
          attendeeIds: Array.from(attendeeIds),
          occurredAt: activityDate ? fromDateInputValue(activityDate) : undefined,
        },
        draftThemes,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/85 border border-amber-900/25 rounded-xl px-4 sm:px-5 py-4 mb-4 shadow-sm">
      {mode === 'edit' && (
        <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold mb-3">
          Editing entry
        </div>
      )}

      {/* ─── Activity date ────────────────────────────────────── */}
      <div className="flex gap-3 mb-4">
        <CalendarIcon className="w-5 h-5 mt-1.5 flex-shrink-0 text-stone-600" />
        <div className="flex-1">
          <label className="font-handwritten text-lg leading-none text-stone-700">
            Activity date
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="date"
              value={activityDate}
              max={toDateInputValue(new Date())}
              onChange={e => setActivityDate(e.target.value)}
              className="font-journal text-stone-800 bg-transparent border-b border-dashed border-stone-300 focus:outline-none focus:border-stone-500 py-0.5"
            />
            <button
              type="button"
              onClick={() => setActivityDate(toDateInputValue(new Date()))}
              className="text-xs font-medium text-stone-600 bg-white/60 border border-stone-300 rounded-md px-2.5 py-1 hover:bg-white"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {COMPOSER_FIELDS.map(p => (
          <div key={p.key} className="flex gap-3">
            <p.Icon className={`w-5 h-5 mt-1.5 flex-shrink-0 ${p.color}`} />
            <div className="flex-1">
              <label className={`font-handwritten text-lg leading-none ${p.color}`}>
                {p.label}
                {'hint' in p && p.hint && (
                  <span className="font-journal text-sm text-stone-500 ml-2">{p.hint}</span>
                )}
              </label>
              <textarea
                value={values[p.key as ComposerKey]}
                onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))}
                rows={3}
                className="mt-1 w-full font-journal text-stone-800 bg-transparent border-b border-dashed border-stone-300 focus:outline-none focus:border-stone-500 resize-none placeholder:text-stone-400 placeholder:italic"
                placeholder={p.placeholder}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ─── Attendance ───────────────────────────────────────── */}
      <div className="mt-5 pt-4 border-t border-amber-900/10">
        <div className="flex items-baseline gap-2 mb-1">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="w-5 h-5 text-sky-700" />
            <span className="font-handwritten text-lg leading-none text-sky-700">Attendance</span>
          </div>
          <span className="font-journal text-sm text-stone-500">Check who attended this activity.</span>
        </div>
        {attendanceChoices.length === 0 ? (
          <p className="font-journal italic text-sm text-stone-500 mt-2">
            No one is on this activity's participant list yet. Add participants under
            “Participants by Role” above and they'll appear here to check off.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 mt-2">
              {attendanceChoices.map(p => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-sm font-journal text-stone-700 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={attendeeIds.has(p.id)}
                    onChange={() => toggleAttendee(p.id)}
                    className="w-4 h-4 rounded border-stone-400 text-sky-700 focus:ring-sky-500"
                  />
                  {p.name}
                </label>
              ))}
            </div>
            <p className="font-journal italic text-xs text-stone-500 mt-3">
              If anyone not listed here attended, please add them to the activity
              participants list above — they'll then appear as a checkbox.
            </p>
          </>
        )}
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
            {themes.map(t => (
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
        {mode === 'edit' && (
          <span className="text-xs text-amber-700 italic font-journal ml-auto">
            Editing will overwrite the previous text.
          </span>
        )}
      </div>
    </div>
  );
}
