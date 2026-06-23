import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetMeshNode, PrimNode, ShapeKind } from '../types';
import { ASSET_DRAG_MIME, PRIM_DRAG_MIME, SHAPE_DRAG_MIME } from '../shapes';

interface Props {
  prims: PrimNode[];
  selectedId: string | null;
  /** Full multi-selection set (always includes `selectedId` when set). Used
   *  to highlight every Ctrl+click-added prim in the tree, not just the
   *  gizmo's primary target. */
  selectedIds: string[];
  /** When set, highlights a specific sub-mesh row inside a reference prim's
   *  asset tree instead of (or in addition to) the prim itself. */
  selectedMeshUid: string | null;
  /** Sub-mesh tree for each reference prim, keyed by prim id. Missing entries
   *  mean the asset hasn't finished loading yet (or has no internal nodes). */
  assetMeshes: Record<string, AssetMeshNode[]>;
  /** Prim ids that are currently mapped to an ontology SpatialItem. The
   *  value is the bound SpatialItem (used by Properties; here we only need
   *  the presence of an entry to show the green check). */
  mappedByPrimId: Map<string, { entityId: string; entityName: string }>;
  onSelect: (
    id: string | null,
    meshUid?: string | null,
    additive?: boolean
  ) => void;
  onReparent: (sourceId: string, parentId: string | null) => void;
  onShapeAdd: (kind: ShapeKind, parentId: string | null) => void;
  onAssetAdd: (assetId: string, parentId: string | null) => void;
  onDelete: (id: string) => void;
  onContextMenu: (primId: string, x: number, y: number) => void;
  /** Slide-out open state. When false the panel is translated off-screen. */
  isOpen: boolean;
  onClose: () => void;
}

export default function HierarchyPanel({
  prims,
  selectedId,
  selectedIds,
  selectedMeshUid,
  assetMeshes,
  mappedByPrimId,
  onSelect,
  onReparent,
  onShapeAdd,
  onAssetAdd,
  onDelete,
  onContextMenu,
  isOpen,
  onClose
}: Props) {
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, PrimNode[]>();
    for (const p of prims) {
      const list = m.get(p.parentId) ?? [];
      list.push(p);
      m.set(p.parentId, list);
    }
    return m;
  }, [prims]);

  const roots = childrenByParent.get(null) ?? [];

  // Build the set of node ids that need to be expanded for the current
  // selection to be visible: every ancestor prim, plus (when a sub-mesh is
  // selected) the owning reference prim and every ancestor mesh uid along
  // the path inside the asset's internal tree.
  const expandPath = useMemo(() => {
    const path = new Set<string>();
    if (!selectedId) return path;
    const primById = new Map(prims.map((p) => [p.id, p] as const));
    let cur = primById.get(selectedId);
    while (cur?.parentId) {
      path.add(cur.parentId);
      cur = primById.get(cur.parentId);
    }
    if (selectedMeshUid != null) {
      // The reference prim itself must be expanded to show its mesh tree.
      path.add(selectedId);
      const tree = assetMeshes[selectedId];
      if (tree) {
        for (const uid of findMeshAncestors(tree, selectedMeshUid)) {
          path.add(uid);
        }
      }
    }
    return path;
  }, [prims, selectedId, selectedMeshUid, assetMeshes]);

  const [rootDragOver, setRootDragOver] = useState(false);

  const dragKind = (ev: React.DragEvent): 'prim' | 'shape' | 'asset' | null => {
    const types = ev.dataTransfer.types;
    if (types.includes(PRIM_DRAG_MIME)) return 'prim';
    if (types.includes(SHAPE_DRAG_MIME)) return 'shape';
    if (types.includes(ASSET_DRAG_MIME)) return 'asset';
    return null;
  };

  const onRootDragOver = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    if (!kind) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = kind === 'prim' ? 'move' : 'copy';
    setRootDragOver(true);
  };
  const onRootDragLeave = () => setRootDragOver(false);
  const onRootDrop = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    setRootDragOver(false);
    if (!kind) return;
    ev.preventDefault();
    if (kind === 'shape') {
      const shape = ev.dataTransfer.getData(SHAPE_DRAG_MIME) as ShapeKind;
      if (shape) onShapeAdd(shape, null);
    } else if (kind === 'asset') {
      const assetId = ev.dataTransfer.getData(ASSET_DRAG_MIME);
      if (assetId) onAssetAdd(assetId, null);
    } else {
      const id = ev.dataTransfer.getData(PRIM_DRAG_MIME);
      if (id) onReparent(id, null);
    }
  };

  return (
    <aside className={`panel hierarchy${isOpen ? ' is-open' : ''}`}>
      <header className="panel-header">
        <span>Viewport</span>
        <button
          type="button"
          className="panel-header-close"
          onClick={onClose}
          title="Close viewport panel"
          aria-label="Close viewport panel"
        >
          ×
        </button>
      </header>
      <div
        className="panel-body"
        onClick={() => onSelect(null)}
        onDragOver={onRootDragOver}
        onDragLeave={onRootDragLeave}
        onDrop={onRootDrop}
      >
        <ul className="tree">
          <li className={`tree-root${rootDragOver ? ' is-drop-target' : ''}`}>
            <span className="tree-label tree-scene">Scene</span>
            {roots.length === 0 ? (
              <div className="tree-empty">
                No prims yet. Drag a shape into the viewport.
              </div>
            ) : (
              <ul>
                {roots.map((p) => (
                  <TreeNode
                    key={p.id}
                    prim={p}
                    childrenByParent={childrenByParent}
                    selectedId={selectedId}
                    selectedIds={selectedIds}
                    selectedMeshUid={selectedMeshUid}
                    assetMeshes={assetMeshes}
                    mappedByPrimId={mappedByPrimId}
                    expandPath={expandPath}
                    onSelect={onSelect}
                    onReparent={onReparent}
                    onShapeAdd={onShapeAdd}
                    onAssetAdd={onAssetAdd}
                    onDelete={onDelete}
                    onContextMenu={onContextMenu}
                  />
                ))}
              </ul>
            )}
          </li>
        </ul>
      </div>
    </aside>
  );
}

interface NodeProps {
  prim: PrimNode;
  childrenByParent: Map<string | null, PrimNode[]>;
  selectedId: string | null;
  selectedIds: string[];
  selectedMeshUid: string | null;
  assetMeshes: Record<string, AssetMeshNode[]>;
  mappedByPrimId: Map<string, { entityId: string; entityName: string }>;
  /** Set of prim ids and mesh uids that must be expanded for the current
   *  selection to be visible. Nodes whose id appears here open themselves
   *  automatically when selection changes (user can still collapse them). */
  expandPath: Set<string>;
  onSelect: (
    id: string | null,
    meshUid?: string | null,
    additive?: boolean
  ) => void;
  onReparent: (sourceId: string, parentId: string | null) => void;
  onShapeAdd: (kind: ShapeKind, parentId: string | null) => void;
  onAssetAdd: (assetId: string, parentId: string | null) => void;
  onDelete: (id: string) => void;
  onContextMenu: (primId: string, x: number, y: number) => void;
}

function TreeNode({
  prim,
  childrenByParent,
  selectedId,
  selectedIds,
  selectedMeshUid,
  assetMeshes,
  mappedByPrimId,
  expandPath,
  onSelect,
  onReparent,
  onShapeAdd,
  onAssetAdd,
  onDelete,
  onContextMenu
}: NodeProps) {
  const kids = childrenByParent.get(prim.id) ?? [];
  const subMeshes =
    prim.kind === 'reference' ? assetMeshes[prim.id] ?? [] : [];
  const hasChildren = kids.length > 0 || subMeshes.length > 0;
  // All nodes start collapsed so newly-spawned Asset groups don't blow open
  // their (often deep) sub-trees. The chevron still works, and the auto-expand
  // effect below opens the path to the current selection on demand.
  const [expanded, setExpanded] = useState(false);
  // Auto-expand whenever this node lies on the path to the current selection
  // so the selected row becomes visible. User can still collapse afterwards.
  const inExpandPath = expandPath.has(prim.id);
  useEffect(() => {
    if (inExpandPath) setExpanded(true);
  }, [inExpandPath]);
  const [dragOver, setDragOver] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const dragKind = (ev: React.DragEvent): 'prim' | 'shape' | 'asset' | null => {
    const types = ev.dataTransfer.types;
    if (types.includes(PRIM_DRAG_MIME)) return 'prim';
    if (types.includes(SHAPE_DRAG_MIME)) return 'shape';
    if (types.includes(ASSET_DRAG_MIME)) return 'asset';
    return null;
  };

  const onDragStart = (ev: React.DragEvent) => {
    ev.dataTransfer.setData(PRIM_DRAG_MIME, prim.id);
    ev.dataTransfer.setData('text/plain', prim.name);
    // 'all' so both intra-hierarchy reparent ('move') and ontology binding
    // ('link') drop targets are accepted by the browser.
    ev.dataTransfer.effectAllowed = 'all';
    ev.stopPropagation();
  };
  const onDragOver = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    if (!kind) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = kind === 'prim' ? 'move' : 'copy';
    ev.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    setDragOver(false);
    if (!kind) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (kind === 'shape') {
      const shape = ev.dataTransfer.getData(SHAPE_DRAG_MIME) as ShapeKind;
      if (shape) onShapeAdd(shape, prim.id);
      return;
    }
    if (kind === 'asset') {
      const assetId = ev.dataTransfer.getData(ASSET_DRAG_MIME);
      if (assetId) onAssetAdd(assetId, prim.id);
      return;
    }
    const id = ev.dataTransfer.getData(PRIM_DRAG_MIME);
    if (!id || id === prim.id) return;
    onReparent(id, prim.id);
  };
  const onClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    onSelect(prim.id, null, ev.ctrlKey || ev.metaKey);
  };
  const onRowContextMenu = (ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    onSelect(prim.id);
    onContextMenu(prim.id, ev.clientX, ev.clientY);
  };

  // "Primary" is the gizmo target — only it gets the scroll-into-view +
  // strong highlight. Secondary multi-select members get a lighter
  // highlight via `is-multi-selected` (drives the same styling as the
  // primary minus the scroll behavior).
  const isSelected = selectedId === prim.id && selectedMeshUid == null;
  const isInMultiSelection =
    !isSelected && selectedMeshUid == null && selectedIds.includes(prim.id);

  // Scroll our row into the panel viewport whenever this node becomes the
  // selected one (whether the click originated from the viewport or here).
  // `center` keeps a bit of context above/below the highlighted row instead
  // of just barely scrolling it into view at the edge.
  useEffect(() => {
    if (isSelected && rowRef.current) {
      smoothScrollRowIntoView(rowRef.current);
    }
  }, [isSelected]);

  return (
    <li>
      <div
        ref={rowRef}
        className={
          'tree-node' +
          (isSelected ? ' is-selected' : '') +
          (isInMultiSelection ? ' is-multi-selected' : '') +
          (dragOver ? ' is-drop-target' : '')
        }
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        onContextMenu={onRowContextMenu}
      >
        <ExpandToggle
          expandable={hasChildren}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          label={prim.name}
        />
        <span className="tree-kind-wrap">
          <span className={`tree-kind kind-${prim.kind}`} aria-hidden="true" />
          {mappedByPrimId.has(prim.id) && (
            <svg
              className="tree-mapped-check"
              viewBox="0 0 16 16"
              width="10"
              height="10"
              aria-label="Mapped to ontology"
              role="img"
            >
              <circle cx="8" cy="8" r="8" fill="#3aa847" />
              <g
                fill="none"
                stroke="#fff"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.2 5.4 L10.6 4 a2.4 2.4 0 0 1 3.4 3.4 L12.6 8.8" />
                <path d="M6.8 10.6 L5.4 12 a2.4 2.4 0 0 1 -3.4 -3.4 L3.4 7.2" />
                <path d="M6.2 9.8 L9.8 6.2" />
              </g>
            </svg>
          )}
        </span>
        <span className="tree-label">{prim.name}</span>
        <button
          type="button"
          className="tree-delete"
          title={`Delete ${prim.name}`}
          aria-label={`Delete ${prim.name}`}
          draggable={false}
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete(prim.id);
          }}
          onMouseDown={(ev) => ev.stopPropagation()}
        >
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 4 L13 4" />
            <path d="M6.5 4 V2.5 H9.5 V4" />
            <path d="M4.5 4 L5 13.5 H11 L11.5 4" />
            <path d="M6.5 6.5 V11.5 M9.5 6.5 V11.5" />
          </svg>
        </button>
      </div>
      {expanded && kids.length > 0 && (
        <ul>
          {kids.map((c) => (
            <TreeNode
              key={c.id}
              prim={c}
              childrenByParent={childrenByParent}
              selectedId={selectedId}
              selectedIds={selectedIds}
              selectedMeshUid={selectedMeshUid}
              assetMeshes={assetMeshes}
              mappedByPrimId={mappedByPrimId}
              expandPath={expandPath}
              onSelect={onSelect}
              onReparent={onReparent}
              onShapeAdd={onShapeAdd}
              onAssetAdd={onAssetAdd}
              onDelete={onDelete}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      )}
      {expanded && subMeshes.length > 0 && (
        <ul>
          {subMeshes.map((node) => (
            <AssetMeshTreeNode
              key={node.uid}
              node={node}
              primId={prim.id}
              selectedId={selectedId}
              selectedMeshUid={selectedMeshUid}
              expandPath={expandPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface AssetMeshTreeNodeProps {
  node: AssetMeshNode;
  primId: string;
  selectedId: string | null;
  selectedMeshUid: string | null;
  expandPath: Set<string>;
  onSelect: (id: string | null, meshUid?: string | null) => void;
}

function AssetMeshTreeNode({
  node,
  primId,
  selectedId,
  selectedMeshUid,
  expandPath,
  onSelect
}: AssetMeshTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  // Asset-internal nodes (e.g. `Asset`, `04 - HVP01`) stay collapsed by
  // default. We intentionally do *not* auto-expand them when their uid
  // lands in `expandPath`: a sub-mesh selected in the viewport shouldn't
  // unfurl the whole asset; the user opens nodes manually with the chevron.
  // `expandPath` is still consumed for prim-level rows above.
  const [expanded, setExpanded] = useState(false);
  void expandPath;
  const isSelected = selectedId === primId && selectedMeshUid === node.uid;
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSelected && rowRef.current) {
      smoothScrollRowIntoView(rowRef.current);
    }
  }, [isSelected]);
  const onClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    onSelect(primId, node.uid);
  };
  return (
    <li>
      <div
        ref={rowRef}
        className={
          'tree-node tree-submesh' + (isSelected ? ' is-selected' : '')
        }
        onClick={onClick}
      >
        <ExpandToggle
          expandable={hasChildren}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          label={node.name}
        />
        <span className="tree-kind kind-submesh" aria-hidden="true" />
        <span className="tree-label">{node.name}</span>
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((c) => (
            <AssetMeshTreeNode
              key={c.uid}
              node={c}
              primId={primId}
              selectedId={selectedId}
              selectedMeshUid={selectedMeshUid}
              expandPath={expandPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Walks the asset's internal mesh tree to find every ancestor uid leading to
// the given target uid (target itself is not included). Empty array when the
// target isn't in the tree.
function findMeshAncestors(
  tree: AssetMeshNode[],
  targetUid: string
): string[] {
  const path: string[] = [];
  const walk = (nodes: AssetMeshNode[]): boolean => {
    for (const n of nodes) {
      if (n.uid === targetUid) return true;
      if (walk(n.children)) {
        path.push(n.uid);
        return true;
      }
    }
    return false;
  };
  walk(tree);
  return path;
}

interface ExpandToggleProps {
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  label: string;
}

// Chevron disclosure control rendered in front of every tree row. When the
// row has no children we still render a placeholder so the kind icons and
// labels stay vertically aligned across siblings.
function ExpandToggle({ expandable, expanded, onToggle, label }: ExpandToggleProps) {
  if (!expandable) {
    return <span className="tree-toggle tree-toggle-placeholder" aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      className={`tree-toggle${expanded ? ' is-expanded' : ''}`}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      title={expanded ? 'Collapse' : 'Expand'}
      draggable={false}
      onClick={(ev) => {
        ev.stopPropagation();
        onToggle();
      }}
      onMouseDown={(ev) => ev.stopPropagation()}
    >
      <svg
        viewBox="0 0 12 12"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 2.5 L8 6 L4 9.5" />
      </svg>
    </button>
  );
}

// Browser-native scrollIntoView({behavior:'smooth'}) takes ~400ms and offers
// no speed control. We animate the scrollable ancestor's scrollTop ourselves
// so the auto-scroll on selection feels snappy (~100ms) without being a
// jarring instant jump.
const SCROLL_DURATION_MS = 100;

function smoothScrollRowIntoView(el: HTMLElement): void {
  const container = findScrollContainer(el);
  if (!container) {
    el.scrollIntoView({ block: 'center' });
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  // Distance to add to scrollTop so the row's vertical center sits at the
  // container's vertical center (i.e. matches block: 'center' positioning).
  const elCenterInContainer =
    elRect.top - containerRect.top + el.clientHeight / 2;
  const delta = elCenterInContainer - container.clientHeight / 2;
  if (Math.abs(delta) < 1) return;
  const maxScroll = container.scrollHeight - container.clientHeight;
  const startTop = container.scrollTop;
  const targetTop = Math.max(0, Math.min(maxScroll, startTop + delta));
  if (targetTop === startTop) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / SCROLL_DURATION_MS);
    // ease-in-out cubic for a smooth start/stop without dragging out.
    const eased =
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    container.scrollTop = startTop + (targetTop - startTop) * eased;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const cs = getComputedStyle(p);
    const overflowY = cs.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      p.scrollHeight > p.clientHeight
    ) {
      return p;
    }
    p = p.parentElement;
  }
  return null;
}
