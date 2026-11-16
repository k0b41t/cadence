import { useState, type CSSProperties, type DragEvent } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { isPresetColumnColor, parseColumnColorToRgb } from '../lib/colorUtils';
import { LIMITS, type Column, type PresetColumnBgColor, type Subtask, type Task } from '../types/kanban';
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
  onDragStartTask: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEndTask: () => void;
  onDragOverColumn: (e: DragEvent<HTMLElement>, columnId: string, index: number) => void;
  onDropOnColumn: (e: DragEvent<HTMLElement>, columnId: string, index: number) => void;
  onSelectTask: (task: Task) => void;
  onToggleTaskComplete: (task: Task) => void;
  onToggleSubtask?: (task: Task, subtask: Subtask) => void;
  onQuickCreateTask: (columnId: string, title: string) => Promise<void>;
  onOpenColumnSettings: (column: Column) => void;
}

const COLUMN_BG_MAP: Record<PresetColumnBgColor, { bg: string; border: string }> = {
  amber: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/35',
    border: 'border-amber-300/90 dark:border-amber-800/70',
  },
  red: {
    bg: 'bg-red-50/90 dark:bg-red-950/35',
    border: 'border-red-300/90 dark:border-red-800/70',
  },
  emerald: {
    bg: 'bg-emerald-50/90 dark:bg-emerald-950/30',
    border: 'border-emerald-300/80 dark:border-emerald-800/70',
  },
  blue: {
    bg: 'bg-blue-50/90 dark:bg-blue-950/30',
    border: 'border-blue-300/80 dark:border-blue-800/70',
  },
  violet: {
    bg: 'bg-violet-50/90 dark:bg-violet-950/30',
    border: 'border-violet-300/80 dark:border-violet-800/70',
  },
  slate: {
    bg: 'bg-slate-200/80 dark:bg-slate-800/70',
    border: 'border-slate-300 dark:border-slate-700',
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
  onDragStartTask,
  onDragEndTask,
  onDragOverColumn,
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

  const customStyle = customRgb
    ? ({ '--col-rgb': `${customRgb.r}, ${customRgb.g}, ${customRgb.b}` } as CSSProperties)
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
        if (!canEditTasks) return;
        e.preventDefault();
        if (tasks.length === 0) {
          onDragOverColumn(e, column.id, 0);
        }
      }}
      onDrop={(e) => {
        if (!canEditTasks) return;
        e.preventDefault();
        const targetIndex =
          dropTarget && dropTarget.columnId === column.id ? dropTarget.index : tasks.length;
        onDropOnColumn(e, column.id, targetIndex);
      }}
      className={`w-[320px] shrink-0 flex flex-col max-h-full border rounded-xl transition-colors ${
        presetStyles
          ? presetStyles.bg
          : customRgb
            ? 'bg-[rgba(var(--col-rgb),0.14)] dark:bg-[rgba(var(--col-rgb),0.22)]'
            : 'bg-slate-100/80 dark:bg-slate-900/50'
      } ${
        dropTarget?.columnId === column.id
          ? 'border-blue-500/70 dark:border-blue-500/60'
          : presetStyles
            ? presetStyles.border
            : customRgb
              ? 'border-[rgba(var(--col-rgb),0.45)] dark:border-[rgba(var(--col-rgb),0.55)]'
              : 'border-slate-200/90 dark:border-slate-800'
      }`}
    >
      {/* Column Header */}
      <div className="px-3.5 py-3 flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800/80 shrink-0">
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
        </div>

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
              if (!canEditTasks) return;
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
            className={`h-24 rounded-lg border border-dashed flex items-center justify-center text-xs transition-colors ${
              dropTarget?.columnId === column.id
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                : 'border-slate-300/80 dark:border-slate-700/80 text-slate-400 dark:text-slate-500'
            }`}
          >
            {dropTarget?.columnId === column.id ? 'Drop task here' : 'No tasks in this stage'}
          </div>
        ) : (
          tasks.map((task, idx) => {
            const showDropBefore =
              dropTarget?.columnId === column.id && dropTarget.index === idx;
            return (
              <div
                key={task.id}
                onDragOver={(e) => {
                  if (!canEditTasks) return;
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
                {showDropBefore && (
                  <div className="h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full mb-2.5" />
                )}
                <TaskCard
                  task={task}
                  canEdit={canEditTasks}
                  assigneeName={task.assigneeId ? assigneeNames[task.assigneeId] : undefined}
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

        {dropTarget?.columnId === column.id &&
          dropTarget.index === tasks.length &&
          tasks.length > 0 && (
            <div className="h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full mt-2.5" />
          )}

        {tasks.length > 0 && (
          <div
            onDragOver={(e) => {
              if (!canEditTasks) return;
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
            className="h-6"
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
