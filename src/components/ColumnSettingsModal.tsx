import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  deleteColumnAndHandleTasks,
  reorderColumn,
  sanitizeColumnColorRules,
  updateColumnDetails,
} from '../lib/kanbanService';
import {
  LIMITS,
  type Column,
  type ColumnBgColor,
  type ColumnColorRule,
  type Task,
} from '../types/kanban';

interface ColumnSettingsModalProps {
  boardId: string;
  column: Column;
  columns: Column[];
  allTasks: Task[];
  onClose: () => void;
}

const COLOR_OPTIONS: Array<{ value: ColumnBgColor; label: string; swatchClass: string }> = [
  { value: 'amber', label: 'Yellow / Amber', swatchClass: 'bg-amber-400 border-amber-500' },
  { value: 'red', label: 'Red', swatchClass: 'bg-red-500 border-red-600' },
  { value: 'emerald', label: 'Green', swatchClass: 'bg-emerald-500 border-emerald-600' },
  { value: 'blue', label: 'Blue', swatchClass: 'bg-blue-500 border-blue-600' },
  { value: 'violet', label: 'Purple', swatchClass: 'bg-violet-500 border-violet-600' },
  { value: 'slate', label: 'Slate', swatchClass: 'bg-slate-400 border-slate-500' },
];

export function ColumnSettingsModal({
  boardId,
  column,
  columns,
  allTasks,
  onClose,
}: ColumnSettingsModalProps) {
  const [title, setTitle] = useState(column.title);
  const [wipLimit, setWipLimit] = useState(String(column.wipLimit));
  const [colorRules, setColorRules] = useState<ColumnColorRule[]>(() =>
    sanitizeColumnColorRules(column.colorRules)
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const otherColumns = columns.filter((c) => c.id !== column.id);
  const [moveTargetId, setMoveTargetId] = useState<string>(otherColumns[0]?.id ?? '');

  const columnTasks = allTasks.filter((t) => t.columnId === column.id);
  const currentIndex = columns.findIndex((c) => c.id === column.id);
  const parsedWipPreview = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Number(wipLimit) || 0));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleAddColorRule = () => {
    if (colorRules.length >= LIMITS.COLUMN_COLOR_RULES_MAX) return;
    const maxExisting = colorRules.reduce((m, r) => Math.max(m, r.threshold), 0);
    const nextThreshold = Math.min(
      LIMITS.COLUMN_WIP_MAX,
      maxExisting > 0 ? maxExisting + 1 : parsedWipPreview > 1 ? parsedWipPreview - 1 : 3
    );
    const nextColor: ColumnBgColor =
      parsedWipPreview > 0 && nextThreshold >= parsedWipPreview ? 'red' : 'amber';
    setColorRules([...colorRules, { threshold: nextThreshold, color: nextColor }]);
  };

  const handleApplyWipPreset = () => {
    if (parsedWipPreview <= 0) return;
    if (parsedWipPreview === 1) {
      setColorRules([{ threshold: 1, color: 'red' }]);
      return;
    }
    setColorRules([
      { threshold: parsedWipPreview - 1, color: 'amber' },
      { threshold: parsedWipPreview, color: 'red' },
    ]);
  };

  const handleUpdateRule = (index: number, patch: Partial<ColumnColorRule>) => {
    setColorRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    );
  };

  const handleRemoveRule = (index: number) => {
    setColorRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const parsedWip = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Number(wipLimit) || 0));
      await updateColumnDetails(boardId, column.id, title, parsedWip, colorRules);
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
        className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
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

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
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
                WIP Limit (0 = none)
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
          </div>

          {/* Task-Level Background Color Rules */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Task-Level Background Colors
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Highlight this column when its task count reaches specific levels (e.g. yellow before max, red at max).
                </p>
              </div>
              {parsedWipPreview > 0 && (
                <button
                  type="button"
                  onClick={handleApplyWipPreset}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-md whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Use WIP thresholds</span>
                </button>
              )}
            </div>

            {colorRules.length > 0 ? (
              <div className="space-y-2">
                {colorRules.map((rule, idx) => {
                  const swatch =
                    COLOR_OPTIONS.find((c) => c.value === rule.color)?.swatchClass ??
                    'bg-amber-400 border-amber-500';
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50"
                    >
                      <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        Tasks ≥
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={LIMITS.COLUMN_WIP_MAX}
                        aria-label={`Task count threshold for rule ${idx + 1}`}
                        value={rule.threshold}
                        onChange={(e) =>
                          handleUpdateRule(idx, {
                            threshold: Math.max(
                              1,
                              Math.min(LIMITS.COLUMN_WIP_MAX, Number(e.target.value) || 1)
                            ),
                          })
                        }
                        className="w-16 px-2.5 py-1 text-xs font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <span className={`w-3.5 h-3.5 rounded-sm border shrink-0 ${swatch}`} />
                      <select
                        value={rule.color}
                        aria-label={`Background color for rule ${idx + 1}`}
                        onChange={(e) =>
                          handleUpdateRule(idx, { color: e.target.value as ColumnBgColor })
                        }
                        className="flex-1 px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {COLOR_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        aria-label={`Remove color rule ${idx + 1}`}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No level color rules configured. Column uses the default neutral surface.
              </p>
            )}

            {colorRules.length < LIMITS.COLUMN_COLOR_RULES_MAX && (
              <button
                type="button"
                onClick={handleAddColorRule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add level rule</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
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
