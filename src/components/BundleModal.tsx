import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Lock, LockOpen, Trash2, X } from 'lucide-react';
import type { BundleRecord, Language, ToolAccent, ToolRecord } from '../types';
import { ACCENT_COLORS, getTranslations } from '../i18n';

interface BundleModalProps {
  lang: Language;
  tools: ToolRecord[];
  editingBundle: BundleRecord | null;
  preselectedToolId?: string | null;
  sessionBundlePassword?: string;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    welcomeNote: string;
    toolIds: string[];
    tags: string[];
    accent: ToolAccent;
    password?: string;
    passwordHint?: string;
    newPassword?: string | null;
    currentPassword?: string;
  }) => Promise<void>;
}

export function BundleModal({
  lang,
  tools,
  editingBundle,
  preselectedToolId,
  sessionBundlePassword,
  onClose,
  onSave,
}: BundleModalProps) {
  const t = getTranslations(lang);
  const [title, setTitle] = useState(editingBundle?.title || '');
  const [description, setDescription] = useState(editingBundle?.description || '');
  const [welcomeNote, setWelcomeNote] = useState(editingBundle?.welcomeNote || '');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    editingBundle
      ? editingBundle.toolIds
      : preselectedToolId
        ? [preselectedToolId]
        : [],
  );
  const [accent, setAccent] = useState<ToolAccent>(editingBundle?.accent || 'indigo');

  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState(editingBundle?.passwordHint || '');
  const [currentPassword, setCurrentPassword] = useState(sessionBundlePassword || '');
  const [removePassword, setRemovePassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toolMap = new Map(tools.map((tl) => [tl.id, tl]));

  const toggleTool = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const moveTool = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= selectedIds.length) return;
    setSelectedIds((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError('');
    setSaving(true);
    try {
      const autoTags = Array.from(
        new Set(
          selectedIds
            .map((id) => toolMap.get(id))
            .filter((x): x is ToolRecord => Boolean(x))
            .flatMap((x) => x.tags),
        ),
      ).slice(0, 6);

      if (editingBundle) {
        await onSave({
          title: title.trim(),
          description: description.trim(),
          welcomeNote: welcomeNote.trim(),
          toolIds: selectedIds,
          tags: autoTags,
          accent,
          passwordHint: passwordHint.trim(),
          newPassword: removePassword ? null : password.trim() ? password : undefined,
          currentPassword: currentPassword || undefined,
        });
      } else {
        await onSave({
          title: title.trim(),
          description: description.trim(),
          welcomeNote: welcomeNote.trim(),
          toolIds: selectedIds,
          tags: autoTags,
          accent,
          password: password.trim() || undefined,
          passwordHint: passwordHint.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bundle');
    } finally {
      setSaving(false);
    }
  };

  const needsCurrent = editingBundle?.protected && (removePassword || password.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {editingBundle ? t.bundleModalEdit : t.bundleModalCreate}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">{t.bundleTitleLabel}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.bundleTitlePlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">{t.bundleDescLabel}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.bundleDescPlaceholder}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldAccent}</label>
              <div className="flex items-center gap-2 pt-2">
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

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">{t.bundleWelcomeLabel}</label>
            <textarea
              rows={2}
              value={welcomeNote}
              onChange={(e) => setWelcomeNote(e.target.value)}
              placeholder={t.bundleWelcomePlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          {/* Tool Picker & Ordering */}
          <div>
            <label className="mb-2 block text-xs font-bold text-slate-700">{t.bundleSelectTools}</label>
            {tools.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                {t.bundleNoToolsWarn}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {tools.map((tool) => {
                    const checked = selectedIds.includes(tool.id);
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => toggleTool(tool.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                          checked ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate font-semibold">{tool.title}</span>
                        </div>
                        {tool.protected && <Lock className="h-3 w-3 shrink-0 text-amber-600" />}
                      </button>
                    );
                  })}
                </div>

                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-[#FAF8F5] p-2">
                  {selectedIds.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      0 selected
                    </div>
                  ) : (
                    selectedIds.map((id, idx) => {
                      const tl = toolMap.get(id);
                      if (!tl) return null;
                      return (
                        <div
                          key={id}
                          className="flex items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <span className="truncate font-semibold text-slate-800">
                            {idx + 1}. {tl.title}
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveTool(idx, -1)}
                              disabled={idx === 0}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTool(idx, 1)}
                              disabled={idx === selectedIds.length - 1}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bundle Password */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                {editingBundle?.protected ? (
                  <Lock className="h-4 w-4 text-amber-600" />
                ) : (
                  <LockOpen className="h-4 w-4 text-emerald-600" />
                )}
                <span>{t.bundlePasswordLabel}</span>
              </div>

              {editingBundle?.protected && !removePassword && (
                <button
                  type="button"
                  onClick={() => {
                    setRemovePassword(true);
                    setPassword('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.removePasswordBtn}
                </button>
              )}
            </div>

            {removePassword ? (
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {t.passwordRemovedNote}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingBundle?.protected ? t.newPasswordPlaceholder : t.passwordPlaceholder}
                  className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  value={passwordHint}
                  onChange={(e) => setPasswordHint(e.target.value)}
                  placeholder={t.passwordHintPlaceholder}
                  className="rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
            )}

            {needsCurrent && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-amber-900">
                  {t.currentPasswordLabel}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
            )}
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
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? '...' : t.saveBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
