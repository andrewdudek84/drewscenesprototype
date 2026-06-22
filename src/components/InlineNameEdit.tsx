import { useEffect, useRef, useState } from 'react';

interface Props {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** Small auto-focused text input used by the Entity Models / Instances trees
 *  to rename rows in place. Enter commits, Escape cancels, blur commits. The
 *  parent owns the rename mutation and clears the editing state afterwards. */
export default function InlineNameEdit({ initialName, onCommit, onCancel }: Props) {
  const [val, setVal] = useState(initialName);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="tree-rename-input"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(val);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
