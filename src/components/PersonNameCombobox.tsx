import React, { useState, useEffect, useRef } from 'react';
import { PlusIcon, UserIcon, UserPlusIcon } from 'lucide-react';
import { searchPersonsByName, type PersonSearchMatch } from '../lib/db/persons';
import type { AgeGroup } from '../lib/database.types';
import { ageGroupAllowsMinorToggle } from '../lib/persons/disambiguators';

// The combobox treats `Person.id` as the only identifier. Two people may
// share a name; users disambiguate by picking a row whose contextual
// labels match the person they mean, or by explicitly declaring "this is
// a different person" via the separated create row. There is no silent
// auto-select on Enter when matches exist.

export interface AddPersonParams {
  name: string;
  existingPersonId?: string;
  ageGroup?: AgeGroup;
  minorOverride?: boolean;
}

interface PersonNameComboboxProps {
  placeholder?: string;
  onAdd: (params: AddPersonParams) => Promise<void>;
}

const AGE_GROUP_OPTIONS: Array<{ value: AgeGroup; label: string; hint?: string }> = [
  { value: 'child', label: 'Child', hint: "Children's class age — minor" },
  { value: 'junior_youth', label: 'Junior Youth', hint: 'JY group age — minor' },
  { value: 'youth', label: 'Youth', hint: 'Choose Under 18 if applicable' },
  { value: 'adult', label: 'Adult' },
  { value: 'unknown', label: 'Unknown', hint: 'Pick later' },
];

export function PersonNameCombobox({
  placeholder = 'Add name...',
  onAdd,
}: PersonNameComboboxProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<PersonSearchMatch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isAdding, setIsAdding] = useState(false);
  // Surfaces add/select failures inline so they don't silently vanish into an
  // unhandled promise rejection. Both onAdd call sites set this in catch().
  const [addError, setAddError] = useState<string | null>(null);

  // New-profile dialog state
  const [showNewProfileForm, setShowNewProfileForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileAgeGroup, setNewProfileAgeGroup] = useState<AgeGroup>('unknown');
  const [newProfileMinor, setNewProfileMinor] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newProfileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowNewProfileForm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!inputValue.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchPersonsByName(inputValue);
      setSuggestions(results);
      setIsOpen(true);
      setHighlightedIndex(-1);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  const trimmed = inputValue.trim();
  const hasSuggestions = suggestions.length > 0;

  // Navigable rows = every match plus the explicit "different person" row.
  // When there are no matches the create row stands alone.
  const totalRows = suggestions.length + (trimmed ? 1 : 0);

  const selectExisting = async (match: PersonSearchMatch) => {
    setIsOpen(false);
    setAddError(null);
    setIsAdding(true);
    try {
      await onAdd({ name: match.name, existingPersonId: match.id });
      setInputValue('');
      setSuggestions([]);
    } catch (err: any) {
      setAddError(err?.message ?? 'Failed to add person.');
    } finally {
      setIsAdding(false);
    }
  };

  const openNewProfileForm = () => {
    setIsOpen(false);
    setNewProfileName(trimmed);
    setNewProfileAgeGroup('unknown');
    setNewProfileMinor(false);
    setShowNewProfileForm(true);
    setTimeout(() => newProfileInputRef.current?.focus(), 0);
  };

  const submitNewProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    setAddError(null);
    setIsAdding(true);
    try {
      await onAdd({
        name,
        ageGroup: newProfileAgeGroup,
        minorOverride: ageGroupAllowsMinorToggle(newProfileAgeGroup) ? newProfileMinor : undefined,
      });
      setInputValue('');
      setSuggestions([]);
      setShowNewProfileForm(false);
    } catch (err: any) {
      setAddError(err?.message ?? 'Failed to add person.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      // Enter with no dropdown open: only the no-matches case may proceed
      // straight to a create dialog. With matches present we never act
      // without an explicit selection.
      if (e.key === 'Enter' && trimmed && !hasSuggestions) openNewProfileForm();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, totalRows - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < 0) {
        // No row highlighted → never silently pick the top match. The
        // only safe Enter action is opening the create dialog when there
        // are zero matches.
        if (trimmed && !hasSuggestions) openNewProfileForm();
        return;
      }
      if (highlightedIndex < suggestions.length) {
        selectExisting(suggestions[highlightedIndex]);
      } else {
        openNewProfileForm();
      }
    }
  };

  const minorToggleAvailable = ageGroupAllowsMinorToggle(newProfileAgeGroup);
  const minorForcedTrue = newProfileAgeGroup === 'child' || newProfileAgeGroup === 'junior_youth';

  return (
    <div ref={containerRef} className="relative pt-2">
      {showNewProfileForm ? (
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
              Name
            </label>
            <input
              ref={newProfileInputRef}
              type="text"
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitNewProfile();
                } else if (e.key === 'Escape') {
                  setShowNewProfileForm(false);
                }
              }}
              placeholder="Enter name for new profile..."
              disabled={isAdding}
              className="w-full px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-50"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
              Age group
            </label>
            <select
              value={newProfileAgeGroup}
              onChange={e => {
                const v = e.target.value as AgeGroup;
                setNewProfileAgeGroup(v);
                if (!ageGroupAllowsMinorToggle(v)) setNewProfileMinor(false);
              }}
              disabled={isAdding}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-50"
            >
              {AGE_GROUP_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {AGE_GROUP_OPTIONS.find(o => o.value === newProfileAgeGroup)?.hint && (
              <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                {AGE_GROUP_OPTIONS.find(o => o.value === newProfileAgeGroup)?.hint}
              </p>
            )}
          </div>
          {minorToggleAvailable && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={newProfileMinor}
                onChange={e => setNewProfileMinor(e.target.checked)}
                disabled={isAdding}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Under 18 (minor)
            </label>
          )}
          {minorForcedTrue && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 leading-snug">
              Minors — email and phone will not be collected.
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowNewProfileForm(false)}
              disabled={isAdding}
              className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitNewProfile}
              disabled={!newProfileName.trim() || isAdding}
              className="flex-1 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAdding ? 'Adding…' : 'Add Person'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onFocus={() => {
              if (trimmed && suggestions.length > 0) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isAdding}
            className="flex-1 px-3.5 py-2.5 text-sm font-medium border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-50"
            autoComplete="off"
          />
          <button
            onClick={() => {
              if (!trimmed) return;
              openNewProfileForm();
            }}
            disabled={!trimmed || isAdding}
            className="px-3.5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed"
            title="Create new profile"
          >
            <PlusIcon className="w-4 h-4" />
          </button>

          {isOpen && totalRows > 0 && (
            <div className="absolute z-30 bottom-full mb-1 left-0 right-10 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  onMouseDown={e => {
                    e.preventDefault();
                    selectExisting(s);
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                    highlightedIndex === i
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{s.name}</span>
                    {s.disambiguators.length > 0 && (
                      <span className="text-[11px] text-gray-500 truncate">
                        {s.disambiguators.join(' • ')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {trimmed && (
                <button
                  onMouseDown={e => {
                    e.preventDefault();
                    openNewProfileForm();
                  }}
                  onMouseEnter={() => setHighlightedIndex(suggestions.length)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 border-t-2 border-gray-200 transition-colors ${
                    highlightedIndex === suggestions.length
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <UserPlusIcon className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                  <span>
                    {hasSuggestions
                      ? <>None of these — <strong>create a new person named "{trimmed}"</strong></>
                      : <>Create "<strong>{trimmed}</strong>"</>}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {addError && (
        <p
          role="alert"
          className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 leading-snug"
        >
          {addError}
        </p>
      )}
    </div>
  );
}
