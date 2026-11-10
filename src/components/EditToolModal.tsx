import { useState } from 'react';
import { Lock, LockOpen, Plus, Trash2, X } from 'lucide-react';
import type { CefrLevel, Language, ToolAccent, ToolRecord } from '../types';
import { ACCENT_COLORS, CEFR_LEVELS, PRESET_TAGS, getTranslations } from '../i18n';

interface EditToolModalProps {
  lang: Language;
  tool: ToolRecord;
  sessionPassword?: string;
  onClose: () => void;
  onSave: (patch: {
    title: string;
    description: string;
    tags: string[];
    level: CefrLevel;
    accent: ToolAccent;
    passwordHint?: string;
    newPassword?: string | null;
    currentPassword?: string;
  }) => Promise<void>;
}

export function EditToolModal({
  lang,
  tool,
  sessionPassword,
  onClose,
  onSave,
}: EditToolModalProps) {
  const t = getTranslations(lang);
  const [title, setTitle] = useState(tool.title);
  const [description, setDescription] = useState(tool.description);
  const [tags, setTags] = useState<string[]>(tool.tags);
  const [tagInput, setTagInput] = useState('');
  const [level, setLevel] = useState<CefrLevel>(tool.level || 'All');
  const [accent, setAccent] = useState<ToolAccent>(tool.accent || 'indigo');

  const [currentPassword, setCurrentPassword] = useState(sessionPassword || '');
  const [newPassword, setNewPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [passwordHint, setPasswordHint] = useState(tool.passwordHint || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addTag = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const patch: Parameters<EditToolModalProps['onSave']>[0] = {
        title: title.trim() || tool.title,
        description: description.trim(),
        tags,
        level,
        accent,
        passwordHint: passwordHint.trim(),
      };

      if (removePassword && tool.protected) {
        patch.newPassword = null;
        patch.currentPassword = currentPassword;
      } else if (newPassword.trim().length > 0) {
        patch.newPassword = newPassword;
        if (tool.protected) patch.currentPassword = currentPassword;
      }

      await onSave(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const needsCurrentPw = tool.protected && (removePassword || newPassword.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{t.editModalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldTitle}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldDesc}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldLevel}</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CefrLevel)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
              >
                {CEFR_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === 'All' ? t.allLevels : lvl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">{t.fieldAccent}</label>
              <div className="flex items-center gap-2 pt-1.5">
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

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">{t.fieldTags}</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tg) => (
                <span
                  key={tg}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"
                >
                  #{tg}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== tg))}
                    className="rounded-full hover:text-indigo-950"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                    setTagInput('');
                  }
                }}
                placeholder={t.addTagPlaceholder}
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => {
                  addTag(tagInput);
                  setTagInput('');
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((pt) => {
                const selected = tags.includes(pt);
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() =>
                      setTags((prev) => (selected ? prev.filter((x) => x !== pt) : [...prev, pt]))
                    }
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    +{pt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Security / Password */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                {tool.protected ? (
                  <Lock className="h-4 w-4 text-amber-600" />
                ) : (
                  <LockOpen className="h-4 w-4 text-emerald-600" />
                )}
                <span>{tool.protected ? t.passwordStatusLocked : t.passwordStatusOpen}</span>
              </div>

              {tool.protected && !removePassword && (
                <button
                  type="button"
                  onClick={() => {
                    setRemovePassword(true);
                    setNewPassword('');
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
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    {t.newPasswordLabel}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t.newPasswordPlaceholder}
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                    {t.passwordHintField}
                  </label>
                  <input
                    type="text"
                    value={passwordHint}
                    onChange={(e) => setPasswordHint(e.target.value)}
                    placeholder={t.passwordHintPlaceholder}
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {needsCurrentPw && (
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
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? '...' : t.saveBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
