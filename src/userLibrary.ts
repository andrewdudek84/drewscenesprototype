// User-imported USDA library, persisted in IndexedDB and mirrored in an
// in-memory cache so synchronous lookups (e.g. `getAsset(id)` during a drag
// drop) keep working. Consumers subscribe to `subscribe(...)` to re-render
// when the cache changes.

import { useSyncExternalStore } from 'react';

const DB_NAME = 'drewscenes';
const DB_VERSION = 1;
const STORE = 'userLibrary';

export type UserPalette = 'shape' | 'asset';

export interface UserLibraryItem {
  id: string;
  label: string;
  palette: UserPalette;
  usda: string;
  iconSvg: string;
  createdAt: number;
  // Binary payloads (GLB, GLTF, OBJ, etc.) keyed by filename. Resolved at
  // runtime by registerItemBlobs() into object URLs addressable as
  // `user://<id>/<filename>` from the asset path resolver.
  blobs?: Record<string, Blob>;
}

let cache: UserLibraryItem[] = [];
const listeners = new Set<() => void>();
// Map of `user://<itemId>/<filename>` -> object URL for live blobs.
const userAssetUrls = new Map<string, string>();

function registerItemBlobs(item: UserLibraryItem): void {
  if (!item.blobs) return;
  for (const [name, blob] of Object.entries(item.blobs)) {
    const key = `user://${item.id}/${name}`;
    if (!userAssetUrls.has(key)) {
      userAssetUrls.set(key, URL.createObjectURL(blob));
    }
  }
}

function unregisterItemBlobs(item: UserLibraryItem): void {
  if (!item.blobs) return;
  for (const name of Object.keys(item.blobs)) {
    const key = `user://${item.id}/${name}`;
    const url = userAssetUrls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      userAssetUrls.delete(key);
    }
  }
}

export function resolveUserAssetUrl(assetPath: string): string | undefined {
  return userAssetUrls.get(assetPath);
}

function notify() {
  snapshotVersion += 1;
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUserLibrary(palette?: UserPalette): UserLibraryItem[] {
  return palette ? cache.filter((i) => i.palette === palette) : cache.slice();
}

export function getUserLibraryItem(id: string): UserLibraryItem | undefined {
  return cache.find((i) => i.id === id);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadUserLibrary(): Promise<UserLibraryItem[]> {
  try {
    const db = await openDb();
    const items: UserLibraryItem[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as UserLibraryItem[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    cache = items.sort((a, b) => a.label.localeCompare(b.label));
    for (const item of cache) registerItemBlobs(item);
    notify();
    return cache.slice();
  } catch (err) {
    console.warn('User library load failed', err);
    return [];
  }
}

export async function addUserLibraryItem(
  draft: Omit<UserLibraryItem, 'id' | 'createdAt'> & { id?: string }
): Promise<UserLibraryItem> {
  const item: UserLibraryItem = {
    ...draft,
    id: draft.id ?? `user-${newId()}`,
    createdAt: Date.now()
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  registerItemBlobs(item);
  cache = [...cache, item].sort((a, b) => a.label.localeCompare(b.label));
  notify();
  return item;
}

export async function removeUserLibraryItem(id: string): Promise<void> {
  const existing = cache.find((i) => i.id === id);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  if (existing) unregisterItemBlobs(existing);
  cache = cache.filter((i) => i.id !== id);
  notify();
}

export function newUserItemId(): string {
  return `user-${newId()}`;
}

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

// React hook that re-renders when the user library changes. Pass a `palette`
// to scope the returned list to either user-imported shapes or user-imported
// assets; omit to get everything.
export function useUserLibrary(palette?: UserPalette): UserLibraryItem[] {
  // Snapshot must be referentially stable when nothing has changed; we cache
  // the last-returned array and only rebuild it on a real notify().
  return useSyncExternalStore(subscribe, () => snapshotFor(palette));
}

let lastAll: UserLibraryItem[] = cache;
let lastShape: UserLibraryItem[] = cache.filter((i) => i.palette === 'shape');
let lastAsset: UserLibraryItem[] = cache.filter((i) => i.palette === 'asset');
let snapshotVersion = 0;
let lastSnapshotVersion = -1;

function snapshotFor(palette?: UserPalette): UserLibraryItem[] {
  if (snapshotVersion !== lastSnapshotVersion) {
    lastSnapshotVersion = snapshotVersion;
    lastAll = cache.slice();
    lastShape = cache.filter((i) => i.palette === 'shape');
    lastAsset = cache.filter((i) => i.palette === 'asset');
  }
  if (palette === 'shape') return lastShape;
  if (palette === 'asset') return lastAsset;
  return lastAll;
}
