// Heuristic icon picker. When a user imports a USD/USDA file we try to match
// its filename against a small built-in keyword set and return an inline SVG
// string for the palette tile. If nothing matches the caller should fall back
// to the "Blank" placeholder used by AssetsPalette.

interface IconEntry {
  // Matched against the lowercased filename (without extension).
  match: RegExp;
  // 28x28 SVG markup; rendered with className="palette-icon-svg".
  svg: string;
}

const SVG_OPEN =
  '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" class="palette-icon-svg">';
const SVG_CLOSE = '</svg>';

const ENTRIES: IconEntry[] = [
  {
    match: /(table|desk)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="3" y="10" width="22" height="3" fill="#c0c5d0" />
      <rect x="5" y="13" width="2" height="11" fill="#a86d2a" />
      <rect x="21" y="13" width="2" height="11" fill="#a86d2a" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(chair|seat|stool)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="7" y="4" width="10" height="11" fill="#a86d2a" />
      <rect x="6" y="15" width="16" height="3" fill="#c0c5d0" />
      <rect x="7" y="18" width="2" height="6" fill="#7a8290" />
      <rect x="19" y="18" width="2" height="6" fill="#7a8290" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(shelf|shelves|rack|storage)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="3" y="3" width="2" height="22" fill="#c0c5d0" />
      <rect x="23" y="3" width="2" height="22" fill="#c0c5d0" />
      <rect x="3" y="9" width="22" height="1.5" fill="#c0c5d0" />
      <rect x="3" y="16" width="22" height="1.5" fill="#c0c5d0" />
      <rect x="3" y="23" width="22" height="1.5" fill="#c0c5d0" />
      <rect x="7" y="5" width="5" height="4" fill="#d9a441" />
      <rect x="14" y="4" width="6" height="5" fill="#a86d2a" />
      <rect x="12" y="11" width="5" height="5" fill="#d9a441" />
      <rect x="8" y="19" width="6" height="4" fill="#d9a441" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(bed|cot|mattress)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="2" y="9" width="2.5" height="8" fill="#c0c5d0" />
      <rect x="23.5" y="13" width="2.5" height="4" fill="#c0c5d0" />
      <rect x="4" y="13" width="20" height="3.5" fill="#e8eaef" />
      <rect x="5" y="11.5" width="4" height="2" fill="#ffffff" />
      <line x1="4" y1="17" x2="24" y2="17" stroke="#7a8290" stroke-width="1" />
      <line x1="6" y1="17" x2="6" y2="21" stroke="#7a8290" stroke-width="1" />
      <line x1="22" y1="17" x2="22" y2="21" stroke="#7a8290" stroke-width="1" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(robot|arm|manipulator|ur\d+|kuka|abb)/,
    svg: `${SVG_OPEN}<g stroke="#3f7d8e" stroke-width="0.75" stroke-linejoin="round" stroke-linecap="round">
      <rect x="9" y="23" width="10" height="3" fill="#b8c7cc" />
      <circle cx="14" cy="22" r="2" fill="#a6dadf" />
      <rect x="12.5" y="14" width="3" height="8" fill="#a6dadf" />
      <circle cx="14" cy="14" r="2" fill="#a6dadf" />
      <rect x="13" y="6" width="3" height="8" fill="#a6dadf" transform="rotate(-35 14.5 10)" />
      <circle cx="21" cy="6.5" r="1.8" fill="#a6dadf" />
      <rect x="21" y="3.5" width="2" height="3" fill="#7aa8b0" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(box|crate|container|carton|pallet)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <path d="M4 9 L14 4 L24 9 L14 14 Z" fill="#d9a441" />
      <path d="M4 9 L4 20 L14 25 L14 14 Z" fill="#a86d2a" />
      <path d="M14 14 L14 25 L24 20 L24 9 Z" fill="#c08530" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(room|wall|floor|space)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.9" stroke-linejoin="round" fill="none">
      <rect x="4" y="5" width="20" height="18" fill="#d7dce6" stroke="#a0a8b6" />
      <line x1="4" y1="5" x2="24" y2="5" />
      <line x1="4" y1="5" x2="4" y2="23" />
      <line x1="24" y1="5" x2="24" y2="23" />
      <line x1="4" y1="23" x2="11" y2="23" />
      <line x1="17" y1="23" x2="24" y2="23" />
      <path d="M11 23 A6 6 0 0 1 17 17" stroke="#9aa3b0" stroke-dasharray="1.4 1.4" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(door)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="7" y="3" width="14" height="22" fill="#a86d2a" />
      <rect x="9" y="5" width="10" height="18" fill="none" stroke="#7a5a26" />
      <circle cx="18" cy="14" r="0.9" fill="#d9a441" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(light|lamp|bulb|sconce)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <path d="M9 12 A5 5 0 1 1 19 12 C19 16 17 17 16.5 19 L11.5 19 C11 17 9 16 9 12 Z" fill="#ffe28a" />
      <rect x="11.5" y="19" width="5" height="3" fill="#c0c5d0" />
      <line x1="12" y1="22" x2="16" y2="22" stroke="#7a8290" stroke-width="1" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(tree|plant|bush|foliage)/,
    svg: `${SVG_OPEN}<g stroke="#3f6b3f" stroke-width="0.75" stroke-linejoin="round">
      <circle cx="14" cy="11" r="7" fill="#6db36d" />
      <rect x="13" y="17" width="2" height="6" fill="#7a5a26" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(car|truck|vehicle|forklift|cart|wagon)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="3" y="14" width="22" height="5" fill="#d9a441" />
      <rect x="7" y="9" width="13" height="5" fill="#d9a441" />
      <circle cx="8" cy="21" r="2.5" fill="#2c2f36" />
      <circle cx="20" cy="21" r="2.5" fill="#2c2f36" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(stair|step)/,
    svg: `${SVG_OPEN}<g fill="#c0c5d0" stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="2" y="22" width="22" height="4" />
      <rect x="6" y="18" width="18" height="4" />
      <rect x="10" y="14" width="14" height="4" />
      <rect x="14" y="10" width="10" height="4" />
      <rect x="18" y="6" width="6" height="4" />
    </g>${SVG_CLOSE}`
  },
  {
    match: /(conveyor|belt|line|packing)/,
    svg: `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round">
      <rect x="2" y="17" width="24" height="3" fill="#9aa3b0" />
      <circle cx="5" cy="18.5" r="0.8" fill="#c0c5d0" />
      <circle cx="9" cy="18.5" r="0.8" fill="#c0c5d0" />
      <circle cx="13" cy="18.5" r="0.8" fill="#c0c5d0" />
      <circle cx="17" cy="18.5" r="0.8" fill="#c0c5d0" />
      <circle cx="21" cy="18.5" r="0.8" fill="#c0c5d0" />
      <rect x="6" y="13" width="4" height="4" fill="#a86d2a" />
      <rect x="18" y="12.5" width="4.5" height="4.5" fill="#d9a441" />
    </g>${SVG_CLOSE}`
  }
];

export function pickIconForTitle(title: string): string | null {
  const t = title.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  for (const e of ENTRIES) {
    if (e.match.test(t)) return e.svg;
  }
  return null;
}

// Fallback rendered when nothing matches. Mirrors the "Blank" placeholder in
// AssetsPalette (the .kind-group palette-icon span).
export const BLANK_ICON_SVG = `${SVG_OPEN}<g stroke="#7a8290" stroke-width="0.75" stroke-linejoin="round" fill="#c0c5d0">
  <rect x="4" y="4" width="20" height="20" rx="2" />
  <line x1="4" y1="4" x2="24" y2="24" stroke="#7a8290" stroke-width="0.6" stroke-dasharray="1.2 1.6" />
</g>${SVG_CLOSE}`;
