import { useEffect, useRef, useState } from 'react';

interface NumericInputProps {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  /** Called with the raw string the existing setters expect. */
  onValueChange: (next: string) => void;
  className?: string;
}

/**
 * Numeric input that selects its full contents on click/focus so the next
 * keystroke replaces the value. External value changes (e.g., viewport
 * gizmo drags) update the displayed text whenever the input isn't focused.
 */
export default function NumericInput({
  value,
  step = 1,
  min,
  max,
  onValueChange,
  className
}: NumericInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState<string>(() => String(value));
  const justFocusedRef = useRef(false);

  useEffect(() => {
    if (focused) return;
    setText(String(value));
  }, [value, focused]);

  return (
    <input
      className={className}
      type="number"
      step={step}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onValueChange(e.target.value);
      }}
      onFocus={(e) => {
        setFocused(true);
        justFocusedRef.current = true;
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        setText(String(value));
      }}
      onMouseUp={(e) => {
        // Browsers collapse the focus-time selection on mouseup; re-apply.
        if (justFocusedRef.current) {
          justFocusedRef.current = false;
          (e.target as HTMLInputElement).select();
        }
      }}
    />
  );
}
