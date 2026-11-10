import { useState } from 'react';
import { Check, FolderPlus, Lock, Plus, X } from 'lucide-react';
import type { BundleRecord, Language, ToolRecord } from '../types';
import { getTranslations } from '../i18n';

interface AddToBundleModalProps {
  lang: Language;
  tool: ToolRecord;
  bundles: BundleRecord[];
  onClose: () => void;
  onAddToExisting: (bundle: BundleRecord) => Promise<void>;
  onCreateNew: () => void;
}

export function AddToBundleModal({
  lang,
  tool,
  bundles,
  onClose,
  onAddToExisting,
  onCreateNew,
}: AddToBundleModalProps) {
  const t = getTranslations(lang);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const handlePick = async (bundle: BundleRecord) => {
    setBusyId(bundle.id);
    try {
      await onAddToExisting(bundle);
      setDoneId(bundle.id);
      setTimeout(() => onClose(), 550);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#E6E2DA] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 pr-3">
            <h2 className="text-base font-bold text-slate-900">{t.addToBundleTitle}</h2>
            <p className="truncate text-xs text-slate-500">{tool.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {bundles.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-600">{t.addToExistingBundle}</div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {bundles.map((b) => {
                  const alreadyIn = b.toolIds.includes(tool.id);
                  const isDone = doneId === b.id || alreadyIn;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={Boolean(busyId) || alreadyIn}
                      onClick={() => handlePick(b)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs transition ${
                        isDone
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-[#FAF8F5] text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/60'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FolderPlus className="h-4 w-4 shrink-0 text-indigo-500" />
                        <span className="truncate font-semibold">{b.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {b.protected && <Lock className="h-3.5 w-3.5 text-amber-600" />}
                        {isDone && <Check className="h-4 w-4 text-emerald-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateNew();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t.createNewBundleWithTool}
          </button>
        </div>
      </div>
    </div>
  );
}
