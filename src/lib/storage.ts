import type {
  BundleRecord,
  CatalogData,
  CefrLevel,
  EncryptedPayload,
  RuntimeMode,
  SharePayloadTool,
  ToolAccent,
  ToolRecord,
} from '../types';
import { decryptText, encryptText } from './crypto';
import { extractHtmlMetadata, slugify } from './htmlMeta';

const BASE = import.meta.env.BASE_URL || '/';
const DB_NAME = 'noneteco-workstation-v1';
const DB_VERSION = 1;
const BUNDLE_VERIFY_TOKEN = 'NONETECO_BUNDLE_V1';

interface LocalBlobEntry {
  id: string;
  html?: string;
  encrypted?: EncryptedPayload;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tools')) db.createObjectStore('tools', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bundles')) db.createObjectStore('bundles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('deletedTools')) db.createObjectStore('deletedTools', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('deletedBundles')) db.createObjectStore('deletedBundles', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAll(): Promise<void> {
  const db = await openDb();
  const stores = ['tools', 'blobs', 'bundles', 'deletedTools', 'deletedBundles'];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  const res = await fetch(`${BASE}${clean}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function detectRuntimeMode(): Promise<RuntimeMode> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`${BASE}api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return 'static';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return 'static';
    const data = (await res.json()) as { ok?: boolean; mode?: string };
    return data.ok && data.mode === 'server' ? 'server' : 'static';
  } catch {
    return 'static';
  }
}

async function fetchStaticCatalog(): Promise<CatalogData> {
  try {
    const res = await fetch(`${BASE}library/index.json`, { cache: 'no-store' });
    if (!res.ok) return { version: 1, tools: [], bundles: [] };
    const parsed = (await res.json()) as Partial<CatalogData>;
    return {
      version: 1,
      tools: Array.isArray(parsed.tools) ? parsed.tools.map((t) => ({ ...t, source: 'static' })) : [],
      bundles: Array.isArray(parsed.bundles) ? parsed.bundles.map((b) => ({ ...b, source: 'static' })) : [],
    };
  } catch {
    return { version: 1, tools: [], bundles: [] };
  }
}

export async function loadCatalog(mode: RuntimeMode): Promise<{ catalog: CatalogData; hasLocalChanges: boolean }> {
  if (mode === 'server') {
    const catalog = await apiJson<CatalogData>('api/catalog');
    return { catalog, hasLocalChanges: false };
  }

  const staticCat = await fetchStaticCatalog();
  const [localTools, localBundles, delTools, delBundles] = await Promise.all([
    idbGetAll<ToolRecord>('tools'),
    idbGetAll<BundleRecord>('bundles'),
    idbGetAll<{ id: string }>('deletedTools'),
    idbGetAll<{ id: string }>('deletedBundles'),
  ]);

  const delToolSet = new Set(delTools.map((d) => d.id));
  const delBundleSet = new Set(delBundles.map((d) => d.id));
  const localToolMap = new Map(localTools.map((t) => [t.id, { ...t, source: 'local' as const }]));
  const localBundleMap = new Map(localBundles.map((b) => [b.id, { ...b, source: 'local' as const }]));

  const mergedTools: ToolRecord[] = [];
  for (const t of localTools) {
    if (!delToolSet.has(t.id)) mergedTools.push({ ...t, source: 'local' });
  }
  for (const t of staticCat.tools) {
    if (!delToolSet.has(t.id) && !localToolMap.has(t.id)) {
      mergedTools.push(t);
    }
  }

  const mergedBundles: BundleRecord[] = [];
  for (const b of localBundles) {
    if (!delBundleSet.has(b.id)) {
      mergedBundles.push({
        ...b,
        toolIds: b.toolIds.filter((tid) => !delToolSet.has(tid)),
        source: 'local',
      });
    }
  }
  for (const b of staticCat.bundles) {
    if (!delBundleSet.has(b.id) && !localBundleMap.has(b.id)) {
      mergedBundles.push({
        ...b,
        toolIds: b.toolIds.filter((tid) => !delToolSet.has(tid)),
      });
    }
  }

  const hasLocalChanges =
    localTools.length > 0 || localBundles.length > 0 || delTools.length > 0 || delBundles.length > 0;

  return {
    catalog: { version: 1, tools: mergedTools, bundles: mergedBundles },
    hasLocalChanges,
  };
}

export async function rescanDropFolder(mode: RuntimeMode): Promise<{ imported: number; catalog: CatalogData }> {
  if (mode === 'server') {
    return apiJson<{ imported: number; catalog: CatalogData }>('api/rescan', { method: 'POST' });
  }
  const { catalog } = await loadCatalog(mode);
  return { imported: 0, catalog };
}

export async function getToolHtml(mode: RuntimeMode, tool: ToolRecord): Promise<string> {
  if (mode === 'server') {
    const res = await apiJson<{ html: string }>(`api/tools/${encodeURIComponent(tool.id)}/content`);
    return res.html;
  }

  const localBlob = await idbGet<LocalBlobEntry>('blobs', tool.id);
  if (localBlob) {
    if (localBlob.html !== undefined) return localBlob.html;
    throw new Error('Tool is password-protected');
  }

  if (tool.protected) throw new Error('Tool is password-protected');
  const rel = tool.blobPath || `blobs/${tool.id}.html`;
  const res = await fetch(`${BASE}library/${rel}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load HTML file');
  return res.text();
}

export async function unlockTool(mode: RuntimeMode, tool: ToolRecord, password: string): Promise<string> {
  if (mode === 'server') {
    const res = await apiJson<{ html: string }>(`api/tools/${encodeURIComponent(tool.id)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    return res.html;
  }

  const localBlob = await idbGet<LocalBlobEntry>('blobs', tool.id);
  if (localBlob) {
    if (localBlob.html !== undefined) return localBlob.html;
    if (localBlob.encrypted) return decryptText(localBlob.encrypted, password);
    throw new Error('Missing encrypted payload');
  }

  const rel = tool.blobPath || `blobs/${tool.id}.enc.json`;
  const res = await fetch(`${BASE}library/${rel}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not fetch encrypted file');
  const payload = (await res.json()) as EncryptedPayload;
  return decryptText(payload, password);
}

function toUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export async function createTool(
  mode: RuntimeMode,
  input: {
    title?: string;
    description?: string;
    fileName?: string;
    html: string;
    tags?: string[];
    level?: CefrLevel;
    accent?: ToolAccent;
    password?: string;
    passwordHint?: string;
  },
): Promise<ToolRecord> {
  if (mode === 'server') {
    if (input.html.length > 1_000_000) {
      const { html, ...meta } = input;
      const res = await fetch(`${BASE}api/tools/raw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Tool-Meta': toUtf8Base64(JSON.stringify(meta)),
        },
        body: html,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      }
      return data as ToolRecord;
    }
    return apiJson<ToolRecord>('api/tools', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  const { catalog } = await loadCatalog('static');
  const existing = new Set(catalog.tools.map((t) => t.id));
  const fileName = (input.fileName || 'tool.html').trim();
  const meta = extractHtmlMetadata(input.html, fileName);
  const title = (input.title || meta.title).trim();

  let id = slugify(title || fileName);
  let suffix = 2;
  while (existing.has(id)) {
    id = `${slugify(title || fileName)}-${suffix++}`;
  }

  const hasPassword = Boolean(input.password && input.password.length > 0);
  const now = new Date().toISOString();

  if (hasPassword && input.password) {
    const encrypted = await encryptText(input.html, input.password);
    await idbPut<LocalBlobEntry>('blobs', { id, encrypted });
  } else {
    await idbPut<LocalBlobEntry>('blobs', { id, html: input.html });
  }

  const tags = input.tags && input.tags.length > 0
    ? Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)))
    : meta.suggestedTags;

  const record: ToolRecord = {
    id,
    title,
    description: (input.description ?? meta.description).trim(),
    fileName,
    tags,
    level: input.level || meta.suggestedLevel,
    accent: input.accent || meta.suggestedAccent,
    protected: hasPassword,
    passwordHint: hasPassword ? (input.passwordHint || '').trim() : undefined,
    blobPath: hasPassword ? `blobs/${id}.enc.json` : `blobs/${id}.html`,
    source: 'local',
    sizeBytes: new Blob([input.html]).size,
    createdAt: now,
    updatedAt: now,
    notes: '',
  };

  await idbDelete('deletedTools', id);
  await idbPut('tools', record);
  return record;
}

export async function updateTool(
  mode: RuntimeMode,
  tool: ToolRecord,
  patch: {
    title?: string;
    description?: string;
    tags?: string[];
    level?: CefrLevel;
    accent?: ToolAccent;
    notes?: string;
    html?: string;
    passwordHint?: string;
    newPassword?: string | null;
    currentPassword?: string;
  },
): Promise<ToolRecord> {
  if (mode === 'server') {
    return apiJson<ToolRecord>(`api/tools/${encodeURIComponent(tool.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  const wantsSensitive = patch.html !== undefined || patch.newPassword !== undefined;
  let currentHtml: string | undefined;

  if (wantsSensitive) {
    if (tool.protected) {
      if (!patch.currentPassword) throw new Error('Current password is required');
      currentHtml = await unlockTool('static', tool, patch.currentPassword);
    } else {
      currentHtml = await getToolHtml('static', tool);
    }
  }

  const nextHtml = patch.html !== undefined ? patch.html : currentHtml;
  let nextProtected = tool.protected;
  let nextBlobPath = tool.blobPath;

  if (patch.newPassword === null && nextHtml !== undefined) {
    await idbPut<LocalBlobEntry>('blobs', { id: tool.id, html: nextHtml });
    nextProtected = false;
    nextBlobPath = `blobs/${tool.id}.html`;
  } else if (typeof patch.newPassword === 'string' && patch.newPassword.length > 0 && nextHtml !== undefined) {
    const encrypted = await encryptText(nextHtml, patch.newPassword);
    await idbPut<LocalBlobEntry>('blobs', { id: tool.id, encrypted });
    nextProtected = true;
    nextBlobPath = `blobs/${tool.id}.enc.json`;
  } else if (patch.html !== undefined && nextHtml !== undefined) {
    if (tool.protected) {
      if (!patch.currentPassword) throw new Error('Current password is required');
      const encrypted = await encryptText(nextHtml, patch.currentPassword);
      await idbPut<LocalBlobEntry>('blobs', { id: tool.id, encrypted });
    } else {
      await idbPut<LocalBlobEntry>('blobs', { id: tool.id, html: nextHtml });
    }
  }

  const updated: ToolRecord = {
    ...tool,
    title: patch.title !== undefined ? patch.title.trim() || tool.title : tool.title,
    description: patch.description !== undefined ? patch.description.trim() : tool.description,
    tags: patch.tags !== undefined
      ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean)))
      : tool.tags,
    level: patch.level ?? tool.level,
    accent: patch.accent ?? tool.accent,
    notes: patch.notes !== undefined ? patch.notes : tool.notes,
    protected: nextProtected,
    passwordHint: nextProtected
      ? (patch.passwordHint !== undefined ? patch.passwordHint.trim() : tool.passwordHint)
      : undefined,
    blobPath: nextBlobPath,
    source: 'local',
    sizeBytes: nextHtml !== undefined ? new Blob([nextHtml]).size : tool.sizeBytes,
    updatedAt: new Date().toISOString(),
  };

  await idbPut('tools', updated);
  return updated;
}

export async function deleteTool(mode: RuntimeMode, id: string): Promise<void> {
  if (mode === 'server') {
    await apiJson(`api/tools/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  await idbDelete('tools', id);
  await idbDelete('blobs', id);
  await idbPut('deletedTools', { id });
}

export async function createBundle(
  mode: RuntimeMode,
  input: {
    title: string;
    description?: string;
    welcomeNote?: string;
    toolIds: string[];
    tags?: string[];
    accent?: ToolAccent;
    password?: string;
    passwordHint?: string;
  },
): Promise<BundleRecord> {
  if (mode === 'server') {
    return apiJson<BundleRecord>('api/bundles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  const { catalog } = await loadCatalog('static');
  const existing = new Set(catalog.bundles.map((b) => b.id));
  let id = slugify(input.title);
  let i = 2;
  while (existing.has(id)) {
    id = `${slugify(input.title)}-${i++}`;
  }

  const hasPassword = Boolean(input.password && input.password.length > 0);
  const now = new Date().toISOString();
  const bundle: BundleRecord = {
    id,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    welcomeNote: (input.welcomeNote || '').trim(),
    toolIds: input.toolIds,
    tags: Array.from(new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))),
    accent: input.accent || 'indigo',
    protected: hasPassword,
    passwordHint: hasPassword ? (input.passwordHint || '').trim() : undefined,
    passwordVerify: hasPassword && input.password ? await encryptText(BUNDLE_VERIFY_TOKEN, input.password) : undefined,
    createdAt: now,
    updatedAt: now,
    source: 'local',
  };

  await idbDelete('deletedBundles', id);
  await idbPut('bundles', bundle);
  return bundle;
}

export async function updateBundle(
  mode: RuntimeMode,
  bundle: BundleRecord,
  patch: {
    title?: string;
    description?: string;
    welcomeNote?: string;
    toolIds?: string[];
    tags?: string[];
    accent?: ToolAccent;
    passwordHint?: string;
    newPassword?: string | null;
    currentPassword?: string;
  },
): Promise<BundleRecord> {
  if (mode === 'server') {
    return apiJson<BundleRecord>(`api/bundles/${encodeURIComponent(bundle.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  if (patch.newPassword !== undefined && bundle.protected && bundle.passwordVerify) {
    if (!patch.currentPassword) throw new Error('Current bundle password is required');
    const check = await decryptText(bundle.passwordVerify, patch.currentPassword);
    if (check !== BUNDLE_VERIFY_TOKEN) throw new Error('Incorrect current password');
  }

  let nextProtected = bundle.protected;
  let nextVerify = bundle.passwordVerify;
  if (patch.newPassword === null) {
    nextProtected = false;
    nextVerify = undefined;
  } else if (typeof patch.newPassword === 'string' && patch.newPassword.length > 0) {
    nextProtected = true;
    nextVerify = await encryptText(BUNDLE_VERIFY_TOKEN, patch.newPassword);
  }

  const updated: BundleRecord = {
    ...bundle,
    title: patch.title !== undefined ? patch.title.trim() || bundle.title : bundle.title,
    description: patch.description !== undefined ? patch.description.trim() : bundle.description,
    welcomeNote: patch.welcomeNote !== undefined ? patch.welcomeNote.trim() : bundle.welcomeNote,
    toolIds: patch.toolIds ?? bundle.toolIds,
    tags: patch.tags !== undefined ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean))) : bundle.tags,
    accent: patch.accent ?? bundle.accent,
    protected: nextProtected,
    passwordHint: nextProtected
      ? (patch.passwordHint !== undefined ? patch.passwordHint.trim() : bundle.passwordHint)
      : undefined,
    passwordVerify: nextVerify,
    updatedAt: new Date().toISOString(),
    source: 'local',
  };

  await idbPut('bundles', updated);
  return updated;
}

export async function unlockBundle(mode: RuntimeMode, bundle: BundleRecord, password: string): Promise<boolean> {
  if (!bundle.protected) return true;
  if (mode === 'server') {
    await apiJson(`api/bundles/${encodeURIComponent(bundle.id)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    return true;
  }
  if (!bundle.passwordVerify) return false;
  const check = await decryptText(bundle.passwordVerify, password);
  if (check !== BUNDLE_VERIFY_TOKEN) throw new Error('Incorrect password');
  return true;
}

export async function deleteBundle(mode: RuntimeMode, id: string): Promise<void> {
  if (mode === 'server') {
    await apiJson(`api/bundles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  await idbDelete('bundles', id);
  await idbPut('deletedBundles', { id });
}

export async function exportSingleToolPayload(
  mode: RuntimeMode,
  tool: ToolRecord,
): Promise<SharePayloadTool> {
  if (mode === 'server') {
    if (tool.protected) {
      // Fetch encrypted payload via a 1-item export or dedicated logic; fallback: use bundle-style check
      const res = await apiJson<{ encrypted: EncryptedPayload }>(
        `api/tools/${encodeURIComponent(tool.id)}/encrypted`,
      );
      return {
        id: tool.id,
        title: tool.title,
        description: tool.description,
        fileName: tool.fileName,
        tags: tool.tags,
        level: tool.level,
        accent: tool.accent,
        protected: true,
        passwordHint: tool.passwordHint,
        encrypted: res.encrypted,
      };
    }
    const html = await getToolHtml('server', tool);
    return {
      id: tool.id,
      title: tool.title,
      description: tool.description,
      fileName: tool.fileName,
      tags: tool.tags,
      level: tool.level,
      accent: tool.accent,
      protected: false,
      html,
    };
  }

  if (tool.protected) {
    const localBlob = await idbGet<LocalBlobEntry>('blobs', tool.id);
    let encrypted = localBlob?.encrypted;
    if (!encrypted) {
      const rel = tool.blobPath || `blobs/${tool.id}.enc.json`;
      const res = await fetch(`${BASE}library/${rel}`, { cache: 'no-store' });
      encrypted = (await res.json()) as EncryptedPayload;
    }
    return {
      id: tool.id,
      title: tool.title,
      description: tool.description,
      fileName: tool.fileName,
      tags: tool.tags,
      level: tool.level,
      accent: tool.accent,
      protected: true,
      passwordHint: tool.passwordHint,
      encrypted,
    };
  }

  const html = await getToolHtml('static', tool);
  return {
    id: tool.id,
    title: tool.title,
    description: tool.description,
    fileName: tool.fileName,
    tags: tool.tags,
    level: tool.level,
    accent: tool.accent,
    protected: false,
    html,
  };
}

export async function exportBundleTools(
  mode: RuntimeMode,
  bundle: BundleRecord,
  allTools: ToolRecord[],
  bundlePassword?: string,
): Promise<SharePayloadTool[]> {
  if (mode === 'server') {
    const res = await apiJson<{ tools: SharePayloadTool[] }>(
      `api/bundles/${encodeURIComponent(bundle.id)}/export`,
      {
        method: 'POST',
        body: JSON.stringify({ bundlePassword }),
      },
    );
    return res.tools;
  }

  const out: SharePayloadTool[] = [];
  for (const tid of bundle.toolIds) {
    const tool = allTools.find((t) => t.id === tid);
    if (!tool) continue;

    if (tool.protected) {
      const localBlob = await idbGet<LocalBlobEntry>('blobs', tool.id);
      let encrypted = localBlob?.encrypted;
      if (!encrypted) {
        const rel = tool.blobPath || `blobs/${tool.id}.enc.json`;
        const res = await fetch(`${BASE}library/${rel}`, { cache: 'no-store' });
        encrypted = (await res.json()) as EncryptedPayload;
      }
      out.push({
        id: tool.id,
        title: tool.title,
        description: tool.description,
        fileName: tool.fileName,
        tags: tool.tags,
        level: tool.level,
        accent: tool.accent,
        protected: true,
        passwordHint: tool.passwordHint,
        encrypted,
      });
    } else {
      const html = await getToolHtml('static', tool);
      out.push({
        id: tool.id,
        title: tool.title,
        description: tool.description,
        fileName: tool.fileName,
        tags: tool.tags,
        level: tool.level,
        accent: tool.accent,
        protected: false,
        html,
      });
    }
  }
  return out;
}

export async function collectStaticSyncChanges(): Promise<{
  catalog: CatalogData;
  upsertFiles: Array<{ path: string; content: string }>;
  deletePaths: string[];
}> {
  const staticCat = await fetchStaticCatalog();
  const { catalog } = await loadCatalog('static');
  const localTools = await idbGetAll<ToolRecord>('tools');
  const localBlobs = await idbGetAll<LocalBlobEntry>('blobs');
  const delTools = await idbGetAll<{ id: string }>('deletedTools');

  const blobMap = new Map(localBlobs.map((b) => [b.id, b]));
  const upsertFiles: Array<{ path: string; content: string }> = [];
  const deletePaths: string[] = [];

  for (const t of localTools) {
    const blob = blobMap.get(t.id);
    if (!blob) continue;
    const prev = staticCat.tools.find((st) => st.id === t.id);
    if (prev?.blobPath && prev.blobPath !== t.blobPath) {
      deletePaths.push(`library/${prev.blobPath}`);
    }
    if (blob.encrypted) {
      upsertFiles.push({
        path: `library/${t.blobPath || `blobs/${t.id}.enc.json`}`,
        content: JSON.stringify(blob.encrypted, null, 2),
      });
    } else if (blob.html !== undefined) {
      upsertFiles.push({
        path: `library/${t.blobPath || `blobs/${t.id}.html`}`,
        content: blob.html,
      });
    }
  }

  for (const d of delTools) {
    const prev = staticCat.tools.find((st) => st.id === d.id);
    if (prev?.blobPath) deletePaths.push(`library/${prev.blobPath}`);
  }

  const cleanCatalog: CatalogData = {
    version: 1,
    tools: catalog.tools.map(({ source: _s, ...rest }) => rest),
    bundles: catalog.bundles.map(({ source: _s, ...rest }) => rest),
  };

  upsertFiles.push({
    path: 'library/index.json',
    content: JSON.stringify(cleanCatalog, null, 2),
  });

  return { catalog: cleanCatalog, upsertFiles, deletePaths };
}

export async function clearLocalOverlayAfterPublish(): Promise<void> {
  await idbClearAll();
}

export function getToolSandboxStorage(toolId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(`noneteco_tool_state_${toolId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function setToolSandboxStorage(toolId: string, data: Record<string, string>): void {
  try {
    localStorage.setItem(`noneteco_tool_state_${toolId}`, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function getBundleCompletedIds(bundleId: string): string[] {
  try {
    const raw = localStorage.getItem(`noneteco_bundle_done_${bundleId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function setBundleCompletedIds(bundleId: string, ids: string[]): void {
  try {
    localStorage.setItem(`noneteco_bundle_done_${bundleId}`, JSON.stringify(ids));
  } catch {
    // ignore
  }
}
