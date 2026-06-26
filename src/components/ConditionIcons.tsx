import type { ConditionIcon } from '../conditions';

interface GlyphProps {
  icon: ConditionIcon;
  size?: number;
  /** Stroke / fill color for the glyph itself (not the chip background). */
  color?: string;
}

/** Single-line inline SVG glyph for an overlay icon. Sized for inline list
 *  use; pair with `ConditionIconChip` for the picker preview. */
export function ConditionIconGlyph({ icon, size = 14, color = 'currentColor' }: GlyphProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };
  switch (icon) {
    case 'warning':
      return (
        <svg {...common}>
          <path d="M12 3 L22 20 L2 20 Z" />
          <line x1="12" y1="10" x2="12" y2="14" />
          <circle cx="12" cy="17" r="0.6" fill={color} stroke="none" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7.5 12 L11 15.5 L16.5 9" />
        </svg>
      );
    case 'off':
      return (
        <svg {...common}>
          <path d="M8 5 A8 8 0 1 0 16 5" />
          <line x1="12" y1="3" x2="12" y2="12" />
        </svg>
      );
    case 'on':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill={color} stroke={color} />
          <path d="M8 5 A8 8 0 1 0 16 5" stroke="#fff" />
          <line x1="12" y1="3" x2="12" y2="12" stroke="#fff" />
        </svg>
      );
  }
}

interface ChipProps {
  icon: ConditionIcon;
  /** Chip background — mirrors the rule's `color`. */
  background: string;
  size?: number;
  /** Visual selection ring (used by the icon picker). */
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}

/** Round chip used by the icon picker and (later) the in-viewport overlay.
 *  Renders the glyph in white on top of the rule's color. */
export function ConditionIconChip({
  icon,
  background,
  size = 28,
  selected = false,
  onClick,
  title
}: ChipProps) {
  const interactive = !!onClick;
  const className =
    'condition-icon-chip' + (selected ? ' is-selected' : '') + (interactive ? ' is-clickable' : '');
  const style = {
    width: size,
    height: size,
    background
  } as const;
  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        title={title}
        aria-pressed={selected}
        aria-label={title}
      >
        <ConditionIconGlyph icon={icon} size={Math.round(size * 0.6)} color="#fff" />
      </button>
    );
  }
  return (
    <span className={className} style={style} title={title} aria-label={title}>
      <ConditionIconGlyph icon={icon} size={Math.round(size * 0.6)} color="#fff" />
    </span>
  );
}
