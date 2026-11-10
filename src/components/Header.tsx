import { Code2, FolderKanban, Github, Layers, Plus } from 'lucide-react';
import type { Language, RuntimeMode } from '../types';
import { getTranslations } from '../i18n';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
  activeTab: 'library' | 'bundles';
  onChangeTab: (tab: 'library' | 'bundles') => void;
  bundleCount: number;
  toolCount: number;
  mode: RuntimeMode;
  hasLocalChanges: boolean;
  onOpenUpload: () => void;
  onOpenGithub: () => void;
  onGoHome: () => void;
}

export function Header({
  lang,
  onToggleLang,
  activeTab,
  onChangeTab,
  bundleCount,
  toolCount,
  mode,
  hasLocalChanges,
  onOpenUpload,
  onOpenGithub,
  onGoHome,
}: HeaderProps) {
  const t = getTranslations(lang);

  return (
    <header className="sticky top-0 z-30 border-b border-[#E6E2DA] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-85"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight text-slate-900">
                Noneteco <span className="font-medium text-indigo-600">Workstation</span>
              </div>
              <div className="text-[11px] font-medium text-slate-500">{t.brandSub}</div>
            </div>
          </button>

          <nav className="flex items-center gap-1 rounded-xl bg-[#F4F1EA] p-1">
            <button
              type="button"
              onClick={() => onChangeTab('library')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                activeTab === 'library'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>{t.navLibrary}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {toolCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('bundles')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                activeTab === 'bundles'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderKanban className="h-4 w-4" />
              <span>{t.navBundles}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {bundleCount}
              </span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onOpenGithub}
            className="relative flex items-center gap-1.5 rounded-xl border border-[#E6E2DA] bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            title={mode === 'server' ? t.modeServer : t.modeStatic}
          >
            <Github className="h-4 w-4 text-slate-800" />
            <span className="hidden sm:inline">{t.navGithub}</span>
            <span
              className={`h-2 w-2 rounded-full ${
                hasLocalChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={onToggleLang}
            className="flex items-center rounded-xl border border-[#E6E2DA] bg-white px-2.5 py-2 text-xs font-bold tracking-wide text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Switch language"
          >
            <span className={lang === 'ru' ? 'text-indigo-600' : 'text-slate-400'}>RU</span>
            <span className="mx-1 text-slate-300">/</span>
            <span className={lang === 'en' ? 'text-indigo-600' : 'text-slate-400'}>EN</span>
          </button>

          <button
            type="button"
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            <span>{t.addHtmlBtn}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
