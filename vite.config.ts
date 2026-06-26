import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, statSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USD_ASSETS_SRC = path.resolve(__dirname, 'usd_assets');
const USD_SHAPES_SRC = path.resolve(__dirname, 'usd_shapes');
const URL_PREFIX = '/usd_assets/';
const SHAPES_URL_PREFIX = '/usd_shapes/';
// Restrict which assets get copied into the production bundle. Other assets
// remain available in dev (full usd_assets/ tree) but are excluded from dist/
// to keep the deploy under SWA upload limits. Empty array = include everything.
// Allowlist entries must match a top-level entry under `usd_assets/`:
// either a folder name (e.g. 'Conveyors') or the basename of a sibling
// `*.usda` / `*.glb` (e.g. 'shelves_01').
const DIST_ASSET_ALLOWLIST = ['HospitalBed', 'Room', 'Placeholder'];

// Make usd_assets/ available at /usd_assets/* in dev (via middleware) and
// copied verbatim into dist/usd_assets/ on build. We need stable, original
// filenames so OBJ -> MTL -> texture relative lookups resolve correctly.
function usdAssetsStatic(): Plugin {
  const CONTENT_TYPES: Record<string, string> = {
    '.obj': 'text/plain; charset=utf-8',
    '.mtl': 'text/plain; charset=utf-8',
    '.usda': 'text/plain; charset=utf-8',
    '.usd': 'application/octet-stream',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };

  async function copyDir(src: string, dest: string) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    await Promise.all(
      entries.map(async (e) => {
        const s = path.join(src, e.name);
        const d = path.join(dest, e.name);
        if (e.isDirectory()) await copyDir(s, d);
        else await copyFile(s, d);
      })
    );
  }
  return {
    name: 'usd-assets-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(URL_PREFIX)) return next();
        // Anything with a query string (e.g. `?raw`, `?import`) is a Vite
        // transform request — defer to Vite so the import.meta.glob('*.usda',
        // { query: '?raw' }) pipeline keeps working. We only serve plain
        // fetches the renderer makes for binary payloads + textures.
        if (req.url.includes('?')) return next();
        const rel = decodeURIComponent(req.url.slice(URL_PREFIX.length));
        const filePath = path.join(USD_ASSETS_SRC, rel);
        // Guard against path-escape via '..' segments.
        if (!filePath.startsWith(USD_ASSETS_SRC)) return next();
        try {
          if (!statSync(filePath).isFile()) return next();
        } catch {
          return next();
        }
        const ext = path.extname(filePath).toLowerCase();
        if (CONTENT_TYPES[ext]) res.setHeader('Content-Type', CONTENT_TYPES[ext]);
        createReadStream(filePath).pipe(res);
      });
    },
    async closeBundle() {
      const outDir = path.resolve(__dirname, 'dist', 'usd_assets');
      // Wipe stale assets from previous builds so the dist tree always
      // matches the current allowlist (otherwise removed entries linger).
      await rm(outDir, { recursive: true, force: true });
      const allow = DIST_ASSET_ALLOWLIST;
      if (!allow.length) {
        await copyDir(USD_ASSETS_SRC, outDir);
        return;
      }
      await mkdir(outDir, { recursive: true });
      const entries = await readdir(USD_ASSETS_SRC, { withFileTypes: true });
      await Promise.all(
        entries.map(async (e) => {
          // Match by directory name, or by stripped filename for top-level
          // sibling files like `Forklift.usda` or `shelves_01.glb`.
          const base = e.isDirectory() ? e.name : e.name.replace(/\.[^.]+$/, '');
          if (!allow.includes(base)) return;
          const s = path.join(USD_ASSETS_SRC, e.name);
          const d = path.join(outDir, e.name);
          if (e.isDirectory()) await copyDir(s, d);
          else await copyFile(s, d);
        })
      );
    }
  };
}

// Generic dev/build static-folder middleware used for smaller fixed asset sets
// (currently `usd_shapes/`). Mirrors `usdAssetsStatic` but always copies the
// whole source tree at build time and has no allowlist.
function staticFolder({
  name,
  srcDir,
  urlPrefix,
  distDir
}: {
  name: string;
  srcDir: string;
  urlPrefix: string;
  distDir: string;
}): Plugin {
  const CONTENT_TYPES: Record<string, string> = {
    '.usda': 'text/plain; charset=utf-8',
    '.usd': 'application/octet-stream',
    '.obj': 'text/plain; charset=utf-8',
    '.mtl': 'text/plain; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };

  async function copyDir(src: string, dest: string) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    await Promise.all(
      entries.map(async (e) => {
        const s = path.join(src, e.name);
        const d = path.join(dest, e.name);
        if (e.isDirectory()) await copyDir(s, d);
        else await copyFile(s, d);
      })
    );
  }

  return {
    name,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(urlPrefix)) return next();
        if (req.url.includes('?')) return next();
        const rel = decodeURIComponent(req.url.slice(urlPrefix.length));
        const filePath = path.join(srcDir, rel);
        if (!filePath.startsWith(srcDir)) return next();
        try {
          if (!statSync(filePath).isFile()) return next();
        } catch {
          return next();
        }
        const ext = path.extname(filePath).toLowerCase();
        if (CONTENT_TYPES[ext]) res.setHeader('Content-Type', CONTENT_TYPES[ext]);
        createReadStream(filePath).pipe(res);
      });
    },
    async closeBundle() {
      await copyDir(srcDir, distDir);
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    usdAssetsStatic(),
    // Shapes are a tiny fixed set of primitives, copy the whole folder.
    staticFolder({
      name: 'usd-shapes-static',
      srcDir: USD_SHAPES_SRC,
      urlPrefix: SHAPES_URL_PREFIX,
      distDir: path.resolve(__dirname, 'dist', 'usd_shapes')
    })
  ],
  define: {
    __DIST_ASSET_ALLOWLIST__: JSON.stringify(DIST_ASSET_ALLOWLIST)
  },
  server: { open: true }
});
