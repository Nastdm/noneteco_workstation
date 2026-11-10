import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Circle, FolderKanban, Lock, Sparkles } from 'lucide-react';
import type { Language, SharePayloadPlain, SharePayloadTool } from '../types';
import { getTranslations } from '../i18n';
import { decryptText } from '../lib/crypto';
import { prepareToolHtmlForIframe } from '../lib/htmlMeta';
import {
  getBundleCompletedIds,
  getToolSandboxStorage,
  setBundleCompletedIds,
  setToolSandboxStorage,
} from '../lib/storage';
import { PasswordGate } from './PasswordGate';

interface BundleReaderViewProps {
  lang: Language;
  onToggleLang: () => void;
  data: SharePayloadPlain;
  onOpenFullWorkstation: () => void;
  onUnlockServerTool?: (toolId: string, password: string) => Promise<string>;
}

export function BundleReaderView({
  lang,
  onToggleLang,
  data,
  onOpenFullWorkstation,
  onUnlockServerTool,
}: BundleReaderViewProps) {
  const t = getTranslations(lang);
  const [activeToolId, setActiveToolId] = useState<string>(data.tools[0]?.id || '');
  const [unlockedHtmlMap, setUnlockedHtmlMap] = useState<Record<string, string>>({});
  const [completedIds, setCompletedIds] = useState<string[]>(() =>
    getBundleCompletedIds(data.bundle.id),
  );

  useEffect(() => {
    if (!activeToolId && data.tools.length > 0) {
      setActiveToolId(data.tools[0].id);
    }
  }, [data.tools, activeToolId]);

  const activeTool: SharePayloadTool | undefined = useMemo(
    () => data.tools.find((tl) => tl.id === activeToolId) || data.tools[0],
    [data.tools, activeToolId],
  );

  useEffect(() => {
    if (!activeTool) return;
    const handler = (event: MessageEvent) => {
      const payload = event.data as { type?: string; toolId?: string; data?: Record<string, string> };
      if (payload?.type === 'noneteco-storage-update' && payload.toolId === activeTool.id && payload.data) {
        setToolSandboxStorage(activeTool.id, payload.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeTool?.id]);

  const toggleDone = (id: string) => {
    setCompletedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setBundleCompletedIds(data.bundle.id, next);
      return next;
    });
  };

  const handleUnlockTool = async (tool: SharePayloadTool, password: string) => {
    let html = '';
    if (tool.encrypted) {
      html = await decryptText(tool.encrypted, password);
    } else if (onUnlockServerTool) {
      html = await onUnlockServerTool(tool.id, password);
    } else {
      throw new Error('Cannot decrypt tool');
    }
    setUnlockedHtmlMap((prev) => ({ ...prev, [tool.id]: html }));
  };

  const activeHtml = activeTool ? unlockedHtmlMap[activeTool.id] ?? activeTool.html : undefined;
  const isLocked = Boolean(activeTool?.protected && !activeHtml);

  const preparedSrcDoc = useMemo(() => {
    if (!activeTool?.id || !activeHtml) return '';
    return prepareToolHtmlForIframe(activeHtml, activeTool.id, getToolSandboxStorage(activeTool.id));
  }, [activeTool?.id, activeHtml]);

  const singleToolMode = Boolean(data.bundle.isSingleTool || (data.tools.length === 1 && !data.bundle.welcomeNote));

  return (
    <div className="flex h-screen flex-col bg-[#FAF8F5]">
      <header className="flex items-center justify-between border-b border-[#E6E2DA] bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                {t.bundleReaderBadge}
              </span>
              {!singleToolMode && (
                <span className="text-xs font-semibold text-slate-500">
                  {t.bundleProgress(completedIds.length, data.tools.length)}
                </span>
              )}
            </div>
            <h1 className="truncate text-base font-bold text-slate-900">{data.bundle.title}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleLang}
            className="rounded-xl border border-[#E6E2DA] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {lang.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={onOpenFullWorkstation}
            className="rounded-xl border border-[#E6E2DA] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t.openWorkstation}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Bundle Sidebar */}
        {!singleToolMode && (
          <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-b border-[#E6E2DA] bg-white p-4 md:w-80 md:border-b-0 md:border-r">
          {data.bundle.welcomeNote && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                <Sparkles className="h-3.5 w-3.5" />
                {t.bundleWelcomeTitle}
              </div>
              <p className="text-xs leading-relaxed text-amber-950">{data.bundle.welcomeNote}</p>
            </div>
          )}

          <div className="space-y-2">
            {data.tools.map((tl, idx) => {
              const isActive = activeTool?.id === tl.id;
              const isDone = completedIds.includes(tl.id);
              const stillLocked = tl.protected && !unlockedHtmlMap[tl.id];

              return (
                <div
                  key={tl.id}
                  className={`rounded-2xl border p-3 transition ${
                    isActive
                      ? 'border-indigo-400 bg-indigo-50/60 shadow-2xs'
                      : 'border-[#E6E2DA] bg-[#FAF8F5] hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveToolId(tl.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {idx + 1}. {tl.title}
                      </span>
                      {stillLocked && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tl.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </button>

                  <div className="mt-2.5 flex items-center justify-end border-t border-slate-200/70 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleDone(tl.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                        isDone
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-white text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t.markedDone}
                        </>
                      ) : (
                        <>
                          <Circle className="h-3.5 w-3.5" />
                          {t.markDone}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </aside>
        )}

        {/* Stage */}
        <main className="flex min-h-0 flex-1 flex-col bg-white">
          {!activeTool ? (
            <div className="m-auto p-6 text-center text-sm text-slate-500">{t.bundleEmpty}</div>
          ) : isLocked ? (
            <PasswordGate
              lang={lang}
              kind="tool"
              title={activeTool.title}
              tags={activeTool.tags}
              hint={activeTool.passwordHint}
              onUnlock={(pw) => handleUnlockTool(activeTool, pw)}
            />
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs">
                <span className="font-bold text-slate-800">{activeTool.title}</span>
                <button
                  type="button"
                  onClick={() => toggleDone(activeTool.id)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold ${
                    completedIds.includes(activeTool.id)
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  {completedIds.includes(activeTool.id) ? t.markedDone : t.markDone}
                </button>
              </div>
              <iframe
                key={activeTool.id}
                title={activeTool.title}
                srcDoc={preparedSrcDoc}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                allow="autoplay"
                className="w-full flex-1 border-none bg-white"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
