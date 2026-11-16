import type { DragEvent } from 'react';
import { Check, Circle } from 'lucide-react';
import type { Priority, Task } from '../types/kanban';

interface TaskCardProps {
  task: Task;
  canEdit: boolean;
  assigneeName?: string;
  isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEnd: () => void;
  onClick: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
}

const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  urgent: {
    label: 'Urgent',
    className: 'text-red-600 dark:text-red-400 font-medium',
  },
  high: {
    label: 'High',
    className: 'text-amber-600 dark:text-amber-400 font-medium',
  },
  medium: {
    label: 'Medium',
    className: 'text-blue-600 dark:text-blue-400',
  },
  low: {
    label: 'Low',
    className: 'text-slate-500 dark:text-slate-400',
  },
};

function formatDueDate(dateStr: string): { text: string; isOverdue: boolean } | null {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const isOverdue = parsed.getTime() < now.getTime();
  const text = parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { text, isOverdue };
}

export function TaskCard({
  task,
  canEdit,
  assigneeName,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
  onToggleComplete,
}: TaskCardProps) {
  const priorityInfo = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const due = formatDueDate(task.dueDate);

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        if (!canEdit) return;
        onDragStart(e, task);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(task);
        }
      }}
      className={`group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 text-left transition-all duration-150 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        isDragging ? 'opacity-40 scale-[0.99]' : 'opacity-100'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          disabled={!canEdit}
          aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
          onClick={(e) => {
            e.stopPropagation();
            if (canEdit) onToggleComplete(task);
          }}
          className={`mt-0.5 shrink-0 rounded-full transition-colors ${
            task.completed
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
          } disabled:opacity-50 disabled:cursor-default`}
        >
          {task.completed ? (
            <span className="w-4 h-4 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </span>
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div
            className={`text-sm font-medium leading-snug line-clamp-2 ${
              task.completed
                ? 'text-slate-400 dark:text-slate-500 line-through'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {task.title}
          </div>

          {task.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Zero-pill metadata line */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span className={priorityInfo.className}>{priorityInfo.label}</span>

            {due && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    !task.completed && due.isOverdue
                      ? 'text-red-600 dark:text-red-400 font-medium'
                      : ''
                  }
                >
                  {!task.completed && due.isOverdue ? `Overdue ${due.text}` : due.text}
                </span>
              </>
            )}

            {assigneeName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                  {assigneeName}
                </span>
              </>
            )}

            {task.tags.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[150px] text-slate-500 dark:text-slate-400">
                  {task.tags.join(' / ')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
