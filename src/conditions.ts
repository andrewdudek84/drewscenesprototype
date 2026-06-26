import { newId } from './sceneUtils';

/** Visual treatment a matched object gets when the rule fires. Hooking this
 *  up to the live viewport is deferred — the editor only authors rules for
 *  now. `both` shows the icon overlay AND tints the object. */
export type ViewRuleKind = 'color' | 'icon' | 'both';

/** Default set of overlay icons. Rendered as inline SVG glyphs by
 *  `ConditionIcons`; the picker shows each one with the rule's color as a
 *  background chip so the user can preview the final look. */
export type ConditionIcon = 'warning' | 'check' | 'off' | 'on';

export interface ViewRule {
  id: string;
  /** Regex string typed by the user. Tested against bound entity data at
   *  runtime (not implemented yet). Stored as-is; pattern syntax is
   *  validated lazily so half-typed regexes don't throw mid-edit. */
  pattern: string;
  kind: ViewRuleKind;
  /** Hex color. For 'color' rules, the matched object's material is tinted.
   *  For 'icon' rules, used as the icon chip's background. */
  color: string;
  /** Set when kind === 'icon'. */
  icon?: ConditionIcon;
}

export interface Condition {
  id: string;
  name: string;
  viewRules: ViewRule[];
}

export const DEFAULT_CONDITION_COLOR = '#f59e0b';

export const CONDITION_ICONS: readonly ConditionIcon[] = [
  'warning',
  'check',
  'off',
  'on'
] as const;

export const CONDITION_ICON_LABELS: Record<ConditionIcon, string> = {
  warning: 'Warning',
  check: 'Check mark',
  off: 'Off',
  on: 'On'
};

export function createCondition(name: string): Condition {
  return { id: newId(), name, viewRules: [] };
}

export function createViewRule(): ViewRule {
  return {
    id: newId(),
    pattern: '',
    kind: 'color',
    color: DEFAULT_CONDITION_COLOR
  };
}
