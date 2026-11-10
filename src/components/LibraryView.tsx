import { useMemo, useRef, useState } from 'react';
import { Check, ClipboardPaste, FileUp, Link2, Lock, LockOpen, Search, Tag, X } from 'lucide-react';
import type { CefrLevel, Language, ToolRecord } from '../types';
import { CEFR_LEVELS, getTranslations } from '../i18n';
import { ToolCard } from './ToolCard';

interface LibraryViewProps {
  lang: Language;
  tools: ToolRecord[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onOpenTool: (tool: ToolRecord) => void;
  onEditTool: (tool: ToolRecord) => void;
  onShareTool: (tool: ToolRecord) => void;
  onDuplicateTool: (tool: ToolRecord) => void;
  onDeleteTool: (tool: ToolRecord) => void;
  onAddToBundle: (tool: ToolRecord) => void;
  onOpenUploadFiles: (files: FileList) => void;
  onOpenPasteModal: () => void;
}

type SortBy = 'newest' | 'title' | 'locked';

export function LibraryView({
  lang,
  tools,
  selectedTags,
  onToggleTag,
  onClearTags,
  onOpenTool,
  onEditTool,
  onShareTool,
  onDuplicateTool,
  onDeleteTool,
  onAddToBundle,
  onOpenUploadFiles,
  onOpenPasteModal,
}: LibraryViewProps) {
  const t = getTranslations(lang);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [lockFilter, setLockFilter] = useState<'all' | 'locked' | 'open'>('all');
  const [levelFilter, setLevelFilter] = useState<CefrLevel>('All');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [tagLinkCopied, setTagLinkCopied] = useState(false);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of tools) {
      for (const tag of tool.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    // Keep selected tags visible even if their count dropped to 0
    for (const sel of selectedTags) {
      if (!counts.has(sel)) counts.set(sel, 0);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [tools, selectedTags]);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tools.filter((tool) => {
      if (lockFilter === 'locked' && !tool.protected) return false;
      if (lockFilter === 'open' && tool.protected) return false;
      if (levelFilter !== 'All' && tool.level !== levelFilter) return false;
      if (selectedTags.length > 0 && !selectedTags.every((tg) => tool.tags.includes(tg))) {
        return false;
      }
      if (!q) return true;
      return (
        tool.title.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.fileName.toLowerCase().includes(q) ||
        tool.tags.some((tg) => tg.toLowerCase().includes(q))
      );
    });

    if (sortBy === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy === 'locked') {
      return [...list].sort((a, b) => Number(b.protected) - Number(a.protected));
    }
    return list;
  }, [tools, search, lockFilter, levelFilter, selectedTags, sortBy]);

  const hasFilters = Boolean(search.trim()) || lockFilter !== 'all' || levelFilter !== 'All' || selectedTags.length > 0;

  const handleClearAll = () => {
    setSearch('');
    setLockFilter('all');
    setLevelFilter('All');
    onClearTags();
  };

  const handleCopyTagLink = () => {
    if (selectedTags.length === 0) return;
    const url = `${window.location.origin}${window.location.pathname}?tags=${encodeURIComponent(selectedTags.join(','))}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setTagLinkCopied(true);
    setTimeout(() => setTagLinkCopied(false), 1800);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-dashed border-indigo-300 bg-gradient-to-r from-indigo-50/80 via-white to-amber-50/50 p-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {t.heroTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{t.heroDesc}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onOpenUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <FileUp className="h-4 w-4" />
            {t.chooseFile}
          </button>
          <button
            type="button"
            onClick={onOpenPasteModal}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E6E2DA] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ClipboardPaste className="h-4 w-4" />
            {t.pasteCode}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mb-5 space-y-3 rounded-2xl border border-[#E6E2DA] bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-[#FAF8F5] py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-[#F4F1EA] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLockFilter('all')}
                className={`rounded-lg px-2.5 py-1.5 transition ${
                  lockFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {t.filterAll}
              </button>
              <button
                type="button"
                onClick={() => setLockFilter('locked')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition ${
                  lockFilter === 'locked' ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <Lock className="h-3 w-3" />
                {t.filterLocked}
              </button>
              <button
                type="button"
                onClick={() => setLockFilter('open')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition ${
                  lockFilter === 'open' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <LockOpen className="h-3 w-3" />
                {t.filterOpen}
              </button>
            </div>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as CefrLevel)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
            >
              {CEFR_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === 'All' ? t.allLevels : `CEFR ${lvl}`}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500"
            >
              <option value="newest">{t.sortNewest}</option>
              <option value="title">{t.sortTitle}</option>
              <option value="locked">{t.sortLocked}</option>
            </select>
          </div>
        </div>

        {tagCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Tag className="h-3.5 w-3.5" />
              {t.tagsLabel}
            </span>
            {tagCounts.map(([tag, count]) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'border border-slate-200 bg-[#FAF8F5] text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <span>#{tag}</span>
                  <span className={`text-[10px] ${active ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={handleCopyTagLink}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                {tagLinkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                {tagLinkCopied ? t.tagLinkCopied : t.copyTagLink}
              </button>
            )}

            {hasFilters && (
              <button
                type="button"
                onClick={handleClearAll}
                className={`${selectedTags.length === 0 ? 'ml-auto' : ''} inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800`}
              >
                <X className="h-3.5 w-3.5" />
                {t.clearFilters}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>{t.toolsCount(filteredTools.length)}</span>
      </div>

      {filteredTools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E6E2DA] bg-white px-6 py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <FileUp className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">{t.noToolsTitle}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t.noToolsDesc}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              lang={lang}
              tool={tool}
              activeTags={selectedTags}
              onOpen={onOpenTool}
              onEdit={onEditTool}
              onShare={onShareTool}
              onDuplicate={onDuplicateTool}
              onDelete={onDeleteTool}
              onSelectTag={onToggleTag}
              onAddToBundle={onAddToBundle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
