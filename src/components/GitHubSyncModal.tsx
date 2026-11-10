import { useState } from 'react';
import { CheckCircle2, CloudUpload, ExternalLink, FolderInput, Github, RefreshCw, Trash2, X } from 'lucide-react';
import type { Language, RuntimeMode } from '../types';
import { getTranslations } from '../i18n';
import { loadGitHubConfig, publishToGitHub, saveGitHubConfig, verifyGitHubAccess } from '../lib/github';
import { clearLocalOverlayAfterPublish, collectStaticSyncChanges } from '../lib/storage';

interface GitHubSyncModalProps {
  lang: Language;
  mode: RuntimeMode;
  hasLocalChanges: boolean;
  onClose: () => void;
  onPublished: () => Promise<void>;
  onRescanServer: () => Promise<number>;
}

export function GitHubSyncModal({
  lang,
  mode,
  hasLocalChanges,
  onClose,
  onPublished,
  onRescanServer,
}: GitHubSyncModalProps) {
  const t = getTranslations(lang);
  const [config, setConfig] = useState(() => loadGitHubConfig());
  const [tokenInput, setTokenInput] = useState(config.token);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSaveToken = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const next = { ...config, token: tokenInput.trim() };
      await verifyGitHubAccess(next);
      saveGitHubConfig(next);
      setConfig(next);
      setStatusMsg('✓ Connected to GitHub');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Token verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleClearToken = () => {
    const next = { ...config, token: '' };
    saveGitHubConfig(next);
    setConfig(next);
    setTokenInput('');
    setStatusMsg('');
  };

  const handlePublish = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const { upsertFiles, deletePaths } = await collectStaticSyncChanges();
      await publishToGitHub(config, upsertFiles, deletePaths);
      await clearLocalOverlayAfterPublish();
      await onPublished();
      setStatusMsg(t.githubPublishedOk);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRescan = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const count = await onRescanServer();
      setStatusMsg(`Imported ${count} file(s) from library/drop`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Rescan failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Github className="h-5 w-5 text-slate-900" />
            <h2 className="text-lg font-bold text-slate-900">{t.githubTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-600">{t.githubDesc}</p>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-[#FAF8F5] px-4 py-3 text-xs">
            <div>
              <span className="font-semibold text-slate-500">{t.githubConnectedRepo}: </span>
              <a
                href={`https://github.com/${config.owner}/${config.repo}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline"
              >
                {config.owner}/{config.repo}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">
              {mode === 'server' ? t.modeServer : t.modeStatic}
            </span>
          </div>

          {mode === 'server' ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
              <button
                type="button"
                disabled={busy}
                onClick={handleRescan}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                {t.rescanServerBtn}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {t.githubTokenLabel}
                    </label>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder={t.githubTokenPlaceholder}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      {t.githubBranchLabel}
                    </label>
                    <input
                      type="text"
                      value={config.branch}
                      onChange={(e) => {
                        const next = { ...config, branch: e.target.value };
                        setConfig(next);
                        saveGitHubConfig(next);
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || !tokenInput.trim()}
                    onClick={handleSaveToken}
                    className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-45"
                  >
                    {t.githubSaveToken}
                  </button>
                  {config.token && (
                    <button
                      type="button"
                      onClick={handleClearToken}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.githubClearToken}
                    </button>
                  )}

                  {config.token && (
                    <button
                      type="button"
                      disabled={busy || !hasLocalChanges}
                      onClick={handlePublish}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-45"
                    >
                      <CloudUpload className="h-4 w-4" />
                      {busy ? t.githubPublishing : t.githubPublishBtn}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[#FAF8F5] p-4">
                <div className="mb-2 text-xs font-bold text-slate-800">{t.githubGuideTitle}</div>
                <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed text-slate-600">
                  {t.githubGuideSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-emerald-900">
              <FolderInput className="h-4 w-4 text-emerald-700" />
              {t.githubDropTipTitle}
            </div>
            <p className="text-xs leading-relaxed text-emerald-900/80">{t.githubDropTipDesc}</p>
          </div>

          {statusMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
