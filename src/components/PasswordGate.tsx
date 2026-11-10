import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import type { Language } from '../types';
import { getTranslations } from '../i18n';

interface PasswordGateProps {
  lang: Language;
  kind: 'tool' | 'bundle';
  title: string;
  tags?: string[];
  hint?: string;
  onUnlock: (password: string) => Promise<void>;
  onBack?: () => void;
}

export function PasswordGate({
  lang,
  kind,
  title,
  tags = [],
  hint,
  onUnlock,
  onBack,
}: PasswordGateProps) {
  const t = getTranslations(lang);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      await onUnlock(password);
    } catch {
      setError(t.gateWrongPassword);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div
        className={`w-full max-w-md rounded-2xl border border-[#E6E2DA] bg-white p-7 shadow-lg ${
          shake ? 'animate-shake' : ''
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <Lock className="h-6 w-6" />
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.gateBackBtn}
            </button>
          )}
        </div>

        <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
          {kind === 'tool' ? t.gateTitleLockedTool : t.gateTitleLockedBundle}
        </div>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1.5 text-sm text-slate-500">{t.gateSubtitle}</p>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {hint && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
            <div>
              <span className="font-semibold">{t.gateHintPrefix}</span> {hint}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.gateInputPlaceholder}
              autoFocus
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '...' : t.gateUnlockBtn}
          </button>
        </form>
      </div>
    </div>
  );
}
