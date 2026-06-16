import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, statSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USD_ASSETS_SRC = path.resolve(__dirname, 'usd_assets');
const URL_PREFIX = '/usd_assets/';
// Restrict which assets get copied into the production bundle. Other assets
// remain available in dev (full usd_assets/ tree) but are excluded from dist/
// to keep the deploy under SWA upload limits. Empty array = include everything.
const DIST_ASSET_ALLOWLIST = ['HospitalBed'];

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

export default defineConfig({
  plugins: [react(), usdAssetsStatic()],
  define: {
    __DIST_ASSET_ALLOWLIST__: JSON.stringify(DIST_ASSET_ALLOWLIST)
  },
  server: { open: true }
});
