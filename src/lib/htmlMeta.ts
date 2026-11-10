import type { CefrLevel, ToolAccent } from '../types';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(input: string): string {
  const lower = input.toLowerCase().replace(/\.html?$/i, '');
  let translit = '';
  for (const ch of lower) {
    translit += CYRILLIC_MAP[ch] ?? ch;
  }
  const clean = translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return clean || `tool-${Date.now().toString(36)}`;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

export interface ExtractedHtmlMeta {
  title: string;
  description: string;
  suggestedTags: string[];
  suggestedLevel: CefrLevel;
  suggestedAccent: ToolAccent;
}

const TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'Grammar', pattern: /\b(grammar|tenses?|past simple|present perfect|past perfect|conditionals?|passive|modals?|articles?|prepositions?|irregular verbs?)\b/i },
  { tag: 'Vocabulary', pattern: /\b(vocab|vocabulary|words?|phrasal verbs?|idioms?|collocations?|synonyms?|lexis|glossary)\b/i },
  { tag: 'Speaking', pattern: /\b(speaking|conversations?|discuss|debates?|prompts?|role-?plays?|dialogues?|warm-?ups?)\b/i },
  { tag: 'Listening', pattern: /\b(listening|audio|pronunciation|phonetics|ipa|speechsynthesis|accents?)\b/i },
  { tag: 'Reading', pattern: /\b(reading|comprehension|passages?|articles?|stor(y|ies)|texts?)\b/i },
  { tag: 'Writing', pattern: /\b(writing|essays?|emails?|paragraphs?|sentence builder)\b/i },
  { tag: 'Quiz', pattern: /\b(quiz(zes)?|tests?|check|score|answers?|multiple choice|gap-?fill|fill in)\b/i },
  { tag: 'Game', pattern: /\b(games?|wheels?|spin(ner)?|flashcards?|match(ing)?|memory|board|challenge|streak)\b/i },
  { tag: 'Business', pattern: /\b(business|meetings?|negotiations?|pitch|interviews?|office|corporate)\b/i },
  { tag: 'Kids', pattern: /\b(kids|children|cartoons?|animals?|alphabet|phonics|colors?|toys?)\b/i },
];

const ACCENTS: ToolAccent[] = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'];

export function pickAccentForString(seed: string): ToolAccent {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[hash % ACCENTS.length];
}

export function extractHtmlMetadata(html: string, fileName = 'untitled.html'): ExtractedHtmlMeta {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i)
    || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i);

  const cleanFileName = fileName.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  const rawTitle = titleMatch?.[1] || h1Match?.[1]?.replace(/<[^>]+>/g, '') || cleanFileName || 'Untitled HTML Tool';
  const title = decodeHtmlEntities(rawTitle.replace(/\s+/g, ' ').trim()).slice(0, 120);

  let description = '';
  if (metaDescMatch?.[1]) {
    description = decodeHtmlEntities(metaDescMatch[1].replace(/\s+/g, ' ').trim()).slice(0, 240);
  } else {
    const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch?.[1]) {
      const stripped = decodeHtmlEntities(pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (stripped.length > 10) {
        description = stripped.slice(0, 180);
      }
    }
  }

  const textSample = `${title} ${fileName} ${html.slice(0, 20000).replace(/<style[\s\S]*?<\/style>/gi, ' ')}`;
  const tags: string[] = [];
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(textSample)) {
      tags.push(rule.tag);
    }
    if (tags.length >= 4) break;
  }
  if (tags.length === 0) {
    tags.push('Interactive');
  }

  const levelMatch = textSample.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  const suggestedLevel = (levelMatch ? levelMatch[1] : 'All') as CefrLevel;

  return {
    title,
    description,
    suggestedTags: tags,
    suggestedLevel,
    suggestedAccent: pickAccentForString(title || fileName),
  };
}

export function prepareToolHtmlForIframe(
  rawHtml: string,
  toolId: string,
  initialStorage: Record<string, string> = {},
): string {
  const safeDataJson = JSON.stringify(initialStorage).replace(/</g, '\\u003c');
  const safeIdJson = JSON.stringify(toolId);

  const bridgeScript = `<meta charset="UTF-8"><script>(function(){try{var id=${safeIdJson};var store=Object.assign({},${safeDataJson});var persist=function(){try{window.parent.postMessage({type:'noneteco-storage-update',toolId:id,data:Object.assign({},store)},'*')}catch(e){}};var createStorage=function(){return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null},setItem:function(k,v){store[String(k)]=String(v);persist()},removeItem:function(k){delete store[String(k)];persist()},clear:function(){store={};persist()},key:function(i){var keys=Object.keys(store);return keys[i]===undefined?null:keys[i]},get length(){return Object.keys(store).length}}};var s=createStorage();try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return s}})}catch(e){}try{var ss=createStorage();Object.defineProperty(window,'sessionStorage',{configurable:true,get:function(){return ss}})}catch(e){}}catch(e){}})();</script>`;

  if (/<head[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<head[^>]*>/i, (match) => `${match}\n${bridgeScript}`);
  }
  if (/<html[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<html[^>]*>/i, (match) => `${match}\n<head>${bridgeScript}</head>`);
  }
  return `<!DOCTYPE html><html><head>${bridgeScript}</head><body>${rawHtml}</body></html>`;
}
