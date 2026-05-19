// Inline SVG flourishes used to dress the Nucleus Journal pages.
// Drawn by hand so we don't depend on an asset pipeline. Stroke
// color is `currentColor` so a parent text-color class controls
// the tone (we typically use a muted amber/stone).

interface DecorationProps {
  className?: string;
}

// Branching sprig of leaves used in the top corners of the
// journal spread. Mirror it with a CSS transform for the opposite
// corner.
export function LeafSprig({ className }: DecorationProps) {
  return (
    <svg viewBox="0 0 120 60" className={className} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M2 50 C 30 50, 55 40, 80 22 C 95 12, 108 8, 118 6" />
      {/* leaves alternating along the stem */}
      <path d="M20 47 C 16 38, 22 32, 30 32 C 32 38, 28 46, 20 47 Z" />
      <path d="M38 41 C 36 32, 44 27, 52 28 C 53 36, 47 42, 38 41 Z" />
      <path d="M58 33 C 58 24, 66 20, 74 22 C 74 30, 68 35, 58 33 Z" />
      <path d="M78 21 C 80 13, 88 11, 94 13 C 93 20, 88 23, 78 21 Z" />
      {/* small berries / buds */}
      <circle cx="102" cy="10" r="1.5" />
      <circle cx="108" cy="8"  r="1.2" />
    </svg>
  );
}

// Larger botanical for the bottom of the left page, like the
// dried-flower stem in the mockup.
export function BotanicalSprig({ className }: DecorationProps) {
  return (
    <svg viewBox="0 0 100 140" className={className} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <path d="M50 138 C 50 110, 48 80, 52 50 C 54 32, 58 18, 60 4" />
      {/* fronds */}
      <g strokeWidth="0.9">
        <path d="M52 110 C 45 105, 38 102, 30 102" />
        <path d="M52 110 C 58 106, 65 104, 72 105" />
        <path d="M52 92  C 44 88,  37 86,  29 87" />
        <path d="M53 92  C 60 87,  68 86,  74 88" />
        <path d="M53 74  C 46 70,  40 69,  33 70" />
        <path d="M53 74  C 60 70,  67 70,  73 72" />
        <path d="M55 58  C 49 55,  44 55,  38 56" />
        <path d="M55 58  C 61 54,  66 54,  71 56" />
        <path d="M57 42  C 52 39,  47 39,  43 41" />
        <path d="M57 42  C 62 39,  67 39,  70 41" />
        <path d="M59 28  C 55 25,  51 25,  48 27" />
        <path d="M59 28  C 63 25,  67 25,  69 27" />
      </g>
      {/* tiny buds */}
      <circle cx="58" cy="14" r="1.4" />
      <circle cx="62" cy="10" r="1.2" />
      <circle cx="56" cy="8"  r="1.1" />
    </svg>
  );
}

// Thin ornamental divider used between sections — a centered
// diamond between two tapered lines.
export function OrnamentalDivider({ className }: DecorationProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <div className="flex-1 h-px bg-current opacity-30" />
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
        <path d="M8 1 L15 8 L8 15 L1 8 Z" opacity="0.55" />
      </svg>
      <div className="flex-1 h-px bg-current opacity-30" />
    </div>
  );
}
