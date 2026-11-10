import { FolderKanban, Lock, LockOpen, Pencil, Play, Plus, Share2, Trash2 } from 'lucide-react';
import type { BundleRecord, Language, ToolRecord } from '../types';
import { ACCENT_COLORS, getTranslations } from '../i18n';

interface BundlesViewProps {
  lang: Language;
  bundles: BundleRecord[];
  tools: ToolRecord[];
  onCreateBundle: () => void;
  onEditBundle: (bundle: BundleRecord) => void;
  onDeleteBundle: (bundle: BundleRecord) => void;
  onOpenBundle: (bundle: BundleRecord) => void;
  onShareBundle: (bundle: BundleRecord) => void;
}

export function BundlesView({
  lang,
  bundles,
  tools,
  onCreateBundle,
  onEditBundle,
  onDeleteBundle,
  onOpenBundle,
  onShareBundle,
}: BundlesViewProps) {
  const t = getTranslations(lang);
  const toolMap = new Map(tools.map((tl) => [tl.id, tl]));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-[#E6E2DA] bg-white p-6 shadow-2xs sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {t.bundlesHeroTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{t.bundlesHeroDesc}</p>
        </div>
        <button
          type="button"
          onClick={onCreateBundle}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {t.createBundleBtn}
        </button>
      </div>

      {bundles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E6E2DA] bg-white px-6 py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">{t.noBundlesTitle}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t.noBundlesDesc}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bundles.map((bundle) => {
            const accent = ACCENT_COLORS[bundle.accent] || ACCENT_COLORS.indigo;
            const bundleTools = bundle.toolIds
              .map((id) => toolMap.get(id))
              .filter((x): x is ToolRecord => Boolean(x));

            return (
              <div
                key={bundle.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={`h-1.5 w-full ${accent.bar}`} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${accent.soft}`}>
                      {t.bundleToolsCount(bundleTools.length)}
                    </span>
                    {bundle.protected ? (
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
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">{bundle.title}</h3>
                  {bundle.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{bundle.description}</p>
                  )}

                  {bundleTools.length > 0 && (
                    <ul className="mt-4 space-y-1.5 rounded-xl bg-[#FAF8F5] p-3">
                      {bundleTools.slice(0, 4).map((tl, idx) => (
                        <li key={tl.id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                          <span className="truncate font-medium">
                            {idx + 1}. {tl.title}
                          </span>
                          {tl.protected && <Lock className="h-3 w-3 shrink-0 text-amber-600" />}
                        </li>
                      ))}
                      {bundleTools.length > 4 && (
                        <li className="text-[11px] font-semibold text-slate-400">
                          +{bundleTools.length - 4} more...
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="mt-auto pt-5">
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenBundle(bundle)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          {t.openBundleBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => onShareBundle(bundle)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          {t.shareBundleBtn}
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditBundle(bundle)}
                          title={t.editBundleBtn}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBundle(bundle)}
                          title={t.deleteBundleBtn}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
