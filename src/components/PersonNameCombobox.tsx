import React, { useState, useEffect, useRef } from 'react';
import { PlusIcon, UserIcon, UserPlusIcon } from 'lucide-react';
import { searchPersonsByName } from '../lib/db/persons';

interface Suggestion {
  id: string;
  name: string;
}

interface PersonNameComboboxProps {
  placeholder?: string;
  onAdd: (params: { name: string; existingPersonId?: string }) => Promise<void>;
}

export function PersonNameCombobox({
  placeholder = 'Add name...',
  onAdd,
}: PersonNameComboboxProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isAdding, setIsAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
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

  // All dropdown options: existing matches + "create new" at the end
  const allOptions: Array<Suggestion & { isNew?: boolean }> = [
    ...suggestions,
    ...(inputValue.trim() ? [{ id: '__new__', name: inputValue.trim(), isNew: true }] : []),
  ];

  const handleSelect = async (option: Suggestion & { isNew?: boolean }) => {
    setIsOpen(false);
    setIsAdding(true);
    try {
      if (option.isNew) {
        await onAdd({ name: option.name });
      } else {
        await onAdd({ name: option.name, existingPersonId: option.id });
      }
      setInputValue('');
      setSuggestions([]);
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
      if (e.key === 'Enter' && inputValue.trim()) {
        handleSelect({ id: '__new__', name: inputValue.trim(), isNew: true });
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, allOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < allOptions.length) {
        handleSelect(allOptions[highlightedIndex]);
      } else if (inputValue.trim()) {
        handleSelect({ id: '__new__', name: inputValue.trim(), isNew: true });
      }
    }
  };

  const trimmed = inputValue.trim();
  const hasExactMatch = suggestions.some(
    s => s.name.toLowerCase() === trimmed.toLowerCase()
  );

  return (
    <div ref={containerRef} className="relative flex gap-2 pt-2">
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
        onClick={() => trimmed && handleSelect({ id: '__new__', name: trimmed, isNew: true })}
        disabled={!trimmed || isAdding}
        className="px-3.5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <PlusIcon className="w-4 h-4" />
      </button>

      {isOpen && allOptions.length > 0 && (
        <div className="absolute z-30 bottom-full mb-1 left-0 right-10 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(s);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                highlightedIndex === i
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <span>{s.name}</span>
            </button>
          ))}
          {trimmed && (
            <button
              onMouseDown={e => {
                e.preventDefault();
                handleSelect({ id: '__new__', name: trimmed, isNew: true });
              }}
              onMouseEnter={() => setHighlightedIndex(suggestions.length)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 border-t border-gray-100 transition-colors ${
                highlightedIndex === suggestions.length
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <UserPlusIcon className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
              <span>
                {hasExactMatch ? (
                  <>Add as new record: <strong>{trimmed}</strong></>
                ) : (
                  <>Create "<strong>{trimmed}</strong>"</>
                )}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
