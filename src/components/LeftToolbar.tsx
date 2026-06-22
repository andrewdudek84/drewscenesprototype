import type { JSX } from 'react';
import type { ToolMode } from '../types';

interface Props {
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  onFocus: () => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  sceneOpen: boolean;
  onToggleScene: () => void;
}

const TOOLS: { id: ToolMode; label: string; icon: JSX.Element }[] = [
  {
    id: 'select',
    label: 'Select',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 3 L5 17 L9 13 L11.8 19.2 L13.7 18.3 L11 12 L17 12 Z" />
      </svg>
    )
  },
  {
    id: 'move',
    label: 'Move (translate X / Y / Z)',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 L12 21 M3 12 L21 12" />
        <path d="M12 3 L9.5 5.5 M12 3 L14.5 5.5" />
        <path d="M12 21 L9.5 18.5 M12 21 L14.5 18.5" />
        <path d="M3 12 L5.5 9.5 M3 12 L5.5 14.5" />
        <path d="M21 12 L18.5 9.5 M21 12 L18.5 14.5" />
      </svg>
    )
  },
  {
    id: 'rotate',
    label: 'Rotate (X / Y / Z)',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 12 A8 8 0 1 1 16.5 5.5" />
        <path d="M20 4 L20 8 L16 8" />
      </svg>
    )
  },
  {
    id: 'scale',
    label: 'Scale',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Small square at bottom-left, large square at top-right, with a diagonal arrow showing growth. */}
        <rect x="3" y="17" width="4" height="4" />
        <rect x="10" y="3" width="11" height="11" />
        <path d="M7 17 L13 11" />
        <path d="M13 11 L9 11 M13 11 L13 15" />
      </svg>
    )
  }
];

export default function LeftToolbar({ tool, onToolChange, onFocus, snapEnabled, onSnapToggle, sceneOpen, onToggleScene }: Props) {
  return (
    <aside className="panel toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool-btn${tool === t.id ? ' is-active' : ''}`}
          title={t.label}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => onToolChange(t.id)}
        >
          {t.icon}
        </button>
      ))}
      <div className="tool-divider" aria-hidden="true" />
      <button
        type="button"
        className={`tool-btn${snapEnabled ? ' is-active' : ''}`}
        title={
          snapEnabled
            ? 'Snap to grid: ON \u2014 click to disable'
            : 'Snap to grid: OFF \u2014 click to enable'
        }
        aria-label={snapEnabled ? 'Disable snap to grid' : 'Enable snap to grid'}
        aria-pressed={snapEnabled}
        onClick={onSnapToggle}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* 3x3 grid of dots with a magnet/pin on the center cell. */}
          <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="19" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="19" r="1" fill="currentColor" stroke="none" />
          <rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none" />
          {!snapEnabled && (
            <line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" strokeWidth="1.8" />
          )}
        </svg>
      </button>
      <div className="tool-divider" aria-hidden="true" />
      <button
        type="button"
        className={`tool-btn${tool === 'measure' ? ' is-active' : ''}`}
        title="Measure (M) — click two points to measure distance"
        aria-label="Measure"
        aria-pressed={tool === 'measure'}
        onClick={() => onToolChange(tool === 'measure' ? 'select' : 'measure')}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Tilted ruler with tick marks. */}
          <path d="M3.5 14.5 L9.5 20.5 L20.5 9.5 L14.5 3.5 Z" />
          <path d="M6.5 14 L7.8 15.3" />
          <path d="M9 11.5 L11 13.5" />
          <path d="M11.5 9 L12.8 10.3" />
          <path d="M14 6.5 L16 8.5" />
        </svg>
      </button>
      <button
        type="button"
        className="tool-btn"
        title="Focus (F) — reset camera to initial view"
        aria-label="Focus camera"
        onClick={onFocus}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Crosshair / reticle: center dot plus four ticks plus a soft circle. */}
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <line x1="12" y1="2.5" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="21.5" />
          <line x1="2.5" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="21.5" y2="12" />
        </svg>
      </button>
      <button
        type="button"
        className={`tool-btn${sceneOpen ? ' is-active' : ''}`}
        title={sceneOpen ? 'Hide scene panel' : 'Show scene panel'}
        aria-label={sceneOpen ? 'Hide scene panel' : 'Show scene panel'}
        aria-pressed={sceneOpen}
        onClick={onToggleScene}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Perspective grid: ground plane receding to a vanishing point. */}
          <path d="M3 20 L21 20 L17 7 L7 7 Z" />
          <path d="M9 20 L11 7" />
          <path d="M15 20 L13 7" />
          <path d="M5 15 L19 15" />
          <path d="M6.5 11 L17.5 11" />
        </svg>
      </button>
    </aside>
  );
}
