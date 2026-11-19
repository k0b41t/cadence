import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { formatRgbLabel, parseColumnColorToRgb, rgbToHex } from '../lib/colorUtils';
import {
  deleteColumnAndHandleTasks,
  reorderColumn,
  sanitizeColumnColorRules,
  updateColumnDetails,
} from '../lib/kanbanService';
import {
  isColumnReviewGated,
  LIMITS,
  type Column,
  type ColumnBgColor,
  type ColumnColorRule,
  type Task,
} from '../types/kanban';
import { RgbPalettePicker } from './RgbPalettePicker';

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
  const [colorRules, setColorRules] = useState<ColumnColorRule[]>(() =>
    sanitizeColumnColorRules(column.colorRules)
  );
  const [expandedRuleIndex, setExpandedRuleIndex] = useState<number | null>(() =>
    column.colorRules && column.colorRules.length > 0 ? 0 : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const otherColumns = columns.filter((c) => c.id !== column.id);
  const [moveTargetId, setMoveTargetId] = useState<string>(otherColumns[0]?.id ?? '');
  const [autoMoveOnComplete, setAutoMoveOnComplete] = useState<boolean>(
    Boolean(column.autoMoveOnComplete)
  );
  const [autoMoveTargetColumnId, setAutoMoveTargetColumnId] = useState<string>(() =>
    otherColumns.some((c) => c.id === column.autoMoveTargetColumnId)
      ? (column.autoMoveTargetColumnId ?? '')
      : ''
  );
  const [requireReviewBeforeMove, setRequireReviewBeforeMove] = useState<boolean>(() =>
    isColumnReviewGated(column)
  );

  const columnTasks = allTasks.filter((t) => t.columnId === column.id);
  const currentIndex = columns.findIndex((c) => c.id === column.id);
  const nextColumn =
    currentIndex >= 0 && currentIndex + 1 < columns.length ? columns[currentIndex + 1] : null;
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
      parsedWipPreview > 0 && nextThreshold >= parsedWipPreview ? '#ef4444' : '#f59e0b';
    const nextIdx = colorRules.length;
    setColorRules([...colorRules, { threshold: nextThreshold, color: nextColor }]);
    setExpandedRuleIndex(nextIdx);
  };

  const handleApplyWipPreset = () => {
    if (parsedWipPreview <= 0) return;
    if (parsedWipPreview === 1) {
      setColorRules([{ threshold: 1, color: '#ef4444' }]);
      setExpandedRuleIndex(0);
      return;
    }
    setColorRules([
      { threshold: parsedWipPreview - 1, color: '#f59e0b' },
      { threshold: parsedWipPreview, color: '#ef4444' },
    ]);
    setExpandedRuleIndex(0);
  };

  const handleUpdateRule = (index: number, patch: Partial<ColumnColorRule>) => {
    setColorRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    );
  };

  const handleRemoveRule = (index: number) => {
    setColorRules((prev) => prev.filter((_, i) => i !== index));
    setExpandedRuleIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const parsedWip = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Number(wipLimit) || 0));
      await updateColumnDetails(boardId, column.id, title, parsedWip, colorRules, {
        autoMoveOnComplete,
        autoMoveTargetColumnId,
        requireReviewBeforeMove,
      });
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
                  const rgb = parseColumnColorToRgb(rule.color);
                  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
                  const isExpanded = expandedRuleIndex === idx;
                  return (
                    <div
                      key={idx}
                      style={
                        {
                          '--rule-rgb': `${rgb.r}, ${rgb.g}, ${rgb.b}`,
                          '--rule-hex': hex,
                        } as CSSProperties
                      }
                      className="px-3 py-2 rounded-lg border transition-colors bg-[rgba(var(--rule-rgb),0.12)] dark:bg-[rgba(var(--rule-rgb),0.20)] border-[rgba(var(--rule-rgb),0.45)] dark:border-[rgba(var(--rule-rgb),0.50)]"
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
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
                        </div>

                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => setExpandedRuleIndex(isExpanded ? null : idx)}
                            aria-expanded={isExpanded}
                            aria-label={`Pick custom RGB color for rule ${idx + 1}`}
                            className="inline-flex items-center gap-2 px-2.5 py-1 text-xs bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <span
                              aria-hidden="true"
                              className="w-4 h-4 rounded-sm border border-slate-300 dark:border-slate-600 bg-[color:var(--rule-hex)] shrink-0"
                            />
                            <span className="font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-200">
                              rgb({formatRgbLabel(rule.color)})
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            aria-label={`Remove color rule ${idx + 1}`}
                            className="p-1 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <RgbPalettePicker
                          color={rule.color}
                          ruleIndex={idx}
                          onChange={(nextHex) => handleUpdateRule(idx, { color: nextHex })}
                        />
                      )}
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

          {/* Checklist Automation */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Checklist Automation
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Optionally move cards forward when every subtask on their checklist is marked complete.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoMoveOnComplete}
                onChange={(e) => setAutoMoveOnComplete(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
              />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                Auto-move tasks when all subtasks are checked
              </span>
            </label>

            {autoMoveOnComplete && (
              <div className="space-y-1.5 pl-6">
                <label
                  htmlFor="col-automove-target"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                >
                  Destination column
                </label>
                <select
                  id="col-automove-target"
                  value={autoMoveTargetColumnId}
                  onChange={(e) => setAutoMoveTargetColumnId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">
                    Next column ({nextColumn ? nextColumn.title : 'none after this column'})
                  </option>
                  {otherColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      Specific column: {c.title}
                    </option>
                  ))}
                </select>
                {!autoMoveTargetColumnId && !nextColumn && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    This is currently the last column. Tasks will auto-move only if another column is placed to the right or a specific column is selected.
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/70">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requireReviewBeforeMove}
                  onChange={(e) => setRequireReviewBeforeMove(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-600"
                />
                <span className="space-y-0.5">
                  <span className="block text-xs font-medium text-slate-800 dark:text-slate-200">
                    Require &ldquo;Reviewed&rdquo; sign-off before moving tasks here
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Blocks dragging, editing, or auto-moving unreviewed tasks into this column (enabled by default for Done columns).
                  </span>
                </span>
              </label>
            </div>
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
