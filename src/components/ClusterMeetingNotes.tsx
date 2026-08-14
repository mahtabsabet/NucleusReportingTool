import React, { useEffect, useState } from 'react';
import { useUnsavedChanges } from '../lib/unsavedChanges';
import { ChevronRightIcon, PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import {
  listClusterMeetingNotes,
  createClusterMeetingNote,
  updateClusterMeetingNote,
  deleteClusterMeetingNote,
} from '../lib/db/clusterMeetings';
import type { ClusterMeetingNote } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

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

// A general cluster-agency / inter-institutional meeting log, kept
// separate from the theme-based learning columns below it. Rows are
// collapsed to just a date + title; clicking one expands it in place.
export function ClusterMeetingNotes({
  clusterId, canEdit,
}: {
  clusterId: string;
  canEdit: boolean;
}) {
  const [notes, setNotes] = useState<ClusterMeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConfirmFor, setEditConfirmFor] = useState<string | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => setNotes(await listClusterMeetingNotes(clusterId));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  return (
    <section className="bg-white/60 border border-amber-900/15 rounded-2xl p-4 sm:p-5 mb-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-amber-800/80 font-journal">
          Cluster Meetings
        </h2>
        {canEdit && !composerOpen && (
          <button
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-900"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Add meeting note
          </button>
        )}
      </div>
      <p className="font-journal italic text-stone-600 text-sm mb-3">
        General cluster-agency and inter-institutional meeting notes — not tied to a theme.
      </p>

      {composerOpen && (
        <MeetingNoteComposer
          mode="create"
          onCancel={() => setComposerOpen(false)}
          onSubmit={async (params) => {
            await createClusterMeetingNote(clusterId, params);
            setComposerOpen(false);
            await load();
          }}
        />
      )}

      {loading && <p className="font-journal italic text-stone-500 text-sm">Gathering meeting notes…</p>}
      {!loading && notes.length === 0 && !composerOpen && (
        <p className="font-journal italic text-stone-500 text-sm">No meeting notes yet.</p>
      )}

      <div className="divide-y divide-amber-900/10">
        {notes.map(note => (
          editingId === note.id ? (
            <div key={note.id} className="py-3">
              <MeetingNoteComposer
                mode="edit"
                initial={note}
                onCancel={() => setEditingId(null)}
                onSubmit={async (params) => {
                  await updateClusterMeetingNote(note.id, params);
                  setEditingId(null);
                  await load();
                }}
              />
            </div>
          ) : (
            <div key={note.id} className="py-2.5 group">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <ChevronRightIcon
                    className={`w-3.5 h-3.5 text-stone-400 flex-shrink-0 transition-transform ${expandedId === note.id ? 'rotate-90' : ''}`}
                  />
                  <span className="text-xs text-stone-500 font-journal italic flex-shrink-0">
                    {note.occurredAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="font-journal text-stone-800 truncate">{note.title}</span>
                </button>
                {canEdit && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => setEditConfirmFor(note.id)}
                      title="Edit meeting note"
                      className="p-0.5 text-stone-400 hover:text-stone-700"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmFor(note.id)}
                      title="Delete meeting note"
                      className="p-0.5 text-stone-400 hover:text-rose-600"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {expandedId === note.id && (
                <div className="pl-6 mt-2 pb-1">
                  <p className="font-journal text-stone-700 text-base leading-relaxed whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <p className="font-journal italic text-[11px] text-stone-400 mt-2">
                    {note.authorName && `Written by ${note.authorName}`}
                    {note.editedAt && (
                      <>
                        {note.authorName ? ' · ' : ''}
                        Edited {note.editedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                        {note.editedByName ? ` by ${note.editedByName}` : ''}
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          )
        ))}
      </div>

      <ConfirmDialog
        open={!!editConfirmFor}
        title="Edit this meeting note?"
        message={
          <>
            Edits overwrite the previous text and are visible to anyone who reads
            the cluster's meeting notes. The note will be marked as edited and
            stamped with your name. Continue?
          </>
        }
        confirmLabel="Yes, edit"
        onCancel={() => setEditConfirmFor(null)}
        onConfirm={() => {
          if (editConfirmFor) { setEditingId(editConfirmFor); setExpandedId(null); }
          setEditConfirmFor(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteConfirmFor}
        title="Delete this meeting note?"
        message={
          <>
            This permanently removes the meeting note for everyone. This cannot
            be undone. Continue?
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Yes, delete'}
        onCancel={() => { if (!deleting) setDeleteConfirmFor(null); }}
        onConfirm={async () => {
          if (!deleteConfirmFor || deleting) return;
          setDeleting(true);
          try {
            await deleteClusterMeetingNote(deleteConfirmFor);
            setDeleteConfirmFor(null);
            await load();
          } finally {
            setDeleting(false);
          }
        }}
      />
    </section>
  );
}


// ─── Composer (create + edit) ────────────────────────────────

function MeetingNoteComposer({
  mode, initial, onCancel, onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: ClusterMeetingNote;
  onCancel: () => void;
  onSubmit: (params: { title: string; body: string; occurredAt: Date }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [date, setDate] = useState(toDateInputValue(initial?.occurredAt ?? new Date()));
  const [saving, setSaving] = useState(false);

  // Unsaved-changes guard: warn before leaving with an in-progress note.
  // (Cancel is a deliberate discard, so it is not guarded.)
  const dirty =
    title !== (initial?.title ?? '')
    || body !== (initial?.body ?? '')
    || date !== toDateInputValue(initial?.occurredAt ?? new Date());
  useUnsavedChanges(dirty);

  const valid = title.trim().length > 0 && body.trim().length > 0;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try { await onSubmit({ title, body, occurredAt: fromDateInputValue(date) }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-amber-50/40 border border-amber-900/20 rounded-xl p-3 mb-3">
      <div className="flex items-center gap-3 mb-2">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Meeting name (e.g. Quarterly cluster agency check-in)"
          className="flex-1 min-w-0 bg-transparent font-journal text-lg text-stone-800 border-b border-stone-300 focus:outline-none focus:border-stone-500"
        />
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="flex-shrink-0 bg-white/70 border border-stone-300 rounded-md px-2 py-1 text-sm text-stone-700"
        />
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={5}
        placeholder="What was discussed?"
        className="w-full bg-transparent font-journal text-stone-800 text-base leading-relaxed focus:outline-none placeholder:italic placeholder:text-stone-400 resize-y"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          disabled={!valid || saving}
          onClick={handleSave}
          className="px-3 py-1.5 bg-stone-800 text-amber-50 text-xs font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add meeting note'}
        </button>
        <button onClick={onCancel} className="px-2 py-1.5 text-xs text-stone-600 hover:text-stone-900">
          Cancel
        </button>
      </div>
    </div>
  );
}
