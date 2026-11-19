import { useState, type CSSProperties, type DragEvent } from 'react';
import { ArrowRightCircle, Plus, Settings2, ShieldCheck } from 'lucide-react';
import { isPresetColumnColor, parseColumnColorToRgb } from '../lib/colorUtils';
import {
  isColumnReviewGated,
  LIMITS,
  type Column,
  type PresetColumnBgColor,
  type Subtask,
  type Task,
} from '../types/kanban';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canManageColumns: boolean;
  assigneeNames: Record<string, string>;
  messageCounts: Record<string, number>;
  subtasksByTask?: Record<string, Subtask[]>;
  draggedTaskId: string | null;
  dropTarget: { columnId: string; index: number } | null;
  isReviewBlockedDrop?: boolean;
  onDragStartTask: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEndTask: () => void;
  onDragOverColumn: (e: DragEvent<HTMLElement>, columnId: string, index: number) => void;
  onDragLeaveColumn: (columnId: string) => void;
  onDropOnColumn: (e: DragEvent<HTMLElement>, columnId: string, index: number) => void;
  onSelectTask: (task: Task) => void;
  onToggleTaskComplete: (task: Task) => void;
  onToggleSubtask?: (task: Task, subtask: Subtask) => void;
  onQuickCreateTask: (columnId: string, title: string) => Promise<void>;
  onOpenColumnSettings: (column: Column) => void;
}

const COLUMN_BG_MAP: Record<
  PresetColumnBgColor,
  { bg: string; border: string; lightBase: string; darkBase: string }
> = {
  amber: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/35',
    border: 'border-amber-300/90 dark:border-amber-800/70',
    lightBase: 'var(--color-amber-50, #fffbeb)',
    darkBase: 'var(--color-amber-950, #451a03)',
  },
  red: {
    bg: 'bg-red-50/90 dark:bg-red-950/35',
    border: 'border-red-300/90 dark:border-red-800/70',
    lightBase: 'var(--color-red-50, #fef2f2)',
    darkBase: 'var(--color-red-950, #450a0a)',
  },
  emerald: {
    bg: 'bg-emerald-50/90 dark:bg-emerald-950/30',
    border: 'border-emerald-300/80 dark:border-emerald-800/70',
    lightBase: 'var(--color-emerald-50, #ecfdf5)',
    darkBase: 'var(--color-emerald-950, #022c22)',
  },
  blue: {
    bg: 'bg-blue-50/90 dark:bg-blue-950/30',
    border: 'border-blue-300/80 dark:border-blue-800/70',
    lightBase: 'var(--color-blue-50, #eff6ff)',
    darkBase: 'var(--color-blue-950, #172554)',
  },
  violet: {
    bg: 'bg-violet-50/90 dark:bg-violet-950/30',
    border: 'border-violet-300/80 dark:border-violet-800/70',
    lightBase: 'var(--color-violet-50, #f5f3ff)',
    darkBase: 'var(--color-violet-950, #2e1065)',
  },
  slate: {
    bg: 'bg-slate-200/80 dark:bg-slate-800/70',
    border: 'border-slate-300 dark:border-slate-700',
    lightBase: 'var(--color-slate-200, #e2e8f0)',
    darkBase: 'var(--color-slate-800, #1e293b)',
  },
};

export function KanbanColumn({
  column,
  tasks,
  canCreateTasks,
  canEditTasks,
  canManageColumns,
  assigneeNames,
  messageCounts,
  subtasksByTask,
  draggedTaskId,
  dropTarget,
  isReviewBlockedDrop = false,
  onDragStartTask,
  onDragEndTask,
  onDragOverColumn,
  onDragLeaveColumn,
  onDropOnColumn,
  onSelectTask,
  onToggleTaskComplete,
  onToggleSubtask,
  onQuickCreateTask,
  onOpenColumnSettings,
}: KanbanColumnProps) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOverWip = column.wipLimit > 0 && tasks.length > column.wipLimit;
  const isAtWip = column.wipLimit > 0 && tasks.length === column.wipLimit;
  const isDropTargetColumn = Boolean(draggedTaskId && dropTarget?.columnId === column.id);

  const activeColorRule = (column.colorRules ?? [])
    .filter((r) => tasks.length >= r.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];

  const presetStyles =
    activeColorRule && isPresetColumnColor(activeColorRule.color)
      ? COLUMN_BG_MAP[activeColorRule.color]
      : null;

  const customRgb =
    activeColorRule && !isPresetColumnColor(activeColorRule.color)
      ? parseColumnColorToRgb(activeColorRule.color)
      : null;

  const customStyle: CSSProperties | undefined = customRgb
    ? ({
        '--col-rgb': `${customRgb.r}, ${customRgb.g}, ${customRgb.b}`,
        '--col-surface-base': `color-mix(in srgb, rgb(${customRgb.r}, ${customRgb.g}, ${customRgb.b}) 24%, var(--color-slate-100, #f1f5f9))`,
        '--col-surface-base-dark': `color-mix(in srgb, rgb(${customRgb.r}, ${customRgb.g}, ${customRgb.b}) 32%, var(--color-slate-900, #0f172a))`,
      } as CSSProperties)
    : presetStyles
      ? ({
          '--col-surface-base': presetStyles.lightBase,
          '--col-surface-base-dark': presetStyles.darkBase,
        } as CSSProperties)
      : undefined;

  const handleSubmitQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || submitting || !canCreateTasks) return;
    setSubmitting(true);
    try {
      await onQuickCreateTask(column.id, trimmed);
      setNewTitle('');
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label={column.title}
      style={customStyle}
      onDragOver={(e) => {
        if (!canEditTasks || !draggedTaskId) return;
        e.preventDefault();
        onDragOverColumn(e, column.id, tasks.length);
      }}
      onDragLeave={(e) => {
        if (!canEditTasks) return;
        const nextTarget = e.relatedTarget as Node | null;
        if (nextTarget && e.currentTarget.contains(nextTarget)) return;
        onDragLeaveColumn(column.id);
      }}
      onDrop={(e) => {
        if (!canEditTasks) return;
        e.preventDefault();
        const targetIndex =
          dropTarget && dropTarget.columnId === column.id ? dropTarget.index : tasks.length;
        onDropOnColumn(e, column.id, targetIndex);
      }}
      className={`cadence-kanban-column w-[320px] shrink-0 flex flex-col max-h-full border rounded-xl transition-all duration-150 ${
        presetStyles
          ? presetStyles.bg
          : customRgb
            ? 'bg-[rgba(var(--col-rgb),0.14)] dark:bg-[rgba(var(--col-rgb),0.22)]'
            : isDropTargetColumn
              ? isReviewBlockedDrop
                ? 'bg-amber-50/70 dark:bg-amber-950/35'
                : 'bg-blue-50/50 dark:bg-blue-950/35'
              : 'bg-slate-100/80 dark:bg-slate-900/50'
      } ${
        isDropTargetColumn
          ? isReviewBlockedDrop
            ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/80 dark:ring-amber-400/80 shadow-md'
            : 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/85 dark:ring-blue-400/85 shadow-md'
          : presetStyles
            ? presetStyles.border
            : customRgb
              ? 'border-[rgba(var(--col-rgb),0.45)] dark:border-[rgba(var(--col-rgb),0.55)]'
              : 'border-slate-200/90 dark:border-slate-800'
      }`}
    >
      {/* Column Header */}
      <div
        className={`px-3.5 py-3 flex items-center justify-between gap-2 border-b shrink-0 transition-colors ${
          isDropTargetColumn
            ? isReviewBlockedDrop
              ? 'border-amber-200 dark:border-amber-800/80'
              : 'border-blue-200 dark:border-blue-800/80'
            : 'border-slate-200/70 dark:border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {column.title}
          </h2>
          <span
            className={`text-xs font-mono tabular-nums whitespace-nowrap shrink-0 ${
              isOverWip
                ? 'text-red-600 dark:text-red-400 font-medium'
                : isAtWip
                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {column.wipLimit > 0 ? `${tasks.length}/${column.wipLimit}` : `${tasks.length}`}
          </span>
          {column.autoMoveOnComplete && (
            <span
              title="Auto-moves tasks when all checklist items are checked"
              className="inline-flex items-center text-blue-600/80 dark:text-blue-400/80 shrink-0"
            >
              <ArrowRightCircle className="w-3.5 h-3.5" />
            </span>
          )}
          {isColumnReviewGated(column) && (
            <span
              title="Requires tasks to be marked Reviewed before moving here"
              className="inline-flex items-center text-emerald-600/80 dark:text-emerald-400/80 shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDropTargetColumn && (
            <span
              className={`text-[11px] font-semibold whitespace-nowrap ${
                isReviewBlockedDrop
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`}
            >
              {isReviewBlockedDrop ? 'Requires Reviewed' : 'Drop target'}
            </span>
          )}
          {canManageColumns && (
            <button
              type="button"
              onClick={() => onOpenColumnSettings(column)}
              aria-label={`Column settings for ${column.title}`}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md transition-colors shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isOverWip && (
        <div className="px-3.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-300 bg-red-50/80 dark:bg-red-950/40 border-b border-red-200/70 dark:border-red-900/60 shrink-0">
          Over WIP limit ({tasks.length} of {column.wipLimit})
        </div>
      )}

      {/* Task Cards List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[120px]">
        {tasks.length === 0 ? (
          <div
            onDragOver={(e) => {
              if (!canEditTasks || !draggedTaskId) return;
              e.preventDefault();
              e.stopPropagation();
              onDragOverColumn(e, column.id, 0);
            }}
            onDrop={(e) => {
              if (!canEditTasks) return;
              e.preventDefault();
              e.stopPropagation();
              onDropOnColumn(e, column.id, 0);
            }}
            className={`h-24 rounded-lg border-2 border-dashed flex items-center justify-center text-xs transition-colors ${
              isDropTargetColumn
                ? isReviewBlockedDrop
                  ? 'border-amber-500 dark:border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium'
                  : 'border-blue-500 dark:border-blue-400 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                : 'border-slate-300/80 dark:border-slate-700/80 text-slate-400 dark:text-slate-500'
            }`}
          >
            {isDropTargetColumn
              ? isReviewBlockedDrop
                ? 'Mark task Reviewed first'
                : 'Drop task here'
              : 'No tasks in this stage'}
          </div>
        ) : (
          tasks.map((task, idx) => {
            const showDropBefore =
              isDropTargetColumn &&
              dropTarget?.index === idx &&
              draggedTaskId !== task.id;
            return (
              <div
                key={task.id}
                onDragOver={(e) => {
                  if (!canEditTasks || !draggedTaskId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const isUpperHalf = e.clientY < rect.top + rect.height / 2;
                  onDragOverColumn(e, column.id, isUpperHalf ? idx : idx + 1);
                }}
                onDrop={(e) => {
                  if (!canEditTasks) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const isUpperHalf = e.clientY < rect.top + rect.height / 2;
                  onDropOnColumn(e, column.id, isUpperHalf ? idx : idx + 1);
                }}
              >
                {showDropBefore && !isReviewBlockedDrop && (
                  <div
                    aria-hidden="true"
                    className="relative -mt-1.5 mb-1.5 h-2 flex items-center pointer-events-none"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0" />
                    <div className="flex-1 h-0.5 bg-blue-600 dark:bg-blue-400" />
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white bg-blue-600 dark:bg-blue-500 rounded">
                      Drop here
                    </span>
                    <div className="flex-1 h-0.5 bg-blue-600 dark:bg-blue-400" />
                    <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0" />
                  </div>
                )}
                <TaskCard
                  task={task}
                  canEdit={canEditTasks}
                  assigneeName={task.assigneeId ? assigneeNames[task.assigneeId] : undefined}
                  reviewerName={task.reviewerId ? assigneeNames[task.reviewerId] : undefined}
                  messageCount={messageCounts[task.id] ?? 0}
                  subtasks={subtasksByTask?.[task.id]}
                  isDragging={draggedTaskId === task.id}
                  onDragStart={onDragStartTask}
                  onDragEnd={onDragEndTask}
                  onClick={onSelectTask}
                  onToggleComplete={onToggleTaskComplete}
                  onToggleSubtask={onToggleSubtask}
                />
              </div>
            );
          })
        )}

        {isDropTargetColumn &&
          !isReviewBlockedDrop &&
          dropTarget?.index === tasks.length &&
          tasks.length > 0 && (
            <div
              aria-hidden="true"
              className="h-14 rounded-lg border-2 border-dashed border-blue-500 dark:border-blue-400 bg-blue-50/75 dark:bg-blue-950/35 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 pointer-events-none"
            >
              Drop task here
            </div>
          )}

        {tasks.length > 0 && (
          <div
            onDragOver={(e) => {
              if (!canEditTasks || !draggedTaskId) return;
              e.preventDefault();
              e.stopPropagation();
              onDragOverColumn(e, column.id, tasks.length);
            }}
            onDrop={(e) => {
              if (!canEditTasks) return;
              e.preventDefault();
              e.stopPropagation();
              onDropOnColumn(e, column.id, tasks.length);
            }}
            className="min-h-10"
          />
        )}
      </div>

      {/* Quick Add Footer */}
      {canCreateTasks && (
        <div className="p-2.5 border-t border-slate-200/70 dark:border-slate-800/80 shrink-0">
          {adding ? (
            <form onSubmit={handleSubmitQuickAdd} className="space-y-2">
              <input
                type="text"
                autoFocus
                maxLength={LIMITS.TASK_TITLE_MAX}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewTitle('');
                  }
                }}
                placeholder="Task title..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting || !newTitle.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {submitting ? 'Adding...' : 'Add task'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setNewTitle('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add task</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
