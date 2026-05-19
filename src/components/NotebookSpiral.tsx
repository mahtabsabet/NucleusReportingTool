// Spiral notebook binding rendered as inline SVG. Each "ring" is a
// double-loop wire — exactly the binding style in the product
// mockup — that wraps around the top edge of the page. The strip
// extends slightly above the page surface so the rings appear to
// pass over a real paper edge. Paper perforations / tabs are drawn
// at the top of the page so each ring looks like it's threaded
// through an actual hole.

interface NotebookSpiralProps {
  // Approx ring count. The SVG scales to its container width so the
  // ring spacing only affects density, not layout. 18 reads well at
  // the full notebook width on desktop and degrades gracefully on
  // mobile.
  ringCount?: number;
}

export function NotebookSpiral({ ringCount = 18 }: NotebookSpiralProps) {
  // Drawn in a fixed viewBox; CSS stretches it to fill the strip.
  const ringSpacing = 90;
  const totalWidth = ringCount * ringSpacing;
  const ringWidth = 38;
  const ringHeight = 78;
  const cy = 38;
  const rings = Array.from({ length: ringCount }, (_, i) => i * ringSpacing + ringSpacing / 2);

  return (
    <div className="relative w-full" aria-hidden>
      {/* Wire rings */}
      <svg
        viewBox={`0 0 ${totalWidth} 90`}
        preserveAspectRatio="none"
        className="block w-full h-[68px] sm:h-[80px]"
      >
        <defs>
          <linearGradient id="wireDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3530" />
            <stop offset="35%" stopColor="#0c0a08" />
            <stop offset="60%" stopColor="#0c0a08" />
            <stop offset="100%" stopColor="#2a2622" />
          </linearGradient>
          <linearGradient id="wireHighlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,250,235,0.55)" />
            <stop offset="60%" stopColor="rgba(255,250,235,0)" />
          </linearGradient>
        </defs>

        {rings.map((cx, i) => (
          <g key={i}>
            {/* Drop shadow under the ring where it presses the page. */}
            <ellipse
              cx={cx}
              cy={cy + ringHeight / 2 - 4}
              rx={ringWidth / 2 + 2}
              ry="3.5"
              fill="rgba(0,0,0,0.30)"
            />
            {/* Main wire loop. Drawn as a tall stroked ellipse so it
                visually wraps around the top edge of the page. */}
            <ellipse
              cx={cx}
              cy={cy}
              rx={ringWidth / 2}
              ry={ringHeight / 2}
              fill="none"
              stroke="url(#wireDark)"
              strokeWidth="4"
            />
            {/* Highlight stroke on the upper outer arc to give the
                wire a metallic sheen. */}
            <path
              d={`M ${cx - ringWidth / 2 + 2} ${cy} A ${ringWidth / 2 - 2} ${ringHeight / 2 - 2} 0 0 1 ${cx + ringWidth / 2 - 2} ${cy}`}
              fill="none"
              stroke="url(#wireHighlight)"
              strokeWidth="1.4"
            />
          </g>
        ))}
      </svg>

      {/* Paper perforation tabs: small dark slots at the top of the
          page where each ring threads through. Drawn in a second
          SVG so the page-color CSS doesn't get tangled with the
          ring colors. */}
      <svg
        viewBox={`0 0 ${totalWidth} 14`}
        preserveAspectRatio="none"
        className="block w-full h-[10px] -mt-[2px]"
      >
        {rings.map((cx, i) => (
          <g key={i}>
            {/* Slot */}
            <rect
              x={cx - 6}
              y={1}
              width={12}
              height={6}
              rx={2.5}
              fill="rgba(60, 40, 22, 0.55)"
            />
            {/* Soft shadow below the slot on the paper */}
            <ellipse cx={cx} cy={10} rx={9} ry={2} fill="rgba(120, 90, 50, 0.18)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
