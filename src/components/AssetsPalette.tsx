import { ASSET_LIBRARY } from '../assets';
import { ASSET_DRAG_MIME } from '../shapes';

export default function AssetsPalette() {
  const onDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    assetId: string
  ) => {
    e.dataTransfer.setData(ASSET_DRAG_MIME, assetId);
    e.dataTransfer.setData('text/plain', assetId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="palette-items">
      {ASSET_LIBRARY.length === 0 ? (
        <div className="palette-empty">No assets in usd_assets/.</div>
      ) : (
        ASSET_LIBRARY.map((a) => (
          <div
            key={a.id}
            className="palette-item"
            draggable
            onDragStart={(e) => onDragStart(e, a.id)}
            title={`Drag ${a.label} into the viewport`}
          >
            <AssetIcon id={a.id} />
            <span className="palette-label">{a.label}</span>
          </div>
        ))
      )}
    </div>
  );
}

function AssetIcon({ id }: { id: string }) {
  if (id === 'stairs') {
    return (
      <svg
        viewBox="0 0 28 28"
        width="28"
        height="28"
        aria-hidden="true"
        className="palette-icon-svg"
      >
        {/* Side-profile staircase climbing up to the right. */}
        <g fill="#c0c5d0" stroke="#7a8290" strokeWidth="0.75" strokeLinejoin="round">
          <rect x="2" y="22" width="22" height="4" />
          <rect x="6" y="18" width="18" height="4" />
          <rect x="10" y="14" width="14" height="4" />
          <rect x="14" y="10" width="10" height="4" />
          <rect x="18" y="6" width="6" height="4" />
        </g>
      </svg>
    );
  }
  if (id === 'Forklift') {
    return (
      <svg
        viewBox="0 0 28 28"
        width="28"
        height="28"
        aria-hidden="true"
        className="palette-icon-svg"
      >
        {/* Side-profile forklift: mast on the left, cab + body on the right, two wheels. */}
        <g stroke="#7a8290" strokeWidth="0.75" strokeLinejoin="round">
          {/* Mast uprights */}
          <line x1="6" y1="4" x2="6" y2="22" stroke="#c0c5d0" strokeWidth="1.5" />
          <line x1="8" y1="4" x2="8" y2="22" stroke="#c0c5d0" strokeWidth="1.5" />
          {/* Forks */}
          <path d="M3 21 L8 21 L8 19 L3 19 Z" fill="#d9a441" />
          <path d="M3 18 L8 18 L8 16 L3 16 Z" fill="#d9a441" />
          {/* Cab / body */}
          <rect x="10" y="10" width="12" height="9" fill="#d9a441" />
          {/* Overhead guard */}
          <rect x="10" y="6" width="12" height="2" fill="#c0c5d0" />
          <line x1="11" y1="8" x2="11" y2="10" stroke="#c0c5d0" strokeWidth="1" />
          <line x1="21" y1="8" x2="21" y2="10" stroke="#c0c5d0" strokeWidth="1" />
          {/* Wheels */}
          <circle cx="13" cy="22" r="3" fill="#2c2f36" />
          <circle cx="21" cy="22" r="3" fill="#2c2f36" />
        </g>
      </svg>
    );
  }
  if (id === 'shelves_01') {
    return (
      <svg
        viewBox="0 0 28 28"
        width="28"
        height="28"
        aria-hidden="true"
        className="palette-icon-svg"
      >
        {/* Front-on shelving unit: uprights + three horizontal shelves with a few boxes. */}
        <g stroke="#7a8290" strokeWidth="0.75" strokeLinejoin="round">
          {/* Uprights */}
          <rect x="3" y="3" width="2" height="22" fill="#c0c5d0" />
          <rect x="23" y="3" width="2" height="22" fill="#c0c5d0" />
          {/* Shelves */}
          <rect x="3" y="9" width="22" height="1.5" fill="#c0c5d0" />
          <rect x="3" y="16" width="22" height="1.5" fill="#c0c5d0" />
          <rect x="3" y="23" width="22" height="1.5" fill="#c0c5d0" />
          {/* Boxes on shelves */}
          <rect x="7" y="5" width="5" height="4" fill="#d9a441" />
          <rect x="14" y="4" width="6" height="5" fill="#a86d2a" />
          <rect x="6" y="12" width="4" height="4" fill="#a86d2a" />
          <rect x="12" y="11" width="5" height="5" fill="#d9a441" />
          <rect x="18" y="13" width="4" height="3" fill="#d9a441" />
          <rect x="8" y="19" width="6" height="4" fill="#d9a441" />
          <rect x="16" y="18" width="5" height="5" fill="#a86d2a" />
        </g>
      </svg>
    );
  }
  if (id === 'HospitalBed') {
    return (
      <svg
        viewBox="0 0 28 28"
        width="28"
        height="28"
        aria-hidden="true"
        className="palette-icon-svg"
      >
        {/* Side-profile hospital bed: raised headrest on left, mattress, foot panel on right, two wheels, red cross. */}
        <g stroke="#7a8290" strokeWidth="0.75" strokeLinejoin="round">
          {/* Headrest panel */}
          <rect x="2" y="9" width="2.5" height="8" fill="#c0c5d0" />
          {/* Foot panel */}
          <rect x="23.5" y="13" width="2.5" height="4" fill="#c0c5d0" />
          {/* Mattress */}
          <rect x="4" y="13" width="20" height="3.5" fill="#e8eaef" />
          {/* Pillow */}
          <rect x="5" y="11.5" width="4" height="2" fill="#ffffff" />
          {/* Red cross on the side */}
          <rect x="14" y="13.8" width="2.4" height="0.9" fill="#d04848" stroke="none" />
          <rect x="14.75" y="13.05" width="0.9" height="2.4" fill="#d04848" stroke="none" />
          {/* Frame under mattress */}
          <line x1="4" y1="17" x2="24" y2="17" stroke="#7a8290" strokeWidth="1" />
          {/* Legs */}
          <line x1="6" y1="17" x2="6" y2="21" stroke="#7a8290" strokeWidth="1" />
          <line x1="22" y1="17" x2="22" y2="21" stroke="#7a8290" strokeWidth="1" />
          {/* Wheels */}
          <circle cx="6" cy="22.5" r="2" fill="#2c2f36" />
          <circle cx="22" cy="22.5" r="2" fill="#2c2f36" />
        </g>
      </svg>
    );
  }
  return <span className="palette-icon" />;
}
