import type { JSX } from 'react';

export type CameraView =
  | 'perspective'
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'left'
  | 'right';

interface Props {
  view: CameraView;
  onChange: (view: CameraView) => void;
}

interface ViewBtn {
  id: CameraView;
  label: string;
  /** SVG glyph showing a cube with the front face indicating which direction. */
  icon: JSX.Element;
  area: string;
}

type HiddenSide = 'left' | 'bottom' | 'back';

// Cube faces and chevrons are colored via CSS so they follow the active theme.
function cube(
  faces: { top?: boolean; right?: boolean; front?: boolean },
  hidden?: HiddenSide
) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      {/* Top face: diamond on top */}
      <polygon
        className={`cube-face${faces.top ? ' is-on' : ''}`}
        points="12,2 22,7 12,12 2,7"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Front face: bottom-left quad */}
      <polygon
        className={`cube-face${faces.front ? ' is-on' : ''}`}
        points="2,7 12,12 12,22 2,17"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Right face: bottom-right quad */}
      <polygon
        className={`cube-face${faces.right ? ' is-on' : ''}`}
        points="22,7 22,17 12,22 12,12"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {hidden === 'left' && (
        <polyline
          className="cube-chevron"
          points="5,10 2,14 5,18"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {hidden === 'bottom' && (
        <polyline
          className="cube-chevron"
          points="8,21 12,17 16,21"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {hidden === 'back' && (
        <polyline
          className="cube-chevron"
          points="17,8 21,5 21,9"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

const VIEWS: ViewBtn[] = [
  { id: 'top', label: 'Top', area: 'top', icon: cube({ top: true }) },
  {
    id: 'front',
    label: 'Front',
    area: 'front',
    icon: cube({ front: true })
  },
  {
    id: 'right',
    label: 'Right',
    area: 'right',
    icon: cube({ right: true })
  },
  { id: 'left', label: 'Left', area: 'left', icon: cube({}, 'left') },
  { id: 'back', label: 'Back', area: 'back', icon: cube({}, 'back') },
  { id: 'bottom', label: 'Bottom', area: 'bottom', icon: cube({}, 'bottom') }
];

export default function CameraControls({ view, onChange }: Props) {
  return (
    <div className="camera-controls" role="toolbar" aria-label="Camera views">
      <div className="camera-grid">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={
              'camera-btn camera-' +
              v.area +
              (view === v.id ? ' is-active' : '')
            }
            style={{ gridArea: v.area }}
            title={v.label}
            aria-label={v.label}
            aria-pressed={view === v.id}
            onClick={() => onChange(v.id)}
          >
            {v.icon}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={
          'camera-btn camera-persp' + (view === 'perspective' ? ' is-active' : '')
        }
        title="Perspective"
        aria-label="Perspective"
        aria-pressed={view === 'perspective'}
        onClick={() => onChange('perspective')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <polygon
            points="4,18 20,18 16,8 8,8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <line
            x1="8"
            y1="8"
            x2="4"
            y2="18"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="16"
            y1="8"
            x2="20"
            y2="18"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
    </div>
  );
}
