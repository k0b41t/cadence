import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, CalendarClock, Flag, X } from 'lucide-react';
import { getTodayDateKey, toggleTaskNotifications } from '../lib/kanbanService';
import type { Board, Task } from '../types/kanban';

export interface TaskNotificationItem {
  key: string;
  boardId: string;
  boardTitle: string;
  task: Task;
  kind: 'due' | 'milestone';
  label: string;
  date: string;
  deltaDays: number;
}

function parseDateKeyToUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y || 2026, (m || 1) - 1, d || 1);
}

function diffDays(startKey: string, endKey: string): number {
  return Math.round((parseDateKeyToUtcMs(endKey) - parseDateKeyToUtcMs(startKey)) / 86400000);
}

export function buildTaskNotifications(
  tasks: Task[],
  boardMap: Map<string, Board>,
  todayKey: string,
  leadDays = 7
): TaskNotificationItem[] {
  const items: TaskNotificationItem[] = [];

  for (const task of tasks) {
    if (task.completed || task.notificationsEnabled === false) continue;
    const board = boardMap.get(task.boardId);
    if (!board) continue;

    if (task.dueDate) {
      const delta = diffDays(todayKey, task.dueDate);
      if (delta <= leadDays) {
        items.push({
          key: `${task.id}_due`,
          boardId: task.boardId,
          boardTitle: board.title,
          task,
          kind: 'due',
          label: 'Due date',
          date: task.dueDate,
          deltaDays: delta,
        });
      }
    }

    for (const ms of task.milestones ?? []) {
      const delta = diffDays(todayKey, ms.date);
      if (delta >= 0 && delta <= leadDays) {
        items.push({
          key: `${task.id}_ms_${ms.id}`,
          boardId: task.boardId,
          boardTitle: board.title,
          task,
          kind: 'milestone',
          label: ms.title,
          date: ms.date,
          deltaDays: delta,
        });
      }
    }
  }

  items.sort((a, b) => {
    if (a.deltaDays !== b.deltaDays) return a.deltaDays - b.deltaDays;
    return a.task.title.localeCompare(b.task.title);
  });

  return items;
}

interface NotificationsModalProps {
  uid: string;
  isAdmin: boolean;
  boards: Board[];
  activeBoard: Board | null;
  activeBoardCanEdit?: boolean;
  allTasks: Task[];
  onOpenTask: (boardId: string, taskId: string) => void;
  onClose: () => void;
}

function formatUrgencyText(deltaDays: number, kind: 'due' | 'milestone'): string {
  if (deltaDays < 0) {
    const overdue = Math.abs(deltaDays);
    return `Overdue ${overdue}d`;
  }
  if (deltaDays === 0) return kind === 'due' ? 'Due today' : 'Today';
  if (deltaDays === 1) return 'Tomorrow';
  return `In ${deltaDays} days`;
}

export function NotificationsModal({
  uid,
  isAdmin,
  boards,
  activeBoard,
  activeBoardCanEdit = false,
  allTasks,
  onOpenTask,
  onClose,
}: NotificationsModalProps) {
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [leadDays, setLeadDays] = useState<3 | 7 | 14>(7);
  const [tab, setTab] = useState<'alerts' | 'muted'>('alerts');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const boardMap = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach((b) => map.set(b.id, b));
    return map;
  }, [boards]);

  const scopedTasks = useMemo(() => {
    if (scope === 'current' && activeBoard) {
      return allTasks.filter((t) => t.boardId === activeBoard.id);
    }
    return allTasks;
  }, [scope, activeBoard, allTasks]);

  const alerts = useMemo(
    () => buildTaskNotifications(scopedTasks, boardMap, todayKey, leadDays),
    [scopedTasks, boardMap, todayKey, leadDays]
  );

  const mutedTasks = useMemo(() => {
    return scopedTasks
      .filter((t) => !t.completed && t.notificationsEnabled === false)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [scopedTasks]);

  const canQuickToggleBoard = (boardId: string) => {
    const b = boardMap.get(boardId);
    if (!b) return false;
    if (isAdmin) return true;
    if (activeBoard && b.id === activeBoard.id && activeBoardCanEdit) return true;
    return b.status === 'active' && b.ownerId === uid;
  };

  const handleToggleMute = async (task: Task, nextEnabled: boolean) => {
    if (togglingId) return;
    setTogglingId(task.id);
    try {
      await toggleTaskNotifications(task.boardId, task.id, nextEnabled);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-modal-heading"
        className="w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2
              id="notifications-modal-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Notifications
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div
            role="tablist"
            aria-label="Notification filter"
            className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'alerts'}
              onClick={() => setTab('alerts')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                tab === 'alerts'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Upcoming · {alerts.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'muted'}
              onClick={() => setTab('muted')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                tab === 'muted'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Muted · {mutedTasks.length}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === 'alerts' && (
              <div
                role="group"
                aria-label="Notification lead window"
                className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                {([3, 7, 14] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setLeadDays(days)}
                    className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      leadDays === days
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            )}

            {activeBoard && boards.length > 1 && (
              <div
                role="group"
                aria-label="Board scope"
                className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    scope === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  All boards
                </button>
                <button
                  type="button"
                  onClick={() => setScope('current')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    scope === 'current'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Current board
                </button>
              </div>
            )}
          </div>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {tab === 'alerts' ? (
            alerts.length === 0 ? (
              <div className="px-6 py-12 text-center space-y-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No upcoming due dates or milestones
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Incomplete tasks with notifications enabled due within {leadDays} days will appear here.
                </p>
              </div>
            ) : (
              alerts.map((item) => {
                const isOverdue = item.deltaDays < 0;
                const isToday = item.deltaDays === 0;
                const urgencyClass = isOverdue
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : isToday
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-blue-600 dark:text-blue-400 font-medium';

                return (
                  <div
                    key={item.key}
                    className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenTask(item.boardId, item.task.id)}
                      className="min-w-0 flex-1 text-left space-y-1 focus:outline-none"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        {item.kind === 'milestone' ? (
                          <Flag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        ) : (
                          <CalendarClock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                        )}
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.task.title}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className={urgencyClass}>
                          {formatUrgencyText(item.deltaDays, item.kind)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{item.date}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                          {item.kind === 'milestone' ? `Milestone: ${item.label}` : 'Due date'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[140px]">{item.boardTitle}</span>
                      </div>
                    </button>

                    {canQuickToggleBoard(item.boardId) && (
                      <button
                        type="button"
                        disabled={togglingId === item.task.id}
                        onClick={() => handleToggleMute(item.task, false)}
                        title="Turn off notifications for this task"
                        aria-label={`Mute notifications for ${item.task.title}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <BellOff className="w-3 h-3" />
                        <span>Mute</span>
                      </button>
                    )}
                  </div>
                );
              })
            )
          ) : mutedTasks.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                No muted tasks
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tasks with notifications toggled off will appear here so you can re-enable them anytime.
              </p>
            </div>
          ) : (
            mutedTasks.map((task) => {
              const boardTitle = boardMap.get(task.boardId)?.title ?? 'Board';
              return (
                <div
                  key={task.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.boardId, task.id)}
                    className="min-w-0 flex-1 text-left space-y-1 focus:outline-none"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <BellOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>{boardTitle}</span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">Due {task.dueDate}</span>
                        </>
                      )}
                      {(task.milestones?.length ?? 0) > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {task.milestones!.length}{' '}
                            {task.milestones!.length === 1 ? 'milestone' : 'milestones'}
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  {canQuickToggleBoard(task.boardId) && (
                    <button
                      type="button"
                      disabled={togglingId === task.id}
                      onClick={() => handleToggleMute(task, true)}
                      aria-label={`Enable notifications for ${task.title}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Bell className="w-3 h-3" />
                      <span>Turn on</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
