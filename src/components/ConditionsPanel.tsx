import type { Condition } from '../conditions';

interface Props {
  conditions: Condition[];
  selectedConditionId: string | null;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Right-click handler. `id` is null when the user right-clicks the empty
   *  area of the panel body (matches the Ontology/Models panels). */
  onContextMenu?: (id: string | null, x: number, y: number) => void;
}

/** Left-rail panel shown in Scene Editor mode. Conditions are business-logic
 *  rules (status / alerts) that bind to ontology instance ids and drive
 *  visuals in the scene. Authoring a condition never mutates the ontology;
 *  the saved scene file is a separate JSON document that references entity
 *  instance ids only.
 *
 *  This panel only owns the list (add / select / delete). Per-condition
 *  properties — name and view rules — are edited in the Properties panel
 *  when a condition row is selected, mirroring the Entity Model authoring
 *  flow. */
export default function ConditionsPanel({
  conditions,
  selectedConditionId,
  onAdd,
  onSelect,
  onDelete,
  onContextMenu
}: Props) {
  const onBgContextMenu = (ev: React.MouseEvent) => {
    if (!onContextMenu) return;
    ev.preventDefault();
    ev.stopPropagation();
    onContextMenu(null, ev.clientX, ev.clientY);
  };
  return (
    <aside className="panel conditions">
      <header className="panel-header panel-header-with-actions">
        <span>Conditions</span>
        <button
          type="button"
          className="panel-header-btn"
          title="Add condition"
          aria-label="Add condition"
          onClick={onAdd}
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
      </header>
      <div className="panel-body" onContextMenu={onBgContextMenu}>
        {conditions.length === 0 ? (
          <div className="tree-empty" onContextMenu={onBgContextMenu}>
            No conditions.
          </div>
        ) : (
          <ul className="tree" onContextMenu={onBgContextMenu}>
            {conditions.map((b) => {
              const isSelected = selectedConditionId === b.id;
              return (
                <li key={b.id}>
                  <div
                    className={'tree-node' + (isSelected ? ' is-selected' : '')}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(b.id);
                    }}
                    onContextMenu={(ev) => {
                      if (!onContextMenu) return;
                      ev.preventDefault();
                      ev.stopPropagation();
                      onSelect(b.id);
                      onContextMenu(b.id, ev.clientX, ev.clientY);
                    }}
                  >
                    <span className="tree-toggle tree-toggle-placeholder" />
                    <span className="tree-label">{b.name}</span>
                    {b.viewRules.length > 0 && (
                      <span
                        className="tree-count"
                        title={`${b.viewRules.length} view rule${
                          b.viewRules.length === 1 ? '' : 's'
                        }`}
                        aria-label={`${b.viewRules.length} view rules`}
                      >
                        {b.viewRules.length}
                      </span>
                    )}
                    <button
                      type="button"
                      className="tree-delete"
                      title={`Delete ${b.name}`}
                      aria-label={`Delete ${b.name}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDelete(b.id);
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
