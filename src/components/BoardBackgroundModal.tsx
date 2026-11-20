import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, Image as ImageIcon, ImageOff, Settings2, Sparkles, X } from 'lucide-react';
import { resolveSafeBoardBackgroundUrl } from '../lib/boardBackgrounds';
import { updateBoardAppearance } from '../lib/kanbanService';
import type { Board, BoardBackground } from '../types/kanban';

interface BoardBackgroundModalProps {
  board: Board;
  backgrounds: BoardBackground[];
  canEdit: boolean;
  isAdmin: boolean;
  draftValues?: {
    backgroundImageUrl: string;
    surfaceOpacityEnabled: boolean;
    surfaceOpacity: number;
  };
  onApplyDraft?: (next: {
    backgroundImageUrl: string;
    surfaceOpacityEnabled: boolean;
    surfaceOpacity: number;
  }) => void;
  onOpenAdminBackgrounds?: () => void;
  onClose: () => void;
}

export function BoardBackgroundModal({
  board,
  backgrounds,
  canEdit,
  isAdmin,
  draftValues,
  onApplyDraft,
  onOpenAdminBackgrounds,
  onClose,
}: BoardBackgroundModalProps) {
  const [selectedUrl, setSelectedUrl] = useState(
    draftValues ? draftValues.backgroundImageUrl : (board.backgroundImageUrl ?? '')
  );
  const [surfaceOpacityEnabled, setSurfaceOpacityEnabled] = useState(
    draftValues ? draftValues.surfaceOpacityEnabled : Boolean(board.surfaceOpacityEnabled)
  );
  const [surfaceOpacity, setSurfaceOpacity] = useState(
    draftValues
      ? draftValues.surfaceOpacity
      : typeof board.surfaceOpacity === 'number'
        ? board.surfaceOpacity
        : 80
  );
  const [brokenThumbIds, setBrokenThumbIds] = useState<Record<string, boolean>>({});
  const [previewLoadError, setPreviewLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeCatalog = useMemo(
    () => backgrounds.filter((bg) => bg.active),
    [backgrounds]
  );

  const normalizedSelectedUrl = selectedUrl.trim();
  const safePreviewUrl = useMemo(
    () => resolveSafeBoardBackgroundUrl(normalizedSelectedUrl),
    [normalizedSelectedUrl]
  );

  const selectedMatchesCatalog = useMemo(
    () => activeCatalog.some((bg) => bg.imageUrl.trim() === normalizedSelectedUrl),
    [activeCatalog, normalizedSelectedUrl]
  );

  const hasLegacyOrCustomSelection = Boolean(normalizedSelectedUrl && !selectedMatchesCatalog);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSelectUrl = (nextUrl: string) => {
    if (!canEdit) return;
    setSelectedUrl(nextUrl);
    setPreviewLoadError(false);
    setErrorMsg(null);
  };

  const handleSave = async () => {
    if (!canEdit || saving) return;
    if (onApplyDraft) {
      onApplyDraft({
        backgroundImageUrl: normalizedSelectedUrl,
        surfaceOpacityEnabled,
        surfaceOpacity,
      });
      onClose();
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await updateBoardAppearance(board.id, {
        backgroundImageUrl: normalizedSelectedUrl,
        surfaceOpacityEnabled,
        surfaceOpacity,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save board background.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/55"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-bg-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-xl"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="board-bg-modal-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Board Background
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Choose an admin-approved background for &ldquo;{board.title}&rdquo;.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close background picker"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5"
            >
              {errorMsg}
            </div>
          )}

          {!canEdit && (
            <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3.5 py-2.5">
              This board is archived. Only workspace administrators can change an archived board&apos;s background.
            </div>
          )}

          {/* Admin-Curated Background Gallery */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Available Workspace Backgrounds
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Curated by workspace administrators.
                </p>
              </div>
              {isAdmin && onOpenAdminBackgrounds && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdminBackgrounds();
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>Manage Library</span>
                </button>
              )}
            </div>

            {activeCatalog.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/40 p-6 text-center space-y-2.5">
                <ImageIcon className="w-6 h-6 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    No active backgrounds configured yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {isAdmin
                      ? 'Add build-bundled images or external image URLs in the Admin Workspace to make them available here.'
                      : 'Ask a workspace administrator to enable background pictures in the Admin Workspace.'}
                  </p>
                </div>
                {isAdmin && onOpenAdminBackgrounds && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdminBackgrounds();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Open Admin Background Library</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Default / None Card */}
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => handleSelectUrl('')}
                  className={`group text-left rounded-xl border p-2 transition-colors disabled:opacity-60 ${
                    normalizedSelectedUrl === ''
                      ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950/40'
                  }`}
                >
                  <div className="aspect-video w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center justify-center relative overflow-hidden">
                    <div className="flex flex-col items-center gap-1 text-slate-500 dark:text-slate-400">
                      <ImageOff className="w-4 h-4" />
                      <span className="text-[11px] font-medium">Default Canvas</span>
                    </div>
                    {normalizedSelectedUrl === '' && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="pt-2 px-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      No Background
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                      Solid
                    </span>
                  </div>
                </button>

                {activeCatalog.map((bg) => {
                  const thumbUrl = resolveSafeBoardBackgroundUrl(bg.imageUrl);
                  const isSelected = normalizedSelectedUrl === bg.imageUrl.trim();
                  const isBroken = Boolean(brokenThumbIds[bg.id]);

                  return (
                    <button
                      key={bg.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleSelectUrl(bg.imageUrl.trim())}
                      className={`group text-left rounded-xl border p-2 transition-colors disabled:opacity-60 ${
                        isSelected
                          ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/40 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950/40'
                      }`}
                    >
                      <div className="aspect-video w-full rounded-lg bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
                        {thumbUrl && !isBroken ? (
                          <img
                            src={thumbUrl}
                            alt={bg.label}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenThumbIds((prev) => ({ ...prev, [bg.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-400 p-2 text-center">
                            <ImageOff className="w-4 h-4" />
                            <span className="text-[10px]">Unavailable</span>
                          </div>
                        )}
                        {isSelected && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="pt-2 px-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {bg.label}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {bg.sourceType === 'build' ? 'Built-in' : 'Web'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {hasLegacyOrCustomSelection && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Current custom background preserved:
                  </span>{' '}
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                    {normalizedSelectedUrl}
                  </span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleSelectUrl('')}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    Clear custom background
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Column & Card Opacity + Live Canvas Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Column &amp; Card Opacity
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Make columns and task cards translucent so the board picture shows through.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={surfaceOpacityEnabled}
                aria-label="Toggle column and task card opacity"
                disabled={!canEdit}
                onClick={() => setSurfaceOpacityEnabled((prev) => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${
                  surfaceOpacityEnabled
                    ? 'bg-blue-600'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    surfaceOpacityEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className={`space-y-1.5 ${surfaceOpacityEnabled ? 'opacity-100' : 'opacity-50'}`}>
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="modal-bg-surface-opacity"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  Surface Opacity
                </label>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {surfaceOpacity}%
                </span>
              </div>
              <input
                id="modal-bg-surface-opacity"
                type="range"
                min={0}
                max={100}
                step={1}
                disabled={!canEdit || !surfaceOpacityEnabled}
                value={surfaceOpacity}
                onChange={(e) => setSurfaceOpacity(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>

            <div
              style={
                {
                  '--preview-bg-image':
                    safePreviewUrl && !previewLoadError ? `url("${safePreviewUrl}")` : 'none',
                  '--board-surface-alpha': `${surfaceOpacityEnabled ? surfaceOpacity : 100}%`,
                } as CSSProperties
              }
              className={`relative rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-100 dark:bg-slate-950 overflow-hidden ${
                safePreviewUrl && !previewLoadError
                  ? 'bg-cover bg-center [background-image:var(--preview-bg-image)]'
                  : ''
              } ${surfaceOpacityEnabled ? 'board-translucent-surfaces' : ''}`}
            >
              {safePreviewUrl && (
                <img
                  src={safePreviewUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="hidden"
                  onLoad={() => setPreviewLoadError(false)}
                  onError={() => setPreviewLoadError(true)}
                />
              )}
              <div className="flex items-start gap-3">
                <div className="cadence-kanban-column bg-slate-100/80 dark:bg-slate-900/50 border border-slate-200/90 dark:border-slate-800 rounded-lg p-2.5 w-52 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                    In Progress
                  </div>
                  <div className="cadence-task-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2 space-y-0.5">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      Review design specs
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Opacity {surfaceOpacityEnabled ? `${surfaceOpacity}%` : 'Default'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {safePreviewUrl && previewLoadError && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Preview image could not be loaded. If this is a newly added build file, rebuild and deploy the app so it is bundled into dist/.
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg whitespace-nowrap"
          >
            Cancel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {saving
                ? 'Saving...'
                : onApplyDraft
                  ? 'Use Selected Background'
                  : 'Apply Background'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
