import type { PrimNode, PrimPatch } from '../types';

interface Props {
  prim: PrimNode | null;
  onUpdate: (id: string, patch: PrimPatch) => void;
}

const AXES: Array<{ key: 'x' | 'y' | 'z'; index: 0 | 1 | 2 }> = [
  { key: 'x', index: 0 },
  { key: 'y', index: 1 },
  { key: 'z', index: 2 }
];

export default function PropertiesPanel({ prim, onUpdate }: Props) {
  return (
    <aside className="panel properties">
      <header className="panel-header">Properties</header>
      <div className="panel-body">
        {prim === null ? (
          <div className="props-empty">
            Select a prim to edit its properties.
          </div>
        ) : (
          <Form prim={prim} onUpdate={onUpdate} />
        )}
      </div>
    </aside>
  );
}

function Form({
  prim,
  onUpdate
}: {
  prim: PrimNode;
  onUpdate: (id: string, patch: PrimPatch) => void;
}) {
  const setPositionAxis = (index: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const next = [...prim.position] as PrimNode['position'];
    next[index] = v;
    onUpdate(prim.id, { position: next });
  };

  const setRotationAxisDeg = (index: 0 | 1 | 2, raw: string) => {
    const deg = Number(raw);
    if (!Number.isFinite(deg)) return;
    const next = [...prim.rotation] as PrimNode['rotation'];
    next[index] = (deg * Math.PI) / 180;
    onUpdate(prim.id, { rotation: next });
  };

  return (
    <div className="props-form">
      <Row label="ID">
        <input className="props-input is-readonly" value={prim.id} readOnly />
      </Row>
      <Row label="Kind">
        <span className="props-static">{prim.kind}</span>
      </Row>
      <Row label="Name">
        <input
          className="props-input"
          value={prim.name}
          onChange={(e) => onUpdate(prim.id, { name: e.target.value })}
        />
      </Row>
      <Row label="Position">
        <div className="props-vec">
          {AXES.map(({ key, index }) => (
            <label key={key} className={`props-axis axis-${key}`}>
              <span className="props-axis-label">{key}</span>
              <input
                className="props-input"
                type="number"
                step="0.1"
                value={round(prim.position[index])}
                onChange={(e) => setPositionAxis(index, e.target.value)}
              />
            </label>
          ))}
        </div>
      </Row>
      <Row label="Rotation">
        <div className="props-vec">
          {AXES.map(({ key, index }) => (
            <label key={key} className={`props-axis axis-${key}`}>
              <span className="props-axis-label">{key}</span>
              <input
                className="props-input"
                type="number"
                step="5"
                value={round((prim.rotation[index] * 180) / Math.PI)}
                onChange={(e) => setRotationAxisDeg(index, e.target.value)}
              />
            </label>
          ))}
        </div>
      </Row>
      {prim.kind === 'reference' ? (
        <Row label="Source">
          <input
            className="props-input"
            type="text"
            value={prim.assetSource ?? ''}
            placeholder="./Forklift/Forklift.glb"
            spellCheck={false}
            onChange={(e) => onUpdate(prim.id, { assetSource: e.target.value })}
          />
        </Row>
      ) : prim.kind !== 'group' ? (
        <Row label="Color">
          <div className="props-color">
            <input
              type="color"
              className="props-color-swatch"
              value={prim.color}
              onChange={(e) => onUpdate(prim.id, { color: e.target.value })}
            />
            <input
              type="text"
              className="props-input"
              value={prim.color}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  onUpdate(prim.id, { color: v });
                }
              }}
            />
          </div>
        </Row>
      ) : null}
    </div>
  );
}

function Row({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="props-row">
      <div className="props-label">{label}</div>
      <div className="props-value">{children}</div>
    </div>
  );
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
