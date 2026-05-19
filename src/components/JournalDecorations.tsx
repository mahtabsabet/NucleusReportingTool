// Inline SVG flourishes used to dress the Nucleus Journal pages.
// Drawn by hand so we don't depend on an asset pipeline. Stroke
// color is `currentColor` so a parent text-color class controls
// the tone (we typically use a muted amber/sepia).

interface DecorationProps {
  className?: string;
}

// Small sepia leaf sprig sitting beside a section heading. The
// stem starts low-left and tapers up to a single tip with paired
// leaves along the way, mirroring the laurel-like flourishes in
// the journal mockup.
export function HeadingFlourish({ className }: DecorationProps) {
  return (
    <svg viewBox="0 0 70 38" className={className} fill="currentColor" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round">
      {/* curving stem */}
      <path d="M2 34 C 18 32, 32 24, 46 12 C 54 6, 60 4, 68 3" fill="none" />
      {/* paired leaves along the stem */}
      <g opacity="0.95">
        <path d="M14 31 C 11 26, 14 22, 19 22 C 20 26, 18 30, 14 31 Z" />
        <path d="M16 28 C 19 24, 24 23, 28 25 C 27 30, 21 31, 16 28 Z" fill="none" />
        <path d="M28 24 C 25 19, 28 15, 33 15 C 34 19, 32 23, 28 24 Z" />
        <path d="M30 21 C 34 17, 39 16, 43 18 C 42 23, 35 24, 30 21 Z" fill="none" />
        <path d="M42 16 C 40 11, 43 7, 48 8 C 49 12, 47 15, 42 16 Z" />
        <path d="M44 13 C 48 9, 53 9, 56 11 C 55 16, 49 16, 44 13 Z" fill="none" />
      </g>
      {/* tip bud */}
      <circle cx="65" cy="4" r="1.4" />
    </svg>
  );
}

// Thin ornamental divider used between header and body — a thin
// sepia line with a small leaf-tip terminator on the right side
// (so it mirrors the mockup's right-fading rule).
export function HeaderDivider({ className }: DecorationProps) {
  return (
    <div className={`flex items-center ${className ?? ''}`} aria-hidden>
      <div className="flex-1 h-px bg-current opacity-50" />
      <svg viewBox="0 0 18 8" className="w-4 h-2 ml-1">
        <path
          d="M0 4 L12 4 C 14 4, 16 3, 18 1"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.65"
        />
      </svg>
    </div>
  );
}
