import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Trash2, X } from 'lucide-react';
import {
  deleteColumnAndHandleTasks,
  reorderColumn,
  updateColumnDetails,
} from '../lib/kanbanService';
import { LIMITS, type Column, type Task } from '../types/kanban';

interface ColumnSettingsModalProps {
  boardId: string;
  column: Column;
  columns: Column[];
  allTasks: Task[];
  onClose: () => void;
}

export function ColumnSettingsModal({
  boardId,
  column,
  columns,
  allTasks,
  onClose,
}: ColumnSettingsModalProps) {
  const [title, setTitle] = useState(column.title);
  const [wipLimit, setWipLimit] = useState(String(column.wipLimit));
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const otherColumns = columns.filter((c) => c.id !== column.id);
  const [moveTargetId, setMoveTargetId] = useState<string>(otherColumns[0]?.id ?? '');

  const columnTasks = allTasks.filter((t) => t.columnId === column.id);
  const currentIndex = columns.findIndex((c) => c.id === column.id);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const parsedWip = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Number(wipLimit) || 0));
      await updateColumnDetails(boardId, column.id, title, parsedWip);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveOrder = async (direction: -1 | 1) => {
    const targetIdx = currentIndex + direction;
    if (targetIdx < 0 || targetIdx >= columns.length || submitting) return;
    setSubmitting(true);
    try {
      const neighbor = columns[targetIdx];
      await Promise.all([
        reorderColumn(boardId, column.id, neighbor.position),
        reorderColumn(boardId, neighbor.id, column.position),
      ]);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const targetId = moveTargetId || null;
      const targetMaxPos = targetId
        ? allTasks
            .filter((t) => t.columnId === targetId)
            .reduce((m, t) => Math.max(m, t.position), 0)
        : 0;
      await deleteColumnAndHandleTasks(
        boardId,
        column.id,
        columnTasks,
        targetId,
        targetMaxPos
      );
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="col-modal-heading"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 id="col-modal-heading" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Column Settings
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

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="col-title-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Column Name
            </label>
            <input
              id="col-title-input"
              type="text"
              autoFocus
              required
              maxLength={LIMITS.COLUMN_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="col-wip-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              WIP Limit (0 for unlimited)
            </label>
            <input
              id="col-wip-input"
              type="number"
              min={0}
              max={LIMITS.COLUMN_WIP_MAX}
              value={wipLimit}
              onChange={(e) => setWipLimit(e.target.value)}
              className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Column Order
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={currentIndex <= 0 || submitting}
                onClick={() => handleMoveOrder(-1)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Move Left</span>
              </button>
              <button
                type="button"
                disabled={currentIndex >= columns.length - 1 || submitting}
                onClick={() => handleMoveOrder(1)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition-colors"
              >
                <span>Move Right</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            {confirmDelete ? (
              <div className="space-y-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3.5">
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  {columnTasks.length > 0
                    ? `This column contains ${columnTasks.length} task${columnTasks.length === 1 ? '' : 's'}.`
                    : 'Delete this empty column?'}
                </p>
                {columnTasks.length > 0 && (
                  <div className="space-y-1">
                    <label htmlFor="move-tasks-target" className="block text-[11px] text-slate-600 dark:text-slate-400">
                      Destination for existing tasks
                    </label>
                    <select
                      id="move-tasks-target"
                      value={moveTargetId}
                      onChange={(e) => setMoveTargetId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                    >
                      {otherColumns.map((c) => (
                        <option key={c.id} value={c.id}>
                          Move tasks to {c.title}
                        </option>
                      ))}
                      <option value="">Delete tasks with column</option>
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400"
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
                <span>Delete column</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {submitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
