import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SearchIcon,
  UserIcon,
  CircleIcon,
  ActivityIcon,
  XIcon,
} from 'lucide-react';
import { globalSearch } from '../lib/db/search';
import type {
  GlobalSearchResults,
  SearchActivityResult,
} from '../lib/db/search';

type FlatItem =
  | { kind: 'person'; id: string; name: string }
  | { kind: 'nucleus'; id: string; name: string }
  | { kind: 'activity'; id: string; name: string; nucleusId: string; nucleusName: string | null };

const EMPTY: GlobalSearchResults = { people: [], nuclei: [], activities: [] };

function flatten(results: GlobalSearchResults): FlatItem[] {
  return [
    ...results.people.map(p => ({ kind: 'person' as const, id: p.id, name: p.name })),
    ...results.activities.map((a: SearchActivityResult) => ({
      kind: 'activity' as const,
      id: a.id,
      name: a.name,
      nucleusId: a.nucleusId,
      nucleusName: a.nucleusName,
    })),
    ...results.nuclei.map(n => ({ kind: 'nucleus' as const, id: n.id, name: n.name })),
  ];
}

interface GlobalSearchProps {
  className?: string;
  placeholder?: string;
}

export function GlobalSearch({
  className = '',
  placeholder = 'Search people, activities, nuclei…',
}: GlobalSearchProps) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically-increasing request id; only the latest response wins.
  const requestSeq = useRef(0);

  // Close dropdown on outside click.
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Debounced search. Stale responses are dropped via the request sequence.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const seq = ++requestSeq.current;
      globalSearch(trimmed)
        .then(res => {
          if (seq !== requestSeq.current) return;
          setResults(res);
          setHighlight(0);
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setResults(EMPTY);
        })
        .finally(() => {
          if (seq !== requestSeq.current) return;
          setLoading(false);
        });
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const flat = flatten(results);
  const hasQuery = value.trim().length > 0;
  const showDropdown = open && hasQuery;

  function navigateTo(item: FlatItem) {
    if (item.kind === 'person') navigate(`/individual/${item.id}`);
    else if (item.kind === 'nucleus') navigate(`/nucleus/${item.id}`);
    else if (item.kind === 'activity') navigate(`/nucleus/${item.nucleusId}/activity/${item.id}`);
  }

  function handleSelect(item: FlatItem) {
    setOpen(false);
    setValue('');
    setResults(EMPTY);
    navigateTo(item);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showDropdown || flat.length === 0) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(i => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[highlight];
      if (item) handleSelect(item);
    }
  }

  // Index helpers so the keyboard highlight maps to grouped rendering.
  let runningIndex = 0;
  function nextIndex() {
    return runningIndex++;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (hasQuery) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Global search"
          autoComplete="off"
          className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 shadow-sm"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              setResults(EMPTY);
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Clear search"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-40 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading && flat.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">Searching…</div>
          ) : flat.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500">No matches.</div>
          ) : (
            <>
              {results.people.length > 0 && (
                <SearchGroup label="People">
                  {results.people.map(p => {
                    const idx = nextIndex();
                    const item: FlatItem = { kind: 'person', id: p.id, name: p.name };
                    return (
                      <SearchRow
                        key={`p-${p.id}`}
                        active={highlight === idx}
                        onMouseEnter={() => setHighlight(idx)}
                        onSelect={() => handleSelect(item)}
                        icon={<UserIcon className="w-3.5 h-3.5 text-gray-400" />}
                        primary={p.name}
                      />
                    );
                  })}
                </SearchGroup>
              )}
              {results.activities.length > 0 && (
                <SearchGroup label="Activities">
                  {results.activities.map(a => {
                    const idx = nextIndex();
                    const item: FlatItem = {
                      kind: 'activity',
                      id: a.id,
                      name: a.name,
                      nucleusId: a.nucleusId,
                      nucleusName: a.nucleusName,
                    };
                    return (
                      <SearchRow
                        key={`a-${a.id}`}
                        active={highlight === idx}
                        onMouseEnter={() => setHighlight(idx)}
                        onSelect={() => handleSelect(item)}
                        icon={<ActivityIcon className="w-3.5 h-3.5 text-gray-400" />}
                        primary={a.name}
                        secondary={a.nucleusName ?? undefined}
                      />
                    );
                  })}
                </SearchGroup>
              )}
              {results.nuclei.length > 0 && (
                <SearchGroup label="Nuclei">
                  {results.nuclei.map(n => {
                    const idx = nextIndex();
                    const item: FlatItem = { kind: 'nucleus', id: n.id, name: n.name };
                    return (
                      <SearchRow
                        key={`n-${n.id}`}
                        active={highlight === idx}
                        onMouseEnter={() => setHighlight(idx)}
                        onSelect={() => handleSelect(item)}
                        icon={<CircleIcon className="w-3.5 h-3.5 text-gray-400" />}
                        primary={n.name}
                      />
                    );
                  })}
                </SearchGroup>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

interface SearchRowProps {
  active: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
  icon: React.ReactNode;
  primary: string;
  secondary?: string;
}

function SearchRow({ active, onMouseEnter, onSelect, icon, primary, secondary }: SearchRowProps) {
  return (
    <button
      type="button"
      onMouseDown={e => {
        // Use mousedown so clicks register before input blur closes the dropdown.
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onMouseEnter}
      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
        active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{primary}</span>
      {secondary && (
        <span className="ml-auto text-xs text-gray-400 truncate pl-2">{secondary}</span>
      )}
    </button>
  );
}
