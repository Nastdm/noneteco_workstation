import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { encryptText as nodeEncrypt, decryptText as nodeDecrypt } from '../server/crypto.ts';
import { encryptText as webEncrypt, decryptText as webDecrypt } from '../src/lib/crypto.ts';
import { LibraryStore } from '../server/store.ts';
import { extractHtmlMetadata, prepareToolHtmlForIframe, slugify } from '../src/lib/htmlMeta.ts';
import { buildShareUrl, decryptShareEnvelope, generatePortableBundleHtml, parseShareHash } from '../src/lib/share.ts';

test('Node crypto and Browser WebCrypto PBKDF2-AES-256-GCM are 100% interoperable', async () => {
  const sampleHtml = '<html><head><title>Irregular Verbs</title></head><body>Привет! /ˈɪŋɡlɪʃ/</body></html>';
  const password = 'secret-tutor-password-123';

  const nodeEncrypted = nodeEncrypt(sampleHtml, password);
  const decryptedByWeb = await webDecrypt(nodeEncrypted, password);
  assert.equal(decryptedByWeb, sampleHtml);

  const webEncrypted = await webEncrypt(sampleHtml, password);
  const decryptedByNode = nodeDecrypt(webEncrypted, password);
  assert.equal(decryptedByNode, sampleHtml);

  await assert.rejects(() => webDecrypt(nodeEncrypted, 'wrong-password'));
  assert.throws(() => nodeDecrypt(webEncrypted, 'wrong-password'));
});

test('HTML metadata extraction, Cyrillic slugification, and sandbox localStorage bridge', () => {
  assert.equal(slugify('Глаголы B1 тест.html'), 'glagoly-b1-test');

  const html = `<!DOCTYPE html><html><head><title>Business English Idioms B2</title><meta name="description" content="Quiz on office idioms"></head><body><h1>Quiz</h1></body></html>`;
  const meta = extractHtmlMetadata(html, 'idioms.html');
  assert.equal(meta.title, 'Business English Idioms B2');
  assert.equal(meta.description, 'Quiz on office idioms');
  assert.equal(meta.suggestedLevel, 'B2');
  assert.ok(meta.suggestedTags.includes('Vocabulary'));
  assert.ok(meta.suggestedTags.includes('Business'));
  assert.ok(meta.suggestedTags.includes('Quiz'));

  const bridged = prepareToolHtmlForIframe(html, 'tool-1', { score: '42' });
  assert.ok(bridged.includes('noneteco-storage-update'));
  assert.ok(bridged.includes('"score":"42"'));
  assert.ok(bridged.includes('<meta charset="UTF-8">'));
});

test('LibraryStore CRUD, drop ingestion, password locks, and bundle management', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'noneteco-test-'));
  try {
    const store = new LibraryStore(tmpDir);
    await store.init();

    // Drop folder auto-ingest
    await fs.writeFile(
      path.join(tmpDir, 'library', 'drop', 'Dropped Speaking Game.html'),
      '<html><head><title>Dropped Speaking Game</title></head><body>Discussion warm-up</body></html>',
      'utf8',
    );
    const importedCount = await store.syncDropFolder();
    assert.equal(importedCount, 1);

    let cat = await store.getCatalog();
    assert.equal(cat.tools.length, 1);
    assert.equal(cat.tools[0].title, 'Dropped Speaking Game');

    // Create password-protected tool
    const locked = await store.createTool({
      title: 'Teacher Key Secret',
      html: '<h1>Top Secret Answers</h1>',
      tags: ['Grammar', 'Teacher Key'],
      level: 'B1',
      password: 'my-password',
      passwordHint: 'hint here',
    });
    assert.equal(locked.protected, true);

    await assert.rejects(() => store.getToolHtml(locked.id), /password-protected/i);
    await assert.rejects(() => store.unlockTool(locked.id, 'bad'), /Incorrect password/i);
    const unlockedHtml = await store.unlockTool(locked.id, 'my-password');
    assert.equal(unlockedHtml, '<h1>Top Secret Answers</h1>');

    // Change password and then remove password
    await store.updateTool(locked.id, {
      currentPassword: 'my-password',
      newPassword: 'new-password',
      tags: ['Grammar', 'Updated'],
    });
    await assert.rejects(() => store.unlockTool(locked.id, 'my-password'));
    assert.equal(await store.unlockTool(locked.id, 'new-password'), '<h1>Top Secret Answers</h1>');

    await store.updateTool(locked.id, {
      currentPassword: 'new-password',
      newPassword: null,
    });
    assert.equal(await store.getToolHtml(locked.id), '<h1>Top Secret Answers</h1>');

    // Bundle creation, locking, and cleanup on tool delete
    const bundle = await store.createBundle({
      title: 'Lesson Pack 1',
      toolIds: [cat.tools[0].id, locked.id],
      password: 'bundle-pw',
      passwordHint: 'b-hint',
    });
    assert.equal(bundle.protected, true);
    await assert.rejects(() => store.unlockBundle(bundle.id, 'nope'));
    assert.equal(await store.unlockBundle(bundle.id, 'bundle-pw'), true);

    await store.deleteTool(locked.id);
    cat = await store.getCatalog();
    assert.deepEqual(cat.bundles[0].toolIds, [cat.tools[0].id]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Share URL compression/encryption and Portable Bundle HTML generation', async () => {
  // Mock window.location for buildShareUrl
  (globalThis as unknown as { window: { location: { origin: string; pathname: string } } }).window = {
    location: { origin: 'https://nastdm.github.io', pathname: '/noneteco_workstation/' },
  };

  const bundle = {
    id: 'test-pack',
    title: 'Test Pack',
    description: 'Two tools',
    welcomeNote: 'Enjoy!',
    toolIds: ['t1'],
    tags: ['Grammar'],
    accent: 'indigo' as const,
    protected: true,
    passwordHint: 'pass123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const toolsPayload = [
    {
      id: 't1',
      title: 'Tool 1',
      description: 'Desc',
      fileName: 't1.html',
      tags: ['Grammar'],
      level: 'B1' as const,
      accent: 'indigo' as const,
      protected: false,
      html: '<html><body><script>const x = "</script>";</script><h1>Hi!</h1></body></html>',
    },
  ];

  const { url } = await buildShareUrl(bundle, toolsPayload, 'pass123');
  assert.ok(url.startsWith('https://nastdm.github.io/noneteco_workstation/#share='));

  const hash = '#' + url.split('#')[1];
  const env = parseShareHash(hash);
  assert.ok(env);
  assert.equal(env.protected, true);
  assert.equal(env.plain, undefined);

  await assert.rejects(() => decryptShareEnvelope(env, 'wrong'));
  const plain = await decryptShareEnvelope(env, 'pass123');
  assert.equal(plain.bundle.title, 'Test Pack');
  assert.equal(plain.tools[0].html?.includes('Hi!'), true);

  const portableHtml = await generatePortableBundleHtml(bundle, toolsPayload, 'pass123');
  assert.ok(portableHtml.includes('<!DOCTYPE html>'));
  assert.ok(!portableHtml.includes('<h1>Hi!</h1>')); // encrypted inside portable HTML when bundle has password!
});
