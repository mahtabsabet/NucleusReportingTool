import React from 'react';
import { LearningTheme } from '../types';

// Highlighter-style palette. Soft translucent background with a
// slightly deeper text tone, matching the marker / highlighter
// aesthetic of the mockups. Unknown color names fall back to amber.
// All class names are spelled out as literals so Tailwind's
// content scanner picks them up.
interface Palette {
  bgSoft: string;
  bgMuted: string;
  text: string;
  border: string;
  dot: string;
  hoverBg: string;
}

const PALETTE: Record<string, Palette> = {
  amber:  { bgSoft: 'bg-amber-100/70',   bgMuted: 'bg-amber-50/40',   text: 'text-amber-900',   border: 'border-amber-300',   dot: 'bg-amber-400',   hoverBg: 'hover:bg-amber-100/70' },
  green:  { bgSoft: 'bg-emerald-100/70', bgMuted: 'bg-emerald-50/40', text: 'text-emerald-900', border: 'border-emerald-300', dot: 'bg-emerald-500', hoverBg: 'hover:bg-emerald-100/70' },
  red:    { bgSoft: 'bg-rose-100/70',    bgMuted: 'bg-rose-50/40',    text: 'text-rose-900',    border: 'border-rose-300',    dot: 'bg-rose-400',    hoverBg: 'hover:bg-rose-100/70' },
  blue:   { bgSoft: 'bg-sky-100/70',     bgMuted: 'bg-sky-50/40',     text: 'text-sky-900',     border: 'border-sky-300',     dot: 'bg-sky-400',     hoverBg: 'hover:bg-sky-100/70' },
  purple: { bgSoft: 'bg-violet-100/70',  bgMuted: 'bg-violet-50/40',  text: 'text-violet-900',  border: 'border-violet-300',  dot: 'bg-violet-400',  hoverBg: 'hover:bg-violet-100/70' },
  pink:   { bgSoft: 'bg-pink-100/70',    bgMuted: 'bg-pink-50/40',    text: 'text-pink-900',    border: 'border-pink-300',    dot: 'bg-pink-400',    hoverBg: 'hover:bg-pink-100/70' },
};

export function themePalette(color: string): Palette {
  return PALETTE[color] ?? PALETTE.amber;
}

interface ThemeTagProps {
  theme: LearningTheme;
  selected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export function ThemeTag({ theme, selected, onClick, size = 'md', showIcon = false }: ThemeTagProps) {
  const p = themePalette(theme.color);
  const emerging = theme.status === 'emerging';
  const padding = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1';
  const text = size === 'sm' ? 'text-xs' : 'text-sm';

  // Selected = solid highlighter look. Unselected (in composer) =
  // outlined / muted. Emerging themes get a dashed border.
  const showSelected = !onClick || selected;
  const bg = showSelected ? p.bgSoft : `${p.bgMuted} ${p.hoverBg}`;
  const borderStyle = emerging ? 'border-dashed' : 'border-solid';

  const base = `inline-flex items-center gap-1.5 rounded-md font-medium border transition ${padding} ${text} ${bg} ${p.text} ${p.border} ${borderStyle}`;

  const Inner = (
    <>
      {(showIcon || selected) && <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} aria-hidden />}
      <span>{theme.name}</span>
      {emerging && (
        <span className="text-[10px] uppercase tracking-wider opacity-60 ml-1">emerging</span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} aria-pressed={selected}>
        {Inner}
      </button>
    );
  }
  return <span className={base}>{Inner}</span>;
}
