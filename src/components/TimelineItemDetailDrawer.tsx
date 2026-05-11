import React, { useEffect, useState } from 'react';
import {
  XIcon,
  PencilIcon,
  Trash2Icon,
  FileTextIcon,
  LinkIcon,
  UploadIcon,
  DownloadIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UsersIcon,
  MapPinIcon,
  CalendarIcon,
  ClockIcon,
} from 'lucide-react';
import type { TimelineEvent, TimelineItemNote } from '../types';
import {
  addDocumentNote,
  addLinkNote,
  addTextNote,
  deleteTimelineItemNote,
  fetchTimelineItemNotes,
  getDocumentDownloadUrl,
} from '../lib/db/timeline';
import { formatShortDate } from '../lib/timeline/dateRange';
import { useIsMobile } from '../lib/useIsMobile';

interface TimelineItemDetailDrawerProps {
  item: TimelineEvent;
  // Whether the signed-in user may attach / remove notes and edit the
  // parent timeline item. The drawer hides the corresponding
  // affordances when false.
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

type Tab = 'details' | 'notes';

// Bottom-attached detail panel for a clicked timeline item.
//
// Desktop: a resizable bottom drawer pinned across the full width
// (so the timeline above it stays panable/zoomable without the panel
// occluding selection). Mobile: a slide-up bottom sheet that takes
// the lower portion of the screen.
//
// We intentionally avoid anchoring the panel to the clicked item's
// pixel coordinates — the timeline can pan / zoom / re-pack lanes
// while the panel is open, and a coordinate-tied popup would jitter
// or drift offscreen.
export function TimelineItemDetailDrawer({
  item,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: TimelineItemDetailDrawerProps) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('details');
  const [notes, setNotes] = useState<TimelineItemNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [drawerHeight, setDrawerHeight] = useState(320);
  // Mobile bottom sheet has a single collapsed / expanded state, so
  // users can keep a thumbprint of the timeline visible.
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Re-fetch notes when the selected item changes. We don't optimistically
  // share notes across items — each click is a fresh load.
  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    setNotesError(null);
    fetchTimelineItemNotes(item.id)
      .then(rows => {
        if (cancelled) return;
        setNotes(rows);
      })
      .catch(err => {
        if (cancelled) return;
        setNotesError(err.message ?? 'Failed to load notes');
        setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const formatDateRange = () =>
    item.endDate
      ? `${formatShortDate(item.startDate)} – ${formatShortDate(item.endDate)}`
      : formatShortDate(item.startDate);

  // ── Type chip colors mirror the strip's event vs. meeting palette.
  const typeChip =
    item.itemType === 'meeting'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-blue-100 text-blue-800 border-blue-200';

  // ── Add-note staging form ──────────────────────────────────────────
  const [adding, setAdding] = useState<null | 'text' | 'link' | 'document'>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetAddForm = () => {
    setAdding(null);
    setNoteTitle('');
    setNoteBody('');
    setLinkUrl('');
    setLinkLabel('');
    setDocFile(null);
    setSaveError(null);
  };

  const submitNote = async () => {
    if (!adding) return;
    setSaving(true);
    setSaveError(null);
    try {
      let newNote: TimelineItemNote | null = null;
      if (adding === 'text') {
        if (!noteBody.trim()) {
          setSaveError('Note body is required.');
          setSaving(false);
          return;
        }
        newNote = await addTextNote({
          timelineItemId: item.id,
          title: noteTitle.trim() || undefined,
          bodyText: noteBody,
        });
      } else if (adding === 'link') {
        if (!linkUrl.trim()) {
          setSaveError('Link URL is required.');
          setSaving(false);
          return;
        }
        newNote = await addLinkNote({
          timelineItemId: item.id,
          title: noteTitle.trim() || undefined,
          linkUrl: linkUrl.trim(),
          linkLabel: linkLabel.trim() || undefined,
        });
      } else if (adding === 'document') {
        if (!docFile) {
          setSaveError('Pick a file to upload.');
          setSaving(false);
          return;
        }
        newNote = await addDocumentNote({
          timelineItemId: item.id,
          title: noteTitle.trim() || undefined,
          file: docFile,
        });
      }
      if (newNote) setNotes(prev => [newNote!, ...prev]);
      resetAddForm();
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteNote = async (note: TimelineItemNote) => {
    // Confirm only when there's a chance of destroying user content —
    // a tiny inline note has no recovery path either, but the upload
    // and the link cases are more painful to redo.
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteTimelineItemNote(note);
      setNotes(prev => prev.filter(n => n.id !== note.id));
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  const onDownload = async (note: TimelineItemNote) => {
    if (!note.filePath) return;
    try {
      const url = await getDocumentDownloadUrl(note.filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to generate download URL', err);
    }
  };

  // ── Drawer chrome geometry ─────────────────────────────────────────
  const rootStyle: React.CSSProperties = isMobile
    ? {
        height: mobileExpanded ? '75vh' : '45vh',
        maxHeight: '85vh',
      }
    : {
        height: `${drawerHeight}px`,
      };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-8px_30px_-4px_rgba(0,0,0,0.15)] z-50 flex flex-col font-sans"
      style={rootStyle}
      role="dialog"
      aria-label={`Details for ${item.name}`}
    >
      {/* Resize / expand grab handle */}
      {isMobile ? (
        <button
          onClick={() => setMobileExpanded(v => !v)}
          aria-label={mobileExpanded ? 'Collapse details' : 'Expand details'}
          className="flex items-center justify-center py-2 border-b border-gray-100 active:bg-gray-50"
        >
          <div className="w-10 h-1.5 rounded-full bg-gray-300" />
        </button>
      ) : (
        <div
          className="flex items-center justify-center py-1 border-b border-gray-100 bg-gray-50/40 cursor-row-resize select-none"
          onMouseDown={e => {
            e.preventDefault();
            const startY = e.clientY;
            const startH = drawerHeight;
            const onMove = (ev: MouseEvent) => {
              const next = startH - (ev.clientY - startY);
              setDrawerHeight(Math.max(180, Math.min(window.innerHeight * 0.85, next)));
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-start gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${typeChip}`}
            >
              {item.itemType === 'meeting' ? 'Meeting' : 'Event'}
            </span>
            {item.meetingType && (
              <span className="text-xs text-amber-700 font-semibold">
                {item.meetingType}
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
            {item.name}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canManage && (
            <>
              <button
                onClick={onEdit}
                title="Edit"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={onDelete}
                title="Delete"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </>
          )}
          <button
            onClick={onClose}
            aria-label="Close details"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-6 border-b border-gray-100 flex items-center gap-4 flex-shrink-0">
        <TabButton active={tab === 'details'} onClick={() => setTab('details')}>
          Details
        </TabButton>
        <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
          Notes & Documents
          {notes.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-md">
              {notes.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {tab === 'details' ? (
          <DetailsTab item={item} formatDateRange={formatDateRange} />
        ) : (
          <NotesTab
            notes={notes}
            loading={notesLoading}
            error={notesError}
            canManage={canManage}
            adding={adding}
            setAdding={setAdding}
            noteTitle={noteTitle}
            setNoteTitle={setNoteTitle}
            noteBody={noteBody}
            setNoteBody={setNoteBody}
            linkUrl={linkUrl}
            setLinkUrl={setLinkUrl}
            linkLabel={linkLabel}
            setLinkLabel={setLinkLabel}
            docFile={docFile}
            setDocFile={setDocFile}
            saveError={saveError}
            saving={saving}
            onSubmit={submitNote}
            onCancel={resetAddForm}
            onDelete={onDeleteNote}
            onDownload={onDownload}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative py-2.5 text-sm font-semibold transition-colors ${
        active ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-0 right-0 bottom-[-1px] h-0.5 bg-blue-600 rounded-t" />
      )}
    </button>
  );
}

function DetailsTab({
  item,
  formatDateRange,
}: {
  item: TimelineEvent;
  formatDateRange: () => string;
}) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <DetailRow icon={<CalendarIcon className="w-4 h-4" />} label="Date">
        {formatDateRange()}
      </DetailRow>
      {item.startTime && (
        <DetailRow icon={<ClockIcon className="w-4 h-4" />} label="Time">
          {item.startTime}
        </DetailRow>
      )}
      {item.location && (
        <DetailRow icon={<MapPinIcon className="w-4 h-4" />} label="Location">
          {item.location}
        </DetailRow>
      )}
      <DetailRow label="Item Type">
        {item.itemType === 'meeting' ? 'Meeting' : 'Event'}
      </DetailRow>
      {item.itemType === 'meeting' && item.meetingType && (
        <DetailRow label="Meeting Type">{item.meetingType}</DetailRow>
      )}
      {item.itemType === 'meeting' && item.attendees.length > 0 && (
        <div className="sm:col-span-2">
          <DetailRow
            icon={<UsersIcon className="w-4 h-4" />}
            label={`Attendees (${item.attendees.length})`}
          >
            <div className="flex flex-wrap gap-1.5 mt-1">
              {item.attendees.map((a, i) => (
                <span
                  key={`${a}-${i}`}
                  className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs font-medium"
                >
                  {a}
                </span>
              ))}
            </div>
          </DetailRow>
        </div>
      )}
      {item.createdAt && (
        <DetailRow label="Created">
          {item.createdAt.toLocaleString()}
        </DetailRow>
      )}
    </dl>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">
        {icon}
        {label}
      </dt>
      <dd className="text-gray-900 font-medium break-words">{children}</dd>
    </div>
  );
}

interface NotesTabProps {
  notes: TimelineItemNote[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  adding: null | 'text' | 'link' | 'document';
  setAdding: (k: null | 'text' | 'link' | 'document') => void;
  noteTitle: string;
  setNoteTitle: (s: string) => void;
  noteBody: string;
  setNoteBody: (s: string) => void;
  linkUrl: string;
  setLinkUrl: (s: string) => void;
  linkLabel: string;
  setLinkLabel: (s: string) => void;
  docFile: File | null;
  setDocFile: (f: File | null) => void;
  saveError: string | null;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete: (n: TimelineItemNote) => void;
  onDownload: (n: TimelineItemNote) => void;
}

function NotesTab(p: NotesTabProps) {
  return (
    <div className="space-y-4">
      {p.canManage && (
        <div>
          {p.adding ? (
            <AddNoteForm {...p} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => p.setAdding('text')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100"
              >
                <FileTextIcon className="w-3.5 h-3.5" />
                Paste Note
              </button>
              <button
                onClick={() => p.setAdding('document')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100"
              >
                <UploadIcon className="w-3.5 h-3.5" />
                Upload Document
              </button>
              <button
                onClick={() => p.setAdding('link')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-100"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                Add Link
              </button>
            </div>
          )}
        </div>
      )}

      {p.loading ? (
        <div className="text-sm text-gray-400 italic">Loading notes…</div>
      ) : p.error ? (
        <div className="text-sm text-red-600">Could not load notes: {p.error}</div>
      ) : p.notes.length === 0 ? (
        <div className="text-sm text-gray-400 italic">
          No notes or documents attached yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {p.notes.map(n => (
            <NoteCard
              key={n.id}
              note={n}
              canManage={p.canManage}
              onDelete={() => p.onDelete(n)}
              onDownload={() => p.onDownload(n)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddNoteForm(p: NotesTabProps) {
  const kindLabel =
    p.adding === 'text'
      ? 'Pasted Note'
      : p.adding === 'link'
      ? 'External Link'
      : 'Uploaded Document';
  return (
    <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">New {kindLabel}</h3>
        <button
          onClick={p.onCancel}
          className="text-gray-400 hover:text-gray-700"
          aria-label="Cancel"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <input
        type="text"
        value={p.noteTitle}
        onChange={e => p.setNoteTitle(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        placeholder="Title (optional)"
      />
      {p.adding === 'text' && (
        <textarea
          value={p.noteBody}
          onChange={e => p.setNoteBody(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
          placeholder="Paste your meeting notes here. We won't try to standardize or summarize them yet — your raw text is preserved as-is."
          autoFocus
        />
      )}
      {p.adding === 'link' && (
        <div className="space-y-2">
          <input
            type="url"
            value={p.linkUrl}
            onChange={e => p.setLinkUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="https://docs.google.com/document/d/..."
            autoFocus
          />
          <input
            type="text"
            value={p.linkLabel}
            onChange={e => p.setLinkLabel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Link label (optional) — e.g. Reflection notes (Google Doc)"
          />
        </div>
      )}
      {p.adding === 'document' && (
        <div className="space-y-2">
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => p.setDocFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          {p.docFile && (
            <p className="text-xs text-gray-500">
              {p.docFile.name} · {(p.docFile.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
      )}
      {p.saveError && (
        <p className="text-xs text-red-600 font-medium">{p.saveError}</p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={p.onCancel}
          className="px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={p.onSubmit}
          disabled={p.saving}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {p.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  canManage,
  onDelete,
  onDownload,
}: {
  note: TimelineItemNote;
  canManage: boolean;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const longText = note.kind === 'text' && (note.bodyText?.length ?? 0) > 280;

  const kindBadge = (() => {
    switch (note.kind) {
      case 'text':
        return { label: 'Note', class: 'bg-blue-100 text-blue-800', icon: <FileTextIcon className="w-3 h-3" /> };
      case 'document':
        return { label: 'Document', class: 'bg-emerald-100 text-emerald-800', icon: <UploadIcon className="w-3 h-3" /> };
      case 'link':
        return { label: 'Link', class: 'bg-purple-100 text-purple-800', icon: <LinkIcon className="w-3 h-3" /> };
    }
  })();

  return (
    <li className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="flex items-start gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${kindBadge.class}`}
        >
          {kindBadge.icon}
          {kindBadge.label}
        </span>
        {note.title && (
          <h4 className="text-sm font-semibold text-gray-900 flex-1 min-w-0 truncate">
            {note.title}
          </h4>
        )}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {note.kind === 'document' && (
            <button
              onClick={onDownload}
              title="Download"
              className="p-1 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded"
            >
              <DownloadIcon className="w-4 h-4" />
            </button>
          )}
          {canManage && (
            <button
              onClick={onDelete}
              title="Delete"
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2Icon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {note.kind === 'text' && note.bodyText && (
        <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
          {expanded || !longText
            ? note.bodyText
            : `${note.bodyText.slice(0, 280)}…`}
          {longText && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="ml-2 text-xs text-blue-700 font-semibold inline-flex items-center gap-0.5"
            >
              {expanded ? (
                <>
                  <ChevronUpIcon className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDownIcon className="w-3 h-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {note.kind === 'document' && (
        <div className="text-sm text-gray-700">
          <span className="font-medium">{note.fileName}</span>
          {note.fileSizeBytes !== undefined && (
            <span className="text-gray-500 ml-2 text-xs">
              {(note.fileSizeBytes / 1024).toFixed(0)} KB
            </span>
          )}
        </div>
      )}

      {note.kind === 'link' && note.linkUrl && (
        <a
          href={note.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-purple-700 hover:underline font-medium break-all"
        >
          <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {note.linkLabel || note.linkUrl}
        </a>
      )}

      <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
        {note.createdByName && (
          <span className="font-medium">{note.createdByName}</span>
        )}
        <span>·</span>
        <span>{note.createdAt.toLocaleString()}</span>
      </div>
    </li>
  );
}

