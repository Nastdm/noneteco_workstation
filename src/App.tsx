import { useCallback, useEffect, useState } from 'react';
import { FileQuestion, FileUp } from 'lucide-react';
import type {
  BundleRecord,
  CatalogData,
  Language,
  RuntimeMode,
  ShareEnvelope,
  SharePayloadPlain,
  ToolRecord,
} from './types';
import { getTranslations } from './i18n';
import {
  createBundle,
  createTool,
  deleteBundle,
  deleteTool,
  detectRuntimeMode,
  exportBundleTools,
  getToolHtml,
  loadCatalog,
  rescanDropFolder,
  unlockBundle,
  unlockTool,
  updateBundle,
  updateTool,
} from './lib/storage';
import { decryptShareEnvelope, parseShareHash } from './lib/share';
import { Header } from './components/Header';
import { LibraryView } from './components/LibraryView';
import { ToolWorkspace } from './components/ToolWorkspace';
import { PasswordGate } from './components/PasswordGate';
import { UploadModal, type PendingUploadItem } from './components/UploadModal';
import { EditToolModal } from './components/EditToolModal';
import { BundlesView } from './components/BundlesView';
import { BundleModal } from './components/BundleModal';
import { ShareBundleModal } from './components/ShareBundleModal';
import { ShareToolModal } from './components/ShareToolModal';
import { AddToBundleModal } from './components/AddToBundleModal';
import { BundleReaderView } from './components/BundleReaderView';
import { GitHubSyncModal } from './components/GitHubSyncModal';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('noneteco_lang');
    return saved === 'en' ? 'en' : 'ru';
  });
  const t = getTranslations(lang);

  const [mode, setMode] = useState<RuntimeMode>('static');
  const [catalog, setCatalog] = useState<CatalogData>({ version: 1, tools: [], bundles: [] });
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [booting, setBooting] = useState(true);

  const [activeTab, setActiveTab] = useState<'library' | 'bundles'>('library');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Active routes
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [bundleReturnId, setBundleReturnId] = useState<string | null>(null);

  // Shared hash envelope (#share=...)
  const [shareEnvelope, setShareEnvelope] = useState<ShareEnvelope | null>(null);
  const [sharePlain, setSharePlain] = useState<SharePayloadPlain | null>(null);
  const [shareParseError, setShareParseError] = useState(false);

  // Reader data for ?bundle=<id>
  const [bundleReaderData, setBundleReaderData] = useState<SharePayloadPlain | null>(null);

  // Session unlocks (in-memory)
  const [unlockedTools, setUnlockedTools] = useState<Record<string, { html: string; password?: string }>>({});
  const [unlockedBundles, setUnlockedBundles] = useState<Record<string, { password?: string }>>({});

  // Modals
  const [uploadState, setUploadState] = useState<{ open: boolean; mode: 'file' | 'paste'; files: File[] | null }>({
    open: false,
    mode: 'file',
    files: null,
  });
  const [editingTool, setEditingTool] = useState<ToolRecord | null>(null);
  const [bundleModalState, setBundleModalState] = useState<{
    open: boolean;
    editing: BundleRecord | null;
    preselectToolId: string | null;
  }>({ open: false, editing: null, preselectToolId: null });
  const [sharingBundle, setSharingBundle] = useState<BundleRecord | null>(null);
  const [sharingTool, setSharingTool] = useState<ToolRecord | null>(null);
  const [addingToBundleTool, setAddingToBundleTool] = useState<ToolRecord | null>(null);
  const [githubOpen, setGithubOpen] = useState(false);

  // Global drag overlay
  const [draggingOver, setDraggingOver] = useState(false);

  const toggleLang = () => {
    setLang((prev) => {
      const next = prev === 'ru' ? 'en' : 'ru';
      localStorage.setItem('noneteco_lang', next);
      return next;
    });
  };

  const refreshCatalog = useCallback(async (detectedMode?: RuntimeMode) => {
    const m = detectedMode || mode;
    const res = await loadCatalog(m);
    setCatalog(res.catalog);
    setHasLocalChanges(res.hasLocalChanges);
    return res.catalog;
  }, [mode]);

  // Initial boot + URL parsing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hash = window.location.hash;
        if (hash && hash.includes('share=')) {
          try {
            const env = parseShareHash(hash);
            if (env) {
              setShareEnvelope(env);
              if (!env.protected && env.plain) {
                setSharePlain(env.plain);
              }
              setBooting(false);
              return;
            }
          } catch {
            setShareParseError(true);
            setBooting(false);
            return;
          }
        }

        const detected = await detectRuntimeMode();
        if (cancelled) return;
        setMode(detected);
        const cat = await loadCatalog(detected);
        if (cancelled) return;
        setCatalog(cat.catalog);
        setHasLocalChanges(cat.hasLocalChanges);

        const params = new URLSearchParams(window.location.search);
        const qTool = params.get('tool');
        const qBundle = params.get('bundle');
        const qTag = params.get('tag');
        const qTags = params.get('tags');

        if (qTags) {
          setSelectedTags(qTags.split(',').map((s) => s.trim()).filter(Boolean));
        } else if (qTag) {
          setSelectedTags([qTag.trim()]);
        }

        if (qBundle) {
          setActiveBundleId(qBundle);
          setActiveTab('bundles');
        } else if (qTool) {
          setActiveToolId(qTool);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load unlocked tool HTML when activeToolId changes
  const activeTool = catalog.tools.find((tl) => tl.id === activeToolId) || null;
  useEffect(() => {
    if (!activeTool) return;
    if (unlockedTools[activeTool.id]) return;
    if (activeTool.protected) return;

    let cancelled = false;
    getToolHtml(mode, activeTool)
      .then((html) => {
        if (!cancelled) {
          setUnlockedTools((prev) => ({ ...prev, [activeTool.id]: { html } }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeTool, mode, unlockedTools]);

  // Load bundle reader payload when activeBundleId is open and unlocked
  const activeBundle = catalog.bundles.find((b) => b.id === activeBundleId) || null;
  const activeBundleUnlockedPw = activeBundle ? unlockedBundles[activeBundle.id]?.password : undefined;
  const activeBundleUnlockedFlag = Boolean(activeBundle && (!activeBundle.protected || unlockedBundles[activeBundle.id]));
  const activeBundleKey = activeBundle
    ? `${activeBundle.id}:${activeBundle.updatedAt}:${activeBundle.toolIds.join(',')}`
    : '';

  useEffect(() => {
    if (!activeBundle || !activeBundleUnlockedFlag) {
      setBundleReaderData(null);
      return;
    }

    let cancelled = false;
    exportBundleTools(mode, activeBundle, catalog.tools, activeBundleUnlockedPw)
      .then((toolsPayload) => {
        if (!cancelled) {
          setBundleReaderData({
            v: 1,
            bundle: {
              id: activeBundle.id,
              title: activeBundle.title,
              description: activeBundle.description,
              welcomeNote: activeBundle.welcomeNote,
              accent: activeBundle.accent,
              tags: activeBundle.tags,
              createdAt: activeBundle.createdAt,
            },
            tools: toolsPayload,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeBundleKey, activeBundleUnlockedFlag, activeBundleUnlockedPw, mode]);

  // Global drag-and-drop listeners
  useEffect(() => {
    let dragCounter = 0;
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++;
        setDraggingOver(true);
      }
    };
    const onDragLeave = () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) setDraggingOver(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      dragCounter = 0;
      setDraggingOver(false);
      if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
      const htmlFiles = Array.from(e.dataTransfer.files).filter(
        (f) => /\.html?$/i.test(f.name) || f.type === 'text/html',
      );
      if (htmlFiles.length > 0) {
        e.preventDefault();
        setUploadState({ open: true, mode: 'file', files: htmlFiles });
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const syncUrl = (params: { tool?: string | null; bundle?: string | null; tags?: string[] }) => {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('tool');
    url.searchParams.delete('bundle');
    url.searchParams.delete('tag');
    url.searchParams.delete('tags');
    if (params.tool) url.searchParams.set('tool', params.tool);
    if (params.bundle) url.searchParams.set('bundle', params.bundle);
    if (params.tags && params.tags.length > 0) url.searchParams.set('tags', params.tags.join(','));
    window.history.replaceState({}, '', url.toString());
  };

  const handleOpenTool = (tool: ToolRecord) => {
    setActiveBundleId(null);
    setActiveToolId(tool.id);
    syncUrl({ tool: tool.id });
  };

  const handleOpenBundle = (bundle: BundleRecord) => {
    setActiveToolId(null);
    setActiveBundleId(bundle.id);
    syncUrl({ bundle: bundle.id });
  };

  const handleGoHome = () => {
    setShareEnvelope(null);
    setSharePlain(null);
    setShareParseError(false);
    setActiveToolId(null);
    setActiveBundleId(null);
    setBundleReturnId(null);
    syncUrl({ tags: selectedTags });
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag];
      if (!activeToolId && !activeBundleId) syncUrl({ tags: next });
      return next;
    });
  };

  const handleJumpToTag = (tag: string) => {
    setActiveToolId(null);
    setActiveBundleId(null);
    setActiveTab('library');
    setSelectedTags([tag]);
    syncUrl({ tags: [tag] });
  };

  const handleSaveUploads = async (
    items: PendingUploadItem[],
    password: string,
    passwordHint: string,
    openFirst: boolean,
  ) => {
    let firstCreated: ToolRecord | null = null;
    for (const item of items) {
      const rec = await createTool(mode, {
        title: item.title,
        description: item.description,
        fileName: item.fileName,
        html: item.html,
        tags: item.tags,
        level: item.level,
        accent: item.accent,
        password: password || undefined,
        passwordHint: passwordHint || undefined,
      });
      if (!firstCreated) {
        firstCreated = rec;
        if (openFirst) {
          setUnlockedTools((prev) => ({
            ...prev,
            [rec.id]: { html: item.html, password: password || undefined },
          }));
        }
      }
    }
    await refreshCatalog();
    if (openFirst && firstCreated) {
      handleOpenTool(firstCreated);
    }
  };

  const handleDeleteTool = async (tool: ToolRecord) => {
    if (!window.confirm(t.confirmDeleteTool)) return;
    await deleteTool(mode, tool.id);
    setUnlockedTools((prev) => {
      const copy = { ...prev };
      delete copy[tool.id];
      return copy;
    });
    if (activeToolId === tool.id) handleGoHome();
    await refreshCatalog();
  };

  const handleDeleteBundle = async (bundle: BundleRecord) => {
    if (!window.confirm(t.confirmDeleteBundle)) return;
    await deleteBundle(mode, bundle.id);
    if (activeBundleId === bundle.id) handleGoHome();
    await refreshCatalog();
  };

  const handleDuplicateTool = async (tool: ToolRecord) => {
    if (tool.protected) return;
    const html = unlockedTools[tool.id]?.html || (await getToolHtml(mode, tool));
    await createTool(mode, {
      title: `${tool.title} (Copy)`,
      description: tool.description,
      fileName: tool.fileName,
      html,
      tags: tool.tags,
      level: tool.level,
      accent: tool.accent,
    });
    await refreshCatalog();
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  // 1. Standalone Share Link (#share=...)
  if (shareParseError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] p-6">
        <div className="max-w-md rounded-2xl border border-[#E6E2DA] bg-white p-7 text-center shadow-lg">
          <h2 className="text-lg font-bold text-slate-900">{t.invalidShareTitle}</h2>
          <p className="mt-2 text-sm text-slate-500">{t.invalidShareDesc}</p>
          <button
            type="button"
            onClick={() => {
              window.location.hash = '';
              setShareParseError(false);
              window.location.reload();
            }}
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t.openWorkstation}
          </button>
        </div>
      </div>
    );
  }

  if (shareEnvelope) {
    if (!sharePlain) {
      return (
        <div className="min-h-screen bg-[#FAF8F5]">
          <PasswordGate
            lang={lang}
            kind="bundle"
            title={shareEnvelope.title}
            hint={shareEnvelope.passwordHint}
            onUnlock={async (pw) => {
              const decoded = await decryptShareEnvelope(shareEnvelope, pw);
              setSharePlain(decoded);
            }}
          />
        </div>
      );
    }

    return (
      <BundleReaderView
        lang={lang}
        onToggleLang={toggleLang}
        data={sharePlain}
        onOpenFullWorkstation={() => {
          window.location.hash = '';
          window.location.reload();
        }}
      />
    );
  }

  // 2. Direct Bundle Route (?bundle=...)
  if (activeBundleId && !activeBundle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] p-6">
        <div className="max-w-md rounded-2xl border border-[#E6E2DA] bg-white p-7 text-center shadow-lg">
          <FileQuestion className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">{t.notFoundTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.notFoundDesc}</p>
          <button
            type="button"
            onClick={handleGoHome}
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t.backHomeBtn}
          </button>
        </div>
      </div>
    );
  }

  if (activeBundle) {
    const bundleUnlocked = !activeBundle.protected || Boolean(unlockedBundles[activeBundle.id]);
    if (!bundleUnlocked) {
      return (
        <div className="min-h-screen bg-[#FAF8F5]">
          <Header
            lang={lang}
            onToggleLang={toggleLang}
            activeTab={activeTab}
            onChangeTab={(tab) => {
              setActiveBundleId(null);
              setActiveTab(tab);
              syncUrl({});
            }}
            bundleCount={catalog.bundles.length}
            toolCount={catalog.tools.length}
            mode={mode}
            hasLocalChanges={hasLocalChanges}
            onOpenUpload={() => setUploadState({ open: true, mode: 'file', files: null })}
            onOpenGithub={() => setGithubOpen(true)}
            onGoHome={handleGoHome}
          />
          <PasswordGate
            lang={lang}
            kind="bundle"
            title={activeBundle.title}
            tags={activeBundle.tags}
            hint={activeBundle.passwordHint}
            onUnlock={async (pw) => {
              await unlockBundle(mode, activeBundle, pw);
              setUnlockedBundles((prev) => ({ ...prev, [activeBundle.id]: { password: pw } }));
            }}
            onBack={() => {
              setActiveBundleId(null);
              setActiveTab('bundles');
              syncUrl({});
            }}
          />
        </div>
      );
    }

    if (bundleReaderData) {
      return (
        <BundleReaderView
          lang={lang}
          onToggleLang={toggleLang}
          data={bundleReaderData}
          onOpenFullWorkstation={() => {
            setActiveBundleId(null);
            setActiveTab('library');
            syncUrl({});
          }}
          onUnlockServerTool={async (toolId, pw) => {
            const tl = catalog.tools.find((x) => x.id === toolId);
            if (!tl) throw new Error('Tool not found');
            return unlockTool(mode, tl, pw);
          }}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <Header
        lang={lang}
        onToggleLang={toggleLang}
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveToolId(null);
          setActiveBundleId(null);
          setActiveTab(tab);
          syncUrl({ tags: tab === 'library' ? selectedTags : [] });
        }}
        bundleCount={catalog.bundles.length}
        toolCount={catalog.tools.length}
        mode={mode}
        hasLocalChanges={hasLocalChanges}
        onOpenUpload={() => setUploadState({ open: true, mode: 'file', files: null })}
        onOpenGithub={() => setGithubOpen(true)}
        onGoHome={handleGoHome}
      />

      {activeToolId && !activeTool ? (
        <div className="flex min-h-[70vh] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-[#E6E2DA] bg-white p-7 text-center shadow-lg">
            <FileQuestion className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h2 className="text-lg font-bold text-slate-900">{t.notFoundTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.notFoundDesc}</p>
            <button
              type="button"
              onClick={handleGoHome}
              className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {t.backHomeBtn}
            </button>
          </div>
        </div>
      ) : activeTool ? (
        activeTool.protected && !unlockedTools[activeTool.id] ? (
          <PasswordGate
            lang={lang}
            kind="tool"
            title={activeTool.title}
            tags={activeTool.tags}
            hint={activeTool.passwordHint}
            onUnlock={async (pw) => {
              const html = await unlockTool(mode, activeTool, pw);
              setUnlockedTools((prev) => ({ ...prev, [activeTool.id]: { html, password: pw } }));
            }}
            onBack={handleGoHome}
          />
        ) : unlockedTools[activeTool.id] ? (
          <ToolWorkspace
            lang={lang}
            tool={activeTool}
            html={unlockedTools[activeTool.id].html}
            allTools={catalog.tools}
            backLabel={bundleReturnId ? t.backToBundle : t.backToLibrary}
            onBack={() => {
              if (bundleReturnId) {
                setActiveToolId(null);
                setActiveBundleId(bundleReturnId);
                setBundleReturnId(null);
              } else {
                handleGoHome();
              }
            }}
            onJumpToTag={handleJumpToTag}
            onOpenTool={handleOpenTool}
            onEditSettings={(tl) => setEditingTool(tl)}
            onShareTool={(tl) => setSharingTool(tl)}
            onLockAgain={
              activeTool.protected
                ? () => {
                    setUnlockedTools((prev) => {
                      const copy = { ...prev };
                      delete copy[activeTool.id];
                      return copy;
                    });
                  }
                : undefined
            }
            onSaveNotes={async (id, notes) => {
              const tl = catalog.tools.find((x) => x.id === id);
              if (!tl) return;
              await updateTool(mode, tl, { notes });
              await refreshCatalog();
            }}
            onSaveHtml={async (id, newHtml) => {
              const tl = catalog.tools.find((x) => x.id === id);
              if (!tl) return;
              const pw = unlockedTools[id]?.password;
              await updateTool(mode, tl, { html: newHtml, currentPassword: pw });
              setUnlockedTools((prev) => ({ ...prev, [id]: { html: newHtml, password: pw } }));
              await refreshCatalog();
            }}
          />
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          </div>
        )
      ) : activeTab === 'library' ? (
        <LibraryView
          lang={lang}
          tools={catalog.tools}
          selectedTags={selectedTags}
          onToggleTag={handleToggleTag}
          onClearTags={() => {
            setSelectedTags([]);
            syncUrl({});
          }}
          onOpenTool={handleOpenTool}
          onEditTool={(tl) => setEditingTool(tl)}
          onShareTool={(tl) => setSharingTool(tl)}
          onDuplicateTool={handleDuplicateTool}
          onDeleteTool={handleDeleteTool}
          onAddToBundle={(tl) => {
            if (catalog.bundles.length === 0) {
              setBundleModalState({ open: true, editing: null, preselectToolId: tl.id });
            } else {
              setAddingToBundleTool(tl);
            }
          }}
          onOpenUploadFiles={(fileList) =>
            setUploadState({ open: true, mode: 'file', files: Array.from(fileList) })
          }
          onOpenPasteModal={() => setUploadState({ open: true, mode: 'paste', files: null })}
        />
      ) : (
        <BundlesView
          lang={lang}
          bundles={catalog.bundles}
          tools={catalog.tools}
          onCreateBundle={() =>
            setBundleModalState({ open: true, editing: null, preselectToolId: null })
          }
          onEditBundle={(b) =>
            setBundleModalState({ open: true, editing: b, preselectToolId: null })
          }
          onDeleteBundle={handleDeleteBundle}
          onOpenBundle={handleOpenBundle}
          onShareBundle={(b) => setSharingBundle(b)}
        />
      )}

      {/* Drag & Drop Fullscreen Overlay */}
      {draggingOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/50 p-6 backdrop-blur-xs">
          <div className="flex max-w-md flex-col items-center rounded-3xl border-2 border-dashed border-white bg-indigo-600/95 px-10 py-12 text-center text-white shadow-2xl">
            <FileUp className="mb-3 h-12 w-12" />
            <div className="text-xl font-bold">{t.dropOverlayTitle}</div>
            <div className="mt-1 text-sm text-indigo-100">{t.dropOverlaySub}</div>
          </div>
        </div>
      )}

      {uploadState.open && (
        <UploadModal
          lang={lang}
          initialMode={uploadState.mode}
          initialFiles={uploadState.files}
          onClose={() => setUploadState({ open: false, mode: 'file', files: null })}
          onSaveItems={handleSaveUploads}
        />
      )}

      {editingTool && (
        <EditToolModal
          lang={lang}
          tool={editingTool}
          sessionPassword={unlockedTools[editingTool.id]?.password}
          onClose={() => setEditingTool(null)}
          onSave={async (patch) => {
            await updateTool(mode, editingTool, patch);
            if (patch.newPassword === null) {
              setUnlockedTools((prev) => {
                const copy = { ...prev };
                if (copy[editingTool.id]) copy[editingTool.id] = { html: copy[editingTool.id].html };
                return copy;
              });
            } else if (typeof patch.newPassword === 'string' && patch.newPassword.length > 0) {
              setUnlockedTools((prev) => {
                const copy = { ...prev };
                if (copy[editingTool.id]) {
                  copy[editingTool.id] = { html: copy[editingTool.id].html, password: patch.newPassword! };
                }
                return copy;
              });
            }
            await refreshCatalog();
          }}
        />
      )}

      {bundleModalState.open && (
        <BundleModal
          lang={lang}
          tools={catalog.tools}
          editingBundle={bundleModalState.editing}
          preselectedToolId={bundleModalState.preselectToolId}
          sessionBundlePassword={
            bundleModalState.editing ? unlockedBundles[bundleModalState.editing.id]?.password : undefined
          }
          onClose={() => setBundleModalState({ open: false, editing: null, preselectToolId: null })}
          onSave={async (payload) => {
            if (bundleModalState.editing) {
              await updateBundle(mode, bundleModalState.editing, payload);
            } else {
              await createBundle(mode, payload);
            }
            setActiveTab('bundles');
            await refreshCatalog();
          }}
        />
      )}

      {sharingBundle && (
        <ShareBundleModal
          lang={lang}
          mode={mode}
          bundle={sharingBundle}
          allTools={catalog.tools}
          sessionBundlePassword={unlockedBundles[sharingBundle.id]?.password}
          onClose={() => setSharingBundle(null)}
        />
      )}

      {sharingTool && (
        <ShareToolModal
          lang={lang}
          mode={mode}
          tool={sharingTool}
          onClose={() => setSharingTool(null)}
        />
      )}

      {addingToBundleTool && (
        <AddToBundleModal
          lang={lang}
          tool={addingToBundleTool}
          bundles={catalog.bundles}
          onClose={() => setAddingToBundleTool(null)}
          onAddToExisting={async (bundle) => {
            if (!bundle.toolIds.includes(addingToBundleTool.id)) {
              await updateBundle(mode, bundle, {
                toolIds: [...bundle.toolIds, addingToBundleTool.id],
              });
              await refreshCatalog();
            }
          }}
          onCreateNew={() =>
            setBundleModalState({
              open: true,
              editing: null,
              preselectToolId: addingToBundleTool.id,
            })
          }
        />
      )}

      {githubOpen && (
        <GitHubSyncModal
          lang={lang}
          mode={mode}
          hasLocalChanges={hasLocalChanges}
          onClose={() => setGithubOpen(false)}
          onPublished={async () => {
            await refreshCatalog();
          }}
          onRescanServer={async () => {
            const res = await rescanDropFolder(mode);
            setCatalog(res.catalog);
            return res.imported;
          }}
        />
      )}
    </div>
  );
}
