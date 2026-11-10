import { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardPaste, FileCode2, Lock, Plus, Upload, X } from 'lucide-react';
import type { CefrLevel, Language, ToolAccent } from '../types';
import { ACCENT_COLORS, CEFR_LEVELS, PRESET_TAGS, getTranslations } from '../i18n';
import { detectNonStandaloneHtml, extractHtmlMetadata } from '../lib/htmlMeta';

export interface PendingUploadItem {
  fileName: string;
  html: string;
  title: string;
  description: string;
  tags: string[];
  level: CefrLevel;
  accent: ToolAccent;
}

interface UploadModalProps {
  lang: Language;
  initialMode: 'file' | 'paste';
  initialFiles: File[] | null;
  onClose: () => void;
  onSaveItems: (
    items: PendingUploadItem[],
    password: string,
    passwordHint: string,
    openFirst: boolean,
  ) => Promise<void>;
}

export function UploadModal({
  lang,
  initialMode,
  initialFiles,
  onClose,
  onSaveItems,
}: UploadModalProps) {
  const t = getTranslations(lang);
  const [tab, setTab] = useState<'file' | 'paste'>(initialMode);
  const [items, setItems] = useState<PendingUploadItem[]>([]);
  const [pastedHtml, setPastedHtml] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [level, setLevel] = useState<CefrLevel>('All');
  const [accent, setAccent] = useState<ToolAccent>('indigo');
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [titleTouched, setTitleTouched] = useState(false);
  const [descTouched, setDescTouched] = useState(false);
  const [tagsTouched, setTagsTouched] = useState(false);
  const [nonStandaloneWarn, setNonStandaloneWarn] = useState(false);

  const loadFiles = async (fileList: File[]) => {
    const htmlFiles = fileList.filter((f) => /\.html?$/i.test(f.name) || f.type === 'text/html');
    if (htmlFiles.length === 0) return;

    const loaded: PendingUploadItem[] = [];
    let hasWarn = false;
    for (const f of htmlFiles) {
      const html = await f.text();
      if (detectNonStandaloneHtml(html)) hasWarn = true;
      const meta = extractHtmlMetadata(html, f.name);
      loaded.push({
        fileName: f.name,
        html,
        title: meta.title,
        description: meta.description,
        tags: meta.suggestedTags,
        level: meta.suggestedLevel,
        accent: meta.suggestedAccent,
      });
    }
    setNonStandaloneWarn(hasWarn);
    setItems(loaded);
    if (loaded.length === 1) {
      setTitle(loaded[0].title);
      setDescription(loaded[0].description);
      setTags(loaded[0].tags);
      setLevel(loaded[0].level);
      setAccent(loaded[0].accent);
    } else {
      const mergedTags = Array.from(new Set(loaded.flatMap((l) => l.tags)));
      setTags(mergedTags);
    }
  };

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      setTab('file');
      loadFiles(initialFiles);
    }
  }, [initialFiles]);

  const handlePasteChange = (val: string) => {
    setPastedHtml(val);
    setNonStandaloneWarn(Boolean(detectNonStandaloneHtml(val)));
    if (val.trim().length > 20) {
      const meta = extractHtmlMetadata(val, 'custom-tool.html');
      if (!titleTouched) setTitle(meta.title);
      if (!descTouched) setDescription(meta.description);
      if (!tagsTouched) setTags(meta.suggestedTags);
      if (meta.suggestedLevel !== 'All') setLevel(meta.suggestedLevel);
      setAccent(meta.suggestedAccent);
    }
  };

  const addTag = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])));
    setTagsTouched(true);
  };

  const togglePresetTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
    setTagsTouched(true);
  };

  const handleSubmit = async (openAfter: boolean) => {
    setError('');
    setSaving(true);
    try {
      let finalItems: PendingUploadItem[] = [];
      if (tab === 'file') {
        if (items.length === 0) {
          throw new Error('Select at least one .html file');
        }
        if (items.length === 1) {
          finalItems = [
            {
              ...items[0],
              title: title.trim() || items[0].title,
              description: description.trim(),
              tags,
              level,
              accent,
            },
          ];
        } else {
          finalItems = items.map((it) => ({
            ...it,
            tags: Array.from(new Set([...it.tags, ...tags])),
            level: level !== 'All' ? level : it.level,
          }));
        }
      } else {
        if (!pastedHtml.trim()) {
          throw new Error('Paste HTML code first');
        }
        const meta = extractHtmlMetadata(pastedHtml, 'custom-tool.html');
        finalItems = [
          {
            fileName: `${(title.trim() || meta.title).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'tool'}.html`,
            html: pastedHtml,
            title: title.trim() || meta.title,
            description: description.trim(),
            tags: tags.length > 0 ? tags : meta.suggestedTags,
            level,
            accent,
          },
        ];
      }

      await onSaveItems(finalItems, password, passwordHint, openAfter);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = tab === 'file' ? items.length > 0 : pastedHtml.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{t.uploadModalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F4F1EA] p-1">
            <button
              type="button"
              onClick={() => setTab('file')}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${
                tab === 'file' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Upload className="h-4 w-4" />
              {t.uploadTabFile}
            </button>
            <button
              type="button"
              onClick={() => setTab('paste')}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${
                tab === 'paste' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <ClipboardPaste className="h-4 w-4" />
              {t.uploadTabPaste}
            </button>
          </div>

          {tab === 'file' ? (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/70">
                <FileCode2 className="mb-2 h-8 w-8 text-indigo-600" />
                <span className="text-sm font-semibold text-slate-800">{t.dropStripTitle}</span>
                <span className="mt-0.5 text-xs text-slate-500">.html / .htm</span>
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) loadFiles(Array.from(e.target.files));
                  }}
                />
              </label>

              {items.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-700">{t.filesSelected(items.length)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((it) => (
                      <span
                        key={it.fileName}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        <FileCode2 className="h-3.5 w-3.5 text-indigo-500" />
                        {it.fileName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={pastedHtml}
              onChange={(e) => handlePasteChange(e.target.value)}
              placeholder={t.pastePlaceholder}
              rows={7}
              className="w-full rounded-xl border border-slate-300 bg-slate-950 p-3.5 font-mono text-xs text-emerald-300 outline-none focus:border-indigo-500"
            />
          )}

          {nonStandaloneWarn && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{t.nonStandaloneWarning}</span>
            </div>
          )}

          {/* Metadata fields (shown for single file or paste) */}
          {(tab === 'paste' || items.length <= 1) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldTitle}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitleTouched(true);
                    setTitle(e.target.value);
                  }}
                  placeholder={t.fieldTitlePlaceholder}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldDesc}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => {
                    setDescTouched(true);
                    setDescription(e.target.value);
                  }}
                  placeholder={t.fieldDescPlaceholder}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldLevel}</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CefrLevel)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                {CEFR_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === 'All' ? t.allLevels : lvl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldAccent}</label>
              <div className="flex items-center gap-2 pt-1.5">
                {(Object.keys(ACCENT_COLORS) as ToolAccent[]).map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => setAccent(acc)}
                    className={`h-7 w-7 rounded-full ${ACCENT_COLORS[acc].bar} transition ${
                      accent === acc ? 'ring-2 ring-slate-900 ring-offset-2' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">{t.fieldTags}</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tg) => (
                <span
                  key={tg}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"
                >
                  #{tg}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== tg))}
                    className="rounded-full hover:text-indigo-950"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                    setTagInput('');
                  }
                }}
                placeholder={t.addTagPlaceholder}
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => {
                  addTag(tagInput);
                  setTagInput('');
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2.5">
              <span className="mr-2 text-[11px] font-semibold text-slate-400">{t.presetTagsLabel}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((pt) => {
                  const selected = tags.includes(pt);
                  return (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => togglePresetTag(pt)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                        selected
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      +{pt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Password Lock */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-amber-900">
              <Lock className="h-4 w-4 text-amber-600" />
              {t.passwordSection}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder}
                className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-amber-500"
              />
              <input
                type="text"
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                placeholder={t.passwordHintPlaceholder}
                disabled={!password}
                className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-amber-500 disabled:opacity-50"
              />
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/60"
          >
            {t.cancelBtn}
          </button>
          {(tab === 'paste' || items.length <= 1) && (
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => handleSubmit(true)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40"
            >
              {t.saveAndOpen}
            </button>
          )}
          <button
            type="button"
            disabled={!canSubmit || saving}
            onClick={() => handleSubmit(false)}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? '...' : t.saveBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
