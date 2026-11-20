import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BookOpen,
  Check,
  Circle,
  ExternalLink,
  FileText,
  Flag,
  GitBranch,
  Link2,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  createSubtask,
  deleteSubtask,
  deleteTask,
  deleteTaskMessage,
  generateId,
  getTodayDateKey,
  inferLinkKind,
  moveTask,
  normalizeTaskUrl,
  sendTaskMessage,
  subscribeSubtasks,
  toggleSubtaskCompleted,
  toggleTaskReviewed,
  updateTaskAssignee,
  updateTaskDetails,
  updateTaskReviewer,
} from '../lib/kanbanService';
import {
  isColumnReviewGated,
  LIMITS,
  type Board,
  type Column,
  type Priority,
  type Subtask,
  type Task,
  type TaskLink,
  type TaskLinkKind,
  type TaskMessage,
  type TaskMilestone,
} from '../types/kanban';

interface TaskDetailModalProps {
  uid: string;
  senderName: string;
  isAdmin: boolean;
  board: Board;
  task: Task;
  columns: Column[];
  allTasks: Task[];
  messages: TaskMessage[];
  assigneeOptions: Array<{ uid: string; label: string }>;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canAssignTasks: boolean;
  initialFocusChat?: boolean;
  onToggleSubtask?: (task: Task, subtask: Subtask, currentSubtasks: Subtask[]) => Promise<void> | void;
  onClose: () => void;
}

interface TaskMutationErrorContext {
  actionLabel: string;
  boardStatus?: string;
  isCreator?: boolean;
  isAdmin?: boolean;
  canAssignTasks?: boolean;
}

function formatTaskMutationError(
  err: unknown,
  fallback: string,
  ctx?: TaskMutationErrorContext
): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const raw = err.message.trim();
  let innerError = raw;
  let errorPath = '';

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string; path?: string | null };
      if (parsed.error) innerError = parsed.error;
      if (parsed.path) errorPath = parsed.path;
    } catch {
      // keep raw message
    }
  }

  const lower = innerError.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient')) {
    const action = ctx?.actionLabel || 'updating this task';
    const roleSummary = ctx?.isAdmin
      ? 'Admin'
      : ctx?.isCreator
        ? 'Board Creator'
        : ctx?.canAssignTasks
          ? 'Member with assign access'
          : 'No assign access';
    const details = [
      innerError,
      ctx?.boardStatus ? `board: ${ctx.boardStatus}` : '',
      `role: ${roleSummary}`,
      errorPath ? `path: ${errorPath}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return `Permission denied while ${action}. Make sure the board is active and your role allows assigning tasks (${details}).`;
  }

  return innerError || fallback;
}

function serializeForSync(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
}

export function TaskDetailModal({
  uid,
  senderName,
  isAdmin,
  board,
  task,
  columns,
  allTasks,
  messages,
  assigneeOptions,
  canCreateTasks,
  canEditTasks,
  canDeleteTasks,
  canAssignTasks,
  initialFocusChat = false,
  onToggleSubtask,
  onClose,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [placedOnColumnAt, setPlacedOnColumnAt] = useState(task.placedOnColumnAt ?? '');
  const [completed, setCompleted] = useState(task.completed);
  const [completedAt, setCompletedAt] = useState(task.completedAt ?? '');
  const [columnId, setColumnId] = useState(task.columnId);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    task.notificationsEnabled !== false
  );
  const [tags, setTags] = useState<string[]>(task.tags);
  const [tagInput, setTagInput] = useState('');

  const [links, setLinks] = useState<TaskLink[]>(task.links ?? []);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkKind, setLinkKind] = useState<TaskLinkKind>('repo');
  const [linkKindManual, setLinkKindManual] = useState(false);

  const [milestones, setMilestones] = useState<TaskMilestone[]>(task.milestones ?? []);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [reviewerId, setReviewerId] = useState(task.reviewerId ?? '');
  const [reviewed, setReviewed] = useState(Boolean(task.reviewed));
  const [reviewedAt, setReviewedAt] = useState(task.reviewedAt ?? '');
  const [reviewedBy, setReviewedBy] = useState(task.reviewedBy ?? '');
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatSectionRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedTaskRef = useRef<Task>(task);

  const taskMessages = useMemo(
    () => messages.filter((m) => m.taskId === task.id),
    [messages, task.id]
  );

  const canPostChat = isAdmin || board.status === 'active';

  useEffect(() => {
    const prev = lastSyncedTaskRef.current;
    if (prev.id !== task.id) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setDueDate(task.dueDate);
      setPlacedOnColumnAt(task.placedOnColumnAt ?? '');
      setCompleted(task.completed);
      setCompletedAt(task.completedAt ?? '');
      setColumnId(task.columnId);
      setAssigneeId(task.assigneeId ?? '');
      setNotificationsEnabled(task.notificationsEnabled !== false);
      setTags(task.tags);
      setLinks(task.links ?? []);
      setMilestones(task.milestones ?? []);
      setReviewerId(task.reviewerId ?? '');
      setReviewed(Boolean(task.reviewed));
      setReviewedAt(task.reviewedAt ?? '');
      setReviewedBy(task.reviewedBy ?? '');
      setAssigneeError(null);
      setReviewError(null);
      setErrorMsg(null);
      lastSyncedTaskRef.current = task;
      return;
    }

    if (prev.title !== task.title) setTitle(task.title);
    if (prev.description !== task.description) setDescription(task.description);
    if (prev.priority !== task.priority) setPriority(task.priority);
    if (prev.dueDate !== task.dueDate) setDueDate(task.dueDate);
    if ((prev.placedOnColumnAt ?? '') !== (task.placedOnColumnAt ?? '')) {
      setPlacedOnColumnAt(task.placedOnColumnAt ?? '');
    }
    if (prev.completed !== task.completed) setCompleted(task.completed);
    if ((prev.completedAt ?? '') !== (task.completedAt ?? '')) {
      setCompletedAt(task.completedAt ?? '');
    }
    if (prev.columnId !== task.columnId) setColumnId(task.columnId);
    if (!savingAssignee && (prev.assigneeId ?? '') !== (task.assigneeId ?? '')) {
      setAssigneeId(task.assigneeId ?? '');
    }
    if ((prev.notificationsEnabled !== false) !== (task.notificationsEnabled !== false)) {
      setNotificationsEnabled(task.notificationsEnabled !== false);
    }
    if (serializeForSync(prev.tags) !== serializeForSync(task.tags)) {
      setTags(task.tags);
    }
    if (serializeForSync(prev.links ?? []) !== serializeForSync(task.links ?? [])) {
      setLinks(task.links ?? []);
    }
    if (serializeForSync(prev.milestones ?? []) !== serializeForSync(task.milestones ?? [])) {
      setMilestones(task.milestones ?? []);
    }
    if (!savingReview) {
      if ((prev.reviewerId ?? '') !== (task.reviewerId ?? '')) {
        setReviewerId(task.reviewerId ?? '');
      }
      if (Boolean(prev.reviewed) !== Boolean(task.reviewed)) {
        setReviewed(Boolean(task.reviewed));
      }
      if ((prev.reviewedAt ?? '') !== (task.reviewedAt ?? '')) {
        setReviewedAt(task.reviewedAt ?? '');
      }
      if ((prev.reviewedBy ?? '') !== (task.reviewedBy ?? '')) {
        setReviewedBy(task.reviewedBy ?? '');
      }
    }

    lastSyncedTaskRef.current = {
      ...task,
      assigneeId: savingAssignee ? prev.assigneeId : task.assigneeId,
      reviewerId: savingReview ? prev.reviewerId : task.reviewerId,
      reviewed: savingReview ? prev.reviewed : task.reviewed,
      reviewedAt: savingReview ? prev.reviewedAt : task.reviewedAt,
      reviewedBy: savingReview ? prev.reviewedBy : task.reviewedBy,
    };
  }, [task, savingAssignee, savingReview]);

  useEffect(() => {
    const unsub = subscribeSubtasks(board.id, task.id, setSubtasks);
    return () => unsub();
  }, [board.id, task.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (initialFocusChat) {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      chatInputRef.current?.focus();
    }
  }, [initialFocusChat, task.id]);

  useEffect(() => {
    if (taskMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [taskMessages.length]);

  const handleAddTag = () => {
    if (!canEditTasks) return;
    const clean = tagInput.trim().slice(0, LIMITS.TASK_TAG_LENGTH_MAX);
    if (!clean) return;
    if (tags.length >= LIMITS.TASK_TAGS_MAX || tags.includes(clean)) {
      setTagInput('');
      return;
    }
    setTags([...tags, clean]);
    setTagInput('');
  };

  const handleAddLink = () => {
    if (!canEditTasks || !linkUrl.trim() || links.length >= LIMITS.TASK_LINKS_MAX) return;
    setErrorMsg(null);
    try {
      const normalized = normalizeTaskUrl(linkUrl);
      if (links.some((l) => l.url === normalized)) {
        setErrorMsg('That URL is already linked to this task.');
        return;
      }
      const hostFallback = new URL(normalized).hostname.replace(/^www\./, '');
      const cleanLabel = linkLabel.trim().slice(0, LIMITS.TASK_LINK_LABEL_MAX) || hostFallback;
      const finalKind = linkKindManual ? linkKind : inferLinkKind(normalized);
      setLinks([...links, { label: cleanLabel, url: normalized, kind: finalKind }]);
      setLinkUrl('');
      setLinkLabel('');
      setLinkKind('repo');
      setLinkKindManual(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid link URL.');
    }
  };

  const handleAddMilestone = () => {
    if (!canEditTasks || milestones.length >= LIMITS.TASK_MILESTONES_MAX) return;
    const cleanTitle = milestoneTitle.trim().slice(0, LIMITS.TASK_MILESTONE_TITLE_MAX);
    if (!cleanTitle || !milestoneDate) return;
    const next = [...milestones, { id: generateId('ms'), title: cleanTitle, date: milestoneDate }];
    next.sort((a, b) => a.date.localeCompare(b.date));
    setMilestones(next);
    setMilestoneTitle('');
    setMilestoneDate('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditTasks || saving) return;
    if (!title.trim()) {
      setErrorMsg('Task title is required.');
      return;
    }

    const targetCol = columns.find((c) => c.id === columnId);
    if (targetCol && targetCol.id !== task.columnId && isColumnReviewGated(targetCol) && !reviewed) {
      setErrorMsg(
        `Mark this task as Reviewed in the Review & Sign-Off section below before moving it to "${targetCol.title}".`
      );
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const finalLinks = [...links];
      if (linkUrl.trim() && finalLinks.length < LIMITS.TASK_LINKS_MAX) {
        const normalized = normalizeTaskUrl(linkUrl);
        if (!finalLinks.some((l) => l.url === normalized)) {
          const hostFallback = new URL(normalized).hostname.replace(/^www\./, '');
          const cleanLabel = linkLabel.trim().slice(0, LIMITS.TASK_LINK_LABEL_MAX) || hostFallback;
          const finalKind = linkKindManual ? linkKind : inferLinkKind(normalized);
          finalLinks.push({ label: cleanLabel, url: normalized, kind: finalKind });
        }
      }

      const finalMilestones = [...milestones];
      if (milestoneTitle.trim() && milestoneDate && finalMilestones.length < LIMITS.TASK_MILESTONES_MAX) {
        finalMilestones.push({
          id: generateId('ms'),
          title: milestoneTitle.trim().slice(0, LIMITS.TASK_MILESTONE_TITLE_MAX),
          date: milestoneDate,
        });
      }

      if (columnId !== task.columnId) {
        const targetColTasks = allTasks.filter((t) => t.columnId === columnId);
        const maxPos = targetColTasks.reduce((m, t) => Math.max(m, t.position), 0);
        await moveTask(board.id, task.id, columnId, maxPos + 1000, true);
      }
      await updateTaskDetails(board.id, task.id, {
        title,
        description,
        priority,
        tags,
        dueDate,
        completed,
        completedAt,
        placedOnColumnAt,
        assigneeId: canAssignTasks ? assigneeId : (task.assigneeId ?? ''),
        notificationsEnabled,
        links: finalLinks,
        milestones: finalMilestones,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        formatTaskMutationError(err, 'Unable to save task changes.', {
          actionLabel: 'saving task changes',
          boardStatus: board.status,
          isCreator: board.ownerId === uid,
          isAdmin,
          canAssignTasks,
        })
      );
      setSaving(false);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSubtaskTitle.trim();
    if (!clean || !canCreateTasks) return;
    const maxPos = subtasks.reduce((m, s) => Math.max(m, s.position), 0);
    setNewSubtaskTitle('');
    await createSubtask(uid, board, task.id, clean, maxPos + 1000);
  };

  const handleDeleteTask = async () => {
    if (!canDeleteTasks || saving) return;
    setSaving(true);
    try {
      await deleteTask(board.id, task.id);
      onClose();
    } catch (err) {
      setErrorMsg(
        formatTaskMutationError(err, 'Unable to delete task.', {
          actionLabel: 'deleting this task',
          boardStatus: board.status,
          isCreator: board.ownerId === uid,
          isAdmin,
          canAssignTasks,
        })
      );
      setSaving(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newMessageText.trim();
    if (!clean || sendingMessage || !canPostChat) return;
    setSendingMessage(true);
    setErrorMsg(null);
    try {
      await sendTaskMessage(uid, senderName, board, { id: task.id, title: title.trim() || task.title }, clean);
      setNewMessageText('');
    } catch (err) {
      setErrorMsg(
        formatTaskMutationError(err, 'Unable to send chat message.', {
          actionLabel: 'sending chat message',
          boardStatus: board.status,
          isCreator: board.ownerId === uid,
          isAdmin,
          canAssignTasks,
        })
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const handleAssigneeChange = async (nextAssigneeId: string) => {
    if (!canAssignTasks || savingAssignee) return;
    const prevAssigneeId = assigneeId;
    setAssigneeId(nextAssigneeId);
    setSavingAssignee(true);
    setAssigneeError(null);
    setErrorMsg(null);
    try {
      await updateTaskAssignee(board.id, task.id, nextAssigneeId);
    } catch (err) {
      setAssigneeId(prevAssigneeId);
      const formatted = formatTaskMutationError(err, 'Unable to update assignee.', {
        actionLabel: 'updating task assignee',
        boardStatus: board.status,
        isCreator: board.ownerId === uid,
        isAdmin,
        canAssignTasks,
      });
      setAssigneeError(formatted);
      setErrorMsg(formatted);
    } finally {
      setSavingAssignee(false);
    }
  };

  const handleReviewerChange = async (nextReviewerId: string) => {
    if (!canAssignTasks || savingReview) return;
    const prevReviewerId = reviewerId;
    setReviewerId(nextReviewerId);
    setSavingReview(true);
    setReviewError(null);
    setErrorMsg(null);
    try {
      await updateTaskReviewer(board.id, task.id, nextReviewerId);
    } catch (err) {
      setReviewerId(prevReviewerId);
      const formatted = formatTaskMutationError(err, 'Unable to assign reviewer.', {
        actionLabel: 'assigning reviewer',
        boardStatus: board.status,
        isCreator: board.ownerId === uid,
        isAdmin,
        canAssignTasks,
      });
      setReviewError(formatted);
      setErrorMsg(formatted);
    } finally {
      setSavingReview(false);
    }
  };

  const handleToggleReviewed = async () => {
    if (!(canEditTasks || canAssignTasks) || savingReview) return;
    const prevReviewed = reviewed;
    const prevReviewedAt = reviewedAt;
    const prevReviewedBy = reviewedBy;
    const nextReviewed = !reviewed;

    setReviewed(nextReviewed);
    setReviewedAt(nextReviewed ? getTodayDateKey() : '');
    setReviewedBy(nextReviewed ? uid : '');
    setSavingReview(true);
    setReviewError(null);
    setErrorMsg(null);
    try {
      await toggleTaskReviewed(board.id, task.id, nextReviewed, uid);
    } catch (err) {
      setReviewed(prevReviewed);
      setReviewedAt(prevReviewedAt);
      setReviewedBy(prevReviewedBy);
      const formatted = formatTaskMutationError(err, 'Unable to update review status.', {
        actionLabel: 'updating review status',
        boardStatus: board.status,
        isCreator: board.ownerId === uid,
        isAdmin,
        canAssignTasks,
      });
      setReviewError(formatted);
      setErrorMsg(formatted);
    } finally {
      setSavingReview(false);
    }
  };

  const reviewedByLabel = reviewedBy
    ? reviewedBy === uid
      ? 'You'
      : assigneeOptions.find((opt) => opt.uid === reviewedBy)?.label || 'Team member'
    : '';

  const selectedTargetColumn = columns.find((c) => c.id === columnId);
  const isReviewBlockedColumn = Boolean(
    selectedTargetColumn &&
      selectedTargetColumn.id !== task.columnId &&
      isColumnReviewGated(selectedTargetColumn) &&
      !reviewed
  );

  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-heading"
        className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <button
              type="button"
              disabled={!canEditTasks}
              onClick={() => {
                const nextCompleted = !completed;
                setCompleted(nextCompleted);
                setCompletedAt(nextCompleted ? completedAt || getTodayDateKey() : '');
              }}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                completed
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              } disabled:opacity-60`}
            >
              {completed ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              <span>{completed ? 'Completed' : 'Mark complete'}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              disabled={!canEditTasks}
              onClick={() => setNotificationsEnabled((prev) => !prev)}
              title={
                notificationsEnabled
                  ? 'Notifications enabled for due dates and milestones'
                  : 'Notifications muted for this task'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                notificationsEnabled
                  ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              } disabled:opacity-60`}
            >
              {notificationsEnabled ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              <span>{notificationsEnabled ? 'Notifications On' : 'Notifications Off'}</span>
            </button>
            <h2 id="task-modal-heading" className="text-sm font-semibold text-slate-500 dark:text-slate-400 truncate">
              Task Details
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5">
              {errorMsg}
            </div>
          )}

          <form id="task-edit-form" onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="task-title-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Title
              </label>
              <input
                id="task-title-input"
                type="text"
                disabled={!canEditTasks}
                maxLength={LIMITS.TASK_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-medium bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="task-col-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Column
                </label>
                <select
                  id="task-col-select"
                  disabled={!canEditTasks}
                  value={columnId}
                  onChange={(e) => {
                    const nextCol = e.target.value;
                    setColumnId(nextCol);
                    setPlacedOnColumnAt(
                      nextCol !== task.columnId
                        ? getTodayDateKey()
                        : (task.placedOnColumnAt ?? '')
                    );
                  }}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  {columns.map((c) => {
                    const gated = c.id !== task.columnId && isColumnReviewGated(c) && !reviewed;
                    return (
                      <option key={c.id} value={c.id}>
                        {gated ? `${c.title} (requires Reviewed)` : c.title}
                      </option>
                    );
                  })}
                </select>
                {isReviewBlockedColumn && selectedTargetColumn && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Mark this task as Reviewed below before moving to {selectedTargetColumn.title}.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="task-priority-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Priority
                </label>
                <select
                  id="task-priority-select"
                  disabled={!canEditTasks}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="task-assignee-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Assignee
                  </label>
                  {canAssignTasks && assigneeId !== uid && assigneeOptions.some((opt) => opt.uid === uid) && (
                    <button
                      type="button"
                      disabled={savingAssignee}
                      onClick={() => void handleAssigneeChange(uid)}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap disabled:opacity-50"
                    >
                      Assign to me
                    </button>
                  )}
                </div>
                <select
                  id="task-assignee-select"
                  disabled={!canAssignTasks || savingAssignee}
                  value={assigneeId}
                  onChange={(e) => void handleAssigneeChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((opt) => (
                    <option key={opt.uid} value={opt.uid}>
                      {opt.label}
                    </option>
                  ))}
                  {assigneeId && !assigneeOptions.some((opt) => opt.uid === assigneeId) && (
                    <option value={assigneeId}>Unlisted user</option>
                  )}
                </select>
                {savingAssignee && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Saving assignee...
                  </p>
                )}
                {assigneeError && (
                  <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                    {assigneeError}
                  </p>
                )}
                {canEditTasks && !canAssignTasks && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Requires &ldquo;Add assignee / reviewer&rdquo; permission.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="task-due-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Due Date
                </label>
                <input
                  id="task-due-input"
                  type="date"
                  disabled={!canEditTasks}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-desc-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Notes
              </label>
              <textarea
                id="task-desc-input"
                rows={4}
                disabled={!canEditTasks}
                maxLength={LIMITS.TASK_DESC_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add implementation context, acceptance criteria, or links..."
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
              />
            </div>

            {/* Timeline & Important Dates */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Timeline &amp; Important Dates
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {milestones.length}/{LIMITS.TASK_MILESTONES_MAX} milestones
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="task-placed-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Placed on Column
                  </label>
                  <input
                    id="task-placed-input"
                    type="date"
                    disabled={!canEditTasks}
                    value={placedOnColumnAt}
                    onChange={(e) => setPlacedOnColumnAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="task-completed-at-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Completion Date
                  </label>
                  <input
                    id="task-completed-at-input"
                    type="date"
                    disabled={!canEditTasks || !completed}
                    value={completed ? completedAt : ''}
                    onChange={(e) => setCompletedAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                  />
                </div>
              </div>

              {milestones.length > 0 && (
                <ul className="space-y-1.5">
                  {milestones.map((ms) => (
                    <li
                      key={ms.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Flag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          {ms.date}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {ms.title}
                        </span>
                      </div>
                      {canEditTasks && (
                        <button
                          type="button"
                          onClick={() => setMilestones(milestones.filter((m) => m.id !== ms.id))}
                          aria-label={`Remove milestone ${ms.title}`}
                          className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canEditTasks && milestones.length < LIMITS.TASK_MILESTONES_MAX && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    maxLength={LIMITS.TASK_MILESTONE_TITLE_MAX}
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMilestone();
                      }
                    }}
                    placeholder="Important date or milestone..."
                    aria-label="Milestone title"
                    className="sm:col-span-6 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <input
                    type="date"
                    value={milestoneDate}
                    onChange={(e) => setMilestoneDate(e.target.value)}
                    aria-label="Milestone date"
                    className="sm:col-span-4 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    disabled={!milestoneTitle.trim() || !milestoneDate}
                    className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              )}
            </div>

            {/* Files & Repo Links */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Files &amp; Repo Links
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {links.length}/{LIMITS.TASK_LINKS_MAX}
                </span>
              </div>

              {links.length > 0 ? (
                <ul className="space-y-1.5">
                  {links.map((link) => {
                    const icon =
                      link.kind === 'repo' ? (
                        <GitBranch className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                      ) : link.kind === 'file' ? (
                        <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                      ) : link.kind === 'doc' ? (
                        <BookOpen className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                      ) : (
                        <Link2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                      );
                    return (
                      <li
                        key={link.url}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60"
                      >
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 min-w-0 flex-1 group"
                        >
                          {icon}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 group-hover:underline truncate">
                              <span className="truncate">{link.label}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {link.url}
                            </div>
                          </div>
                        </a>
                        {canEditTasks && (
                          <button
                            type="button"
                            onClick={() => setLinks(links.filter((l) => l.url !== link.url))}
                            aria-label={`Remove link ${link.label}`}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No repository or file links attached yet.
                </p>
              )}

              {canEditTasks && links.length < LIMITS.TASK_LINKS_MAX && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setLinkUrl(nextVal);
                      if (!linkKindManual && nextVal.trim()) {
                        setLinkKind(inferLinkKind(nextVal));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLink();
                      }
                    }}
                    placeholder="https://github.com/org/repo or file URL"
                    aria-label="Link URL"
                    className="sm:col-span-5 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <input
                    type="text"
                    maxLength={LIMITS.TASK_LINK_LABEL_MAX}
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLink();
                      }
                    }}
                    placeholder="Label (optional)"
                    aria-label="Link label"
                    className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <select
                    value={linkKind}
                    aria-label="Link type"
                    onChange={(e) => {
                      setLinkKind(e.target.value as TaskLinkKind);
                      setLinkKindManual(true);
                    }}
                    className="sm:col-span-2 px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="repo">Repo</option>
                    <option value="file">File</option>
                    <option value="doc">Doc</option>
                    <option value="other">Link</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddLink}
                    disabled={!linkUrl.trim()}
                    className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Tags ({tags.length}/{LIMITS.TASK_TAGS_MAX})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                    <span>{tag}</span>
                    {canEditTasks && (
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
                        aria-label={`Remove tag ${tag}`}
                        className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
                {canEditTasks && tags.length < LIMITS.TASK_TAGS_MAX && (
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={LIMITS.TASK_TAG_LENGTH_MAX}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag..."
                      className="w-28 px-2.5 py-1 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Subtasks Checklist */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Checklist
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {completedSubtasks} / {subtasks.length}
              </span>
            </div>

            {subtasks.length > 0 && (
              <ul className="space-y-1.5">
                {subtasks.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <button
                      type="button"
                      disabled={!canEditTasks}
                      onClick={() => {
                        if (onToggleSubtask) {
                          void onToggleSubtask(task, sub, subtasks);
                        } else {
                          void toggleSubtaskCompleted(board.id, task.id, sub.id, !sub.completed);
                        }
                      }}
                      className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                    >
                      {sub.completed ? (
                        <span className="w-4 h-4 rounded bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 shrink-0" />
                      )}
                      <span
                        className={`text-sm truncate ${
                          sub.completed
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {sub.title}
                      </span>
                    </button>
                    {canDeleteTasks && (
                      <button
                        type="button"
                        aria-label={`Delete checklist item ${sub.title}`}
                        onClick={() => deleteSubtask(board.id, task.id, sub.id)}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canCreateTasks && (
              <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={LIMITS.SUBTASK_TITLE_MAX}
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Add checklist item..."
                  className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>
            )}
          </div>

          {/* Task Chat Log */}
          <div
            ref={chatSectionRef}
            className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Chat Log
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {taskMessages.length} {taskMessages.length === 1 ? 'message' : 'messages'}
              </span>
            </div>

            {taskMessages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                No messages on this task yet. Start the discussion below.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2.5 pr-1">
                {taskMessages.map((msg) => {
                  const isMine = msg.senderId === uid;
                  const canDeleteMsg =
                    (isAdmin || board.status === 'active') &&
                    (isAdmin || board.ownerId === uid || isMine);
                  const timeLabel = msg.createdAt
                    ? msg.createdAt.toDate().toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'Sending...';

                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg border px-3.5 py-2.5 text-sm space-y-1 ${
                        isMine
                          ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/80 dark:border-blue-900/60'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {isMine ? `${msg.senderName} (You)` : msg.senderName}
                          </span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {timeLabel}
                          </span>
                        </div>
                        {canDeleteMsg && (
                          <button
                            type="button"
                            aria-label="Delete chat message"
                            onClick={() => deleteTaskMessage(board.id, msg.id)}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}

            {canPostChat ? (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  maxLength={LIMITS.MESSAGE_TEXT_MAX}
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Write a message to this task's chat log..."
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !newMessageText.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingMessage ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Board is archived. Chat log is read-only.
              </p>
            )}
          </div>

          {/* Review & Sign-Off */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`w-3.5 h-3.5 ${
                    reviewed
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Review &amp; Sign-Off
                </h3>
              </div>
              {reviewed && (
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {reviewedByLabel ? `Reviewed by ${reviewedByLabel}` : 'Reviewed'}
                  {reviewedAt ? ` · ${reviewedAt}` : ''}
                </span>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-3.5">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="task-reviewer-select"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Reviewer
                  </label>
                  {canAssignTasks &&
                    reviewerId !== uid &&
                    assigneeOptions.some((opt) => opt.uid === uid) && (
                      <button
                        type="button"
                        disabled={savingReview}
                        onClick={() => void handleReviewerChange(uid)}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap disabled:opacity-50"
                      >
                        Assign me
                      </button>
                    )}
                </div>
                <select
                  id="task-reviewer-select"
                  disabled={!canAssignTasks || savingReview}
                  value={reviewerId}
                  onChange={(e) => void handleReviewerChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((opt) => (
                    <option key={opt.uid} value={opt.uid}>
                      {opt.label}
                    </option>
                  ))}
                  {reviewerId && !assigneeOptions.some((opt) => opt.uid === reviewerId) && (
                    <option value={reviewerId}>Unlisted user</option>
                  )}
                </select>
                {savingReview && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Saving review status...
                  </p>
                )}
                {reviewError && (
                  <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                    {reviewError}
                  </p>
                )}
                {canEditTasks && !canAssignTasks && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Requires &ldquo;Add assignee / reviewer&rdquo; permission.
                  </p>
                )}
                {reviewerId && assigneeId && reviewerId === assigneeId && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Reviewer is currently the same person as the assignee.
                  </p>
                )}
              </div>

              <div className="shrink-0 flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Reviewed
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reviewed}
                  aria-label="Mark task reviewed"
                  disabled={!(canEditTasks || canAssignTasks) || savingReview}
                  onClick={() => void handleToggleReviewed()}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
                    reviewed
                      ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500'
                      : 'bg-slate-200 border-slate-300 dark:bg-slate-800 dark:border-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      reviewed ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/70 dark:bg-slate-900">
          {canDeleteTasks ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                  Delete permanently?
                </span>
                <button
                  type="button"
                  onClick={handleDeleteTask}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md whitespace-nowrap"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete task</span>
              </button>
            )
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {!canEditTasks ? (canAssignTasks ? 'Assign-only access' : 'View-only access') : 'Task deletion restricted'}
            </span>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              Close
            </button>
            {canEditTasks && (
              <button
                type="submit"
                form="task-edit-form"
                disabled={saving || savingAssignee || savingReview}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
