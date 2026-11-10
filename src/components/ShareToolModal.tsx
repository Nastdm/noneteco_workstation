import { useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Link2, Lock, Sparkles, X } from 'lucide-react';
import type { BundleRecord, Language, RuntimeMode, ToolRecord } from '../types';
import { getTranslations } from '../i18n';
import { exportSingleToolPayload } from '../lib/storage';
import { buildShareUrl, generatePortableBundleHtml } from '../lib/share';

interface ShareToolModalProps {
  lang: Language;
  mode: RuntimeMode;
  tool: ToolRecord;
  onClose: () => void;
}

export function ShareToolModal({ lang, mode, tool, onClose }: ShareToolModalProps) {
  const t = getTranslations(lang);
  const [copied1, setCopied1] = useState(false);
  const [copied2, setCopied2] = useState(false);
  const [instantUrl, setInstantUrl] = useState('');
  const [tooLong, setTooLong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const permanentUrl = `${window.location.origin}${window.location.pathname}?tool=${encodeURIComponent(tool.id)}`;
  const isLocalOnly = mode === 'static' && tool.source === 'local';

  const makeVirtualBundle = (): BundleRecord => ({
    id: `tool-${tool.id}`,
    title: tool.title,
    description: tool.description,
    toolIds: [tool.id],
    tags: tool.tags,
    accent: tool.accent,
    protected: false,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  });

  const handleCopyPermanent = () => {
    navigator.clipboard.writeText(permanentUrl).catch(() => {});
    setCopied1(true);
    setTimeout(() => setCopied1(false), 1800);
  };

  const handleGenerateInstant = async () => {
    setError('');
    setBusy(true);
    try {
      const payloadTool = await exportSingleToolPayload(mode, tool);
      const vb = makeVirtualBundle();
      const res = await buildShareUrl(vb, [payloadTool], undefined, { isSingleTool: true });
      setTooLong(res.tooLong);
      setInstantUrl(res.url);
      if (!res.tooLong) {
        navigator.clipboard.writeText(res.url).catch(() => {});
        setCopied2(true);
        setTimeout(() => setCopied2(false), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPortable = async () => {
    setError('');
    setBusy(true);
    try {
      const payloadTool = await exportSingleToolPayload(mode, tool);
      const html = await generatePortableBundleHtml(makeVirtualBundle(), [payloadTool], undefined, { isSingleTool: true });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tool.protected ? `locked-${tool.id}.html` : tool.fileName || `${tool.id}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 pr-3">
            <h2 className="text-lg font-bold text-slate-900">{t.shareToolTitle}</h2>
            <p className="truncate text-xs font-medium text-slate-500">{tool.title}</p>
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
          {isLocalOnly ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{t.shareToolLocalNotice}</span>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs font-medium text-emerald-900">
              {t.shareToolPublishedNotice}
            </div>
          )}

          {tool.protected && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#FAF8F5] px-3.5 py-2 text-xs text-slate-700">
              <Lock className="h-3.5 w-3.5 text-amber-600" />
              <span>{t.passwordStatusLocked}</span>
            </div>
          )}

          {/* Option 1: Permanent Link */}
          <div className={`rounded-2xl border p-4 ${isLocalOnly ? 'border-slate-200 opacity-65' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Link2 className="h-4 w-4 text-indigo-600" />
              <span>?tool={tool.id}</span>
            </div>
            <div className="mt-2.5 flex gap-2">
              <input
                type="text"
                readOnly
                value={permanentUrl}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 outline-none"
              />
              <button
                type="button"
                onClick={handleCopyPermanent}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-600"
              >
                {copied1 ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied1 ? t.copiedBtn : t.copyBtn}
              </button>
            </div>
          </div>

          {/* Option 2: Instant Self-Contained Share Link */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/35 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              {t.shareOption2Title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{t.shareOption2Desc}</p>

            <div className="mt-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleGenerateInstant}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-45"
              >
                {copied2 ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                {copied2 ? t.copiedBtn : t.generateInstantLink}
              </button>
            </div>

            {tooLong && (
              <p className="mt-2 text-xs font-semibold text-amber-800">{t.shareOption2TooBig}</p>
            )}

            {instantUrl && !tooLong && (
              <div className="mt-2.5 flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={instantUrl}
                  className="flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 font-mono text-[11px] text-slate-700 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(instantUrl).catch(() => {});
                    setCopied2(true);
                    setTimeout(() => setCopied2(false), 1800);
                  }}
                  className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  {t.copyBtn}
                </button>
              </div>
            )}
          </div>

          {/* Option 3: Portable .html */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Download className="h-4 w-4 text-emerald-600" />
              {t.shareOption3Title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.shareOption3Desc}</p>
            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadPortable}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-45"
            >
              <Download className="h-3.5 w-3.5" />
              {t.downloadPortableBtn}
            </button>
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
