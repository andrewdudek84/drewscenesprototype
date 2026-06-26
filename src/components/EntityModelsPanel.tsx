import { useMemo, useRef, useState } from 'react';
import InlineNameEdit from './InlineNameEdit';
import type { ModelNode, OntologyRelationship } from '../ontology';

export const ENTITY_TYPE_DRAG_MIME = 'application/x-entity-type-name';

/** Entity-type names that are intentionally hidden from the Entity Models
 *  tree. The underlying types still exist in the ontology and are exported
 *  normally; this just suppresses their visual rows. */
const HIDDEN_TYPE_NAMES = new Set<string>(['USD']);

/** Same set, exposed so other UI surfaces (e.g. the Add-Instance type picker)
 *  can apply the same hide policy. */
export const HIDDEN_ENTITY_TYPE_NAMES: ReadonlySet<string> = HIDDEN_TYPE_NAMES;

/** Relationship type names that are hidden from the Relationships list. The
 *  edges remain valid in the ontology (and on export) — only the rows are
 *  suppressed. */
const HIDDEN_RELATIONSHIP_TYPE_NAMES = new Set<string>(['HasUSD']);

function filterHiddenNodes(nodes: ModelNode[]): ModelNode[] {
  const out: ModelNode[] = [];
  for (const n of nodes) {
    if (HIDDEN_TYPE_NAMES.has(n.type.name)) continue;
    out.push({ ...n, children: filterHiddenNodes(n.children) });
  }
  return out;
}

/** Filter a model tree to nodes whose name matches `q` (case-insensitive
 *  substring) OR have at least one descendant that matches. Non-matching
 *  branches are pruned; matching ancestors are kept so the tree path
 *  stays coherent. */
function filterNodesByQuery(nodes: ModelNode[], q: string): ModelNode[] {
  if (!q) return nodes;
  const needle = q.toLowerCase();
  const out: ModelNode[] = [];
  for (const n of nodes) {
    const selfMatch = n.type.name.toLowerCase().includes(needle);
    const filteredChildren = filterNodesByQuery(n.children, q);
    if (selfMatch || filteredChildren.length > 0) {
      out.push({ ...n, children: filteredChildren });
    }
  }
  return out;
}

interface Props {
  roots: ModelNode[];
  modelRelationships: OntologyRelationship[];
  selectedTypeName: string | null;
  selectedRelationshipIndex: number | null;
  /** Number of entity instances per type name. Rendered as a small count
   *  badge on the right of each row; types missing from the map (or with
   *  count 0) render no badge. */
  instanceCountByType: ReadonlyMap<string, number>;
  /** Add a brand-new entity type (caller picks a unique placeholder name and
   *  immediately puts it in inline-edit mode). */
  onAddType: () => void;
  onSelectType: (name: string) => void;
  onSelectRelationship: (index: number) => void;
  /** Open the per-type right-click menu at the given page coords. `typeName`
   *  is empty for right-clicks on the panel background (in which case only
   *  "Add Type" is meaningful). `parentName` identifies which HasChild
   *  occurrence was clicked (null for root-level rows) so callers can offer
   *  a precise "Detach from <Parent>" action — types may appear under
   *  multiple parents in the DAG. */
  onContextMenu: (
    typeName: string,
    parentName: string | null,
    x: number,
    y: number
  ) => void;
  /** Name of the type currently being inline-renamed, or null. */
  editingName: string | null;
  onCommitRename: (oldName: string, newName: string) => void;
  onCancelRename: () => void;
  /** Drag-drop reparent — semantics are ADDITIVE: dropping a type onto a
   *  parent adds a new HasChild edge (the type may have multiple parents).
   *  Root drops (`newParent === null`) are refused at the panel layer. */
  onReparent: (name: string, newParent: string | null) => void;
  /** Returns whether a drag-drop reparent of `name` onto `newParent` (null =
   *  root) is allowed. Invalid drops are refused and shake the row to signal
   *  "no" instead of mutating the model. */
  canReparent: (name: string, newParent: string | null) => boolean;
  /** When true the panel hides authoring affordances: the "+" header
   *  button, right-click context menus, inline rename, and drag-drop
   *  reparenting. Selection and expand/collapse remain interactive. */
  readOnly?: boolean;
}

interface DragInfo {
  name: string;
  descendants: Set<string>;
}

export default function EntityModelsPanel({
  roots,
  modelRelationships,
  selectedTypeName,
  selectedRelationshipIndex,
  instanceCountByType,
  onAddType,
  onSelectType,
  onSelectRelationship,
  onContextMenu,
  editingName,
  onCommitRename,
  onCancelRename,
  onReparent,
  canReparent,
  readOnly = false
}: Props) {
  const dragRef = useRef<DragInfo | null>(null);
  const [rootDropOver, setRootDropOver] = useState(false);
  const [rootShake, setRootShake] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  const visibleRoots = useMemo(() => {
    const hidden = filterHiddenNodes(roots);
    return isSearching ? filterNodesByQuery(hidden, trimmedQuery) : hidden;
  }, [roots, isSearching, trimmedQuery]);

  // Lookup: name -> set of descendants (inclusive) across all DAG paths.
  // Built by walking the rendered tree (which may contain a type under
  // multiple parents); each visit unions the descendants into every
  // ancestor's set. Used to keep drag-drop from creating cycles even when
  // the same type appears in several subtrees.
  const descendantsByName = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const walk = (node: ModelNode, ancestorChain: ModelNode[]) => {
      for (const a of ancestorChain) {
        let set = map.get(a.type.name);
        if (!set) {
          set = new Set<string>();
          map.set(a.type.name, set);
        }
        set.add(node.type.name);
      }
      let self = map.get(node.type.name);
      if (!self) {
        self = new Set<string>();
        map.set(node.type.name, self);
      }
      self.add(node.type.name);
      for (const c of node.children) walk(c, [...ancestorChain, node]);
    };
    for (const r of roots) walk(r, []);
    return map;
  }, [roots]);

  const onBgContextMenu = (ev: React.MouseEvent) => {
    if (readOnly) return;
    if (ev.target !== ev.currentTarget) return;
    ev.preventDefault();
    onContextMenu('', null, ev.clientX, ev.clientY);
  };

  const onRootDragOver = (ev: React.DragEvent) => {
    if (readOnly) return;
    if (!ev.dataTransfer.types.includes(ENTITY_TYPE_DRAG_MIME)) return;
    ev.preventDefault();
    // Root drops are never allowed by the additive reparent semantics — to
    // promote a type to root you remove its parents via the context menu.
    // Show the "not allowed" cursor and skip highlighting; the actual shake
    // fires on drop in onRootDrop.
    ev.dataTransfer.dropEffect = 'none';
    setRootDropOver(false);
  };
  const onRootDragLeave = () => setRootDropOver(false);
  const onRootDrop = (ev: React.DragEvent) => {
    setRootDropOver(false);
    const name = ev.dataTransfer.getData(ENTITY_TYPE_DRAG_MIME);
    if (!name) return;
    ev.preventDefault();
    ev.stopPropagation();
    setRootShake(true);
    dragRef.current = null;
  };

  return (
    <aside className="panel models">
      <header className="panel-header panel-header-with-actions">
        <span>Entity Models</span>
        {!readOnly && (
          <button
            type="button"
            className="panel-header-btn"
            title="Add type"
            aria-label="Add entity type"
            onClick={onAddType}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M8 3 V13 M3 8 H13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </header>
      <div className="panel-body" onContextMenu={onBgContextMenu}>
        <div className="panel-search">
          <input
            type="search"
            className="panel-search-input"
            placeholder="Search entity models…"
            value={searchQuery}
            onChange={(ev) => setSearchQuery(ev.target.value)}
            aria-label="Search entity models"
          />
          {searchQuery && (
            <button
              type="button"
              className="panel-search-clear"
              title="Clear search"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>
        <ul
          className={
            'tree' +
            (rootDropOver ? ' is-drop-target' : '') +
            (rootShake ? ' is-shake-no' : '')
          }
          onContextMenu={onBgContextMenu}
          onDragOver={onRootDragOver}
          onDragLeave={onRootDragLeave}
          onDrop={onRootDrop}
          onAnimationEnd={() => {
            if (rootShake) setRootShake(false);
          }}
        >
          {visibleRoots.length === 0 ? (
            <li className="tree-empty">
              {isSearching ? 'No matching entity types.' : 'No entity model types.'}
            </li>
          ) : (
            visibleRoots.map((n) => (
              <ModelTreeNode
                key={`_root_::${n.type.name}`}
                node={n}
                parentName={null}
                selectedTypeName={selectedTypeName}
                instanceCountByType={instanceCountByType}
                onSelectType={onSelectType}
                editingName={editingName}
                onContextMenu={onContextMenu}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onReparent={onReparent}
                canReparent={canReparent}
                dragRef={dragRef}
                descendantsByName={descendantsByName}
                forceExpand={isSearching}
                readOnly={readOnly}
              />
            ))
          )}
        </ul>
        <div className="model-relationships">
          <div className="model-relationships-header">
            <span>Relationships</span>
          </div>
          {(() => {
            const needle = trimmedQuery.toLowerCase();
            const visibleRelationships = modelRelationships
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => !HIDDEN_RELATIONSHIP_TYPE_NAMES.has(r.type))
              .filter(({ r }) => {
                if (!isSearching) return true;
                return (
                  r.type.toLowerCase().includes(needle) ||
                  r.source.toLowerCase().includes(needle) ||
                  r.target.toLowerCase().includes(needle) ||
                  (r.usd ?? '').toLowerCase().includes(needle)
                );
              });
            if (visibleRelationships.length === 0) {
              return (
                <div className="tree-empty">
                  {isSearching ? 'No matching relationships.' : 'No model relationships.'}
                </div>
              );
            }
            return (
              <ul className="model-relationship-list">
                {visibleRelationships.map(({ r, i }) => (
                  <li
                    key={`${r.type}:${r.source}:${r.target}:${i}`}
                    className={
                      'model-relationship-row' +
                      (selectedRelationshipIndex === i ? ' is-selected' : '')
                    }
                    onClick={() => onSelectRelationship(i)}
                  >
                    <span className="model-relationship-text">
                      {r.type} {r.source} -&gt; {r.target}
                      {r.usd ? ` (${r.usd})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </div>
    </aside>
  );
}

interface NodeProps {
  node: ModelNode;
  /** Name of the HasChild parent this occurrence is rendered under, or null
   *  when the row is a root. A single type may appear under multiple parents
   *  in the DAG; this field lets row callbacks (context menu, detach)
   *  identify which edge they're acting on. */
  parentName: string | null;
  selectedTypeName: string | null;
  instanceCountByType: ReadonlyMap<string, number>;
  onSelectType: (name: string) => void;
  editingName: string | null;
  onContextMenu: (
    typeName: string,
    parentName: string | null,
    x: number,
    y: number
  ) => void;
  onCommitRename: (oldName: string, newName: string) => void;
  onCancelRename: () => void;
  onReparent: (name: string, newParent: string | null) => void;
  canReparent: (name: string, newParent: string | null) => boolean;
  dragRef: React.MutableRefObject<DragInfo | null>;
  descendantsByName: Map<string, Set<string>>;
  /** When true, the node renders expanded regardless of local toggle state.
   *  Used while a search query is active so matches deep in the tree are
   *  visible without the user expanding every ancestor manually. */
  forceExpand?: boolean;
  /** Authoring affordances (drag-drop reparent, right-click menu, inline
   *  rename) are suppressed when true. */
  readOnly?: boolean;
}

function ModelTreeNode({
  node,
  parentName,
  selectedTypeName,
  instanceCountByType,
  onSelectType,
  editingName,
  onContextMenu,
  onCommitRename,
  onCancelRename,
  onReparent,
  canReparent,
  dragRef,
  descendantsByName,
  forceExpand = false,
  readOnly = false
}: NodeProps) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const effectiveExpanded = forceExpand || expanded;
  const [dropOver, setDropOver] = useState(false);
  const [shake, setShake] = useState(false);
  const isEditing = editingName === node.type.name;
  const isSelected = selectedTypeName === node.type.name;
  const instanceCount = instanceCountByType.get(node.type.name) ?? 0;

  const onDragStart = (ev: React.DragEvent) => {
    if (readOnly) return;
    ev.stopPropagation();
    ev.dataTransfer.setData(ENTITY_TYPE_DRAG_MIME, node.type.name);
    ev.dataTransfer.effectAllowed = 'move';
    dragRef.current = {
      name: node.type.name,
      descendants: descendantsByName.get(node.type.name) ?? new Set([node.type.name])
    };
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };
  const onDragOver = (ev: React.DragEvent) => {
    if (readOnly) return;
    if (!ev.dataTransfer.types.includes(ENTITY_TYPE_DRAG_MIME)) return;
    const drag = dragRef.current;
    // USD is always a root in the model tree, so refuse to accept it
    // as a child of any other type.
    if (drag && drag.name === 'USD') return;
    if (drag && drag.descendants.has(node.type.name)) return;
    ev.preventDefault();
    ev.stopPropagation();
    // Validate against the model (cycle, duplicate edge, hidden type). If
    // the drop would be refused, set 'none' so the OS shows "not allowed"
    // and skip the highlight; the row will shake on drop instead.
    if (drag && !canReparent(drag.name, node.type.name)) {
      ev.dataTransfer.dropEffect = 'none';
      setDropOver(false);
      return;
    }
    ev.dataTransfer.dropEffect = 'move';
    setDropOver(true);
  };
  const onDragLeave = () => setDropOver(false);
  const onDrop = (ev: React.DragEvent) => {
    if (readOnly) return;
    setDropOver(false);
    const name = ev.dataTransfer.getData(ENTITY_TYPE_DRAG_MIME);
    if (!name || name === node.type.name) return;
    if (name === 'USD') return;
    const drag = dragRef.current;
    if (drag && drag.descendants.has(node.type.name)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!canReparent(name, node.type.name)) {
      setShake(true);
      dragRef.current = null;
      return;
    }
    onReparent(name, node.type.name);
    dragRef.current = null;
  };

  return (
    <li>
      <div
        className={
          'tree-node' +
          (dropOver ? ' is-drop-target' : '') +
          (isSelected ? ' is-selected' : '') +
          (shake ? ' is-shake-no' : '')
        }
        title={node.type.description ?? node.type.name}
        draggable={!isEditing && !readOnly}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectType(node.type.name);
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onAnimationEnd={() => {
          if (shake) setShake(false);
        }}
        onContextMenu={(ev) => {
          if (readOnly) return;
          ev.preventDefault();
          ev.stopPropagation();
          onContextMenu(node.type.name, parentName, ev.clientX, ev.clientY);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`tree-toggle${effectiveExpanded ? ' is-expanded' : ''}`}
            onClick={() => setExpanded((v) => !v)}
            aria-label={effectiveExpanded ? 'Collapse' : 'Expand'}
          >
            ▶
          </button>
        ) : (
          <span className="tree-toggle tree-toggle-placeholder" />
        )}
        {isEditing ? (
          <InlineNameEdit
            initialName={node.type.name}
            onCommit={(name) => onCommitRename(node.type.name, name)}
            onCancel={onCancelRename}
          />
        ) : (
          <span className="tree-label">{node.type.name}</span>
        )}
        {!isEditing && instanceCount > 0 && (
          <span
            className="tree-count"
            title={`${instanceCount} instance${instanceCount === 1 ? '' : 's'} of ${node.type.name}`}
            aria-label={`${instanceCount} instance${instanceCount === 1 ? '' : 's'}`}
          >
            {instanceCount}
          </span>
        )}
      </div>
      {hasChildren && effectiveExpanded && (
        <ul>
          {node.children.map((c) => (
            <ModelTreeNode
              key={`${node.type.name}::${c.type.name}`}
              node={c}
              parentName={node.type.name}
              selectedTypeName={selectedTypeName}
              instanceCountByType={instanceCountByType}
              onSelectType={onSelectType}
              editingName={editingName}
              onContextMenu={onContextMenu}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onReparent={onReparent}
              canReparent={canReparent}
              dragRef={dragRef}
              descendantsByName={descendantsByName}
              forceExpand={forceExpand}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
