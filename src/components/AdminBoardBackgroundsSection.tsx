import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Image as ImageIcon,
  ImageOff,
  Link2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatBackgroundLabelFromFileName,
  getBundledBackgroundAssets,
  resolveSafeBoardBackgroundUrl,
  sanitizeBuildAssetFileName,
} from '../lib/boardBackgrounds';
import {
  createBoardBackground,
  deleteBoardBackground,
  includeBundledBoardBackgrounds,
  updateBoardBackground,
} from '../lib/kanbanService';
import { LIMITS, type BoardBackground } from '../types/kanban';

interface AdminBoardBackgroundsSectionProps {
  uid: string;
  backgrounds: BoardBackground[];
}

interface StagedBuildFile {
  id: string;
  file: File;
  safeFileName: string;
  canonicalPath: string;
  label: string;
  previewObjectUrl: string;
}

export function AdminBoardBackgroundsSection({
  uid,
  backgrounds,
}: AdminBoardBackgroundsSectionProps) {
  const bundledAssets = useMemo(() => getBundledBackgroundAssets(), []);

  const [urlLabelInput, setUrlLabelInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [brokenIds, setBrokenIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedBuildFile[]>([]);
  const stagedFilesRef = useRef<StagedBuildFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    stagedFilesRef.current = stagedFiles;
  }, [stagedFiles]);

  useEffect(() => {
    return () => {
      stagedFilesRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewObjectUrl);
      });
    };
  }, []);

  const catalogByUrl = useMemo(() => {
    const map = new Map<string, BoardBackground>();
    backgrounds.forEach((bg) => {
      map.set(bg.imageUrl.trim(), bg);
    });
    return map;
  }, [backgrounds]);

  const unaddedBundledAssets = useMemo(
    () => bundledAssets.filter((asset) => !catalogByUrl.has(asset.canonicalPath)),
    [bundledAssets, catalogByUrl]
  );

  const activeCount = useMemo(
    () => backgrounds.filter((bg) => bg.active).length,
    [backgrounds]
  );
  const hiddenCount = backgrounds.length - activeCount;

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  const handleIncludeAllBuildFiles = async () => {
    if (busy || unaddedBundledAssets.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const added = await includeBundledBoardBackgrounds(
        uid,
        unaddedBundledAssets.map((a) => ({
          label: a.suggestedLabel,
          imageUrl: a.canonicalPath,
        })),
        backgrounds
      );
      setFeedback({
        kind: 'success',
        text: `Added ${added} build ${added === 1 ? 'background' : 'backgrounds'} to the user picker catalog.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to include build backgrounds.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddSingleBundled = async (label: string, canonicalPath: string) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const maxSort = backgrounds.reduce((m, b) => Math.max(m, b.sortOrder ?? 0), 0);
      await createBoardBackground(uid, {
        label,
        imageUrl: canonicalPath,
        sourceType: 'build',
        active: true,
        sortOrder: maxSort + 100,
      });
      setFeedback({
        kind: 'success',
        text: `Added "${label}" from the build to the picker catalog.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to add build background.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddUrlBackground = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !urlLabelInput.trim() || !urlInput.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const maxSort = backgrounds.reduce((m, b) => Math.max(m, b.sortOrder ?? 0), 0);
      const label = urlLabelInput.trim();
      await createBoardBackground(uid, {
        label,
        imageUrl: urlInput.trim(),
        sourceType: 'url',
        active: true,
        sortOrder: maxSort + 100,
      });
      setUrlLabelInput('');
      setUrlInput('');
      setFeedback({
        kind: 'success',
        text: `Added "${label}" to the board background catalog.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to add background URL.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (bg: BoardBackground) => {
    setFeedback(null);
    try {
      await updateBoardBackground(bg.id, bg, { active: !bg.active });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to update background visibility.',
      });
    }
  };

  const handleSaveRename = async (bg: BoardBackground) => {
    const clean = editingLabel.trim();
    if (!clean) return;
    setFeedback(null);
    try {
      await updateBoardBackground(bg.id, bg, { label: clean });
      setEditingId(null);
      setEditingLabel('');
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to rename background.',
      });
    }
  };

  const handleMoveOrder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= backgrounds.length) return;
    const current = backgrounds[index];
    const swapWith = backgrounds[targetIndex];
    const currentOrder = current.sortOrder ?? (index + 1) * 100;
    const swapOrder = swapWith.sortOrder ?? (targetIndex + 1) * 100;
    const nextCurrentOrder = currentOrder === swapOrder ? targetIndex * 100 + 100 : swapOrder;
    const nextSwapOrder = currentOrder === swapOrder ? index * 100 + 100 : currentOrder;

    setFeedback(null);
    try {
      await Promise.all([
        updateBoardBackground(current.id, current, { sortOrder: nextCurrentOrder }),
        updateBoardBackground(swapWith.id, swapWith, { sortOrder: nextSwapOrder }),
      ]);
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to reorder backgrounds.',
      });
    }
  };

  const handleDeleteBackground = async (bg: BoardBackground) => {
    setFeedback(null);
    try {
      await deleteBoardBackground(bg.id);
      setBrokenIds((prev) => {
        const copy = { ...prev };
        delete copy[bg.id];
        return copy;
      });
      setFeedback({
        kind: 'success',
        text: `Removed "${bg.label}" from the catalog.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to remove background.',
      });
    }
  };

  const handleStageLocalFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFeedback(null);
    const rejected: string[] = [];
    const additions: StagedBuildFile[] = [];

    Array.from(fileList).forEach((file) => {
      const safeName = sanitizeBuildAssetFileName(file.name);
      if (!safeName) {
        rejected.push(file.name);
        return;
      }
      const canonicalPath = `/src/assets/backgrounds/${safeName}`;
      additions.push({
        id: `${safeName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        safeFileName: safeName,
        canonicalPath,
        label: formatBackgroundLabelFromFileName(safeName),
        previewObjectUrl: URL.createObjectURL(file),
      });
    });

    if (additions.length > 0) {
      setStagedFiles((prev) => [...prev, ...additions]);
    }
    if (rejected.length > 0) {
      setFeedback({
        kind: 'error',
        text: `Skipped unsupported file(s): ${rejected.join(', ')}. Allowed formats: .jpg, .jpeg, .png, .webp, .avif, .svg.`,
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadRenamedBuildFile = (item: StagedBuildFile) => {
    const a = document.createElement('a');
    a.href = item.previewObjectUrl;
    a.download = item.safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePreRegisterStagedFile = async (item: StagedBuildFile) => {
    if (busy || catalogByUrl.has(item.canonicalPath)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const maxSort = backgrounds.reduce((m, b) => Math.max(m, b.sortOrder ?? 0), 0);
      await createBoardBackground(uid, {
        label: item.label.trim() || formatBackgroundLabelFromFileName(item.safeFileName),
        imageUrl: item.canonicalPath,
        sourceType: 'build',
        active: true,
        sortOrder: maxSort + 100,
      });
      setFeedback({
        kind: 'success',
        text: `Registered "${item.canonicalPath}". Place "${item.safeFileName}" in src/assets/backgrounds/ and rebuild to serve it in production.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to register build background path.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewObjectUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Board Background Library
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set which background pictures Board Creators and Admins can select in the board background modal.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {activeCount} active · {hiddenCount} hidden · {bundledAssets.length} in build
          </span>
          {unaddedBundledAssets.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={handleIncludeAllBuildFiles}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Include All Build Files ({unaddedBundledAssets.length})</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {feedback && (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className={`text-xs rounded-lg px-3.5 py-2.5 border ${
              feedback.kind === 'error'
                ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
                : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Admin-Curated Catalog */}
          <div className="xl:col-span-7 space-y-4">
            <form
              onSubmit={handleAddUrlBackground}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-3"
            >
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Add Hosted Background URL (Live Immediately)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-4">
                  <label
                    htmlFor="admin-bg-url-label"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Display Label
                  </label>
                  <input
                    id="admin-bg-url-label"
                    type="text"
                    maxLength={LIMITS.BOARD_BG_LABEL_MAX}
                    value={urlLabelInput}
                    onChange={(e) => setUrlLabelInput(e.target.value)}
                    placeholder="e.g. Campus Courtyard"
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-8">
                  <label
                    htmlFor="admin-bg-url-value"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Direct Image URL (https://...)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="admin-bg-url-value"
                        type="url"
                        maxLength={LIMITS.BOARD_BG_URL_MAX}
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/backdrop.jpg"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy || !urlLabelInput.trim() || !urlInput.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add URL</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Catalog List */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {backgrounds.length === 0 ? (
                <div className="px-4 py-8 text-center space-y-2">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    No backgrounds in the picker catalog yet.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Add built-in build files from the right panel or paste an image URL above.
                  </p>
                </div>
              ) : (
                backgrounds.map((bg, idx) => {
                  const previewUrl = resolveSafeBoardBackgroundUrl(bg.imageUrl);
                  const isBroken = Boolean(brokenIds[bg.id]);
                  const isEditing = editingId === bg.id;

                  return (
                    <div
                      key={bg.id}
                      className="p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-20 h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center">
                          {previewUrl && !isBroken ? (
                            <img
                              src={previewUrl}
                              alt={bg.label}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenIds((prev) => ({ ...prev, [bg.id]: true }))
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageOff className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                maxLength={LIMITS.BOARD_BG_LABEL_MAX}
                                value={editingLabel}
                                onChange={(e) => setEditingLabel(e.target.value)}
                                className="flex-1 min-w-0 px-2 py-1 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveRename(bg)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded"
                                aria-label="Save background label"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingLabel('');
                                }}
                                className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                aria-label="Cancel rename"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                {bg.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(bg.id);
                                  setEditingLabel(bg.label);
                                }}
                                aria-label={`Rename ${bg.label}`}
                                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            <span
                              className={
                                bg.active
                                  ? 'font-medium text-emerald-600 dark:text-emerald-400'
                                  : 'font-medium text-amber-600 dark:text-amber-400'
                              }
                            >
                              {bg.active ? 'Visible in picker' : 'Hidden'}
                            </span>
                            {' · '}
                            <span>{bg.sourceType === 'build' ? 'Build file' : 'Web URL'}</span>
                            {isBroken && bg.sourceType === 'build' && (
                              <span className="text-amber-600 dark:text-amber-400">
                                {' · Rebuild needed for file'}
                              </span>
                            )}
                          </div>

                          <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate">
                            {bg.imageUrl}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void handleMoveOrder(idx, -1)}
                          aria-label={`Move ${bg.label} up`}
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 disabled:opacity-30 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === backgrounds.length - 1}
                          onClick={() => void handleMoveOrder(idx, 1)}
                          aria-label={`Move ${bg.label} down`}
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 disabled:opacity-30 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleActive(bg)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap"
                        >
                          {bg.active ? (
                            <>
                              <EyeOff className="w-3 h-3" />
                              <span>Hide</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>Show</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeleteBackground(bg)}
                          aria-label={`Remove ${bg.label}`}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Bundled Build Files & Local Build Staging */}
          <div className="xl:col-span-5 space-y-4">
            {/* Files Detected in Current Build */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Files in Current Build
                  </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  {bundledAssets.length}
                </span>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {bundledAssets.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                    No image files found in src/assets/images/ or src/assets/backgrounds/.
                  </div>
                ) : (
                  bundledAssets.map((asset) => {
                    const entry = catalogByUrl.get(asset.canonicalPath);
                    return (
                      <div
                        key={asset.canonicalPath}
                        className="p-3 flex items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img
                            src={asset.resolvedUrl}
                            alt={asset.suggestedLabel}
                            className="w-12 h-8 rounded border border-slate-200 dark:border-slate-800 object-cover shrink-0 bg-slate-100 dark:bg-slate-950"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {asset.suggestedLabel}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {asset.canonicalPath}
                            </div>
                          </div>
                        </div>

                        {entry ? (
                          <span
                            className={`text-[11px] font-medium whitespace-nowrap shrink-0 ${
                              entry.active
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {entry.active ? 'In picker' : 'In catalog (hidden)'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleAddSingleBundled(asset.suggestedLabel, asset.canonicalPath)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add to Picker</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Stage Local Files for Repo Build */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Prepare New Local Files for the Build
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Vite bundles static files from <code className="font-mono text-slate-800 dark:text-slate-200">src/assets/backgrounds/</code> when running <code className="font-mono text-slate-800 dark:text-slate-200">npm run build</code>. Select local images below to normalize filenames, preview, download for your repo folder, and pre-register their paths.
                </p>
              </div>

              <input
                ref={fileInputRef}
                id="admin-stage-bg-files-input"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.avif,.svg,image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
                onChange={(e) => handleStageLocalFiles(e.target.files)}
                className="sr-only"
              />

              <label
                htmlFor="admin-stage-bg-files-input"
                className="flex flex-col items-center justify-center gap-1.5 p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl bg-white dark:bg-slate-950/60 cursor-pointer transition-colors text-center"
              >
                <FilePlus2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Select Local Image Files
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  JPG, PNG, WebP, AVIF, or SVG
                </div>
              </label>

              {stagedFiles.length > 0 && (
                <div className="space-y-2.5">
                  {stagedFiles.map((item) => {
                    const alreadyRegistered = catalogByUrl.has(item.canonicalPath);
                    const pathCopied = copiedKey === `staged:${item.id}`;
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 text-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <img
                            src={item.previewObjectUrl}
                            alt={item.label}
                            className="w-16 h-10 rounded border border-slate-200 dark:border-slate-800 object-cover shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <input
                              type="text"
                              maxLength={LIMITS.BOARD_BG_LABEL_MAX}
                              value={item.label}
                              onChange={(e) =>
                                setStagedFiles((prev) =>
                                  prev.map((f) =>
                                    f.id === item.id ? { ...f, label: e.target.value } : f
                                  )
                                )
                              }
                              aria-label="Staged background label"
                              className="w-full px-2 py-1 text-xs font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {item.canonicalPath}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveStagedFile(item.id)}
                            aria-label={`Discard staged file ${item.safeFileName}`}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDownloadRenamedBuildFile(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap"
                          >
                            <Download className="w-3 h-3" />
                            <span>Save as {item.safeFileName}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopy(`staged:${item.id}`, item.canonicalPath)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap"
                          >
                            {pathCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Copied Path</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Path</span>
                              </>
                            )}
                          </button>

                          {alreadyRegistered ? (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 px-1 whitespace-nowrap">
                              Path Registered
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handlePreRegisterStagedFile(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Pre-Register Path</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
