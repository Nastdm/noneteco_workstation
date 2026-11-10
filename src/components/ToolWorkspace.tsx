import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Download,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Timer,
  X,
} from 'lucide-react';
import type { Language, ToolRecord } from '../types';
import { getTranslations } from '../i18n';
import { prepareToolHtmlForIframe } from '../lib/htmlMeta';
import { getToolSandboxStorage, setToolSandboxStorage } from '../lib/storage';

interface ToolWorkspaceProps {
  lang: Language;
  tool: ToolRecord;
  html: string;
  allTools: ToolRecord[];
  backLabel?: string;
  onBack: () => void;
  onJumpToTag: (tag: string) => void;
  onOpenTool: (tool: ToolRecord) => void;
  onEditSettings: (tool: ToolRecord) => void;
  onLockAgain?: () => void;
  onSaveNotes: (toolId: string, notes: string) => Promise<void>;
  onSaveHtml: (toolId: string, newHtml: string) => Promise<void>;
}

type SideTab = 'timer' | 'notes' | 'code' | null;
type ViewportMode = 'desktop' | 'tablet' | 'mobile';

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch {
    // ignore audio errors
  }
}

export function ToolWorkspace({
  lang,
  tool,
  html,
  allTools,
  backLabel,
  onBack,
  onJumpToTag,
  onOpenTool,
  onEditSettings,
  onLockAgain,
  onSaveNotes,
  onSaveHtml,
}: ToolWorkspaceProps) {
  const t = getTranslations(lang);
  const [liveHtml, setLiveHtml] = useState(html);
  const [codeDraft, setCodeDraft] = useState(html);
  const [iframeKey, setIframeKey] = useState(0);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [zenMode, setZenMode] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>(null);

  // Notes state
  const [notes, setNotes] = useState(tool.notes || '');
  const [notesSavedToast, setNotesSavedToast] = useState(false);

  // Code save state
  const [savingCode, setSavingCode] = useState(false);
  const [codeSavedToast, setCodeSavedToast] = useState(false);

  // Timer state
  const [timerPreset, setTimerPreset] = useState(60);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveHtml(html);
    setCodeDraft(html);
    setNotes(tool.notes || '');
    setIframeKey((k) => k + 1);
  }, [tool.id, html]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const payload = event.data as { type?: string; toolId?: string; data?: Record<string, string> };
      if (payload?.type === 'noneteco-storage-update' && payload.toolId === tool.id && payload.data) {
        setToolSandboxStorage(tool.id, payload.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tool.id]);

  useEffect(() => {
    if (!timerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          playChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const preparedSrcDoc = useMemo(() => {
    const saved = getToolSandboxStorage(tool.id);
    return prepareToolHtmlForIframe(liveHtml, tool.id, saved);
  }, [liveHtml, tool.id, iframeKey]);

  const nextToolSuggestion = useMemo(() => {
    if (tool.tags.length === 0) return null;
    for (const tag of tool.tags) {
      const candidates = allTools.filter((item) => item.id !== tool.id && item.tags.includes(tag));
      if (candidates.length > 0) {
        return { tag, tool: candidates[0] };
      }
    }
    return null;
  }, [allTools, tool.id, tool.tags]);

  const handleDownloadHtml = () => {
    const blob = new Blob([liveHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tool.fileName || `${tool.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveNotesNow = async () => {
    await onSaveNotes(tool.id, notes);
    setNotesSavedToast(true);
    setTimeout(() => setNotesSavedToast(false), 1800);
  };

  const handleSaveCode = async () => {
    setSavingCode(true);
    try {
      await onSaveHtml(tool.id, codeDraft);
      setLiveHtml(codeDraft);
      setIframeKey((k) => k + 1);
      setCodeSavedToast(true);
      setTimeout(() => setCodeSavedToast(false), 1800);
    } finally {
      setSavingCode(false);
    }
  };

  const formatClock = (secs: number) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const iframeWidthClass =
    viewport === 'desktop'
      ? 'w-full'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full rounded-2xl border border-[#E6E2DA] shadow-lg'
        : 'w-[390px] max-w-full rounded-3xl border-[6px] border-slate-800 shadow-2xl';

  return (
    <div className={zenMode ? 'fixed inset-0 z-50 flex flex-col bg-white' : 'flex h-[calc(100vh-65px)] flex-col'}>
      {!zenMode && (
        <div className="border-b border-[#E6E2DA] bg-white px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E6E2DA] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {backLabel || t.backToLibrary}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                    {tool.title}
                  </h2>
                  {tool.level && tool.level !== 'All' && (
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                      {tool.level}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {tool.tags.map((tg) => (
                    <button
                      key={tg}
                      type="button"
                      onClick={() => onJumpToTag(tg)}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      #{tg}
                    </button>
                  ))}
                  {nextToolSuggestion && (
                    <button
                      type="button"
                      onClick={() => onOpenTool(nextToolSuggestion.tool)}
                      className="ml-1 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50/70 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                      title={nextToolSuggestion.tool.title}
                    >
                      <span>{t.nextInTag} #{nextToolSuggestion.tag}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Viewport switcher */}
              <div className="hidden items-center rounded-xl bg-[#F4F1EA] p-0.5 md:flex">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  title={t.viewportDesktop}
                  className={`rounded-lg p-1.5 transition ${
                    viewport === 'desktop' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('tablet')}
                  title={t.viewportTablet}
                  className={`rounded-lg p-1.5 transition ${
                    viewport === 'tablet' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  <Tablet className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  title={t.viewportMobile}
                  className={`rounded-lg p-1.5 transition ${
                    viewport === 'mobile' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSideTab((s) => (s === 'timer' ? null : 'timer'))}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                  sideTab === 'timer'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-[#E6E2DA] bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Timer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{timerRunning ? formatClock(secondsLeft) : t.timerBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setSideTab((s) => (s === 'notes' ? null : 'notes'))}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                  sideTab === 'notes'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-[#E6E2DA] bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <NotebookPen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.notesBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setSideTab((s) => (s === 'code' ? null : 'code'))}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                  sideTab === 'code'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-[#E6E2DA] bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.codeBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => onEditSettings(tool)}
                title={t.editSettings}
                className="rounded-xl border border-[#E6E2DA] bg-white p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleDownloadHtml}
                title={t.downloadHtmlBtn}
                className="rounded-xl border border-[#E6E2DA] bg-white p-1.5 text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
              </button>

              {tool.protected && onLockAgain && (
                <button
                  type="button"
                  onClick={onLockAgain}
                  title={t.lockAgainBtn}
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{t.lockAgainBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setZenMode(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.zenModeBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`flex flex-1 justify-center overflow-auto ${
            viewport === 'desktop' ? 'bg-white' : 'bg-[#F0ECE4] p-4 sm:p-6'
          }`}
        >
          <iframe
            key={`${tool.id}-${iframeKey}`}
            title={tool.title}
            srcDoc={preparedSrcDoc}
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
            allow="autoplay"
            className={`h-full bg-white ${iframeWidthClass}`}
          />
        </div>

        {/* Collapsible Tutor Utility Side Drawer */}
        {!zenMode && sideTab && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-[#E6E2DA] bg-white sm:w-96">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex gap-1 rounded-lg bg-[#F4F1EA] p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSideTab('timer')}
                  className={`rounded-md px-2.5 py-1 ${sideTab === 'timer' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
                >
                  {t.timerBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setSideTab('notes')}
                  className={`rounded-md px-2.5 py-1 ${sideTab === 'notes' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
                >
                  {t.notesBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setSideTab('code')}
                  className={`rounded-md px-2.5 py-1 ${sideTab === 'code' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
                >
                  {t.codeBtn}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSideTab(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sideTab === 'timer' && (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 text-5xl font-extrabold tabular-nums tracking-tight text-slate-900">
                  {formatClock(secondsLeft)}
                </div>
                <div className="mb-6 flex flex-wrap justify-center gap-2">
                  {[60, 120, 180, 300, 600].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerPreset(sec);
                        setSecondsLeft(sec);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        timerPreset === sec
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {sec / 60}m
                    </button>
                  ))}
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTimerRunning((r) => !r)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    {timerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {timerRunning ? t.timerPause : t.timerStart}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimerRunning(false);
                      setSecondsLeft(timerPreset);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t.timerReset}
                  </button>
                </div>
              </div>
            )}

            {sideTab === 'notes' && (
              <div className="flex flex-1 flex-col p-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={handleSaveNotesNow}
                  placeholder={t.notesPlaceholder}
                  className="flex-1 resize-none rounded-xl border border-slate-200 bg-[#FAF8F5] p-3.5 text-sm leading-relaxed text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-600">
                    {notesSavedToast ? t.notesSaved : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveNotesNow}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.saveBtn}
                  </button>
                </div>
              </div>
            )}

            {sideTab === 'code' && (
              <div className="flex flex-1 flex-col p-4">
                <textarea
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  spellCheck={false}
                  className="flex-1 resize-none rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-emerald-300 outline-none focus:border-indigo-500"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLiveHtml(codeDraft);
                      setIframeKey((k) => k + 1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t.applyPreviewBtn}
                  </button>
                  <button
                    type="button"
                    disabled={savingCode}
                    onClick={handleSaveCode}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {codeSavedToast ? <Check className="h-3.5 w-3.5" /> : null}
                    {codeSavedToast ? t.codeSavedToast : t.saveCodeChangesBtn}
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {zenMode && (
        <button
          type="button"
          onClick={() => setZenMode(false)}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-slate-900"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          {t.exitZenBtn}
        </button>
      )}
    </div>
  );
}
