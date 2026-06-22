import { ASSET_DRAG_MIME, SHAPE_CATALOG, SHAPE_DRAG_MIME } from '../shapes';
import type { ShapeKind } from '../types';
import PaletteImporter from './PaletteImporter';

export default function ShapesPalette() {
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, kind: ShapeKind) => {
    e.dataTransfer.setData(SHAPE_DRAG_MIME, kind);
    e.dataTransfer.setData('text/plain', kind);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="palette-items">
      <PaletteImporter
        palette="shape"
        dragMime={ASSET_DRAG_MIME}
        importTitle="Import a .usd / .usda shape from your computer"
      />
      {SHAPE_CATALOG.map((s) => (
        <div
          key={s.kind}
          className="palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, s.kind)}
          title={`Drag ${s.label} into the viewport`}
        >
          <span className={`palette-icon kind-${s.kind}`} aria-hidden="true" />
          <span className="palette-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
