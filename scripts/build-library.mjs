import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const LIB_DIR = path.join(ROOT, 'library');
const BLOBS_DIR = path.join(LIB_DIR, 'blobs');
const DROP_DIR = path.join(LIB_DIR, 'drop');
const INDEX_PATH = path.join(LIB_DIR, 'index.json');
const OUT_DIR = path.join(ROOT, 'dist', 'library');
const OUT_BLOBS = path.join(OUT_DIR, 'blobs');

const CYRILLIC_MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(input) {
  const lower = input.toLowerCase().replace(/\.html?$/i, '');
  let translit = '';
  for (const ch of lower) {
    translit += CYRILLIC_MAP[ch] ?? ch;
  }
  return translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'tool';
}

function extractMeta(html, fileName) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const cleanName = fileName.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  const rawTitle = titleMatch?.[1] || h1Match?.[1]?.replace(/<[^>]+>/g, '') || cleanName;
  const title = rawTitle.replace(/\s+/g, ' ').trim().slice(0, 120) || 'HTML Tool';

  const tags = [];
  const sample = `${title} ${fileName} ${html.slice(0, 15000)}`;
  if (/grammar|tense|past|perfect|modal|conditional/i.test(sample)) tags.push('Grammar');
  if (/vocab|word|phrasal|idiom/i.test(sample)) tags.push('Vocabulary');
  if (/speak|conversation|prompt|warm-?up/i.test(sample)) tags.push('Speaking');
  if (/quiz|test|answer|score/i.test(sample)) tags.push('Quiz');
  if (/game|wheel|flashcard|match/i.test(sample)) tags.push('Game');
  if (tags.length === 0) tags.push('Interactive');

  const lvl = sample.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return {
    title,
    tags,
    level: lvl ? lvl[1] : 'All',
  };
}

async function main() {
  await fs.mkdir(OUT_BLOBS, { recursive: true });
  await fs.writeFile(path.join(ROOT, 'dist', '.nojekyll'), '', 'utf8');

  let catalog = { version: 1, tools: [], bundles: [] };
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    catalog = {
      version: 1,
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
      bundles: Array.isArray(parsed.bundles) ? parsed.bundles : [],
    };
  } catch {
    // start empty if no index.json yet
  }

  // Copy all committed blobs
  try {
    const blobFiles = await fs.readdir(BLOBS_DIR);
    for (const file of blobFiles) {
      if (file.startsWith('.')) continue;
      const src = path.join(BLOBS_DIR, file);
      const st = await fs.stat(src);
      if (st.isFile()) {
        await fs.copyFile(src, path.join(OUT_BLOBS, file));
      }
    }
  } catch {
    // ignore if no blobs yet
  }

  // Also include any raw .html files sitting in library/drop/ (for GitHub web UI drops!)
  const existingIds = new Set(catalog.tools.map((t) => t.id));
  try {
    const dropFiles = await fs.readdir(DROP_DIR);
    for (const file of dropFiles) {
      if (!/\.html?$/i.test(file)) continue;
      const src = path.join(DROP_DIR, file);
      const st = await fs.stat(src);
      if (!st.isFile()) continue;

      const html = await fs.readFile(src, 'utf8');
      let id = slugify(file);
      let i = 2;
      while (existingIds.has(id)) {
        id = `${slugify(file)}-${i++}`;
      }
      existingIds.add(id);

      const blobFile = `${id}.html`;
      await fs.writeFile(path.join(OUT_BLOBS, blobFile), html, 'utf8');

      const meta = extractMeta(html, file);
      const now = new Date().toISOString();
      catalog.tools.unshift({
        id,
        title: meta.title,
        description: 'Added via library/drop',
        fileName: file,
        tags: meta.tags,
        level: meta.level,
        accent: 'indigo',
        protected: false,
        blobPath: `blobs/${blobFile}`,
        source: 'static',
        sizeBytes: Buffer.byteLength(html, 'utf8'),
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch {
    // ignore
  }

  catalog.tools = catalog.tools.map((t) => ({ ...t, source: 'static' }));
  catalog.bundles = catalog.bundles.map((b) => ({ ...b, source: 'static' }));

  await fs.writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Built static library: ${catalog.tools.length} tools, ${catalog.bundles.length} bundles -> dist/library/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
