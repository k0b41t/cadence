import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Link2,
  MessageSquare,
  ZoomIn,
  ZoomOut,
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

type ZoomGranularity = 'day' | 'week' | 'month';

interface TimelineBucket {
  key: string;
  startKey: string;
  endKey: string;
  days: number;
  topLabel: string;
  subLabel: string;
  mainLabel: string;
  isCurrent: boolean;
  isWeekend?: boolean;
}

const MIN_PX_PER_DAY = 2.5;
const MAX_PX_PER_DAY = 80;
const DAY_THRESHOLD_PX = 24;
const WEEK_THRESHOLD_PX = 9;

const DEFAULT_PX_FOR_GRANULARITY: Record<ZoomGranularity, number> = {
  day: 48,
  week: 14,
  month: 4.5,
};

function getGranularity(pxPerDay: number): ZoomGranularity {
  if (pxPerDay >= DAY_THRESHOLD_PX) return 'day';
  if (pxPerDay >= WEEK_THRESHOLD_PX) return 'week';
  return 'month';
}

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

function formatMonthYear(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getMondayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  const dow = dt.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysToDateKey(dateKey, offset);
}

function getFirstOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function alignStartForGranularity(dateKey: string, granularity: ZoomGranularity): string {
  if (granularity === 'week') return getMondayOfWeek(dateKey);
  if (granularity === 'month') return getFirstOfMonth(dateKey);
  return dateKey;
}

function buildBuckets(
  rawStartKey: string,
  granularity: ZoomGranularity,
  minDays: number,
  pxPerDay: number,
  todayKey: string
): { gridStartKey: string; totalDays: number; buckets: TimelineBucket[] } {
  if (granularity === 'day') {
    const gridStartKey = rawStartKey;
    const buckets: TimelineBucket[] = [];
    for (let i = 0; i < minDays; i++) {
      const key = addDaysToDateKey(gridStartKey, i);
      const [y, m, d] = key.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      const dow = dt.getDay();
      const weekdayFull = dt.toLocaleDateString('en-US', { weekday: 'short' });
      const weekdayLabel = pxPerDay >= 36 ? weekdayFull.slice(0, 2) : weekdayFull.slice(0, 1);
      const monthShort = dt.toLocaleDateString('en-US', { month: 'short' });
      buckets.push({
        key,
        startKey: key,
        endKey: key,
        days: 1,
        topLabel: i === 0 || d === 1 ? monthShort : '',
        subLabel: weekdayLabel,
        mainLabel: String(d),
        isCurrent: key === todayKey,
        isWeekend: dow === 0 || dow === 6,
      });
    }
    return { gridStartKey, totalDays: minDays, buckets };
  }

  if (granularity === 'week') {
    const gridStartKey = getMondayOfWeek(rawStartKey);
    const numWeeks = Math.max(8, Math.ceil(minDays / 7));
    const buckets: TimelineBucket[] = [];
    let prevMonthKey = '';

    for (let w = 0; w < numWeeks; w++) {
      const startKey = addDaysToDateKey(gridStartKey, w * 7);
      const endKey = addDaysToDateKey(startKey, 6);
      const [sy, sm, sd] = startKey.split('-').map(Number);
      const [, em, ed] = endKey.split('-').map(Number);
      const startDt = new Date(sy, (sm || 1) - 1, sd || 1);
      const startMonthKey = startKey.slice(0, 7);
      const showMonth = w === 0 || startMonthKey !== prevMonthKey;
      prevMonthKey = startMonthKey;

      const monthShort = startDt.toLocaleDateString('en-US', { month: 'short' });
      const weekWidth = 7 * pxPerDay;
      const mainLabel =
        weekWidth >= 112
          ? sm === em
            ? `${monthShort} ${sd}–${ed}`
            : `${formatShortDate(startKey)}–${formatShortDate(endKey)}`
          : weekWidth >= 78
            ? `${monthShort} ${sd}`
            : `${sm}/${sd}`;

      buckets.push({
        key: startKey,
        startKey,
        endKey,
        days: 7,
        topLabel: showMonth ? (sm === 1 || w === 0 ? `${monthShort} ${sy}` : monthShort) : '',
        subLabel: 'Wk',
        mainLabel,
        isCurrent: todayKey >= startKey && todayKey <= endKey,
      });
    }
    return { gridStartKey, totalDays: numWeeks * 7, buckets };
  }

  // Month granularity
  const gridStartKey = getFirstOfMonth(rawStartKey);
  let [year, month] = gridStartKey.split('-').map(Number);
  const buckets: TimelineBucket[] = [];
  let accumulatedDays = 0;

  while (accumulatedDays < minDays || buckets.length < 6) {
    const days = getDaysInMonth(year, month);
    const monthStr = String(month).padStart(2, '0');
    const startKey = `${year}-${monthStr}-01`;
    const endKey = `${year}-${monthStr}-${String(days).padStart(2, '0')}`;
    const dt = new Date(year, month - 1, 1);
    const monthWidth = days * pxPerDay;
    const mainLabel =
      monthWidth >= 115
        ? dt.toLocaleDateString('en-US', { month: 'long' })
        : dt.toLocaleDateString('en-US', { month: 'short' });

    buckets.push({
      key: startKey,
      startKey,
      endKey,
      days,
      topLabel: buckets.length === 0 || month === 1 ? String(year) : '',
      subLabel: '',
      mainLabel,
      isCurrent: todayKey >= startKey && todayKey <= endKey,
    });

    accumulatedDays += days;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return { gridStartKey, totalDays: accumulatedDays, buckets };
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
  const [pxPerDay, setPxPerDay] = useState<number>(DEFAULT_PX_FOR_GRANULARITY.day);
  const [windowStart, setWindowStart] = useState<string>(() => addDaysToDateKey(getTodayDateKey(), -14));
  const [groupByColumn, setGroupByColumn] = useState(true);
  const [viewportTimelineWidth, setViewportTimelineWidth] = useState<number>(960);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedScrollRef = useRef(false);
  const pendingScrollRef = useRef<{ scrollLeft: number } | null>(null);

  const granularity = getGranularity(pxPerDay);
  const hasTasks = tasks.length > 0;

  // Measure available timeline viewport width so zooming out always fills the canvas
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const stickyW = leftColRef.current?.offsetWidth ?? 280;
      setViewportTimelineWidth(Math.max(360, el.clientWidth - stickyW));
    };
    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [hasTasks]);

  const visibleDaysEstimate = Math.ceil(viewportTimelineWidth / pxPerDay);
  const minDaysToRender = useMemo(() => {
    if (granularity === 'month') return Math.max(visibleDaysEstimate + 240, 420);
    if (granularity === 'week') return Math.max(visibleDaysEstimate + 84, 140);
    return Math.max(visibleDaysEstimate + 28, 42);
  }, [granularity, visibleDaysEstimate]);

  const { gridStartKey, totalDays, buckets } = useMemo(
    () => buildBuckets(windowStart, granularity, minDaysToRender, pxPerDay, todayKey),
    [windowStart, granularity, minDaysToRender, pxPerDay, todayKey]
  );

  const gridEndKey = useMemo(
    () => addDaysToDateKey(gridStartKey, totalDays - 1),
    [gridStartKey, totalDays]
  );

  const gridTotalWidth = totalDays * pxPerDay;

  // Keep synchronous zoom math refs for zero-jitter multi-tick wheel bursts
  const liveZoomRef = useRef({
    pxPerDay,
    gridStartKey,
    totalDays,
  });
  liveZoomRef.current = { pxPerDay, gridStartKey, totalDays };

  // Center initial scroll nicely around Today (-5 days visible) once mounted
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (pendingScrollRef.current !== null) {
      el.scrollLeft = pendingScrollRef.current.scrollLeft;
      pendingScrollRef.current = null;
      return;
    }

    if (!hasInitializedScrollRef.current && tasks.length > 0) {
      hasInitializedScrollRef.current = true;
      const targetStart = addDaysToDateKey(todayKey, -5);
      const offsetDays = Math.max(0, diffDays(gridStartKey, targetStart));
      el.scrollLeft = offsetDays * pxPerDay;
    }
  }, [pxPerDay, gridStartKey, todayKey, tasks.length]);

  const applyZoom = useCallback(
    (nextPx: number, clientX?: number) => {
      const el = scrollContainerRef.current;
      const current = liveZoomRef.current;
      const clampedPx = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, nextPx));
      if (!el || Math.abs(clampedPx - current.pxPerDay) < 0.01) return;

      const stickyW = leftColRef.current?.offsetWidth ?? 280;
      const timelineWidth = Math.max(320, el.clientWidth - stickyW);
      const currentScrollLeft = pendingScrollRef.current?.scrollLeft ?? el.scrollLeft;

      let pointerOffset = timelineWidth / 2;
      if (typeof clientX === 'number') {
        const rect = el.getBoundingClientRect();
        const rawOffset = clientX - rect.left - stickyW;
        if (rawOffset >= 0 && rawOffset <= timelineWidth) {
          pointerOffset = rawOffset;
        }
      }

      const dayFloatFromGridStart = (currentScrollLeft + pointerOffset) / current.pxPerDay;
      const wholeDays = Math.floor(dayFloatFromGridStart);
      const subDayFraction = dayFloatFromGridStart - wholeDays;
      const anchorDateKey = addDaysToDateKey(current.gridStartKey, wholeDays);

      const nextGranularity = getGranularity(clampedPx);
      const nextVisibleDays = Math.ceil(timelineWidth / clampedPx);
      const leftBufferDays =
        nextGranularity === 'month'
          ? Math.max(120, Math.ceil(nextVisibleDays * 0.75))
          : nextGranularity === 'week'
            ? Math.max(42, Math.ceil(nextVisibleDays * 0.75))
            : Math.max(14, Math.ceil(nextVisibleDays * 0.75));

      const desiredViewportLeftDays = wholeDays + subDayFraction - pointerOffset / clampedPx;
      const rawNewStart = addDaysToDateKey(
        current.gridStartKey,
        Math.floor(desiredViewportLeftDays) - leftBufferDays
      );
      const alignedNewStart = alignStartForGranularity(rawNewStart, nextGranularity);

      const newDaysToAnchor = diffDays(alignedNewStart, anchorDateKey) + subDayFraction;
      const nextScrollLeft = Math.max(0, newDaysToAnchor * clampedPx - pointerOffset);

      liveZoomRef.current = {
        pxPerDay: clampedPx,
        gridStartKey: alignedNewStart,
        totalDays: current.totalDays,
      };
      pendingScrollRef.current = { scrollLeft: nextScrollLeft };

      setWindowStart(alignedNewStart);
      setPxPerDay(clampedPx);
    },
    []
  );

  // Non-passive mouse wheel listener for zoom on hover
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow native horizontal trackpad swipe or Shift+wheel horizontal pan
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 0.01) return;

      const stickyW = leftColRef.current?.offsetWidth ?? 280;
      const rect = el.getBoundingClientRect();
      const overLeftTaskColumn = e.clientX - rect.left < stickyW;
      const hasVerticalOverflow = el.scrollHeight > el.clientHeight + 4;

      // If hovered over the sticky task list and rows overflow vertically, scroll tasks normally;
      // hovering anywhere over the calendar timeline always zooms in/out
      if (overLeftTaskColumn && hasVerticalOverflow) return;

      e.preventDefault();

      const scaleUnit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 240 : 1;
      const normalizedDeltaY = Math.max(-120, Math.min(120, e.deltaY * scaleUnit));
      const zoomFactor = Math.exp(-normalizedDeltaY * 0.0024);
      const nextPx = liveZoomRef.current.pxPerDay * zoomFactor;

      applyZoom(nextPx, e.clientX);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [applyZoom, tasks.length]);

  const jumpToDate = useCallback(
    (targetDateKey: string, viewportRatio = 0.2) => {
      const el = scrollContainerRef.current;
      const stickyW = leftColRef.current?.offsetWidth ?? 280;
      const timelineWidth = el ? Math.max(320, el.clientWidth - stickyW) : viewportTimelineWidth;
      const visibleDays = Math.ceil(timelineWidth / pxPerDay);
      const leftBuffer =
        granularity === 'month'
          ? Math.max(120, Math.ceil(visibleDays * 0.75))
          : granularity === 'week'
            ? Math.max(42, Math.ceil(visibleDays * 0.75))
            : Math.max(14, Math.ceil(visibleDays * 0.75));

      const offsetPx = timelineWidth * viewportRatio;
      const desiredLeftDate = addDaysToDateKey(
        targetDateKey,
        -Math.round(offsetPx / pxPerDay)
      );
      const alignedStart = alignStartForGranularity(
        addDaysToDateKey(desiredLeftDate, -leftBuffer),
        granularity
      );
      const nextScrollLeft = Math.max(0, diffDays(alignedStart, targetDateKey) * pxPerDay - offsetPx);

      pendingScrollRef.current = { scrollLeft: nextScrollLeft };
      setWindowStart(alignedStart);
    },
    [granularity, pxPerDay, viewportTimelineWidth]
  );

  const handlePanStep = (direction: -1 | 1) => {
    const el = scrollContainerRef.current;
    const stepDays = granularity === 'month' ? 90 : granularity === 'week' ? 28 : 7;
    if (!el) {
      setWindowStart((prev) => alignStartForGranularity(addDaysToDateKey(prev, direction * stepDays), granularity));
      return;
    }

    const nextScroll = el.scrollLeft + direction * stepDays * pxPerDay;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (nextScroll >= 0 && nextScroll <= maxScroll) {
      el.scrollBy({ left: direction * stepDays * pxPerDay, behavior: 'smooth' });
      return;
    }

    const stickyW = leftColRef.current?.offsetWidth ?? 280;
    const timelineWidth = Math.max(320, el.clientWidth - stickyW);
    const currentCenterDay = Math.round((el.scrollLeft + timelineWidth / 2) / pxPerDay);
    const currentCenterDate = addDaysToDateKey(gridStartKey, currentCenterDay);
    const nextCenterDate = addDaysToDateKey(currentCenterDate, direction * stepDays);
    jumpToDate(nextCenterDate, 0.5);
  };

  const handleFitTasks = () => {
    if (tasks.length === 0) {
      applyZoom(DEFAULT_PX_FOR_GRANULARITY.day);
      jumpToDate(todayKey, 0.25);
      return;
    }
    let earliest = todayKey;
    let latest = todayKey;
    for (const t of tasks) {
      const span = computeTaskSpan(t, todayKey);
      if (span.minKey < earliest) earliest = span.minKey;
      if (span.maxKey > latest) latest = span.maxKey;
    }
    const spanDays = Math.max(7, diffDays(earliest, latest) + 4);
    const fitPx = Math.max(
      MIN_PX_PER_DAY,
      Math.min(64, (viewportTimelineWidth - 24) / spanDays)
    );
    const nextGranularity = getGranularity(fitPx);
    const nextVisibleDays = Math.ceil(viewportTimelineWidth / fitPx);
    const leftBuffer =
      nextGranularity === 'month'
        ? Math.max(120, Math.ceil(nextVisibleDays * 0.75))
        : nextGranularity === 'week'
          ? Math.max(42, Math.ceil(nextVisibleDays * 0.75))
          : Math.max(14, Math.ceil(nextVisibleDays * 0.75));

    const targetLeftDate = addDaysToDateKey(earliest, -2);
    const alignedStart = alignStartForGranularity(
      addDaysToDateKey(targetLeftDate, -leftBuffer),
      nextGranularity
    );
    const nextScrollLeft = Math.max(0, diffDays(alignedStart, targetLeftDate) * fitPx);

    pendingScrollRef.current = { scrollLeft: nextScrollLeft };
    setWindowStart(alignedStart);
    setPxPerDay(fitPx);
  };

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
    if (granularity === 'month') {
      return `${formatMonthYear(gridStartKey)} – ${formatMonthYear(gridEndKey)}`;
    }
    return `${formatShortDate(gridStartKey)} – ${formatShortDate(gridEndKey)}`;
  }, [granularity, gridStartKey, gridEndKey]);

  const todayOffsetDays = diffDays(gridStartKey, todayKey);
  const showTodayMarkerLine = todayOffsetDays >= 0 && todayOffsetDays < totalDays;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Calendar Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
            <button
              type="button"
              onClick={() => handlePanStep(-1)}
              aria-label="Pan earlier"
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => jumpToDate(todayKey, 0.25)}
              className="px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePanStep(1)}
              aria-label="Pan later"
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
          <div className="hidden 2xl:flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
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

          {/* Granularity & Zoom Controls */}
          <div className="flex items-center gap-1.5">
            <div
              role="group"
              aria-label="Calendar zoom level"
              className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              {(['day', 'week', 'month'] as const).map((tier) => {
                const label = tier === 'day' ? 'Days' : tier === 'week' ? 'Weeks' : 'Months';
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => applyZoom(DEFAULT_PX_FOR_GRANULARITY[tier])}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      granularity === tier
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
              <button
                type="button"
                onClick={() => applyZoom(pxPerDay / 1.35)}
                disabled={pxPerDay <= MIN_PX_PER_DAY + 0.05}
                aria-label="Zoom out calendar"
                title="Zoom out (or scroll down over calendar)"
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 border-r border-slate-200 dark:border-slate-700"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyZoom(pxPerDay * 1.35)}
                disabled={pxPerDay >= MAX_PX_PER_DAY - 0.05}
                aria-label="Zoom in calendar"
                title="Zoom in (or scroll up over calendar)"
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
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

      {/* Horizontal Zoomable Timeline Grid */}
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
        <div ref={scrollContainerRef} className="flex-1 overflow-auto relative">
          <div style={{ minWidth: `${280 + gridTotalWidth}px` }}>
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div
                ref={leftColRef}
                className="sticky left-0 z-30 w-[260px] sm:w-[300px] shrink-0 px-4 py-2.5 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Task Window
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
                  {tasks.length} {tasks.length === 1 ? 'row' : 'rows'} · Scroll to zoom
                </span>
              </div>

              <div className="flex shrink-0">
                {buckets.map((bucket) => {
                  const colWidth = bucket.days * pxPerDay;
                  return (
                    <div
                      key={bucket.key}
                      style={{ width: `${colWidth}px` }}
                      className={`shrink-0 py-1.5 px-1 text-center border-r border-slate-200/80 dark:border-slate-800/80 overflow-hidden ${
                        bucket.isCurrent
                          ? 'bg-blue-50/90 dark:bg-blue-950/50'
                          : bucket.isWeekend
                            ? 'bg-slate-50/80 dark:bg-slate-950/40'
                            : ''
                      }`}
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 h-3.5 leading-3 truncate">
                        {bucket.topLabel}
                      </div>
                      {bucket.subLabel && (
                        <div
                          className={`text-[10px] font-medium truncate ${
                            bucket.isCurrent
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {bucket.subLabel}
                        </div>
                      )}
                      <div
                        className={`text-xs font-mono tabular-nums truncate ${
                          bucket.isCurrent
                            ? 'font-bold text-blue-700 dark:text-blue-300'
                            : 'font-medium text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {bucket.mainLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task Rows */}
            <div className="relative">
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
                      <div style={{ width: `${gridTotalWidth}px` }} className="shrink-0 relative">
                        {showTodayMarkerLine && (
                          <div
                            style={{ left: `${(todayOffsetDays + 0.5) * pxPerDay}px` }}
                            className="absolute top-0 bottom-0 w-px bg-blue-400/50 dark:bg-blue-500/40 pointer-events-none"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {group.tasks.map((task) => {
                    const span = computeTaskSpan(task, todayKey);
                    const colName = columnMap.get(task.columnId)?.title ?? 'Column';
                    const assigneeName = task.assigneeId ? assigneeNames[task.assigneeId] : undefined;
                    const msgCount = messageCounts[task.id] ?? 0;
                    const linkCount = task.links?.length ?? 0;
                    const milestones = task.milestones ?? [];
                    const inset = pxPerDay >= 20 ? 3 : 1;

                    const renderSegment = (
                      segStart: string,
                      segEnd: string,
                      className: string,
                      labelTitle: string
                    ) => {
                      const rawStartIdx = diffDays(gridStartKey, segStart);
                      const rawEndIdx = diffDays(gridStartKey, segEnd);
                      if (rawEndIdx < 0 || rawStartIdx >= totalDays) return null;
                      const clippedStart = Math.max(0, rawStartIdx);
                      const clippedEnd = Math.min(totalDays - 1, rawEndIdx);
                      const leftPx = clippedStart * pxPerDay + inset;
                      const rawWidth = (clippedEnd - clippedStart + 1) * pxPerDay - inset * 2;
                      const widthPx = Math.max(8, rawWidth);
                      return (
                        <div
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          title={labelTitle}
                          className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md transition-opacity group-hover:opacity-95 ${className}`}
                        />
                      );
                    };

                    const minIdx = diffDays(gridStartKey, span.minKey);
                    const maxIdx = diffDays(gridStartKey, span.maxKey);
                    const isCompletelyBefore = maxIdx < 0;
                    const isCompletelyAfter = minIdx >= totalDays;

                    const placedIdx = diffDays(gridStartKey, span.startKey);
                    const dueIdx = task.dueDate ? diffDays(gridStartKey, task.dueDate) : -1;
                    const completedIdx = span.completedKey
                      ? diffDays(gridStartKey, span.completedKey)
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

                        {/* Horizontal Zoomable Bar Cell */}
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
                          {/* Background grid columns matching active granularity */}
                          {buckets.map((bucket) => (
                            <div
                              key={bucket.key}
                              style={{ width: `${bucket.days * pxPerDay}px` }}
                              className={`h-full shrink-0 border-r border-slate-100 dark:border-slate-800/70 ${
                                bucket.isCurrent
                                  ? 'bg-blue-50/40 dark:bg-blue-950/20'
                                  : bucket.isWeekend
                                    ? 'bg-slate-50/50 dark:bg-slate-950/30'
                                    : ''
                              }`}
                            />
                          ))}

                          {/* Crisp Today hairline across Week & Month views */}
                          {showTodayMarkerLine && granularity !== 'day' && (
                            <div
                              style={{ left: `${(todayOffsetDays + 0.5) * pxPerDay}px` }}
                              className="absolute top-0 bottom-0 w-px bg-blue-500/45 dark:bg-blue-400/45 pointer-events-none z-[1]"
                            />
                          )}

                          {/* Off-screen jump button if entire task span lies outside rendered range */}
                          {(isCompletelyBefore || isCompletelyAfter) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                jumpToDate(span.startKey, 0.2);
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
                              const gEnd = Math.min(totalDays - 1, maxIdx);
                              if (gEnd <= gStart) return null;
                              const gLeft = (gStart + 0.5) * pxPerDay;
                              const gWidth = (gEnd - gStart) * pxPerDay;
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
                          {placedIdx >= 0 && placedIdx < totalDays && (
                            <div
                              style={{
                                left: `${placedIdx * pxPerDay + Math.min(8, Math.max(2, pxPerDay * 0.2))}px`,
                              }}
                              title={`Placed on ${colName}: ${span.startKey}`}
                              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border-2 border-slate-800 dark:border-white z-[2]"
                            />
                          )}

                          {/* Due date ring marker */}
                          {task.dueDate && dueIdx >= 0 && dueIdx < totalDays && (
                            <div
                              style={{
                                left: `${(dueIdx + 0.5) * pxPerDay}px`,
                              }}
                              title={`Due date: ${task.dueDate}`}
                              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 bg-white dark:bg-slate-900 z-[2] ${
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
                            completedIdx < totalDays && (
                              <div
                                style={{
                                  left: `${(completedIdx + 0.5) * pxPerDay}px`,
                                }}
                                title={`Completed: ${span.completedKey}`}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-emerald-700 dark:bg-emerald-400 text-white dark:text-slate-950 flex items-center justify-center z-[3]"
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            )}

                          {/* Important Dates / Milestones diamonds */}
                          {milestones.map((ms) => {
                            const msIdx = diffDays(gridStartKey, ms.date);
                            if (msIdx < 0 || msIdx >= totalDays) return null;
                            const centerX = (msIdx + 0.5) * pxPerDay;
                            return (
                              <div
                                key={ms.id}
                                style={{ left: `${centerX}px` }}
                                title={`Milestone: ${ms.title} (${ms.date})`}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-[4] flex items-center"
                              >
                                <span
                                  className={`rotate-45 bg-amber-500 dark:bg-amber-400 border-2 border-white dark:border-slate-900 block shadow-xs ${
                                    pxPerDay < 12 ? 'w-2.5 h-2.5' : 'w-3 h-3'
                                  }`}
                                />
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
