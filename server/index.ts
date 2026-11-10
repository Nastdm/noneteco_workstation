import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { LibraryStore, StoreError } from './store.ts';
import type { EncryptedPayload, SharePayloadTool } from '../src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

async function main() {
  const store = new LibraryStore(process.cwd());
  await store.init();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const asyncHandler = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  ) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'server',
      repo: 'Nastdm/noneteco_workstation',
    });
  });

  app.get(
    '/api/catalog',
    asyncHandler(async (_req, res) => {
      await store.syncDropFolder();
      const catalog = await store.getCatalog();
      res.json(catalog);
    }),
  );

  app.post(
    '/api/rescan',
    asyncHandler(async (_req, res) => {
      const imported = await store.syncDropFolder();
      const catalog = await store.getCatalog();
      res.json({ imported, catalog });
    }),
  );

  app.post(
    '/api/tools',
    asyncHandler(async (req, res) => {
      const record = await store.createTool(req.body);
      res.status(201).json(record);
    }),
  );

  app.get(
    '/api/tools/:id/content',
    asyncHandler(async (req, res) => {
      const html = await store.getToolHtml(String(req.params.id));
      res.json({ html });
    }),
  );

  app.post(
    '/api/tools/:id/unlock',
    asyncHandler(async (req, res) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const html = await store.unlockTool(String(req.params.id), password);
      res.json({ html });
    }),
  );

  app.patch(
    '/api/tools/:id',
    asyncHandler(async (req, res) => {
      const updated = await store.updateTool(String(req.params.id), req.body || {});
      res.json(updated);
    }),
  );

  app.delete(
    '/api/tools/:id',
    asyncHandler(async (req, res) => {
      await store.deleteTool(String(req.params.id));
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/bundles',
    asyncHandler(async (req, res) => {
      const bundle = await store.createBundle(req.body || {});
      res.status(201).json(bundle);
    }),
  );

  app.post(
    '/api/bundles/:id/unlock',
    asyncHandler(async (req, res) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      await store.unlockBundle(String(req.params.id), password);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/bundles/:id/export',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const catalog = await store.getCatalog();
      const bundle = catalog.bundles.find((b) => b.id === id);
      if (!bundle) throw new StoreError(404, 'Bundle not found');

      if (bundle.protected) {
        const pw = typeof req.body?.bundlePassword === 'string' ? req.body.bundlePassword : '';
        await store.unlockBundle(id, pw);
      }

      const toolsPayload: SharePayloadTool[] = [];
      for (const toolId of bundle.toolIds) {
        const tool = catalog.tools.find((t) => t.id === toolId);
        if (!tool) continue;

        if (tool.protected) {
          const encPath = path.resolve(store.libraryDir, tool.blobPath || `blobs/${tool.id}.enc.json`);
          const rawEnc = await fs.readFile(encPath, 'utf8');
          const encrypted = JSON.parse(rawEnc) as EncryptedPayload;
          toolsPayload.push({
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
          const html = await store.getToolHtml(tool.id);
          toolsPayload.push({
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

      res.json({ bundle, tools: toolsPayload });
    }),
  );

  app.patch(
    '/api/bundles/:id',
    asyncHandler(async (req, res) => {
      const updated = await store.updateBundle(String(req.params.id), req.body || {});
      res.json(updated);
    }),
  );

  app.delete(
    '/api/bundles/:id',
    asyncHandler(async (req, res) => {
      await store.deleteBundle(String(req.params.id));
      res.json({ ok: true });
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof StoreError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        allowedHosts: true,
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, HOST, () => {
    console.log(`Noneteco Workstation listening on http://${HOST}:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
