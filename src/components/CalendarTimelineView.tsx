import { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Link2,
  MessageSquare,
} from 'lucide-react';
import { addDaysToDateKey, getTodayDateKey } from '../lib/kanbanService';
import type { Board, Column, Priority, Task } from '../types/kanban';

interface CalendarTimelineViewProps {
  board: Board;
  columns: Column[];
  tasks: Task[];
  assigneeNames: Record<string, string>;
  messageCounts: Record<string, number>;
  canToggleComplete: boolean;
  onSelectTask: (task: Task) => void;
  onToggleTaskComplete: (task: Task) => void;
}

const DAY_COL_WIDTH = 48; // px per day cell

function parseDateKeyToUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y || 2026, (m || 1) - 1, d || 1);
}

function diffDays(startKey: string, endKey: string): number {
  return Math.round((parseDateKeyToUtcMs(endKey) - parseDateKeyToUtcMs(startKey)) / 86400000);
}

function toLocalDateKey(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayMeta(dateKey: string): {
  weekday: string;
  dayNum: string;
  monthShort: string;
  isFirstOfMonth: boolean;
  isWeekend: boolean;
} {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const dow = dt.getDay();
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
    dayNum: String(d),
    monthShort: dt.toLocaleDateString('en-US', { month: 'short' }),
    isFirstOfMonth: d === 1,
    isWeekend: dow === 0 || dow === 6,
  };
}

const PRIORITY_TEXT: Record<Priority, string> = {
  urgent: 'text-red-600 dark:text-red-400 font-medium',
  high: 'text-amber-600 dark:text-amber-400 font-medium',
  medium: 'text-blue-600 dark:text-blue-400',
  low: 'text-slate-500 dark:text-slate-400',
};

interface TaskSpanComputed {
  startKey: string;
  solidStartKey: string;
  solidEndKey: string;
  plannedStartKey: string | null;
  plannedEndKey: string | null;
  overdueStartKey: string | null;
  overdueEndKey: string | null;
  minKey: string;
  maxKey: string;
  completedKey: string | null;
}

function computeTaskSpan(task: Task, todayKey: string): TaskSpanComputed {
  const createdKey = task.createdAt ? toLocalDateKey(task.createdAt.toDate()) : todayKey;
  const startKey = task.placedOnColumnAt || createdKey;
  const hasDue = Boolean(task.dueDate);

  let solidStartKey = startKey;
  let solidEndKey = startKey;
  let plannedStartKey: string | null = null;
  let plannedEndKey: string | null = null;
  let overdueStartKey: string | null = null;
  let overdueEndKey: string | null = null;
  let completedKey: string | null = null;

  if (task.completed) {
    const fallbackEnd = task.updatedAt ? toLocalDateKey(task.updatedAt.toDate()) : todayKey;
    completedKey = task.completedAt || fallbackEnd;
    if (completedKey < startKey) completedKey = startKey;
    solidStartKey = startKey;
    solidEndKey = completedKey;
  } else if (hasDue) {
    if (task.dueDate >= todayKey) {
      solidStartKey = startKey;
      solidEndKey = todayKey >= startKey ? todayKey : startKey;
      if (task.dueDate > solidEndKey) {
        plannedStartKey = solidEndKey;
        plannedEndKey = task.dueDate;
      }
    } else {
      // Overdue: dueDate < todayKey
      solidStartKey = startKey;
      solidEndKey = task.dueDate >= startKey ? task.dueDate : startKey;
      overdueStartKey = solidEndKey;
      overdueEndKey = todayKey >= solidEndKey ? todayKey : solidEndKey;
    }
  } else {
    solidStartKey = startKey;
    solidEndKey = todayKey >= startKey ? todayKey : startKey;
  }

  let minKey = startKey;
  let maxKey = overdueEndKey || plannedEndKey || solidEndKey;
  if (task.dueDate && task.dueDate < minKey) minKey = task.dueDate;
  if (task.dueDate && task.dueDate > maxKey) maxKey = task.dueDate;
  for (const ms of task.milestones ?? []) {
    if (ms.date < minKey) minKey = ms.date;
    if (ms.date > maxKey) maxKey = ms.date;
  }

  return {
    startKey,
    solidStartKey,
    solidEndKey,
    plannedStartKey,
    plannedEndKey,
    overdueStartKey,
    overdueEndKey,
    minKey,
    maxKey,
    completedKey,
  };
}

export function CalendarTimelineView({
  board,
  columns,
  tasks,
  assigneeNames,
  messageCounts,
  canToggleComplete,
  onSelectTask,
  onToggleTaskComplete,
}: CalendarTimelineViewProps) {
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [spanDays, setSpanDays] = useState<14 | 21 | 30>(21);
  const [windowStart, setWindowStart] = useState<string>(() => addDaysToDateKey(getTodayDateKey(), -5));
  const [groupByColumn, setGroupByColumn] = useState(true);

  const windowDays = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < spanDays; i++) {
      list.push(addDaysToDateKey(windowStart, i));
    }
    return list;
  }, [windowStart, spanDays]);

  const windowEnd = windowDays[windowDays.length - 1];

  const columnMap = useMemo(() => {
    const map = new Map<string, Column>();
    columns.forEach((c) => map.set(c.id, c));
    return map;
  }, [columns]);

  const rows = useMemo(() => {
    if (groupByColumn) {
      const grouped: Array<{ column: Column | null; tasks: Task[] }> = [];
      columns.forEach((col) => {
        const colTasks = tasks
          .filter((t) => t.columnId === col.id)
          .sort((a, b) => a.position - b.position);
        if (colTasks.length > 0) {
          grouped.push({ column: col, tasks: colTasks });
        }
      });
      const orphanTasks = tasks.filter((t) => !columnMap.has(t.columnId));
      if (orphanTasks.length > 0) {
        grouped.push({ column: null, tasks: orphanTasks });
      }
      return grouped;
    }

    const sortedAll = [...tasks].sort((a, b) => {
      const aStart = a.placedOnColumnAt || todayKey;
      const bStart = b.placedOnColumnAt || todayKey;
      if (aStart !== bStart) return aStart.localeCompare(bStart);
      return a.position - b.position;
    });
    return [{ column: null, tasks: sortedAll }];
  }, [groupByColumn, columns, tasks, columnMap, todayKey]);

  const rangeLabel = useMemo(() => {
    return `${formatShortDate(windowStart)} – ${formatShortDate(windowEnd)}`;
  }, [windowStart, windowEnd]);

  const handleFitTasks = () => {
    if (tasks.length === 0) {
      setWindowStart(addDaysToDateKey(todayKey, -5));
      return;
    }
    let earliest = todayKey;
    for (const t of tasks) {
      const span = computeTaskSpan(t, todayKey);
      if (span.minKey < earliest) earliest = span.minKey;
    }
    setWindowStart(addDaysToDateKey(earliest, -2));
  };

  const gridTotalWidth = spanDays * DAY_COL_WIDTH;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Calendar Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
            <button
              type="button"
              onClick={() => setWindowStart((prev) => addDaysToDateKey(prev, -7))}
              aria-label="Previous week"
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWindowStart(addDaysToDateKey(todayKey, -5))}
              className="px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWindowStart((prev) => addDaysToDateKey(prev, 7))}
              aria-label="Next week"
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleFitTasks}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
          >
            Fit tasks
          </button>

          <span className="text-xs font-mono tabular-nums font-medium text-slate-700 dark:text-slate-200 px-1.5 whitespace-nowrap">
            {rangeLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Legend */}
          <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 dark:bg-blue-500 inline-block" />
              <span>Active</span>
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-3 h-2 rounded-sm border border-dashed border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/50 inline-block" />
              <span>Planned</span>
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500 inline-block" />
              <span>Completed</span>
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rotate-45 bg-amber-500 border border-white dark:border-slate-900 inline-block" />
              <span>Milestone</span>
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full border-2 border-slate-700 dark:border-slate-200 inline-block" />
              <span>Due</span>
            </span>
          </div>

          <div
            role="group"
            aria-label="Calendar day span"
            className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {([14, 21, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setSpanDays(days)}
                className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  spanDays === days
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setGroupByColumn((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              groupByColumn
                ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {groupByColumn ? 'Grouped by column' : 'All tasks'}
          </button>
        </div>
      </div>

      {/* Horizontal Day-by-Day Grid */}
      {tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              No tasks to plot on {board.title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create a task or adjust your active filters to see task timelines and milestones.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: `${280 + gridTotalWidth}px` }}>
            {/* Sticky Day Header */}
            <div className="sticky top-0 z-20 flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="sticky left-0 z-30 w-[260px] sm:w-[300px] shrink-0 px-4 py-2.5 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Task Window
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {tasks.length} {tasks.length === 1 ? 'row' : 'rows'}
                </span>
              </div>

              <div className="flex shrink-0">
                {windowDays.map((dayKey, idx) => {
                  const meta = formatDayMeta(dayKey);
                  const isToday = dayKey === todayKey;
                  const showMonth = idx === 0 || meta.isFirstOfMonth;
                  return (
                    <div
                      key={dayKey}
                      style={{ width: `${DAY_COL_WIDTH}px` }}
                      className={`shrink-0 py-1.5 px-1 text-center border-r border-slate-100 dark:border-slate-800/80 ${
                        isToday
                          ? 'bg-blue-50/90 dark:bg-blue-950/50'
                          : meta.isWeekend
                            ? 'bg-slate-50/80 dark:bg-slate-950/40'
                            : ''
                      }`}
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 h-3.5 leading-3">
                        {showMonth ? meta.monthShort : ''}
                      </div>
                      <div
                        className={`text-[10px] font-medium ${
                          isToday
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {meta.weekday}
                      </div>
                      <div
                        className={`text-xs font-mono tabular-nums ${
                          isToday
                            ? 'font-bold text-blue-700 dark:text-blue-300'
                            : 'font-medium text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {meta.dayNum}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task Rows */}
            <div>
              {rows.map((group) => (
                <div key={group.column ? group.column.id : 'all'}>
                  {group.column && (
                    <div className="flex bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                      <div className="sticky left-0 z-10 w-[260px] sm:w-[300px] shrink-0 px-4 py-1.5 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">
                          {group.column.title}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {group.tasks.length}
                        </span>
                      </div>
                      <div style={{ width: `${gridTotalWidth}px` }} className="shrink-0" />
                    </div>
                  )}

                  {group.tasks.map((task) => {
                    const span = computeTaskSpan(task, todayKey);
                    const colName = columnMap.get(task.columnId)?.title ?? 'Column';
                    const assigneeName = task.assigneeId ? assigneeNames[task.assigneeId] : undefined;
                    const msgCount = messageCounts[task.id] ?? 0;
                    const linkCount = task.links?.length ?? 0;
                    const milestones = task.milestones ?? [];

                    const renderSegment = (
                      segStart: string,
                      segEnd: string,
                      className: string,
                      labelTitle: string
                    ) => {
                      const rawStartIdx = diffDays(windowStart, segStart);
                      const rawEndIdx = diffDays(windowStart, segEnd);
                      if (rawEndIdx < 0 || rawStartIdx >= spanDays) return null;
                      const clippedStart = Math.max(0, rawStartIdx);
                      const clippedEnd = Math.min(spanDays - 1, rawEndIdx);
                      const leftPx = clippedStart * DAY_COL_WIDTH + 4;
                      const widthPx = Math.max(
                        DAY_COL_WIDTH - 8,
                        (clippedEnd - clippedStart + 1) * DAY_COL_WIDTH - 8
                      );
                      return (
                        <div
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          title={labelTitle}
                          className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md transition-opacity group-hover:opacity-95 ${className}`}
                        />
                      );
                    };

                    const minIdx = diffDays(windowStart, span.minKey);
                    const maxIdx = diffDays(windowStart, span.maxKey);
                    const isCompletelyBefore = maxIdx < 0;
                    const isCompletelyAfter = minIdx >= spanDays;

                    const placedIdx = diffDays(windowStart, span.startKey);
                    const dueIdx = task.dueDate ? diffDays(windowStart, task.dueDate) : -1;
                    const completedIdx = span.completedKey
                      ? diffDays(windowStart, span.completedKey)
                      : -1;

                    return (
                      <div
                        key={task.id}
                        className="group flex border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* Sticky Left Task Meta Cell */}
                        <div className="sticky left-0 z-10 w-[260px] sm:w-[300px] shrink-0 px-4 py-2.5 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 border-r border-slate-200 dark:border-slate-800 flex items-start gap-2.5">
                          <button
                            type="button"
                            disabled={!canToggleComplete}
                            aria-label={
                              task.completed
                                ? `Mark "${task.title}" incomplete`
                                : `Mark "${task.title}" complete`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canToggleComplete) onToggleTaskComplete(task);
                            }}
                            className={`mt-0.5 shrink-0 rounded-full transition-colors ${
                              task.completed
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
                            } disabled:opacity-50`}
                          >
                            {task.completed ? (
                              <span className="w-4 h-4 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectTask(task)}
                            className="min-w-0 flex-1 text-left space-y-0.5 focus:outline-none"
                          >
                            <div
                              className={`text-xs font-medium truncate ${
                                task.completed
                                  ? 'text-slate-400 dark:text-slate-500 line-through'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {!groupByColumn && (
                                <>
                                  <span className="truncate max-w-[85px]">{colName}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <span className={PRIORITY_TEXT[task.priority]}>{task.priority}</span>
                              {assigneeName && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate max-w-[90px] text-slate-600 dark:text-slate-300">
                                    {assigneeName}
                                  </span>
                                </>
                              )}
                              {linkCount > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5">
                                    <Link2 className="w-2.5 h-2.5" />
                                    <span>{linkCount}</span>
                                  </span>
                                </>
                              )}
                              {msgCount > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5">
                                    <MessageSquare className="w-2.5 h-2.5" />
                                    <span>{msgCount}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </button>
                        </div>

                        {/* Horizontal Day-by-Day Bar Cell */}
                        <div
                          style={{ width: `${gridTotalWidth}px` }}
                          onClick={() => onSelectTask(task)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectTask(task);
                            }
                          }}
                          className="relative shrink-0 cursor-pointer flex"
                        >
                          {/* Background day columns */}
                          {windowDays.map((dayKey) => {
                            const meta = formatDayMeta(dayKey);
                            const isToday = dayKey === todayKey;
                            return (
                              <div
                                key={dayKey}
                                style={{ width: `${DAY_COL_WIDTH}px` }}
                                className={`h-full shrink-0 border-r border-slate-100 dark:border-slate-800/70 ${
                                  isToday
                                    ? 'bg-blue-50/40 dark:bg-blue-950/20'
                                    : meta.isWeekend
                                      ? 'bg-slate-50/50 dark:bg-slate-950/30'
                                      : ''
                                }`}
                              />
                            );
                          })}

                          {/* Off-screen jump badge if entire task span lies outside visible window */}
                          {(isCompletelyBefore || isCompletelyAfter) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWindowStart(addDaysToDateKey(span.startKey, -2));
                              }}
                              className={`absolute top-1/2 -translate-y-1/2 px-2 py-0.5 text-[11px] font-mono tabular-nums text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900/60 whitespace-nowrap ${
                                isCompletelyBefore ? 'left-3' : 'right-3'
                              }`}
                            >
                              {isCompletelyBefore
                                ? `← Placed ${formatShortDate(span.startKey)}`
                                : `Placed ${formatShortDate(span.startKey)} →`}
                            </button>
                          )}

                          {/* Subtle full-extent guide connecting bar and outer milestones */}
                          {!isCompletelyBefore && !isCompletelyAfter && (
                            (() => {
                              const gStart = Math.max(0, minIdx);
                              const gEnd = Math.min(spanDays - 1, maxIdx);
                              if (gEnd <= gStart) return null;
                              const gLeft = gStart * DAY_COL_WIDTH + DAY_COL_WIDTH / 2;
                              const gWidth = (gEnd - gStart) * DAY_COL_WIDTH;
                              return (
                                <div
                                  style={{ left: `${gLeft}px`, width: `${gWidth}px` }}
                                  className="absolute top-1/2 -translate-y-1/2 border-t border-dashed border-slate-300 dark:border-slate-700 pointer-events-none"
                                />
                              );
                            })()
                          )}

                          {/* Planned runway bar (active with future due date) */}
                          {span.plannedStartKey &&
                            span.plannedEndKey &&
                            renderSegment(
                              span.plannedStartKey,
                              span.plannedEndKey,
                              'bg-blue-50/90 dark:bg-blue-950/40 border border-dashed border-blue-400 dark:border-blue-600',
                              `Planned through due date ${task.dueDate}`
                            )}

                          {/* Main solid bar (placed -> today/due/completed) */}
                          {renderSegment(
                            span.solidStartKey,
                            span.solidEndKey,
                            task.completed
                              ? 'bg-emerald-500/85 dark:bg-emerald-600/85'
                              : 'bg-blue-600/90 dark:bg-blue-500/90',
                            task.completed
                              ? `Placed ${span.startKey} → Completed ${span.completedKey}`
                              : `Placed ${span.startKey}`
                          )}

                          {/* Overdue extension segment */}
                          {span.overdueStartKey &&
                            span.overdueEndKey &&
                            renderSegment(
                              span.overdueStartKey,
                              span.overdueEndKey,
                              'bg-red-500/80 dark:bg-red-600/80',
                              `Overdue since ${task.dueDate}`
                            )}

                          {/* Placed-on-column start anchor */}
                          {placedIdx >= 0 && placedIdx < spanDays && (
                            <div
                              style={{ left: `${placedIdx * DAY_COL_WIDTH + 8}px` }}
                              title={`Placed on ${colName}: ${span.startKey}`}
                              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border-2 border-slate-800 dark:border-white z-[2]"
                            />
                          )}

                          {/* Due date ring marker */}
                          {task.dueDate && dueIdx >= 0 && dueIdx < spanDays && (
                            <div
                              style={{
                                left: `${dueIdx * DAY_COL_WIDTH + DAY_COL_WIDTH - 16}px`,
                              }}
                              title={`Due date: ${task.dueDate}`}
                              className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 bg-white dark:bg-slate-900 z-[2] ${
                                !task.completed && task.dueDate < todayKey
                                  ? 'border-red-600 dark:border-red-400'
                                  : 'border-slate-700 dark:border-slate-200'
                              }`}
                            />
                          )}

                          {/* Completed cap marker */}
                          {task.completed &&
                            span.completedKey &&
                            completedIdx >= 0 &&
                            completedIdx < spanDays && (
                              <div
                                style={{
                                  left: `${completedIdx * DAY_COL_WIDTH + DAY_COL_WIDTH - 20}px`,
                                }}
                                title={`Completed: ${span.completedKey}`}
                                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-700 dark:bg-emerald-400 text-white dark:text-slate-950 flex items-center justify-center z-[3]"
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            )}

                          {/* Important Dates / Milestones diamonds */}
                          {milestones.map((ms) => {
                            const msIdx = diffDays(windowStart, ms.date);
                            if (msIdx < 0 || msIdx >= spanDays) return null;
                            const centerX = msIdx * DAY_COL_WIDTH + DAY_COL_WIDTH / 2;
                            return (
                              <div
                                key={ms.id}
                                style={{ left: `${centerX}px` }}
                                title={`Milestone: ${ms.title} (${ms.date})`}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-[4] flex items-center"
                              >
                                <span className="w-3 h-3 rotate-45 bg-amber-500 dark:bg-amber-400 border-2 border-white dark:border-slate-900 block shadow-xs" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
