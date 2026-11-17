import { useEffect, useState, type CSSProperties } from 'react';
import { Archive, Image as ImageIcon, Trash2, X } from 'lucide-react';
import {
  archiveBoard,
  createBoard,
  deleteBoard,
  updateBoardDetails,
} from '../lib/kanbanService';
import { BOARD_TEMPLATES, LIMITS, type Board, type BoardTemplate } from '../types/kanban';

interface BoardModalProps {
  uid: string;
  ownerDisplayName?: string;
  mode: 'create' | 'edit';
  board?: Board;
  isAdmin: boolean;
  canCreateBoards: boolean;
  onCreated: (boardId: string) => void;
  onDeleted: (deletedBoardId: string) => void;
  onClose: () => void;
}

function getSafePreviewUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^https?:\/\/[^\s]+$/i.test(trimmed)) return null;
  try {
    return new URL(trimmed).href;
  } catch {
    return null;
  }
}

export function BoardModal({
  uid,
  ownerDisplayName,
  mode,
  board,
  isAdmin,
  canCreateBoards,
  onCreated,
  onDeleted,
  onClose,
}: BoardModalProps) {
  const [title, setTitle] = useState(mode === 'edit' && board ? board.title : '');
  const [description, setDescription] = useState(
    mode === 'edit' && board ? board.description : ''
  );
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(
    mode === 'edit' && board ? (board.backgroundImageUrl ?? '') : ''
  );
  const [surfaceOpacityEnabled, setSurfaceOpacityEnabled] = useState(
    mode === 'edit' && board ? Boolean(board.surfaceOpacityEnabled) : false
  );
  const [surfaceOpacity, setSurfaceOpacity] = useState(
    mode === 'edit' && board && typeof board.surfaceOpacity === 'number'
      ? board.surfaceOpacity
      : 80
  );
  const [previewLoadError, setPreviewLoadError] = useState(false);

  const [template, setTemplate] = useState<BoardTemplate>('standard');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isArchived = mode === 'edit' && board?.status === 'archived';
  const canEditBoard =
    (mode === 'create' && (isAdmin || canCreateBoards)) ||
    (mode === 'edit' && Boolean(board) && (isAdmin || (board!.ownerId === uid && !isArchived)));

  const safePreviewUrl = getSafePreviewUrl(backgroundImageUrl);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting || !canEditBoard) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (mode === 'create') {
        const newId = await createBoard(uid, title, description, template, false, ownerDisplayName);
        onCreated(newId);
        onClose();
      } else if (board) {
        await updateBoardDetails(board.id, title, description, {
          backgroundImageUrl,
          surfaceOpacityEnabled,
          surfaceOpacity,
        });
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save board.');
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!board || isArchived || submitting || !canEditBoard) return;
    setSubmitting(true);
    try {
      await archiveBoard(board.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to archive board.');
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!board || submitting || (!isAdmin && board.ownerId !== uid)) return;
    setSubmitting(true);
    try {
      await deleteBoard(board.id);
      onDeleted(board.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete board.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-modal-heading"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 id="board-modal-heading" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'create' ? 'Create Board' : 'Board Settings'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5">
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="board-title-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Board Name
            </label>
            <input
              id="board-title-input"
              type="text"
              autoFocus
              required
              disabled={!canEditBoard}
              maxLength={LIMITS.BOARD_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Mobile App v2"
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="board-desc-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Description
            </label>
            <textarea
              id="board-desc-input"
              rows={2}
              disabled={!canEditBoard}
              maxLength={LIMITS.BOARD_DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional scope or team goals..."
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
            />
          </div>

          {mode === 'create' && (
            <div className="space-y-1.5">
              <label htmlFor="board-template-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Column Template
              </label>
              <select
                id="board-template-select"
                value={template}
                onChange={(e) => setTemplate(e.target.value as BoardTemplate)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {(Object.keys(BOARD_TEMPLATES) as BoardTemplate[]).map((key) => (
                  <option key={key} value={key}>
                    {BOARD_TEMPLATES[key].label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'edit' && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="board-bg-url-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Board Background Image URL
                </label>
                <div className="relative flex items-center">
                  <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    id="board-bg-url-input"
                    type="url"
                    disabled={!canEditBoard}
                    maxLength={LIMITS.BOARD_BG_URL_MAX}
                    value={backgroundImageUrl}
                    onChange={(e) => {
                      setBackgroundImageUrl(e.target.value);
                      setPreviewLoadError(false);
                    }}
                    placeholder="https://example.com/wallpaper.jpg"
                    className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  />
                  {backgroundImageUrl && canEditBoard && (
                    <button
                      type="button"
                      onClick={() => {
                        setBackgroundImageUrl('');
                        setPreviewLoadError(false);
                      }}
                      aria-label="Clear background image URL"
                      className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Applies only to this board&apos;s canvas. Leave empty for the default workspace background.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Column &amp; Card Opacity
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Make columns and task cards translucent to show the board image.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={surfaceOpacityEnabled}
                    aria-label="Toggle column and task card opacity"
                    disabled={!canEditBoard}
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
                      htmlFor="board-surface-opacity-slider"
                      className="font-medium text-slate-700 dark:text-slate-300"
                    >
                      Background opacity
                    </label>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {surfaceOpacity}%
                    </span>
                  </div>
                  <input
                    id="board-surface-opacity-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!canEditBoard || !surfaceOpacityEnabled}
                    value={surfaceOpacity}
                    onChange={(e) => setSurfaceOpacity(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>

                {(safePreviewUrl || surfaceOpacityEnabled) && (
                  <div
                    style={
                      {
                        '--preview-bg-image': safePreviewUrl && !previewLoadError ? `url("${safePreviewUrl}")` : 'none',
                        '--board-surface-alpha': `${surfaceOpacityEnabled ? surfaceOpacity : 100}%`,
                      } as CSSProperties
                    }
                    className={`relative rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-100 dark:bg-slate-950 overflow-hidden ${
                      safePreviewUrl && !previewLoadError ? 'bg-cover bg-center [background-image:var(--preview-bg-image)]' : ''
                    } ${surfaceOpacityEnabled ? 'board-translucent-surfaces' : ''}`}
                  >
                    {safePreviewUrl && (
                      <img
                        src={safePreviewUrl}
                        alt=""
                        className="hidden"
                        onLoad={() => setPreviewLoadError(false)}
                        onError={() => setPreviewLoadError(true)}
                      />
                    )}
                    <div className="cadence-kanban-column bg-slate-100/80 dark:bg-slate-900/50 border border-slate-200/90 dark:border-slate-800 rounded-lg p-2.5 max-w-[220px] space-y-2">
                      <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                        Preview Column
                      </div>
                      <div className="cadence-task-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2 space-y-0.5">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          Sample task card
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Opacity {surfaceOpacityEnabled ? `${surfaceOpacity}%` : 'Default'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {safePreviewUrl && previewLoadError && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Could not load image preview from this URL. Check that it points directly to an accessible image.
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === 'edit' && board && (isAdmin || board.ownerId === uid) && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              {!isArchived && (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archive board (read-only)</span>
                </button>
              )}

              {confirmDelete ? (
                <div className="flex items-center justify-between gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">
                    Delete board and all tasks?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={submitting}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete board permanently</span>
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg whitespace-nowrap"
            >
              Close
            </button>
            {canEditBoard && (
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {submitting ? 'Saving...' : mode === 'create' ? 'Create board' : 'Save changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
