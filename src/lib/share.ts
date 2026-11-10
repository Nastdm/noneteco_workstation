import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { BundleRecord, ShareEnvelope, SharePayloadPlain, SharePayloadTool } from '../types';
import { decryptText, encryptText } from './crypto';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const binary = atob(norm + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function createShareEnvelope(
  bundle: BundleRecord,
  tools: SharePayloadTool[],
  bundlePassword?: string,
  options?: { isSingleTool?: boolean },
): Promise<ShareEnvelope> {
  const plain: SharePayloadPlain = {
    v: 1,
    bundle: {
      id: bundle.id,
      title: bundle.title,
      description: bundle.description,
      welcomeNote: bundle.welcomeNote,
      accent: bundle.accent,
      tags: bundle.tags,
      createdAt: bundle.createdAt,
      isSingleTool: options?.isSingleTool,
    },
    tools,
  };

  if (bundle.protected && bundlePassword) {
    const encrypted = await encryptText(JSON.stringify(plain), bundlePassword);
    return {
      v: 1,
      protected: true,
      title: bundle.title,
      passwordHint: bundle.passwordHint,
      encrypted,
    };
  }

  return {
    v: 1,
    protected: false,
    title: bundle.title,
    plain,
  };
}

export async function buildShareUrl(
  bundle: BundleRecord,
  tools: SharePayloadTool[],
  bundlePassword?: string,
  options?: { isSingleTool?: boolean },
): Promise<{ url: string; length: number; tooLong: boolean }> {
  let rawEstimate = 0;
  for (const tl of tools) {
    rawEstimate += tl.html ? tl.html.length : tl.encrypted ? tl.encrypted.data.length : 0;
  }
  if (rawEstimate > 250_000) {
    return {
      url: '',
      length: rawEstimate,
      tooLong: true,
    };
  }

  const envelope = await createShareEnvelope(bundle, tools, bundlePassword, options);
  const jsonBytes = strToU8(JSON.stringify(envelope));
  const compressed = zlibSync(jsonBytes, { level: 9 });
  const encoded = toBase64Url(compressed);
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const url = `${baseUrl}#share=${encoded}`;
  return {
    url,
    length: url.length,
    tooLong: url.length > 32000,
  };
}

export function parseShareHash(hash: string): ShareEnvelope | null {
  if (!hash || !hash.includes('share=')) return null;
  const idx = hash.indexOf('share=');
  const token = hash.slice(idx + 6).split('&')[0];
  if (!token) return null;

  const compressed = fromBase64Url(token);
  const jsonBytes = unzlibSync(compressed);
  const parsed = JSON.parse(strFromU8(jsonBytes)) as ShareEnvelope;
  if (!parsed || parsed.v !== 1) return null;
  return parsed;
}

export async function decryptShareEnvelope(envelope: ShareEnvelope, password: string): Promise<SharePayloadPlain> {
  if (!envelope.protected && envelope.plain) return envelope.plain;
  if (!envelope.encrypted) throw new Error('Missing encrypted bundle payload');
  const raw = await decryptText(envelope.encrypted, password);
  return JSON.parse(raw) as SharePayloadPlain;
}

export async function generatePortableBundleHtml(
  bundle: BundleRecord,
  tools: SharePayloadTool[],
  bundlePassword?: string,
  options?: { isSingleTool?: boolean },
): Promise<string> {
  const envelope = await createShareEnvelope(bundle, tools, bundlePassword, options);
  const safeJson = JSON.stringify(envelope).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const safeTitle = bundle.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — Noneteco Portable Bundle</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FAF8F5;color:#181A1F;height:100vh;display:flex;flex-direction:column}
    header{background:#fff;border-bottom:1px solid #E6E2DA;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}
    .badge{background:#EEF2FF;color:#3730A3;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px}
    .main{flex:1;display:flex;min-height:0}
    aside{width:300px;background:#fff;border-right:1px solid #E6E2DA;display:flex;flex-direction:column;overflow:auto;padding:16px;gap:10px}
    @media(max-width:768px){.main{flex-direction:column}aside{width:100%;max-height:220px;border-right:none;border-bottom:1px solid #E6E2DA}}
    .note{background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:12px;font-size:13px;color:#78350F;line-height:1.45}
    .tool-btn{text-align:left;width:100%;padding:12px;border-radius:12px;border:1px solid #E6E2DA;background:#FAF8F5;cursor:pointer;transition:.15s}
    .tool-btn:hover{border-color:#6366F1}
    .tool-btn.active{background:#EEF2FF;border-color:#4F46E5}
    .tool-title{font-weight:600;font-size:14px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;gap:6px}
    .tags{display:flex;flex-wrap:wrap;gap:4px}
    .tag{font-size:11px;background:#fff;border:1px solid #E5E7EB;padding:2px 7px;border-radius:999px;color:#4B5563}
    .stage{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff}
    iframe{border:none;width:100%;height:100%;flex:1}
    .gate{margin:auto;max-width:400px;width:92%;background:#fff;border:1px solid #E6E2DA;border-radius:18px;padding:28px;box-shadow:0 16px 36px rgba(0,0,0,.06);text-align:center}
    .gate h2{margin:0 0 8px;font-size:20px}
    .gate p{margin:0 0 16px;color:#5D6470;font-size:14px}
    .gate input{width:100%;padding:11px 14px;border:1px solid #D1D5DB;border-radius:10px;font-size:14px;margin-bottom:10px}
    .gate button{width:100%;padding:11px;border:none;border-radius:10px;background:#3B49DF;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
    .err{color:#DC2626;font-size:13px;margin-top:8px;min-height:18px}
    .hint{background:#FFFBEB;color:#92400E;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px}
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>Noneteco</span>
      <span class="badge" id="bundleTitle">${safeTitle}</span>
    </div>
    <span style="font-size:12px;color:#5D6470" id="statusText">Portable Bundle</span>
  </header>
  <div id="root" class="main"></div>
  <script id="bundle-data" type="application/json">${safeJson}</script>
  <script>
    const envelope = JSON.parse(document.getElementById('bundle-data').textContent);
    const root = document.getElementById('root');
    const dec = new TextDecoder(), enc = new TextEncoder();

    function b64ToBytes(b){const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
    async function decryptPayload(payload, password){
      const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64ToBytes(payload.salt),iterations:payload.iterations||150000,hash:'SHA-256'}, km, {name:'AES-GCM',length:256}, false, ['decrypt']);
      const out = await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(payload.iv)}, key, b64ToBytes(payload.data));
      const parsed = JSON.parse(dec.decode(out));
      if(parsed.magic !== 'NONETECO_V1') throw new Error('Invalid password');
      return parsed.text;
    }

    function renderGate(title, hint, onUnlock){
      root.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'gate';
      box.innerHTML = \`<h2>\${title}</h2><p>Enter password to unlock</p>\${hint ? \`<div class="hint">Hint: \${hint}</div>\` : ''}<input type="password" id="pw" placeholder="Password..." /><button id="go">Unlock</button><div class="err" id="err"></div>\`;
      root.appendChild(box);
      const pw = box.querySelector('#pw');
      const err = box.querySelector('#err');
      const submit = async () => {
        err.textContent = '';
        try { await onUnlock(pw.value); } catch { err.textContent = 'Incorrect password'; }
      };
      box.querySelector('#go').onclick = submit;
      pw.onkeydown = (e) => { if(e.key === 'Enter') submit(); };
      pw.focus();
    }

    function renderWorkspace(data){
      const unlockedTools = {};
      let activeIdx = 0;
      root.innerHTML = '<aside id="side"></aside><div class="stage" id="stage"></div>';
      const side = document.getElementById('side');
      const stage = document.getElementById('stage');

      function drawSidebar(){
        side.innerHTML = '';
        if(data.bundle.welcomeNote){
          const n = document.createElement('div');
          n.className = 'note';
          n.textContent = data.bundle.welcomeNote;
          side.appendChild(n);
        }
        data.tools.forEach((t, i) => {
          const btn = document.createElement('button');
          btn.className = 'tool-btn' + (i === activeIdx ? ' active' : '');
          const lock = t.protected && !unlockedTools[t.id] ? '🔒' : '';
          btn.innerHTML = \`<div class="tool-title"><span>\${t.title}</span><span>\${lock}</span></div><div class="tags">\${(t.tags||[]).map(tag=>\`<span class="tag">\${tag}</span>\`).join('')}</div>\`;
          btn.onclick = () => { activeIdx = i; drawSidebar(); drawStage(); };
          side.appendChild(btn);
        });
      }

      function drawStage(){
        const t = data.tools[activeIdx];
        if(!t){ stage.innerHTML = '<div style="margin:auto;color:#666">No tools in bundle</div>'; return; }
        const html = unlockedTools[t.id] || t.html;
        if(t.protected && !html && t.encrypted){
          stage.innerHTML = '';
          const box = document.createElement('div');
          box.className = 'gate';
          box.innerHTML = \`<h2>\${t.title}</h2><p>This tool is password-protected</p>\${t.passwordHint?\`<div class="hint">Hint: \${t.passwordHint}</div>\`:''}<input type="password" id="tpw" placeholder="Password..." /><button id="tgo">Unlock Tool</button><div class="err" id="terr"></div>\`;
          stage.appendChild(box);
          const inp = box.querySelector('#tpw');
          const err = box.querySelector('#terr');
          const go = async () => {
            err.textContent = '';
            try {
              unlockedTools[t.id] = await decryptPayload(t.encrypted, inp.value);
              drawSidebar(); drawStage();
            } catch { err.textContent = 'Incorrect password'; }
          };
          box.querySelector('#tgo').onclick = go;
          inp.onkeydown = (e) => { if(e.key === 'Enter') go(); };
          return;
        }
        stage.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads');
        iframe.srcdoc = html || '';
        stage.appendChild(iframe);
      }

      drawSidebar();
      drawStage();
    }

    if(envelope.protected && envelope.encrypted){
      renderGate(envelope.title, envelope.passwordHint, async (pw) => {
        const plainJson = await decryptPayload(envelope.encrypted, pw);
        renderWorkspace(JSON.parse(plainJson));
      });
    } else if(envelope.plain){
      renderWorkspace(envelope.plain);
    }
  </script>
</body>
</html>`;
}
