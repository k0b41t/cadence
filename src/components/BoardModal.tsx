import { useEffect, useState } from 'react';
import { Archive, Trash2, X } from 'lucide-react';
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
  const [template, setTemplate] = useState<BoardTemplate>('standard');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isArchived = mode === 'edit' && board?.status === 'archived';
  const canEditBoard =
    (mode === 'create' && (isAdmin || canCreateBoards)) ||
    (mode === 'edit' && Boolean(board) && (isAdmin || (board!.ownerId === uid && !isArchived)));

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
        await updateBoardDetails(board.id, title, description);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-modal-heading"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
