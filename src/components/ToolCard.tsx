import {
  CopyPlus,
  FolderPlus,
  Lock,
  LockOpen,
  Play,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { Language, ToolRecord } from '../types';
import { ACCENT_COLORS, getTranslations } from '../i18n';

interface ToolCardProps {
  lang: Language;
  tool: ToolRecord;
  activeTags: string[];
  onOpen: (tool: ToolRecord) => void;
  onEdit: (tool: ToolRecord) => void;
  onShare: (tool: ToolRecord) => void;
  onDuplicate: (tool: ToolRecord) => void;
  onDelete: (tool: ToolRecord) => void;
  onSelectTag: (tag: string) => void;
  onAddToBundle: (tool: ToolRecord) => void;
}

export function ToolCard({
  lang,
  tool,
  activeTags,
  onOpen,
  onEdit,
  onShare,
  onDuplicate,
  onDelete,
  onSelectTag,
  onAddToBundle,
}: ToolCardProps) {
  const t = getTranslations(lang);
  const accent = ACCENT_COLORS[tool.accent] || ACCENT_COLORS.indigo;
  const sizeKb = Math.max(1, Math.round(tool.sizeBytes / 1024));

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className={`h-1.5 w-full ${accent.bar}`} />

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {tool.level && tool.level !== 'All' && (
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${accent.soft}`}>
                {tool.level}
              </span>
            )}
            {tool.protected ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                <Lock className="h-3 w-3" />
                {t.lockedBadge}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <LockOpen className="h-3 w-3" />
                {t.openBadge}
              </span>
            )}
            {tool.source === 'local' && (
              <span className="rounded-md border border-amber-200 bg-amber-50/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {t.localOnlyBadge}
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium text-slate-400">{sizeKb} KB</span>
        </div>

        <button
          type="button"
          onClick={() => onOpen(tool)}
          className="text-left focus:outline-none"
        >
          <h3 className="line-clamp-2 text-[17px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-indigo-600">
            {tool.title}
          </h3>
        </button>

        {tool.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500">
            {tool.description}
          </p>
        ) : (
          <p className="mt-1.5 text-xs italic text-slate-400">{tool.fileName}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {tool.tags.map((tag) => {
            const isActive = activeTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTag(tag);
                }}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-[#FAF8F5] text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
            <button
              type="button"
              onClick={() => onOpen(tool)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {t.openTool}
            </button>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onEdit(tool)}
                title={t.editSettings}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onAddToBundle(tool)}
                title={t.addToBundle}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onShare(tool)}
                title={t.shareToolBtn}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {!tool.protected && (
                <button
                  type="button"
                  onClick={() => onDuplicate(tool)}
                  title={t.duplicateToolBtn}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <CopyPlus className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(tool)}
                title={t.deleteTool}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
