import { useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  /** When true, renders the item in a destructive color (e.g. Delete). */
  destructive?: boolean;
  /** When true, renders the item disabled (no hover, no click). */
  disabled?: boolean;
  /** When set, hovering the item opens a nested context menu flyout to its
   *  right. The parent item's own `onClick` is ignored — the user picks an
   *  action from the submenu instead. */
  submenu?: ContextMenuItem[];
}

interface Props {
  /** Page-space anchor point (clientX / clientY from the originating event). */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// Simple floating right-click menu. Closes on Escape, scroll, resize, or any
// pointer down outside the menu. The parent owns position + item state and
// re-renders the component with a fresh `{x, y}` to move it.
export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => {
      if (ref.current && ref.current.contains(ev.target as Node)) return;
      onClose();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  // Nudge the menu so it stays inside the viewport when opened near an edge.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 32 - 8)
  };

  const openSub = (idx: number, ev: React.MouseEvent<HTMLElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    setOpenSubmenu(idx);
    setSubmenuPos({ x: rect.right + 2, y: rect.top });
  };

  return (
    <div ref={ref} className="context-menu" style={style} role="menu">
      {items.map((item, idx) => {
        const hasSub = !!item.submenu && item.submenu.length > 0;
        return (
          <button
            key={item.label + idx}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={
              'context-menu-item' +
              (item.destructive ? ' is-destructive' : '') +
              (item.disabled ? ' is-disabled' : '') +
              (hasSub ? ' has-submenu' : '')
            }
            onMouseEnter={(ev) => {
              if (hasSub && !item.disabled) openSub(idx, ev);
              else setOpenSubmenu(null);
            }}
            onClick={(ev) => {
              if (item.disabled) return;
              if (hasSub) {
                openSub(idx, ev);
                return;
              }
              item.onClick?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {hasSub && <span className="context-menu-chevron">›</span>}
          </button>
        );
      })}
      {openSubmenu !== null && submenuPos && items[openSubmenu]?.submenu && (
        <ContextMenu
          x={submenuPos.x}
          y={submenuPos.y}
          items={items[openSubmenu].submenu!}
          onClose={onClose}
        />
      )}
    </div>
  );
}
