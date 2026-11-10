import fs from 'node:fs/promises';
import path from 'node:path';
import type { BundleRecord, CatalogData, CefrLevel, EncryptedPayload, ToolAccent, ToolRecord } from '../src/types.ts';
import { decryptText, encryptText } from './crypto.ts';
import { extractHtmlMetadata, slugify } from '../src/lib/htmlMeta.ts';

const BUNDLE_VERIFY_TOKEN = 'NONETECO_BUNDLE_V1';

export class StoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class LibraryStore {
  readonly libraryDir: string;
  readonly blobsDir: string;
  readonly dropDir: string;
  readonly indexPath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(rootDir = process.cwd()) {
    this.libraryDir = path.resolve(rootDir, 'library');
    this.blobsDir = path.join(this.libraryDir, 'blobs');
    this.dropDir = path.join(this.libraryDir, 'drop');
    this.indexPath = path.join(this.libraryDir, 'index.json');
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.catch(() => {});
    return next;
  }

  private assertSafeId(id: string): string {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) {
      throw new StoreError(400, 'Invalid identifier');
    }
    return id;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.blobsDir, { recursive: true });
    await fs.mkdir(this.dropDir, { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      const empty: CatalogData = { version: 1, tools: [], bundles: [] };
      await fs.writeFile(this.indexPath, JSON.stringify(empty, null, 2), 'utf8');
    }
    await this.syncDropFolder();
  }

  private async readCatalogRaw(): Promise<CatalogData> {
    try {
      const raw = await fs.readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CatalogData>;
      return {
        version: 1,
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        bundles: Array.isArray(parsed.bundles) ? parsed.bundles : [],
      };
    } catch {
      return { version: 1, tools: [], bundles: [] };
    }
  }

  private async writeCatalogRaw(catalog: CatalogData): Promise<void> {
    const tmpPath = `${this.indexPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(catalog, null, 2), 'utf8');
    await fs.rename(tmpPath, this.indexPath);
  }

  private uniqueId(base: string, existingIds: Set<string>): string {
    let candidate = slugify(base);
    if (!existingIds.has(candidate)) return candidate;
    let i = 2;
    while (existingIds.has(`${candidate}-${i}`)) {
      i++;
    }
    return `${candidate}-${i}`;
  }

  async syncDropFolder(): Promise<number> {
    return this.enqueue(async () => {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(this.dropDir);
      } catch {
        return 0;
      }

      const htmlFiles = entries.filter((f) => /\.html?$/i.test(f));
      if (htmlFiles.length === 0) return 0;

      const catalog = await this.readCatalogRaw();
      const existingIds = new Set(catalog.tools.map((t) => t.id));
      let imported = 0;

      for (const fileName of htmlFiles) {
        const srcPath = path.join(this.dropDir, fileName);
        const stat = await fs.stat(srcPath);
        if (!stat.isFile()) continue;

        const html = await fs.readFile(srcPath, 'utf8');
        const meta = extractHtmlMetadata(html, fileName);
        const id = this.uniqueId(fileName, existingIds);
        existingIds.add(id);

        const blobName = `${id}.html`;
        await fs.writeFile(path.join(this.blobsDir, blobName), html, 'utf8');
        await fs.unlink(srcPath);

        const now = new Date().toISOString();
        catalog.tools.unshift({
          id,
          title: meta.title,
          description: meta.description,
          fileName,
          tags: meta.suggestedTags,
          level: meta.suggestedLevel,
          accent: meta.suggestedAccent,
          protected: false,
          blobPath: `blobs/${blobName}`,
          source: 'server',
          sizeBytes: Buffer.byteLength(html, 'utf8'),
          createdAt: now,
          updatedAt: now,
          notes: '',
        });
        imported++;
      }

      if (imported > 0) {
        await this.writeCatalogRaw(catalog);
      }
      return imported;
    });
  }

  async getCatalog(): Promise<CatalogData> {
    const catalog = await this.readCatalogRaw();
    return {
      version: 1,
      tools: catalog.tools.map((t) => ({ ...t, source: 'server' })),
      bundles: catalog.bundles.map((b) => ({ ...b, source: 'server' })),
    };
  }

  async getToolHtml(id: string): Promise<string> {
    this.assertSafeId(id);
    const catalog = await this.readCatalogRaw();
    const tool = catalog.tools.find((t) => t.id === id);
    if (!tool) throw new StoreError(404, 'Tool not found');
    if (tool.protected) {
      throw new StoreError(403, 'Tool is password-protected');
    }
    const blobRel = tool.blobPath || `blobs/${id}.html`;
    const blobPath = path.resolve(this.libraryDir, blobRel);
    if (!blobPath.startsWith(this.blobsDir)) {
      throw new StoreError(400, 'Invalid blob path');
    }
    return fs.readFile(blobPath, 'utf8');
  }

  async unlockTool(id: string, password: string): Promise<string> {
    this.assertSafeId(id);
    if (!password) throw new StoreError(400, 'Password is required');
    const catalog = await this.readCatalogRaw();
    const tool = catalog.tools.find((t) => t.id === id);
    if (!tool) throw new StoreError(404, 'Tool not found');
    if (!tool.protected) {
      return this.getToolHtml(id);
    }

    const blobRel = tool.blobPath || `blobs/${id}.enc.json`;
    const blobPath = path.resolve(this.libraryDir, blobRel);
    if (!blobPath.startsWith(this.blobsDir)) {
      throw new StoreError(400, 'Invalid blob path');
    }
    const raw = await fs.readFile(blobPath, 'utf8');
    const payload = JSON.parse(raw) as EncryptedPayload;

    try {
      return decryptText(payload, password);
    } catch {
      throw new StoreError(401, 'Incorrect password');
    }
  }

  async createTool(input: {
    title?: string;
    description?: string;
    fileName?: string;
    html: string;
    tags?: string[];
    level?: CefrLevel;
    accent?: ToolAccent;
    password?: string;
    passwordHint?: string;
    notes?: string;
  }): Promise<ToolRecord> {
    if (!input.html || typeof input.html !== 'string') {
      throw new StoreError(400, 'HTML content is required');
    }

    return this.enqueue(async () => {
      const catalog = await this.readCatalogRaw();
      const existingIds = new Set(catalog.tools.map((t) => t.id));
      const fileName = (input.fileName || 'tool.html').trim();
      const meta = extractHtmlMetadata(input.html, fileName);
      const title = (input.title || meta.title).trim();
      const id = this.uniqueId(title || fileName, existingIds);

      const hasPassword = Boolean(input.password && input.password.length > 0);
      const now = new Date().toISOString();
      let blobPath = `blobs/${id}.html`;

      if (hasPassword && input.password) {
        blobPath = `blobs/${id}.enc.json`;
        const enc = encryptText(input.html, input.password);
        await fs.writeFile(path.join(this.libraryDir, blobPath), JSON.stringify(enc, null, 2), 'utf8');
      } else {
        await fs.writeFile(path.join(this.libraryDir, blobPath), input.html, 'utf8');
      }

      const tags = Array.isArray(input.tags) && input.tags.length > 0
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
        blobPath,
        source: 'server',
        sizeBytes: Buffer.byteLength(input.html, 'utf8'),
        createdAt: now,
        updatedAt: now,
        notes: input.notes || '',
      };

      catalog.tools.unshift(record);
      await this.writeCatalogRaw(catalog);
      return record;
    });
  }

  async updateTool(
    id: string,
    patch: {
      title?: string;
      description?: string;
      tags?: string[];
      level?: CefrLevel;
      accent?: ToolAccent;
      notes?: string;
      html?: string;
      passwordHint?: string;
      newPassword?: string | null; // null removes password, string sets/updates password, undefined leaves unchanged
      currentPassword?: string;
    },
  ): Promise<ToolRecord> {
    this.assertSafeId(id);

    return this.enqueue(async () => {
      const catalog = await this.readCatalogRaw();
      const idx = catalog.tools.findIndex((t) => t.id === id);
      if (idx === -1) throw new StoreError(404, 'Tool not found');

      const tool = catalog.tools[idx];
      const wantsSensitiveChange = patch.html !== undefined || patch.newPassword !== undefined;

      let currentHtml: string | null = null;
      if (wantsSensitiveChange) {
        if (tool.protected) {
          if (!patch.currentPassword) {
            throw new StoreError(403, 'Current password is required to modify protected tool or password');
          }
          const encRaw = await fs.readFile(path.join(this.libraryDir, tool.blobPath || `blobs/${id}.enc.json`), 'utf8');
          try {
            currentHtml = decryptText(JSON.parse(encRaw) as EncryptedPayload, patch.currentPassword);
          } catch {
            throw new StoreError(401, 'Current password is incorrect');
          }
        } else {
          currentHtml = await fs.readFile(path.join(this.libraryDir, tool.blobPath || `blobs/${id}.html`), 'utf8');
        }
      }

      const nextHtml = patch.html !== undefined ? patch.html : currentHtml;
      let nextProtected = tool.protected;
      let nextBlobPath = tool.blobPath || (tool.protected ? `blobs/${id}.enc.json` : `blobs/${id}.html`);

      if (patch.newPassword === null) {
        // Remove password
        if (nextHtml === null) throw new StoreError(500, 'Missing HTML');
        const oldPath = path.join(this.libraryDir, nextBlobPath);
        nextBlobPath = `blobs/${id}.html`;
        await fs.writeFile(path.join(this.libraryDir, nextBlobPath), nextHtml, 'utf8');
        if (oldPath !== path.join(this.libraryDir, nextBlobPath)) {
          await fs.unlink(oldPath).catch(() => {});
        }
        nextProtected = false;
      } else if (typeof patch.newPassword === 'string' && patch.newPassword.length > 0) {
        // Set or change password
        if (nextHtml === null) throw new StoreError(500, 'Missing HTML');
        const oldPath = path.join(this.libraryDir, nextBlobPath);
        nextBlobPath = `blobs/${id}.enc.json`;
        const enc = encryptText(nextHtml, patch.newPassword);
        await fs.writeFile(path.join(this.libraryDir, nextBlobPath), JSON.stringify(enc, null, 2), 'utf8');
        if (oldPath !== path.join(this.libraryDir, nextBlobPath)) {
          await fs.unlink(oldPath).catch(() => {});
        }
        nextProtected = true;
      } else if (patch.html !== undefined && nextHtml !== null) {
        // HTML changed without changing password state
        if (tool.protected) {
          if (!patch.currentPassword) throw new StoreError(403, 'Password required');
          const enc = encryptText(nextHtml, patch.currentPassword);
          await fs.writeFile(path.join(this.libraryDir, nextBlobPath), JSON.stringify(enc, null, 2), 'utf8');
        } else {
          await fs.writeFile(path.join(this.libraryDir, nextBlobPath), nextHtml, 'utf8');
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
        sizeBytes: nextHtml !== null ? Buffer.byteLength(nextHtml, 'utf8') : tool.sizeBytes,
        updatedAt: new Date().toISOString(),
      };

      catalog.tools[idx] = updated;
      await this.writeCatalogRaw(catalog);
      return updated;
    });
  }

  async deleteTool(id: string): Promise<void> {
    this.assertSafeId(id);
    return this.enqueue(async () => {
      const catalog = await this.readCatalogRaw();
      const tool = catalog.tools.find((t) => t.id === id);
      if (!tool) throw new StoreError(404, 'Tool not found');

      if (tool.blobPath) {
        const blobPath = path.resolve(this.libraryDir, tool.blobPath);
        if (blobPath.startsWith(this.blobsDir)) {
          await fs.unlink(blobPath).catch(() => {});
        }
      }

      catalog.tools = catalog.tools.filter((t) => t.id !== id);
      catalog.bundles = catalog.bundles.map((b) => ({
        ...b,
        toolIds: b.toolIds.filter((tid) => tid !== id),
      }));
      await this.writeCatalogRaw(catalog);
    });
  }

  async createBundle(input: {
    title: string;
    description?: string;
    welcomeNote?: string;
    toolIds: string[];
    tags?: string[];
    accent?: ToolAccent;
    password?: string;
    passwordHint?: string;
  }): Promise<BundleRecord> {
    if (!input.title || !input.title.trim()) {
      throw new StoreError(400, 'Bundle title is required');
    }

    return this.enqueue(async () => {
      const catalog = await this.readCatalogRaw();
      const existingIds = new Set(catalog.bundles.map((b) => b.id));
      const id = this.uniqueId(input.title, existingIds);
      const validToolIds = new Set(catalog.tools.map((t) => t.id));
      const toolIds = (input.toolIds || []).filter((tid) => validToolIds.has(tid));

      const hasPassword = Boolean(input.password && input.password.length > 0);
      const now = new Date().toISOString();

      const bundle: BundleRecord = {
        id,
        title: input.title.trim(),
        description: (input.description || '').trim(),
        welcomeNote: (input.welcomeNote || '').trim(),
        toolIds,
        tags: Array.from(new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))),
        accent: input.accent || 'indigo',
        protected: hasPassword,
        passwordHint: hasPassword ? (input.passwordHint || '').trim() : undefined,
        passwordVerify: hasPassword && input.password ? encryptText(BUNDLE_VERIFY_TOKEN, input.password) : undefined,
        createdAt: now,
        updatedAt: now,
        source: 'server',
      };

      catalog.bundles.unshift(bundle);
      await this.writeCatalogRaw(catalog);
      return bundle;
    });
  }

  async updateBundle(
    id: string,
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
    this.assertSafeId(id);
    return this.enqueue(async () => {
      const catalog = await this.readCatalogRaw();
      const idx = catalog.bundles.findIndex((b) => b.id === id);
      if (idx === -1) throw new StoreError(404, 'Bundle not found');

      const bundle = catalog.bundles[idx];

      if (patch.newPassword !== undefined && bundle.protected && bundle.passwordVerify) {
        if (!patch.currentPassword) {
          throw new StoreError(403, 'Current bundle password is required');
        }
        try {
          const check = decryptText(bundle.passwordVerify, patch.currentPassword);
          if (check !== BUNDLE_VERIFY_TOKEN) throw new Error('Invalid');
        } catch {
          throw new StoreError(401, 'Current bundle password is incorrect');
        }
      }

      let nextProtected = bundle.protected;
      let nextVerify = bundle.passwordVerify;
      if (patch.newPassword === null) {
        nextProtected = false;
        nextVerify = undefined;
      } else if (typeof patch.newPassword === 'string' && patch.newPassword.length > 0) {
        nextProtected = true;
        nextVerify = encryptText(BUNDLE_VERIFY_TOKEN, patch.newPassword);
      }

      const validToolIds = new Set(catalog.tools.map((t) => t.id));
      const nextToolIds = patch.toolIds
        ? patch.toolIds.filter((tid) => validToolIds.has(tid))
        : bundle.toolIds;

      const updated: BundleRecord = {
        ...bundle,
        title: patch.title !== undefined ? patch.title.trim() || bundle.title : bundle.title,
        description: patch.description !== undefined ? patch.description.trim() : bundle.description,
        welcomeNote: patch.welcomeNote !== undefined ? patch.welcomeNote.trim() : bundle.welcomeNote,
        toolIds: nextToolIds,
        tags: patch.tags !== undefined
          ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean)))
          : bundle.tags,
        accent: patch.accent ?? bundle.accent,
        protected: nextProtected,
        passwordHint: nextProtected
          ? (patch.passwordHint !== undefined ? patch.passwordHint.trim() : bundle.passwordHint)
          : undefined,
        passwordVerify: nextVerify,
        updatedAt: new Date().toISOString(),
      };

      catalog.bundles[idx] = updated;
      await this.writeCatalogRaw(catalog);
      return updated;
    });
  }

  async unlockBundle(id: string, password: string): Promise<boolean> {
    this.assertSafeId(id);
    const catalog = await this.readCatalogRaw();
    const bundle = catalog.bundles.find((b) => b.id === id);
    if (!bundle) throw new StoreError(404, 'Bundle not found');
    if (!bundle.protected || !bundle.passwordVerify) return true;
    try {
      const check = decryptText(bundle.passwordVerify, password);
      if (check !== BUNDLE_VERIFY_TOKEN) throw new StoreError(401, 'Incorrect password');
      return true;
    } catch {
      throw new StoreError(401, 'Incorrect password');
    }
  }

  async deleteBundle(id: string): Promise<void> {
    this.assertSafeId(id);
    return this.enqueue(async () => {
      const catalog = await this.readCatalogRaw();
      const exists = catalog.bundles.some((b) => b.id === id);
      if (!exists) throw new StoreError(404, 'Bundle not found');
      catalog.bundles = catalog.bundles.filter((b) => b.id !== id);
      await this.writeCatalogRaw(catalog);
    });
  }
}
