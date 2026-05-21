import React, { useEffect, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { ThemeTag, themePalette } from './ThemeTag';
import { THEME_COLORS } from '../lib/db/journal';
import type { LearningTheme } from '../types';

// Shows an entry's APPLIED themes as a row of chips. Addable
// themes never sit inline next to applied ones (which made every
// entry look like it carried every theme); instead a "+ Tag"
// button opens a popover bubble of not-yet-applied themes.

interface ThemeTagEditorProps {
  applied: LearningTheme[];
  available: LearningTheme[];   // not-yet-applied, non-archived
  canEdit: boolean;
  onAdd: (themeId: string) => void | Promise<void>;
  onRemove: (themeId: string) => void | Promise<void>;
  // Optional: allow proposing a brand-new emerging theme from the popover.
  onPropose?: (args: { name: string; color: string }) => void | Promise<void>;
  emptyLabel?: string;
}

export function ThemeTagEditor({
  applied, available, canEdit, onAdd, onRemove, onPropose, emptyLabel = 'No themes yet',
}: ThemeTagEditorProps) {
  const [open, setOpen] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('amber');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setProposing(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setProposing(false); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {applied.map(t => (
        <span key={t.id} className="inline-flex items-center gap-1">
          <ThemeTag theme={t} size="sm" showIcon />
          {canEdit && (
            <button
              onClick={() => onRemove(t.id)}
              title="Remove tag"
              className="text-stone-400 hover:text-rose-600 text-xs"
            >×</button>
          )}
        </span>
      ))}
      {applied.length === 0 && !canEdit && (
        <span className="text-xs italic text-stone-400 font-journal">{emptyLabel}</span>
      )}

      {canEdit && (
        <div className="relative" ref={wrapRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 bg-white/50 border border-dashed border-stone-300 rounded-md px-2 py-0.5 hover:bg-white"
          >
            <PlusIcon className="w-3 h-3" /> Tag
          </button>

          {open && (
            <div className="absolute z-20 top-full left-0 mt-1.5 w-64 bg-white border border-amber-900/20 rounded-xl shadow-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">
                Add a learning theme
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {available.length === 0 && !proposing && (
                  <span className="text-xs italic text-stone-400">All themes applied.</span>
                )}
                {available.map(t => (
                  <ThemeTag
                    key={t.id}
                    theme={t}
                    size="sm"
                    onClick={async () => { await onAdd(t.id); }}
                  />
                ))}
              </div>

              {onPropose && (
                <div className="mt-2.5 pt-2.5 border-t border-stone-100">
                  {!proposing ? (
                    <button
                      onClick={() => setProposing(true)}
                      className="text-xs font-medium text-stone-600 hover:text-stone-900"
                    >+ Propose new theme</button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Theme name"
                        className="text-xs bg-transparent border-b border-stone-300 focus:outline-none flex-1 min-w-0"
                      />
                      <select value={newColor} onChange={e => setNewColor(e.target.value)} className="text-xs bg-transparent">
                        {THEME_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className={`w-3 h-3 rounded-sm ${themePalette(newColor).dot}`} />
                      <button
                        onClick={async () => {
                          if (!newName.trim() || !onPropose) return;
                          await onPropose({ name: newName.trim(), color: newColor });
                          setNewName(''); setProposing(false);
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                      >Add</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
