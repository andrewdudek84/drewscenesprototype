import { useRef, useState } from 'react';
import {
  addUserLibraryItem,
  newUserItemId,
  removeUserLibraryItem,
  useUserLibrary
} from '../userLibrary';
import type { UserPalette } from '../userLibrary';
import { pickIconForTitle, BLANK_ICON_SVG } from '../assetIcon';

interface Props {
  palette: UserPalette;
  // MIME type written into the DataTransfer so the viewport drop handler
  // routes the item through the asset-spawn pipeline.
  dragMime: string;
  // Tooltip prefix, e.g. "Import a .usd / .usda shape...".
  importTitle: string;
}

const ACCEPTED_EXTS = ['.usda', '.usd', '.glb', '.gltf', '.obj'] as const;
type BinaryExt = 'glb' | 'gltf' | 'obj';

// Compact toolbar above the palette tiles with an "Import" button that
// accepts a .usd or .usda file and a list of currently-imported items with
// a per-item remove affordance.
export default function PaletteImporter({ palette, dragMime, importTitle }: Props) {
  const items = useUserLibrary(palette);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData(dragMime, id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onPick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
      if (!ACCEPTED_EXTS.includes(ext as (typeof ACCEPTED_EXTS)[number])) {
        alert(
          `Unsupported file type "${ext || file.name}". Allowed: ${ACCEPTED_EXTS.join(', ')}.`
        );
        return;
      }
      const rawName = file.name.replace(/\.[^.]+$/, '');
      const label = rawName.replace(/[_-]+/g, ' ').trim() || 'Untitled';
      const iconSvg = pickIconForTitle(rawName) ?? BLANK_ICON_SVG;

      if (ext === '.usda' || ext === '.usd') {
        const text = await file.text();
        if (!text.trimStart().startsWith('#usda') && !/\bdef\s+/.test(text)) {
          alert(
            'That file does not look like a USDA scene (no `#usda` magic or `def` blocks). Binary `.usd` files are not supported \u2014 please save your file as `.usda` first.'
          );
          return;
        }
        await addUserLibraryItem({ palette, label, usda: text, iconSvg });
      } else {
        // .glb / .gltf / .obj: store the binary as a Blob and synthesize a
        // wrapper USDA that references it via `user://<id>/<filename>`.
        const id = newUserItemId();
        const binExt = ext.slice(1) as BinaryExt;
        const fileName = sanitizeFileName(file.name);
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const usda = buildReferenceWrapper(label, id, fileName);
        await addUserLibraryItem({
          id,
          palette,
          label,
          usda,
          iconSvg,
          blobs: { [fileName]: blob }
        });
        if (binExt === 'gltf' || binExt === 'obj') {
          // Heads-up: companion files (gltf .bin / textures, obj .mtl) aren't
          // imported, so only single-file payloads render fully.
          console.info(
            `Imported ${ext}; companion files (.bin/.mtl/textures) were not included and may not render.`
          );
        }
      }
    } catch (err) {
      console.error('Import failed', err);
      alert(`Could not import "${file.name}". ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".usda,.usd,.glb,.gltf,.obj"
        style={{ display: 'none' }}
        onChange={onPick}
      />
      <button
        type="button"
        className="palette-item palette-import-tile"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title={importTitle}
      >
        <span className="palette-import-glyph" aria-hidden="true">+</span>
        <span className="palette-label">{busy ? 'Importing\u2026' : 'Import'}</span>
      </button>
      {items.map((it) => (
        <div
          key={it.id}
          className="palette-item is-user"
          draggable
          onDragStart={(e) => onDragStart(e, it.id)}
          title={`Drag ${it.label} into the viewport`}
        >
          <span
            className="palette-icon-svg"
            // The icon SVG comes from our own keyword table (assetIcon.ts) or
            // is the locally-defined BLANK_ICON_SVG \u2014 never user input \u2014 so
            // dangerouslySetInnerHTML is safe here.
            dangerouslySetInnerHTML={{ __html: it.iconSvg }}
          />
          <span className="palette-label">{it.label}</span>
          <button
            type="button"
            className="palette-item-remove"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove "${it.label}" from your library?`)) {
                void removeUserLibraryItem(it.id);
              }
            }}
            title={`Remove ${it.label}`}
            aria-label={`Remove ${it.label}`}
          >
            {'\u00d7'}
          </button>
        </div>
      ))}
    </>
  );
}

// Strip path separators and reserved chars so the filename is safe to embed
// in a `@user://<id>/<name>@` asset path.
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

// Generate a minimal USDA wrapper that defines a single `reference` prim
// pointing at the user-imported binary. parseUsda treats the outer Xform as
// the asset's scene root, so the spawned hierarchy is:
//   Group("<label>") -> Reference("Model") -> loaded GLB/OBJ meshes.
function buildReferenceWrapper(label: string, itemId: string, fileName: string): string {
  const root = sanitizeIdent(label) || 'Imported';
  return `#usda 1.0
(
    defaultPrim = "${root}"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "${root}"
{
    def Xform "Model" (
        kind = "reference"
    )
    {
        custom string drewscenes:id = "${itemId}-root"
        double3 xformOp:translate = (0, 0, 0)
        float3 xformOp:rotateXYZ = (0, 0, 0)
        float3 xformOp:scale = (1, 1, 1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]
        custom asset assetInfo:source = @user://${itemId}/${fileName}@
    }
}
`;
}

function sanitizeIdent(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+/, '');
  return cleaned.replace(/^([0-9])/, '_$1');
}
