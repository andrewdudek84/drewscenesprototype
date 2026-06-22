import { useEffect, useMemo, useState } from 'react';
import type {
  OntologyEntity,
  OntologyEntityType,
  OntologyRelationship
} from '../ontology';
import { ASSET_DRAG_MIME, SHAPE_DRAG_MIME } from '../shapes';
import { AssetIcon } from './AssetsPalette';
import type { PrimNode, PrimPatch, ShapeKind, SubMeshInfo } from '../types';

interface Props {
  prim: PrimNode | null;
  subMesh: SubMeshInfo | null;
  /** Set when the selected prim is bound to an ontology SpatialItem. */
  mappedTo: { entityId: string; entityName: string } | null;
  onUpdate: (id: string, patch: PrimPatch) => void;
  modelType: OntologyEntityType | null;
  modelRelationship: OntologyRelationship | null;
  entityInstance: OntologyEntity | null;
  /** USD child of `entityInstance` (target of a HasUSD edge), if any. The
   *  child is hidden from the Ontology tree; its position/rotation/USD/topic
   *  /GUID are merged into the parent's Properties form so the parent row
   *  visibly owns them. Name and Description from the USD child are
   *  intentionally not surfaced — the parent's Name field wins. */
  entityUsdChild: OntologyEntity | null;
  /** Live prim id bound to `entityUsdChild`, if any. Read from App's
   *  `bindings` state — the entity record's own `guid` is only written on
   *  export, so we surface the runtime mapping directly. */
  entityUsdChildGuid: string | null;
  /** Live prim bound to `entityUsdChild`. When present, the merged USD
   *  section reads its position/rotation from the prim and writes changes
   *  back through `onUpdate` (the prim updater) so the viewport gizmo and
   *  the Properties form stay in lockstep. */
  entityUsdChildPrim: PrimNode | null;
  onRenameModelType: (oldName: string, newName: string) => void;
  onUpdateModelType: (
    name: string,
    patch: Partial<Omit<OntologyEntityType, 'name'>>
  ) => void;
  onUpdateModelRelationship: (
    oldRel: OntologyRelationship,
    nextRel: OntologyRelationship
  ) => void;
  onUpdateEntityInstance: (
    id: string,
    patch: Partial<Omit<OntologyEntity, 'id' | 'type'>>
  ) => void;
}

const AXES: Array<{ key: 'x' | 'y' | 'z'; index: 0 | 1 | 2 }> = [
  { key: 'x', index: 0 },
  { key: 'y', index: 1 },
  { key: 'z', index: 2 }
];

// Display labels for ShapeKind. The 'group' kind is surfaced as "Asset" in
// the UI; everything else uses a sentence-case version of the kind name.
const KIND_DISPLAY: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  plane: 'Plane',
  cone: 'Cone',
  group: 'Asset',
  reference: 'Reference'
};

export default function PropertiesPanel({
  prim,
  subMesh,
  mappedTo,
  onUpdate,
  modelType,
  modelRelationship,
  entityInstance,
  entityUsdChild,
  entityUsdChildGuid,
  entityUsdChildPrim,
  onRenameModelType,
  onUpdateModelType,
  onUpdateModelRelationship,
  onUpdateEntityInstance
}: Props) {
  // Floating overlay: nothing to edit -> render nothing so the viewport gets
  // the full area. (The panel itself is absolutely positioned by CSS.)
  const hasSelection =
    !!subMesh || !!entityInstance || !!prim || !!modelType || !!modelRelationship;
  if (!hasSelection) return null;

  return (
    <aside className="panel properties">
      <header className="panel-header">Properties</header>
      <div className="panel-body">
        {subMesh ? (
          <SubMeshForm subMesh={subMesh} />
        ) : entityInstance ? (
          <EntityInstanceForm
            entity={entityInstance}
            usdChild={entityUsdChild}
            usdChildGuid={entityUsdChildGuid}
            usdChildPrim={entityUsdChildPrim}
            onUpdate={onUpdateEntityInstance}
            onUpdatePrim={onUpdate}
          />
        ) : prim ? (
          <Form prim={prim} mappedTo={mappedTo} onUpdate={onUpdate} />
        ) : modelType ? (
          <ModelTypeForm
            modelType={modelType}
            onRename={onRenameModelType}
            onUpdate={onUpdateModelType}
          />
        ) : modelRelationship ? (
          <ModelRelationshipForm
            relationship={modelRelationship}
            onUpdate={onUpdateModelRelationship}
          />
        ) : (
          <div className="props-empty">
            Select a prim, instance, model type, or model relationship to edit properties.
          </div>
        )}
      </div>
    </aside>
  );
}

function ModelTypeForm({
  modelType,
  onRename,
  onUpdate
}: {
  modelType: OntologyEntityType;
  onRename: (oldName: string, newName: string) => void;
  onUpdate: (name: string, patch: Partial<Omit<OntologyEntityType, 'name'>>) => void;
}) {
  const [name, setName] = useState(modelType.name);
  const [description, setDescription] = useState(modelType.description ?? '');
  const extraProps = useMemo(
    () =>
      toStringProps(modelType, [
        'name',
        'description',
        'position',
        'rotation',
        'usd',
        'topic',
        'guid'
      ]),
    [modelType]
  );

  useEffect(() => {
    setName(modelType.name);
    setDescription(modelType.description ?? '');
  }, [modelType.name, modelType.description]);

  const setVecAxis = (
    key: 'position' | 'rotation',
    index: 0 | 1 | 2,
    raw: string
  ) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const cur =
      key === 'position'
        ? modelType.position ?? { x: 0, y: 0, z: 0 }
        : modelType.rotation ?? { x: 0, y: 0, z: 0 };
    const next = { ...cur };
    if (index === 0) next.x = v;
    else if (index === 1) next.y = v;
    else next.z = v;
    onUpdate(modelType.name, { [key]: next });
  };

  return (
    <div className="props-form">
      <Row label="Kind">
        <input className="props-input is-readonly" value="Model Type" readOnly />
      </Row>
      <Row label="Name">
        <input
          className="props-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(modelType.name, name)}
        />
      </Row>
      <Row label="Description">
        <input
          className="props-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onUpdate(modelType.name, { description })}
        />
      </Row>
      {(modelType.name === 'USD' || modelType.position || modelType.rotation) && (
        <>
          <Row label="Position">
            <div className="props-vec">
              {AXES.map(({ key, index }) => (
                <label key={key} className={`props-axis axis-${key}`}>
                  <span className="props-axis-label">{key}</span>
                  <input
                    className="props-input"
                    type="number"
                    step="0.1"
                    value={round(
                      index === 0
                        ? (modelType.position?.x ?? 0)
                        : index === 1
                          ? (modelType.position?.y ?? 0)
                          : (modelType.position?.z ?? 0)
                    )}
                    onChange={(e) => setVecAxis('position', index, e.target.value)}
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
                    step="0.1"
                    value={round(
                      index === 0
                        ? (modelType.rotation?.x ?? 0)
                        : index === 1
                          ? (modelType.rotation?.y ?? 0)
                          : (modelType.rotation?.z ?? 0)
                    )}
                    onChange={(e) => setVecAxis('rotation', index, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </Row>
        </>
      )}
      {modelType.usd !== undefined && (
        <Row label="USD">
          <UsdDropZone
            value={modelType.usd}
            onChange={(next) => onUpdate(modelType.name, { usd: next })}
          />
        </Row>
      )}
      {(modelType.name === 'USD' || modelType.topic !== undefined) && (
        <Row label="Topic">
          <input
            className="props-input"
            value={modelType.topic ?? ''}
            onChange={(e) => onUpdate(modelType.name, { topic: e.target.value })}
          />
        </Row>
      )}
      {(modelType.name === 'USD' || modelType.guid !== undefined) && (
        <Row label="GUID">
          <input
            className="props-input"
            value={modelType.guid ?? ''}
            onChange={(e) => onUpdate(modelType.name, { guid: e.target.value })}
          />
        </Row>
      )}
      <CustomPropsEditor
        title="Extra Properties"
        propsMap={extraProps}
        onAdd={(key, value) =>
          onUpdate(modelType.name, { [key]: value } as Partial<Omit<OntologyEntityType, 'name'>>)
        }
        onChange={(key, value) =>
          onUpdate(modelType.name, { [key]: value } as Partial<Omit<OntologyEntityType, 'name'>>)
        }
        onRemove={(key) =>
          onUpdate(modelType.name, { [key]: undefined } as Partial<Omit<OntologyEntityType, 'name'>>)
        }
      />
    </div>
  );
}

function ModelRelationshipForm({
  relationship,
  onUpdate
}: {
  relationship: OntologyRelationship;
  onUpdate: (oldRel: OntologyRelationship, nextRel: OntologyRelationship) => void;
}) {
  const [draft, setDraft] = useState(relationship);
  const extraProps = useMemo(
    () => toStringProps(draft, ['type', 'source', 'target', 'usd']),
    [draft]
  );

  useEffect(() => {
    setDraft(relationship);
  }, [relationship]);

  const commit = (next: OntologyRelationship) => {
    const hasUsd = Object.prototype.hasOwnProperty.call(next, 'usd');
    const normalized: OntologyRelationship = {
      ...next,
      type: next.type.trim(),
      source: next.source.trim(),
      target: next.target.trim(),
      usd: hasUsd ? (next.usd ?? '').trim() : undefined
    };
    setDraft(normalized);
    onUpdate(relationship, normalized);
  };

  return (
    <div className="props-form">
      <Row label="Kind">
        <input className="props-input is-readonly" value="Model Relationship" readOnly />
      </Row>
      <Row label="Type">
        <input
          className="props-input"
          value={draft.type}
          onChange={(e) => {
            const next = { ...draft, type: e.target.value };
            setDraft(next);
          }}
          onBlur={() => commit(draft)}
        />
      </Row>
      <Row label="Source">
        <input
          className="props-input"
          value={draft.source}
          onChange={(e) => setDraft((cur) => ({ ...cur, source: e.target.value }))}
          onBlur={() => commit(draft)}
        />
      </Row>
      <Row label="Target">
        <input
          className="props-input"
          value={draft.target}
          onChange={(e) => setDraft((cur) => ({ ...cur, target: e.target.value }))}
          onBlur={() => commit(draft)}
        />
      </Row>
      {(draft.usd !== undefined || relationship.usd !== undefined) && (
        <Row label="USD">
          <input
            className="props-input"
            value={draft.usd ?? ''}
            onChange={(e) => setDraft((cur) => ({ ...cur, usd: e.target.value }))}
            onBlur={() => commit(draft)}
          />
        </Row>
      )}
      <CustomPropsEditor
        title="Extra Properties"
        propsMap={extraProps}
        onAdd={(key, value) => {
          const next = { ...draft, [key]: value } as OntologyRelationship;
          setDraft(next);
          commit(next);
        }}
        onChange={(key, value) => {
          const next = { ...draft, [key]: value } as OntologyRelationship;
          setDraft(next);
          commit(next);
        }}
        onRemove={(key) => {
          const next = { ...draft } as Record<string, unknown>;
          delete next[key];
          const rel = next as unknown as OntologyRelationship;
          setDraft(rel);
          commit(rel);
        }}
      />
    </div>
  );
}

function EntityInstanceForm({
  entity,
  usdChild,
  usdChildGuid,
  usdChildPrim,
  onUpdate,
  onUpdatePrim
}: {
  entity: OntologyEntity;
  /** Hidden USD-child of `entity`. When present, its pose/USD/topic/GUID are
   *  rendered under a "USD" subheader so the parent row owns them in UX
   *  (the child entity is filtered out of the Ontology tree). */
  usdChild: OntologyEntity | null;
  /** Runtime prim id bound to `usdChild`. Shown read-only in the merged
   *  section — it's the live mapping into the viewport. */
  usdChildGuid: string | null;
  /** Live prim for `usdChild`. When set, the merged section's position and
   *  rotation are sourced from and written to this prim, keeping the form
   *  and the viewport gizmo in sync. */
  usdChildPrim: PrimNode | null;
  onUpdate: (
    id: string,
    patch: Partial<Omit<OntologyEntity, 'id' | 'type'>>
  ) => void;
  /** Prim patcher — same callback used by the standard prim Form. */
  onUpdatePrim: (id: string, patch: PrimPatch) => void;
}) {
  const [name, setName] = useState(entity.name);
  const extraProps = useMemo(
    () =>
      toStringProps(entity, [
        'id',
        'type',
        'name',
        'position',
        'rotation',
        'usd',
        'topic',
        'guid'
      ]),
    [entity]
  );

  useEffect(() => {
    setName(entity.name);
  }, [entity.id, entity.name]);

  // Pose setter for either the parent entity or its USD child, picked via
  // `target`. The child route is used by the merged USD section below.
  const setVecAxis = (
    target: OntologyEntity,
    key: 'position' | 'rotation',
    index: 0 | 1 | 2,
    raw: string
  ) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const cur =
      key === 'position'
        ? target.position ?? { x: 0, y: 0, z: 0 }
        : target.rotation ?? { x: 0, y: 0, z: 0 };
    const next = { ...cur };
    if (index === 0) next.x = v;
    else if (index === 1) next.y = v;
    else next.z = v;
    onUpdate(target.id, { [key]: next });
  };

  return (
    <div className="props-form">
      <Row label="Kind">
        <input className="props-input is-readonly" value="Entity Instance" readOnly />
      </Row>
      <Row label="ID">
        <input className="props-input is-readonly" value={entity.id} readOnly />
      </Row>
      <Row label="Type">
        <input className="props-input is-readonly" value={entity.type} readOnly />
      </Row>
      <Row label="Name">
        <input
          className="props-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== entity.name) {
              onUpdate(entity.id, { name: trimmed });
            } else {
              setName(entity.name);
            }
          }}
        />
      </Row>
      {(entity.position || entity.rotation || entity.type === 'USD') && (
        <>
          <Row label="Position">
            <div className="props-vec">
              {AXES.map(({ key, index }) => (
                <label key={key} className={`props-axis axis-${key}`}>
                  <span className="props-axis-label">{key}</span>
                  <input
                    className="props-input"
                    type="number"
                    step="0.1"
                    value={round(
                      index === 0
                        ? (entity.position?.x ?? 0)
                        : index === 1
                          ? (entity.position?.y ?? 0)
                          : (entity.position?.z ?? 0)
                    )}
                    onChange={(e) => setVecAxis(entity, 'position', index, e.target.value)}
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
                    step="0.1"
                    value={round(
                      index === 0
                        ? (entity.rotation?.x ?? 0)
                        : index === 1
                          ? (entity.rotation?.y ?? 0)
                          : (entity.rotation?.z ?? 0)
                    )}
                    onChange={(e) => setVecAxis(entity, 'rotation', index, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </Row>
        </>
      )}
      {entity.usd !== undefined && (
        <Row label="USD">
          <UsdDropZone
            value={entity.usd}
            onChange={(next) => onUpdate(entity.id, { usd: next })}
          />
        </Row>
      )}
      {entity.topic !== undefined && (
        <Row label="Topic">
          <input
            className="props-input"
            value={entity.topic ?? ''}
            onChange={(e) => onUpdate(entity.id, { topic: e.target.value })}
          />
        </Row>
      )}
      {usdChild && (
        <UsdChildSection
          child={usdChild}
          guid={usdChildGuid}
          prim={usdChildPrim}
          onUpdate={onUpdate}
          onUpdatePrim={onUpdatePrim}
          setVecAxis={setVecAxis}
        />
      )}
      <CustomPropsEditor
        title="Extra Properties"
        propsMap={extraProps}
        onAdd={(key, value) =>
          onUpdate(entity.id, { [key]: value } as Partial<Omit<OntologyEntity, 'id' | 'type'>>)
        }
        onChange={(key, value) =>
          onUpdate(entity.id, { [key]: value } as Partial<Omit<OntologyEntity, 'id' | 'type'>>)
        }
        onRemove={(key) =>
          onUpdate(entity.id, { [key]: undefined } as Partial<Omit<OntologyEntity, 'id' | 'type'>>)
        }
      />
    </div>
  );
}

// Merged subsection for a hidden USD-child entity. Renders only the fields
// the parent row should "own" in the UI — name and description are skipped
// on purpose (the parent's Name field is the canonical one).
function UsdChildSection({
  child,
  guid,
  prim,
  onUpdate,
  onUpdatePrim,
  setVecAxis
}: {
  child: OntologyEntity;
  /** Runtime prim id from App's bindings — empty/null when the child has no
   *  spawned prim yet (e.g. its USD path is blank). Shown read-only because
   *  it's owned by the viewport binding, not user input. */
  guid: string | null;
  /** Live prim bound to `child`. When present, position/rotation read from
   *  and write to the prim so the form and the viewport gizmo stay synced.
   *  When null (no binding yet), we fall back to editing the entity record
   *  directly so the values are still persisted. */
  prim: PrimNode | null;
  onUpdate: (
    id: string,
    patch: Partial<Omit<OntologyEntity, 'id' | 'type'>>
  ) => void;
  onUpdatePrim: (id: string, patch: PrimPatch) => void;
  setVecAxis: (
    target: OntologyEntity,
    key: 'position' | 'rotation',
    index: 0 | 1 | 2,
    raw: string
  ) => void;
}) {
  // Read position/rotation. When a prim is bound, prefer its live values so
  // the form moves with the viewport gizmo; otherwise fall back to the
  // entity record. Rotation is stored as radians on the prim (matching the
  // standard prim Form) and displayed/edited in degrees here.
  const posTriple: [number, number, number] = prim
    ? [prim.position[0], prim.position[1], prim.position[2]]
    : [child.position?.x ?? 0, child.position?.y ?? 0, child.position?.z ?? 0];
  const rotTripleDeg: [number, number, number] = prim
    ? [
        (prim.rotation[0] * 180) / Math.PI,
        (prim.rotation[1] * 180) / Math.PI,
        (prim.rotation[2] * 180) / Math.PI
      ]
    : [child.rotation?.x ?? 0, child.rotation?.y ?? 0, child.rotation?.z ?? 0];

  const setPositionAxis = (index: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    if (prim) {
      const next = [...prim.position] as PrimNode['position'];
      next[index] = v;
      onUpdatePrim(prim.id, { position: next });
    } else {
      setVecAxis(child, 'position', index, raw);
    }
  };
  const setRotationAxis = (index: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    if (prim) {
      const next = [...prim.rotation] as PrimNode['rotation'];
      next[index] = (v * Math.PI) / 180;
      onUpdatePrim(prim.id, { rotation: next });
    } else {
      setVecAxis(child, 'rotation', index, raw);
    }
  };
  return (
    <>
      <div className="props-section-header">USD</div>
      <Row label="Position">
        <div className="props-vec">
          {AXES.map(({ key, index }) => (
            <label key={key} className={`props-axis axis-${key}`}>
              <span className="props-axis-label">{key}</span>
              <input
                className="props-input"
                type="number"
                step="0.1"
                value={round(posTriple[index])}
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
                step="0.1"
                value={round(rotTripleDeg[index])}
                onChange={(e) => setRotationAxis(index, e.target.value)}
              />
            </label>
          ))}
        </div>
      </Row>
      <Row label="USD">
        <UsdDropZone
          value={child.usd ?? ''}
          onChange={(next) => onUpdate(child.id, { usd: next })}
        />
      </Row>
      <Row label="Topic">
        <input
          className="props-input"
          value={child.topic ?? ''}
          onChange={(e) => onUpdate(child.id, { topic: e.target.value })}
        />
      </Row>
      <Row label="GUID">
        <input
          className="props-input is-readonly"
          value={guid ?? ''}
          readOnly
        />
      </Row>
    </>
  );
}

// Read-only view for a node *inside* a loaded reference asset. Transforms
// of asset-internal nodes aren't user-editable here (the gizmo always drives
// the parent prim), so we just display the picked node's name and local
// pose. ID/Kind are intentionally omitted.
function SubMeshForm({ subMesh }: { subMesh: SubMeshInfo }) {
  return (
    <div className="props-form">
      <Row label="Name">
        <input className="props-input is-readonly" value={subMesh.name} readOnly />
      </Row>
      <Row label="Position">
        <div className="props-vec">
          {AXES.map(({ key, index }) => (
            <label key={key} className={`props-axis axis-${key}`}>
              <span className="props-axis-label">{key}</span>
              <input
                className="props-input is-readonly"
                type="number"
                value={round(subMesh.position[index])}
                readOnly
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
                className="props-input is-readonly"
                type="number"
                value={round((subMesh.rotation[index] * 180) / Math.PI)}
                readOnly
              />
            </label>
          ))}
        </div>
      </Row>
    </div>
  );
}

function Form({
  prim,
  mappedTo,
  onUpdate
}: {
  prim: PrimNode;
  mappedTo: { entityId: string; entityName: string } | null;
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

  const setScaleAxis = (index: 0 | 1 | 2, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const next = [...prim.scale] as PrimNode['scale'];
    next[index] = v;
    onUpdate(prim.id, { scale: next });
  };

  return (
    <div className="props-form">
      <Row label="ID">
        <input className="props-input is-readonly" value={prim.id} readOnly />
      </Row>
      <Row label="Kind">
        <input
          className="props-input is-readonly"
          value={KIND_DISPLAY[prim.kind]}
          readOnly
        />
      </Row>
      {mappedTo && (
        <Row label="Mapped">
          <input
            className="props-input is-readonly"
            value={`${mappedTo.entityName} (${mappedTo.entityId})`}
            readOnly
          />
        </Row>
      )}
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
      <Row label="Scale">
        <div className="props-vec">
          {AXES.map(({ key, index }) => (
            <label key={key} className={`props-axis axis-${key}`}>
              <span className="props-axis-label">{key}</span>
              <input
                className="props-input"
                type="number"
                step="0.1"
                value={round(prim.scale[index])}
                onChange={(e) => setScaleAxis(index, e.target.value)}
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
        <ColorRow color={prim.color} onChange={(c) => onUpdate(prim.id, { color: c })} />
      ) : null}
      <CustomPropsEditor
        title="Custom Properties"
        propsMap={prim.customProps ?? {}}
        onAdd={(key, value) =>
          onUpdate(prim.id, {
            customProps: { ...(prim.customProps ?? {}), [key]: value }
          })
        }
        onChange={(key, value) =>
          onUpdate(prim.id, {
            customProps: { ...(prim.customProps ?? {}), [key]: value }
          })
        }
        onRemove={(key) => {
          const next = { ...(prim.customProps ?? {}) };
          delete next[key];
          onUpdate(prim.id, { customProps: next });
        }}
      />
    </div>
  );
}

function CustomPropsEditor({
  title,
  propsMap,
  onAdd,
  onChange,
  onRemove
}: {
  title: string;
  propsMap: Record<string, string>;
  onAdd: (key: string, value: string) => void;
  onChange: (key: string, value: string) => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  return (
    <div className="props-custom-block">
      <div className="props-custom-title">{title}</div>
      {Object.entries(propsMap).map(([k, v]) => (
        <div className="props-custom-row" key={k}>
          <input className="props-input is-readonly" value={k} readOnly />
          <input
            className="props-input"
            value={v}
            onChange={(e) => onChange(k, e.target.value)}
          />
          <button
            type="button"
            className="model-rel-btn"
            onClick={() => onRemove(k)}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="props-custom-row">
        <input
          className="props-input"
          placeholder="property"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <input
          className="props-input"
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <button
          type="button"
          className="model-rel-btn"
          onClick={() => {
            const k = newKey.trim();
            if (!k) return;
            onAdd(k, newValue);
            setNewKey('');
            setNewValue('');
          }}
        >
          Add
        </button>
      </div>
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

function UsdDropZone({
  value,
  onChange
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [over, setOver] = useState(false);

  const resolve = (ev: React.DragEvent): string | null => {
    const shape = ev.dataTransfer.getData(SHAPE_DRAG_MIME);
    if (shape && shape !== 'group') {
      const file = shape.charAt(0).toUpperCase() + shape.slice(1);
      return `usd_shapes/${file}.usda`;
    }
    const asset = ev.dataTransfer.getData(ASSET_DRAG_MIME);
    if (asset) return `usd_assets/${asset}.usda`;
    return null;
  };

  const onDragOver = (ev: React.DragEvent) => {
    const types = ev.dataTransfer.types;
    if (!types.includes(SHAPE_DRAG_MIME) && !types.includes(ASSET_DRAG_MIME)) {
      return;
    }
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };
  const onDragLeave = () => setOver(false);
  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    setOver(false);
    const next = resolve(ev);
    if (next) onChange(next);
  };

  const icon = renderUsdIcon(value);

  return (
    <div
      className={'usd-drop' + (over ? ' is-drop-target' : '')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {icon && <span className="usd-drop-icon">{icon}</span>}
      <input
        className="props-input usd-drop-input"
        value={value}
        placeholder="Drag a shape or asset here"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Returns a small icon node for a USD path pointing at a known shape or asset.
// Returns null when the path is empty or doesn't match a known location.
function renderUsdIcon(value: string): React.ReactNode | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const shapeMatch = /(?:^|\/)usd_shapes\/([^/]+)\.usd[ac]?$/i.exec(v);
  if (shapeMatch) {
    const kind = shapeMatch[1].toLowerCase() as ShapeKind;
    return <span className={`palette-icon kind-${kind}`} aria-hidden="true" />;
  }
  const assetMatch = /(?:^|\/)usd_assets\/([^/]+)\.usd[ac]?$/i.exec(v);
  if (assetMatch) {
    return <AssetIcon id={assetMatch[1]} />;
  }
  return null;
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function toStringProps(
  obj: object,
  excluded: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  const exclude = new Set(excluded);
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (exclude.has(k)) continue;
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object') continue;
    out[k] = String(v);
  }
  return out;
}

// Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` into the 6-digit base color and a
// 0..1 alpha. Anything unparseable is treated as opaque white-grey so the
// inputs stay editable instead of falling back to an empty string.
function parseColor(raw: string): { hex6: string; alpha: number } {
  const s = (raw ?? '').trim();
  const m8 = /^#?([0-9a-fA-F]{8})$/.exec(s);
  if (m8) {
    const h = m8[1];
    return {
      hex6: `#${h.slice(0, 6).toLowerCase()}`,
      alpha: parseInt(h.slice(6, 8), 16) / 255
    };
  }
  const m6 = /^#?([0-9a-fA-F]{6})$/.exec(s);
  if (m6) return { hex6: `#${m6[1].toLowerCase()}`, alpha: 1 };
  const m3 = /^#?([0-9a-fA-F]{3})$/.exec(s);
  if (m3) {
    const h = m3[1];
    return {
      hex6: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase(),
      alpha: 1
    };
  }
  return { hex6: '#b3b3b8', alpha: 1 };
}

// Re-encode into 6 or 8 digit hex depending on whether alpha is fully opaque.
function formatColor(hex6: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (a >= 0.9999) return hex6.toLowerCase();
  const aa = Math.round(a * 255).toString(16).padStart(2, '0');
  return `${hex6.toLowerCase()}${aa}`;
}

function ColorRow({
  color,
  onChange
}: {
  color: string;
  onChange: (next: string) => void;
}) {
  const { hex6, alpha } = parseColor(color);
  const alphaPct = Math.round(alpha * 100);
  return (
    <>
      <Row label="Color">
        <div className="props-color">
          <input
            type="color"
            className="props-color-swatch"
            value={hex6}
            onChange={(e) => onChange(formatColor(e.target.value, alpha))}
          />
          <input
            type="text"
            className="props-input"
            value={color}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) {
                onChange(v);
              }
            }}
          />
        </div>
      </Row>
      <Row label="Alpha">
        <div className="props-alpha">
          <input
            type="range"
            className="props-alpha-slider"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onChange={(e) => onChange(formatColor(hex6, Number(e.target.value)))}
          />
          <input
            type="number"
            className="props-input props-alpha-num"
            min={0}
            max={1}
            step={0.01}
            value={round(alpha)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                onChange(formatColor(hex6, Math.max(0, Math.min(1, n))));
              }
            }}
          />
          <span className="props-alpha-pct">{alphaPct}%</span>
        </div>
      </Row>
    </>
  );
}
