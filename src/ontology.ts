// Shared ontology data + types. Loaded once from the bundled JSON; consumers
// keep their own mutable state (e.g. App's `bindings`) keyed by entity id.

import hospitalOntologyRaw from '../onotologies/hospital.json?raw';

export interface OntologyEntity {
  id: string;
  type: string;
  name: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  usd?: string;
  topic?: string;
  /** Prim id of the bound scene object. Empty/absent when unbound. Written
   *  on export by `applyBindingsToOntology` and read on import to restore the
   *  asset ↔ SpatialItem mapping. */
  guid?: string;
}

export interface OntologyRelationship {
  type: string;
  source: string;
  target: string;
  /** Optional USD asset path used by model-side relationships (e.g.
   *  HasUSD, HasChild). */
  usd?: string;
}

/** A type definition from the model section. These records hold type metadata;
 *  model-to-model links live in `model.relationships` (e.g. HasChild,
 *  HasUSD). */
export interface OntologyEntityType {
  name: string;
  description?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  /** Path to a USD asset (shape or asset) that visually represents this
   *  entity type. Edited via the dashed drop zone in the Properties panel —
   *  drop a shape or asset from the palettes to set it. */
  usd?: string;
  topic?: string;
  guid?: string;
}

export interface OntologyRelationshipType {
  name: string;
  description?: string;
}

export interface OntologyModel {
  entityTypes: OntologyEntityType[];
  relationshipTypes: OntologyRelationshipType[];
  relationships?: OntologyRelationship[];
}

/** Full ontology document as authored in `onotologies/hospital.json`. */
export interface OntologyDoc {
  model?: OntologyModel;
  instances: {
    entities: OntologyEntity[];
    relationships: OntologyRelationship[];
  };
}

/** Back-compat alias retained because other modules import the old name. */
export type OntologyData = OntologyDoc;

export interface OntologyNode {
  entity: OntologyEntity;
  children: OntologyNode[];
}

/** Tree node for the model-side hierarchy (entity types, not instances). */
export interface ModelNode {
  type: OntologyEntityType;
  children: ModelNode[];
}

/** In-memory override applied to a SpatialItem after a successful asset drop. */
export interface SpatialBinding {
  usd: string;
  guid: string;
  name: string;
}

// Runtime instance tree relationships:
//   - HasChild: source is the parent of target.
//   - HasUSD:   source owns the USD child target.
// Legacy data is still accepted by mapping ChildOf/HasSpatial accordingly.
// Roots are entities that never appear as a "child" in either mapping.
function buildTree(entities: OntologyEntity[], relationships: OntologyRelationship[]): OntologyNode[] {
  const byId = new Map(entities.map((e) => [e.id, e] as const));
  const childrenOf = new Map<string, string[]>();
  const isChild = new Set<string>();

  const addChild = (parentId: string, childId: string) => {
    if (!byId.has(parentId) || !byId.has(childId)) return;
    const list = childrenOf.get(parentId) ?? [];
    list.push(childId);
    childrenOf.set(parentId, list);
    isChild.add(childId);
  };

  for (const r of relationships) {
    if (r.type === 'HasChild' || r.type === 'HasUSD') {
      addChild(r.source, r.target);
    } else if (r.type === 'ChildOf') {
      addChild(r.target, r.source);
    } else if (r.type === 'HasSpatial') {
      addChild(r.source, r.target);
    }
  }

  const build = (id: string): OntologyNode => ({
    entity: byId.get(id)!,
    children: (childrenOf.get(id) ?? []).map(build)
  });

  return entities.filter((e) => !isChild.has(e.id)).map((e) => build(e.id));
}

/** Build the runtime `{entities, roots}` view from a parsed ontology doc. */
export function buildOntology(doc: OntologyDoc): {
  entities: OntologyEntity[];
  roots: OntologyNode[];
} {
  const { entities, relationships } = doc.instances;
  return { entities, roots: buildTree(entities, relationships) };
}

/** Build a hierarchy of entity types from model-side relationships.
 *  HasChild(source -> target) defines parent -> child edges. The model is a
 *  DAG: a type with multiple HasChild parents is rendered once under each
 *  parent (the underlying type object is shared, so edits propagate). Cycles
 *  are broken at expansion time by skipping any child already present in the
 *  current ancestor chain. Legacy `parent` fields are accepted as fallback
 *  for older files. */
export function buildModelTree(doc: OntologyDoc): ModelNode[] {
  const types = doc.model?.entityTypes ?? [];
  if (types.length === 0) return [];
  const byName = new Map(types.map((t) => [t.name, t] as const));

  // parent -> ordered list of children (deduped).
  const childrenOf = new Map<string, string[]>();
  // set of types that appear as a HasChild target at least once.
  const isChild = new Set<string>();
  const pushEdge = (parent: string, child: string) => {
    if (parent === child) return;
    if (!byName.has(parent) || !byName.has(child)) return;
    if (child === 'USD') return;
    const list = childrenOf.get(parent) ?? [];
    if (list.includes(child)) return;
    list.push(child);
    childrenOf.set(parent, list);
    isChild.add(child);
  };

  for (const r of doc.model?.relationships ?? []) {
    if (r.type !== 'HasChild') continue;
    pushEdge(r.source, r.target);
  }

  // Back-compat fallback for old docs that still encode parent on type rows.
  for (const t of types) {
    const legacyParent = (t as { parent?: string }).parent;
    if (!legacyParent) continue;
    pushEdge(legacyParent, t.name);
  }

  const build = (name: string, ancestors: Set<string>): ModelNode => {
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(name);
    const children = (childrenOf.get(name) ?? [])
      .filter((c) => !nextAncestors.has(c))
      .map((c) => build(c, nextAncestors));
    return {
      type: byName.get(name)!,
      children
    };
  };

  return types.filter((t) => !isChild.has(t.name)).map((t) => build(t.name, new Set()));
}

/** Parse the bundled hospital ontology into its raw doc form. Used as the
 *  startup default and for callers that want to deep-clone for editing. */
export function loadHospitalOntologyDoc(): OntologyDoc {
  return JSON.parse(hospitalOntologyRaw) as OntologyDoc;
}

let cached: { entities: OntologyEntity[]; roots: OntologyNode[] } | null = null;
export function loadHospitalOntology(): {
  entities: OntologyEntity[];
  roots: OntologyNode[];
} {
  if (cached) return cached;
  cached = buildOntology(loadHospitalOntologyDoc());
  return cached;
}

/** Return a deep-cloned ontology doc with each SpatialItem's `usd` and `guid`
 *  overridden by the matching live binding (if any). Entities without a
 *  binding have their `usd` / `guid` cleared so the exported doc is
 *  self-consistent (no stale mappings carry over from a previous load).
 *
 *  When `primPoseById` is supplied, the live local pose of the bound prim
 *  is also copied into the entity's `position` / `rotation` so the saved
 *  ontology captures whatever the viewport gizmo last produced. Without
 *  this, an exported entity would freeze at whatever pose it had at
 *  creation time. */
export function applyBindingsToOntology(
  doc: OntologyDoc,
  bindings: Record<string, SpatialBinding>,
  primPoseById?: Map<string, { position: [number, number, number]; rotation: [number, number, number] }>
): OntologyDoc {
  const clone = JSON.parse(JSON.stringify(doc)) as OntologyDoc;
  for (const e of clone.instances.entities) {
    const b = bindings[e.id];
    if (b) {
      e.usd = b.usd;
      e.guid = b.guid;
      const pose = primPoseById?.get(b.guid);
      if (pose) {
        e.position = { x: pose.position[0], y: pose.position[1], z: pose.position[2] };
        e.rotation = { x: pose.rotation[0], y: pose.rotation[1], z: pose.rotation[2] };
      }
    } else if ('guid' in e || 'usd' in e) {
      if (e.usd) e.usd = '';
      if (e.guid) e.guid = '';
    }
  }
  return clone;
}

// ---------- Mutations ----------
// All mutation helpers return a NEW deep-cloned doc; callers replace the
// previous `ontologyDoc` state in App so React picks up the change.

function cloneDoc(doc: OntologyDoc): OntologyDoc {
  return JSON.parse(JSON.stringify(doc)) as OntologyDoc;
}

function ensureModel(doc: OntologyDoc): OntologyModel {
  if (!doc.model) {
    doc.model = { entityTypes: [], relationshipTypes: [], relationships: [] };
  } else {
    doc.model.entityTypes = doc.model.entityTypes ?? [];
    doc.model.relationshipTypes = doc.model.relationshipTypes ?? [];
    doc.model.relationships = doc.model.relationships ?? [];
  }
  return doc.model;
}

/** Defaults applied to every newly-created entity model. Hard-coded here
 *  (not in the user-facing ontology file) so a fresh type shows the
 *  Description + USD rows in the Properties panel out of the box. */
export const DEFAULT_ENTITY_TYPE: Readonly<OntologyEntityType> = {
  name: 'NewType',
  description: 'A new model entity type.',
  usd: ''
};

export function addEntityType(
  doc: OntologyDoc,
  name: string,
  description?: string
): OntologyDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  if (model.entityTypes.some((t) => t.name === trimmed)) return doc;
  model.entityTypes.push({
    ...DEFAULT_ENTITY_TYPE,
    name: trimmed,
    description: description?.trim() ?? DEFAULT_ENTITY_TYPE.description
  });
  return next;
}

export function renameEntityType(
  doc: OntologyDoc,
  oldName: string,
  newName: string
): OntologyDoc {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return doc;
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  if (model.entityTypes.some((t) => t.name === trimmed)) return doc;
  const t = model.entityTypes.find((x) => x.name === oldName);
  if (!t) return doc;
  t.name = trimmed;
  for (const r of model.relationships ?? []) {
    if (r.source === oldName) r.source = trimmed;
    if (r.target === oldName) r.target = trimmed;
  }
  for (const e of next.instances.entities) {
    if (e.type === oldName) e.type = trimmed;
  }
  return next;
}

export function removeEntityType(doc: OntologyDoc, name: string): OntologyDoc {
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  const before = model.entityTypes.length;
  model.entityTypes = model.entityTypes.filter((t) => t.name !== name);
  if (model.entityTypes.length === before) return doc;
  model.relationships = (model.relationships ?? []).filter(
    (r) => r.source !== name && r.target !== name
  );
  // Cascade: drop all instances of this type and any relationship that
  // referenced them.
  const removedIds = new Set<string>();
  next.instances.entities = next.instances.entities.filter((e) => {
    if (e.type === name) {
      removedIds.add(e.id);
      return false;
    }
    return true;
  });
  if (removedIds.size > 0) {
    next.instances.relationships = next.instances.relationships.filter(
      (r) => !removedIds.has(r.source) && !removedIds.has(r.target)
    );
  }
  return next;
}

export function moveEntityType(
  doc: OntologyDoc,
  name: string,
  direction: -1 | 1
): OntologyDoc {
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  const idx = model.entityTypes.findIndex((t) => t.name === name);
  if (idx < 0) return doc;
  const swap = idx + direction;
  if (swap < 0 || swap >= model.entityTypes.length) return doc;
  const tmp = model.entityTypes[idx];
  model.entityTypes[idx] = model.entityTypes[swap];
  model.entityTypes[swap] = tmp;
  return next;
}

/** Patch editable properties on a model entity type (except name). */
export function updateEntityType(
  doc: OntologyDoc,
  name: string,
  patch: Partial<Omit<OntologyEntityType, 'name'>>
): OntologyDoc {
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  const t = model.entityTypes.find((x) => x.name === name);
  if (!t) return doc;
  const bag = t as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete bag[k];
    else bag[k] = v;
  }
  return next;
}

/** Set (or clear, with `null`) a model-side HasChild parent edge. When
 *  clearing, prunes any instance-side HasChild edges whose (parent.type ->
 *  child.type) pair is no longer permitted by the model. */
export function setEntityTypeParent(
  doc: OntologyDoc,
  name: string,
  newParent: string | null
): OntologyDoc {
  if (newParent === name) return doc;
  if (name === 'USD' && newParent !== null) return doc;
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  if (!model.entityTypes.some((t) => t.name === name)) return doc;
  const relationships = model.relationships ?? [];
  if (newParent) {
    if (!model.entityTypes.some((t) => t.name === newParent)) return doc;
    if (wouldCreateHasChildCycle(relationships, newParent, name)) return doc;
    model.relationships = relationships.filter(
      (r) => !(r.type === 'HasChild' && r.target === name)
    );
    model.relationships.push({ type: 'HasChild', source: newParent, target: name });
    pruneInstanceHasChildEdges(next);
    return next;
  }

  model.relationships = relationships.filter(
    (r) => !(r.type === 'HasChild' && r.target === name)
  );
  pruneInstanceHasChildEdges(next);
  return next;
}

/** Add a HasChild parent edge to `name` without disturbing existing parents.
 *  No-op if the edge already exists or would create a cycle. Used by the
 *  Entity Models drag-drop, which is now additive (a type may have multiple
 *  HasChild parents). */
export function addEntityTypeParent(
  doc: OntologyDoc,
  name: string,
  parent: string
): OntologyDoc {
  if (!name || !parent || parent === name) return doc;
  if (name === 'USD') return doc;
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  if (!model.entityTypes.some((t) => t.name === name)) return doc;
  if (!model.entityTypes.some((t) => t.name === parent)) return doc;
  const rels = model.relationships ?? [];
  const exists = rels.some(
    (r) => r.type === 'HasChild' && r.source === parent && r.target === name
  );
  if (exists) return doc;
  if (wouldCreateHasChildCycle(rels, parent, name)) return doc;
  model.relationships = [...rels, { type: 'HasChild', source: parent, target: name }];
  return next;
}

/** Remove a single HasChild parent edge. Other parents (if any) survive.
 *  Also prunes any instance-side HasChild edges that the model no longer
 *  permits — orphaned child instances stay in place at root level so the
 *  user can reparent or delete them. */
export function removeEntityTypeParent(
  doc: OntologyDoc,
  name: string,
  parent: string
): OntologyDoc {
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  const before = (model.relationships ?? []).length;
  model.relationships = (model.relationships ?? []).filter(
    (r) => !(r.type === 'HasChild' && r.source === parent && r.target === name)
  );
  if (model.relationships.length === before) return doc;
  pruneInstanceHasChildEdges(next);
  return next;
}

/** Drop every instance-side HasChild edge whose (parent.type -> child.type)
 *  pair no longer matches a HasChild edge in the model. Call after any
 *  mutation that removes or rewrites model HasChild edges to keep the
 *  instance side consistent. Mutates `doc.instances.relationships` in place.
 *  Edges referencing missing entity ids are left alone (they're a different
 *  consistency issue, handled elsewhere). */
function pruneInstanceHasChildEdges(doc: OntologyDoc): void {
  const model = doc.model;
  if (!model) return;
  const allowed = new Set<string>();
  for (const r of model.relationships ?? []) {
    if (r.type === 'HasChild') allowed.add(`${r.source}>${r.target}`);
  }
  const entityById = new Map(
    doc.instances.entities.map((e) => [e.id, e] as const)
  );
  doc.instances.relationships = doc.instances.relationships.filter((r) => {
    if (r.type !== 'HasChild') return true;
    const src = entityById.get(r.source);
    const tgt = entityById.get(r.target);
    if (!src || !tgt) return true;
    return allowed.has(`${src.type}>${tgt.type}`);
  });
}

/** True iff adding `HasChild source=parent target=child` would close a cycle
 *  via any existing HasChild path (i.e. `parent` is already a descendant of
 *  `child`). */
function wouldCreateHasChildCycle(
  relationships: OntologyRelationship[],
  parent: string,
  child: string
): boolean {
  if (parent === child) return true;
  const parentsOf = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== 'HasChild') continue;
    const list = parentsOf.get(r.target) ?? [];
    list.push(r.source);
    parentsOf.set(r.target, list);
  }
  const stack = [parent];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === child) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of parentsOf.get(cur) ?? []) stack.push(p);
  }
  return false;
}

/** Create or update a model-side relationship between entity types.
 *  - HasChild: adds (or upserts) a single source -> target edge. Other
 *    HasChild parents of the target are left in place — the model is a DAG.
 *  - HasUSD: upserts source -> target (default `USD`) and stores
 *    usd.
 */
export function upsertModelRelationship(
  doc: OntologyDoc,
  rel: OntologyRelationship
): OntologyDoc {
  if (!rel.type || !rel.source || !rel.target) return doc;
  if (rel.type === 'HasChild') {
    const normalized: Record<string, unknown> = { ...rel, type: 'HasChild' };
    normalized.source = rel.source.trim();
    normalized.target = rel.target.trim();
    if ('usd' in rel) normalized.usd = (rel.usd ?? '').trim();
    for (const [k, v] of Object.entries(normalized)) {
      if (v === undefined) delete normalized[k];
    }
    const source = normalized.source as string;
    const target = normalized.target as string;
    if (!source || !target || source === target) return doc;
    if (target === 'USD') return doc;

    const next = cloneDoc(doc);
    const model = ensureModel(next);
    if (!model.entityTypes.some((t) => t.name === source)) return doc;
    if (!model.entityTypes.some((t) => t.name === target)) return doc;

    const rels = model.relationships ?? [];
    const idx = rels.findIndex(
      (r) =>
        r.type === 'HasChild' &&
        r.source === source &&
        r.target === target
    );
    if (idx >= 0) {
      rels[idx] = normalized as unknown as OntologyRelationship;
      model.relationships = rels;
      return next;
    }
    if (wouldCreateHasChildCycle(rels, source, target)) return doc;
    model.relationships = [...rels, normalized as unknown as OntologyRelationship];
    return next;
  }

  const next = cloneDoc(doc);
  const model = ensureModel(next);
  if (!model.entityTypes.some((t) => t.name === rel.source)) return doc;
  if (!model.entityTypes.some((t) => t.name === rel.target)) return doc;

  model.relationships = (model.relationships ?? []).filter(
    (r) => !(r.type === 'HasUSD' && r.source === rel.source)
  );
  if (rel.type === 'HasUSD') {
    const nextRel: Record<string, unknown> = { ...rel, type: 'HasUSD' };
    nextRel.source = rel.source.trim();
    nextRel.target = rel.target.trim();
    nextRel.usd = (rel.usd ?? '').trim();
    for (const [k, v] of Object.entries(nextRel)) {
      if (v === undefined) delete nextRel[k];
    }
    model.relationships.push(nextRel as unknown as OntologyRelationship);
    return next;
  }

  const nextRel: Record<string, unknown> = { ...rel, usd: (rel.usd ?? '').trim() };
  nextRel.type = rel.type.trim();
  nextRel.source = rel.source.trim();
  nextRel.target = rel.target.trim();
  for (const [k, v] of Object.entries(nextRel)) {
    if (v === undefined) delete nextRel[k];
  }
  model.relationships.push(nextRel as unknown as OntologyRelationship);
  return next;
}

/** Remove one model-side relationship. */
export function removeModelRelationship(
  doc: OntologyDoc,
  rel: OntologyRelationship
): OntologyDoc {
  if (!rel.type || !rel.source || !rel.target) return doc;
  if (rel.type === 'HasChild') {
    return removeEntityTypeParent(doc, rel.target, rel.source);
  }

  const next = cloneDoc(doc);
  const model = ensureModel(next);
  const before = (model.relationships ?? []).length;
  model.relationships = (model.relationships ?? []).filter(
    (r) => !(r.type === rel.type && r.source === rel.source && r.target === rel.target)
  );
  if (model.relationships.length === before) return doc;
  return next;
}

/** Disambiguate a new entity instance name against names already in use:
 *  first request keeps `base`; subsequent collisions append `_1`, `_2`, ...
 *  If `base` itself ends in `_<n>`, counting resumes from that index. */
function uniqueInstanceName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  const m = /^(.*)_(\d+)$/.exec(base);
  const stem = m ? m[1] : base;
  let n = m ? Number(m[2]) + 1 : 1;
  let candidate = `${stem}_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${stem}_${n}`;
  }
  return candidate;
}

/** Create a new instance of `type` (optionally under `parentId` via a
 *  `HasChild` or `HasUSD` edge). Returns the new doc plus the generated
 *  entity id so callers can immediately select/focus it. */
export function addEntityInstance(
  doc: OntologyDoc,
  type: string,
  name: string,
  options?: { parentId?: string | null; relationship?: 'HasChild' | 'HasUSD' }
): { doc: OntologyDoc; id: string; spatialId?: string; usd?: string } {
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  const modelRels = model.relationships ?? [];
  const id = `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const baseName =
    name.trim() || `${type} ${next.instances.entities.length + 1}`;
  const takenNames = new Set(next.instances.entities.map((e) => e.name));
  const entity: OntologyEntity = {
    id,
    type,
    name: uniqueInstanceName(baseName, takenNames)
  };
  if (type === 'USD') {
    entity.position = { x: 0, y: 0, z: 0 };
    entity.rotation = { x: 0, y: 0, z: 0 };
    entity.usd = '';
    entity.topic = '';
    entity.guid = '';
  }
  next.instances.entities.push(entity);

  const ownType = model.entityTypes.find((t) => t.name === type);
  const modelUsd = (ownType?.usd ?? '').trim();
  const usdRel = modelRels.find(
    (r) => r.type === 'HasUSD' && r.source === type
  );
  const usdType = usdRel?.target ?? 'USD';
  let spatialId: string | undefined;
  if (type !== 'USD' && !!modelUsd) {
    spatialId = `usd-${Math.random().toString(36).slice(2, 8)}`;
    const spatialTaken = new Set(next.instances.entities.map((e) => e.name));
    const spatial: OntologyEntity = {
      id: spatialId,
      type: usdType,
      name: uniqueInstanceName(`${entity.name} USD`, spatialTaken),
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      usd: modelUsd,
      topic: '',
      guid: ''
    };
    next.instances.entities.push(spatial);
    next.instances.relationships.push({
      type: 'HasUSD',
      source: id,
      target: spatialId
    });
  }

  const parentId = options?.parentId ?? null;
  if (parentId) {
    const rel = options?.relationship ?? (type === 'USD' ? 'HasUSD' : 'HasChild');
    if (rel === 'HasUSD') {
      next.instances.relationships.push({ type: 'HasUSD', source: parentId, target: id });
    } else {
      next.instances.relationships.push({ type: 'HasChild', source: parentId, target: id });
    }
  }
  return { doc: next, id, spatialId, usd: modelUsd || undefined };
}

export function renameEntityInstance(
  doc: OntologyDoc,
  id: string,
  newName: string
): OntologyDoc {
  const trimmed = newName.trim();
  if (!trimmed) return doc;
  const next = cloneDoc(doc);
  const e = next.instances.entities.find((x) => x.id === id);
  if (!e) return doc;
  e.name = trimmed;
  return next;
}

export function updateEntityInstance(
  doc: OntologyDoc,
  id: string,
  patch: Partial<Omit<OntologyEntity, 'id' | 'type'>>
): OntologyDoc {
  const next = cloneDoc(doc);
  const e = next.instances.entities.find((x) => x.id === id);
  if (!e) return doc;
  const target = e as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete target[k];
    else target[k] = v;
  }
  return next;
}

export function changeEntityInstanceType(
  doc: OntologyDoc,
  id: string,
  newType: string
): OntologyDoc {
  const next = cloneDoc(doc);
  const model = ensureModel(next);
  if (!model.entityTypes.some((t) => t.name === newType)) return doc;
  const e = next.instances.entities.find((x) => x.id === id);
  if (!e || e.type === newType) return doc;
  e.type = newType;
  return next;
}

/** Reparent an instance: drop any incoming HasChild/HasUSD edge for `id`
 *  and add a new edge to `newParentId`. USD nodes use HasUSD;
 *  everything else uses HasChild. Pass `null` to detach. Refuses cycles
 *  (i.e. dropping onto a descendant of `id`). */
export function setEntityInstanceParent(
  doc: OntologyDoc,
  id: string,
  newParentId: string | null
): OntologyDoc {
  if (id === newParentId) return doc;
  const next = cloneDoc(doc);
  const entity = next.instances.entities.find((e) => e.id === id);
  if (!entity) return doc;

  if (newParentId) {
    if (!next.instances.entities.some((e) => e.id === newParentId)) return doc;
    // Walk up the existing parent chain from newParentId — if we hit `id`,
    // assigning would create a cycle.
    const parentOf = new Map<string, string>();
    for (const r of next.instances.relationships) {
      if (r.type === 'HasChild' || r.type === 'HasUSD') {
        parentOf.set(r.target, r.source);
      } else if (r.type === 'ChildOf') {
        parentOf.set(r.source, r.target);
      } else if (r.type === 'HasSpatial') {
        parentOf.set(r.target, r.source);
      }
    }
    const seen = new Set<string>();
    let cur: string | undefined = newParentId;
    while (cur) {
      if (cur === id) return doc;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  // Strip the entity's current parent edge(s).
  next.instances.relationships = next.instances.relationships.filter((r) => {
    if (r.type === 'HasChild' && r.target === id) return false;
    if (r.type === 'HasUSD' && r.target === id) return false;
    if (r.type === 'ChildOf' && r.source === id) return false;
    if (r.type === 'HasSpatial' && r.target === id) return false;
    return true;
  });

  if (newParentId) {
    if (entity.type === 'USD') {
      next.instances.relationships.push({
        type: 'HasUSD',
        source: newParentId,
        target: id
      });
    } else {
      next.instances.relationships.push({
        type: 'HasChild',
        source: newParentId,
        target: id
      });
    }
  }
  return next;
}

/** Remove an entity and (recursively) every entity reached via outgoing
 *  HasChild/HasUSD edges from it. All relationships touching any removed
 *  id are dropped. */
export function removeEntityInstance(doc: OntologyDoc, id: string): OntologyDoc {
  const next = cloneDoc(doc);
  const removed = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (removed.has(cur)) continue;
    removed.add(cur);
    for (const r of next.instances.relationships) {
      if (r.type === 'HasChild' && r.source === cur) stack.push(r.target);
      else if (r.type === 'HasUSD' && r.source === cur) stack.push(r.target);
      else if (r.type === 'ChildOf' && r.target === cur) stack.push(r.source);
      else if (r.type === 'HasSpatial' && r.source === cur) stack.push(r.target);
    }
  }
  next.instances.entities = next.instances.entities.filter((e) => !removed.has(e.id));
  next.instances.relationships = next.instances.relationships.filter(
    (r) => !removed.has(r.source) && !removed.has(r.target)
  );
  return next;
}
