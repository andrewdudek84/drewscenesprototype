// Minimal USDA (.usda) serializer + parser for the prototype's prim graph.
// This is not a general USD implementation — it handles exactly the subset we
// write so import round-trips export. Anything outside that subset is ignored.

import type { PrimNode, ShapeKind, Vec3 } from './types';

const KIND_TO_USD: Record<ShapeKind, string> = {
  box: 'Cube',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  plane: 'Plane',
  group: 'Xform',
  // External GLB payload referenced from USDA; no inner geom def is written.
  reference: 'Xform'
};

const USD_TO_KIND: Record<string, ShapeKind> = {
  Cube: 'box',
  Cylinder: 'cylinder',
  Sphere: 'sphere',
  Cone: 'cone',
  Plane: 'plane'
};

export interface ImportedScene {
  sceneName: string;
  prims: PrimNode[];
}

// ---------- Export ----------

export function exportToUsda(prims: PrimNode[], sceneName: string): string {
  const childrenByParent = new Map<string | null, PrimNode[]>();
  for (const p of prims) {
    const list = childrenByParent.get(p.parentId) ?? [];
    list.push(p);
    childrenByParent.set(p.parentId, list);
  }
  const roots = childrenByParent.get(null) ?? [];
  const usedNames = new Set<string>();
  const rootName = sanitizeName(sceneName, 'World', usedNames);

  const header =
    '#usda 1.0\n' +
    '(\n' +
    `    defaultPrim = "${rootName}"\n` +
    '    metersPerUnit = 1\n' +
    '    upAxis = "Y"\n' +
    ')\n\n';

  const body =
    `def Xform "${rootName}"\n{\n` +
    roots
      .map((p) => renderPrim(p, childrenByParent, '    '))
      .join('') +
    '}\n';

  return header + body;
}

function renderPrim(
  prim: PrimNode,
  childrenByParent: Map<string | null, PrimNode[]>,
  indent: string
): string {
  const name = sanitizeIdentifier(prim.name);
  const colorRgb = hexToRgb(prim.color);
  const kids = childrenByParent.get(prim.id) ?? [];
  const inner = indent + '    ';

  const lines: string[] = [];
  lines.push(`${indent}def Xform "${name}" (`);
  lines.push(`${indent}    kind = "${prim.kind}"`);
  lines.push(`${indent})`);
  lines.push(`${indent}{`);
  lines.push(
    `${inner}double3 xformOp:translate = ${vec3(prim.position)}`
  );
  lines.push(
    `${inner}float3 xformOp:rotateXYZ = ${vec3(eulerDeg(prim.rotation))}`
  );
  lines.push(`${inner}float3 xformOp:scale = ${vec3(prim.scale)}`);
  lines.push(
    `${inner}uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]`
  );

  if (prim.kind === 'reference') {
    // External payload (e.g. GLB). The viewport resolves this asset path.
    if (prim.assetSource) {
      lines.push(
        `${inner}custom asset assetInfo:source = @${prim.assetSource}@`
      );
    }
  } else if (prim.kind !== 'group') {
    // Group prims are pure transforms with no geometry of their own.
    lines.push('');
    lines.push(`${inner}def ${KIND_TO_USD[prim.kind]} "geom"`);
    lines.push(`${inner}{`);
    lines.push(
      `${inner}    color3f[] primvars:displayColor = [${vec3(colorRgb)}]`
    );
    lines.push(`${inner}}`);
  }

  for (const k of kids) {
    lines.push('');
    lines.push(renderPrim(k, childrenByParent, inner).replace(/\n$/, ''));
  }

  lines.push(`${indent}}`);
  return lines.join('\n') + '\n';
}

function vec3(v: Vec3): string {
  return `(${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])})`;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // Trim trailing zeros, keep up to 6 decimals.
  return parseFloat(n.toFixed(6)).toString();
}

function eulerDeg(rad: Vec3): Vec3 {
  return [
    (rad[0] * 180) / Math.PI,
    (rad[1] * 180) / Math.PI,
    (rad[2] * 180) / Math.PI
  ];
}

function hexToRgb(hex: string): Vec3 {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [0.7, 0.7, 0.7];
  const v = parseInt(m[1], 16);
  return [
    ((v >> 16) & 0xff) / 255,
    ((v >> 8) & 0xff) / 255,
    (v & 0xff) / 255
  ];
}

function rgbToHex(rgb: Vec3): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

function sanitizeIdentifier(name: string): string {
  let s = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (!s) s = 'Prim';
  if (/^[0-9]/.test(s)) s = '_' + s;
  return s;
}

function sanitizeName(
  preferred: string,
  fallback: string,
  used: Set<string>
): string {
  let base = sanitizeIdentifier(preferred || fallback);
  let candidate = base;
  let n = 1;
  while (used.has(candidate)) {
    candidate = `${base}_${++n}`;
  }
  used.add(candidate);
  return candidate;
}

// ---------- Import ----------

interface ParsedNode {
  name: string;
  isXform: boolean;
  attrs: Map<string, string>;
  children: ParsedNode[];
}

export function parseUsda(text: string): ImportedScene {
  const tokens = tokenize(text);
  let i = 0;

  // Skip header magic + optional layer metadata `( ... )`.
  if (tokens[i]?.startsWith('#usda')) i++;
  if (tokens[i] === '(') {
    i = skipParenBlock(tokens, i);
  }

  const roots: ParsedNode[] = [];
  while (i < tokens.length) {
    if (tokens[i] === 'def') {
      const { node, next } = parseDef(tokens, i);
      i = next;
      if (node) roots.push(node);
    } else {
      i++;
    }
  }

  // If there is a single top-level Xform "wrapper", treat it as the scene root.
  let sceneName = 'Untitled Scene';
  let primRoots = roots;
  if (roots.length === 1 && roots[0].isXform) {
    sceneName = roots[0].name;
    primRoots = roots[0].children;
  }

  const out: PrimNode[] = [];
  for (const r of primRoots) {
    walk(r, null, out);
  }
  return { sceneName, prims: out };
}

function walk(node: ParsedNode, parentId: string | null, out: PrimNode[]): void {
  if (!node.isXform) return;

  // Find a child geom def to determine kind + color.
  let kind: ShapeKind | null = null;
  let color = '#b3b3b8';
  const xformChildren: ParsedNode[] = [];
  for (const c of node.children) {
    if (c.isXform) {
      xformChildren.push(c);
      continue;
    }
    const k = USD_TO_KIND[c.attrs.get('__typeName') ?? ''];
    if (k) {
      kind = k;
      const dc = c.attrs.get('primvars:displayColor');
      if (dc) {
        const rgb = parseVecList(dc);
        if (rgb) color = rgbToHex(rgb);
      }
    }
  }
  // Prefer explicit `kind = "<shapekind>"` metadata when present (we write it).
  const meta = node.attrs.get('__kindMeta');
  if (meta && meta in KIND_TO_USD) kind = meta as ShapeKind;

  // Pull the GLB asset path from `custom asset assetInfo:source = @...@`.
  // The tokenizer keeps `@path@` as a single token; strip the delimiters.
  let assetSource: string | undefined;
  const rawSource = node.attrs.get('assetInfo:source');
  if (rawSource) {
    assetSource = rawSource.replace(/^@/, '').replace(/@$/, '');
  }
  if (kind === null && assetSource) kind = 'reference';
  // No geometry child and no override -> this Xform is a pure container.
  if (kind === null) kind = 'group';

  const position = parseVec(node.attrs.get('xformOp:translate')) ?? [0, 0, 0];
  const rotDeg = parseVec(node.attrs.get('xformOp:rotateXYZ')) ?? [0, 0, 0];
  const scale = parseVec(node.attrs.get('xformOp:scale')) ?? [1, 1, 1];
  const rotation: Vec3 = [
    (rotDeg[0] * Math.PI) / 180,
    (rotDeg[1] * Math.PI) / 180,
    (rotDeg[2] * Math.PI) / 180
  ];

  const id = newId();
  out.push({
    id,
    name: node.name,
    kind,
    position,
    rotation,
    scale,
    parentId,
    color,
    ...(assetSource ? { assetSource } : {})
  });
  for (const c of xformChildren) walk(c, id, out);
}

function parseVec(v: string | undefined): Vec3 | null {
  if (!v) return null;
  // Pull the first three numbers, tolerating any surrounding parens / brackets / commas / whitespace.
  const nums = v.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const parts = nums.slice(0, 3).map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

function parseVecList(v: string): Vec3 | null {
  // Accepts "[(r, g, b)]" or "(r, g, b)".
  return parseVec(v);
}

// ---------- Tokenizer / def parser ----------

function tokenize(text: string): string[] {
  // Strip comments (#... to EOL) but keep the magic `#usda` token.
  const lines = text.split(/\r?\n/).map((line) => {
    if (line.trimStart().startsWith('#usda')) return line;
    const i = line.indexOf('#');
    return i === -1 ? line : line.slice(0, i);
  });
  const cleaned = lines.join('\n');

  const out: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === '(' || ch === ')' || ch === '=') {
      out.push(ch);
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < cleaned.length && cleaned[j] !== '"') j++;
      out.push(cleaned.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (ch === '[') {
      // Capture the whole bracketed expression including nested parens.
      let depth = 0;
      let j = i;
      while (j < cleaned.length) {
        const c = cleaned[j];
        if (c === '[') depth++;
        else if (c === ']') {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        j++;
      }
      out.push(cleaned.slice(i, j));
      i = j;
      continue;
    }
    // Identifier / number / parenthesized vec like (1, 2, 3).
    if (ch === '(' as string) {
      // Already handled above; here for clarity.
    }
    let j = i;
    while (
      j < cleaned.length &&
      !' \t\n\r{}()='.includes(cleaned[j])
    ) {
      j++;
    }
    out.push(cleaned.slice(i, j));
    i = j;
  }
  return out;
}

function skipParenBlock(tokens: string[], start: number): number {
  if (tokens[start] !== '(') return start;
  let depth = 0;
  let i = start;
  while (i < tokens.length) {
    if (tokens[i] === '(') depth++;
    else if (tokens[i] === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}

function parseDef(
  tokens: string[],
  start: number
): { node: ParsedNode | null; next: number } {
  // def [TypeName] "Name" [( meta )] { body }
  let i = start + 1; // skip "def"
  let typeName = '';
  if (!tokens[i]?.startsWith('"')) {
    typeName = tokens[i] ?? '';
    i++;
  }
  const nameTok = tokens[i] ?? '';
  i++;
  const name = nameTok.replace(/^"|"$/g, '');

  const attrs = new Map<string, string>();
  if (typeName) attrs.set('__typeName', typeName);

  // Optional meta block.
  if (tokens[i] === '(') {
    const metaEnd = skipParenBlock(tokens, i);
    // Pull out a few known metadata fields from the meta tokens.
    const meta = tokens.slice(i + 1, metaEnd - 1);
    for (let k = 0; k < meta.length - 2; k++) {
      if (meta[k] === 'kind' && meta[k + 1] === '=' && meta[k + 2].startsWith('"')) {
        attrs.set('__kindMeta', meta[k + 2].replace(/^"|"$/g, ''));
      }
    }
    i = metaEnd;
  }

  if (tokens[i] !== '{') {
    return { node: null, next: i };
  }
  i++; // consume '{'

  const children: ParsedNode[] = [];
  while (i < tokens.length && tokens[i] !== '}') {
    if (tokens[i] === 'def') {
      const { node, next } = parseDef(tokens, i);
      i = next;
      if (node) children.push(node);
      continue;
    }
    // Otherwise this is an attribute line: <type tokens...> name = value
    const attr = readAttribute(tokens, i);
    if (attr) {
      attrs.set(attr.name, attr.value);
      i = attr.next;
    } else {
      i++;
    }
  }
  if (tokens[i] === '}') i++;

  const isXform = typeName === 'Xform' || typeName === '';
  return { node: { name, isXform, attrs, children }, next: i };
}

function readAttribute(
  tokens: string[],
  start: number
): { name: string; value: string; next: number } | null {
  // Walk forward until we find an '=' or hit '}' / 'def'.
  let i = start;
  let nameIdx = -1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === '}' || t === 'def') return null;
    if (t === '=') {
      nameIdx = i - 1;
      break;
    }
    i++;
  }
  if (nameIdx < 0) return null;
  const name = tokens[nameIdx].replace(/^"|"$/g, '');
  const valueIdx = i + 1;
  if (valueIdx >= tokens.length) return null;

  // Vector / tuple values are emitted as separate tokens because '(' and ')'
  // are their own tokens. Reassemble parenthesized values into a single string
  // the value parsers can read.
  if (tokens[valueIdx] === '(') {
    let depth = 0;
    let j = valueIdx;
    const buf: string[] = [];
    while (j < tokens.length) {
      const t = tokens[j];
      if (t === '(') {
        depth++;
        buf.push('(');
      } else if (t === ')') {
        depth--;
        buf.push(')');
        if (depth === 0) {
          j++;
          break;
        }
      } else {
        buf.push(t);
      }
      j++;
    }
    return { name, value: buf.join(' '), next: j };
  }

  const valueTok = tokens[valueIdx];
  return { name, value: valueTok.replace(/^"|"$/g, ''), next: valueIdx + 1 };
}

// Local ID generator, kept here so usd.ts is self-contained.
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
