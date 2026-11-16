import { useEffect, useState } from 'react';
import { Bell, BellOff, BookOpen, FileText, Flag, GitBranch, Link2, Plus, Trash2, X } from 'lucide-react';
import {
  createTask,
  generateId,
  getTodayDateKey,
  inferLinkKind,
  normalizeTaskUrl,
} from '../lib/kanbanService';
import {
  LIMITS,
  type Board,
  type Column,
  type Priority,
  type Task,
  type TaskLink,
  type TaskLinkKind,
  type TaskMilestone,
} from '../types/kanban';

interface CreateTaskModalProps {
  uid: string;
  board: Board;
  columns: Column[];
  tasks: Task[];
  assigneeOptions: Array<{ uid: string; label: string }>;
  onClose: () => void;
}

function LinkKindIcon({ kind }: { kind: TaskLinkKind }) {
  if (kind === 'repo') return <GitBranch className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />;
  if (kind === 'file') return <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />;
  if (kind === 'doc') return <BookOpen className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />;
  return <Link2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />;
}

export function CreateTaskModal({
  uid,
  board,
  columns,
  tasks,
  assigneeOptions,
  onClose,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState(columns[0]?.id ?? '');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [placedOnColumnAt, setPlacedOnColumnAt] = useState(() => getTodayDateKey());
  const [dueDate, setDueDate] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  const [links, setLinks] = useState<TaskLink[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkKind, setLinkKind] = useState<TaskLinkKind>('repo');
  const [linkKindManual, setLinkKindManual] = useState(false);

  const [milestones, setMilestones] = useState<TaskMilestone[]>([]);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleAddLink = () => {
    if (!linkUrl.trim() || links.length >= LIMITS.TASK_LINKS_MAX) return;
    setErrorMsg(null);
    try {
      const normalized = normalizeTaskUrl(linkUrl);
      if (links.some((l) => l.url === normalized)) {
        setErrorMsg('That URL has already been added to this task.');
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
    const cleanTitle = milestoneTitle.trim().slice(0, LIMITS.TASK_MILESTONE_TITLE_MAX);
    if (!cleanTitle || !milestoneDate || milestones.length >= LIMITS.TASK_MILESTONES_MAX) return;
    const next = [...milestones, { id: generateId('ms'), title: cleanTitle, date: milestoneDate }];
    next.sort((a, b) => a.date.localeCompare(b.date));
    setMilestones(next);
    setMilestoneTitle('');
    setMilestoneDate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !columnId || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const colTasks = tasks.filter((t) => t.columnId === columnId);
      const maxPos = colTasks.reduce((m, t) => Math.max(m, t.position), 0);
      const tags = tagsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, LIMITS.TASK_TAGS_MAX);

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

      await createTask(uid, board, columnId, {
        title,
        description,
        priority,
        position: maxPos + 1000,
        tags,
        dueDate,
        assigneeId,
        placedOnColumnAt,
        links: finalLinks,
        milestones: finalMilestones,
        notificationsEnabled,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create task.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-heading"
        className="w-full max-w-xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 id="create-task-heading" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            New Task
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5">
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="new-task-title" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Title
            </label>
            <input
              id="new-task-title"
              type="text"
              autoFocus
              required
              maxLength={LIMITS.TASK_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to get done?"
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="new-task-col" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Column
              </label>
              <select
                id="new-task-col"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-task-priority" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Priority
              </label>
              <select
                id="new-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="new-task-assignee" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Assignee
                </label>
                {assigneeId !== uid && assigneeOptions.some((opt) => opt.uid === uid) && (
                  <button
                    type="button"
                    onClick={() => setAssigneeId(uid)}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    Assign to me
                  </button>
                )}
              </div>
              <select
                id="new-task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((opt) => (
                  <option key={opt.uid} value={opt.uid}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="new-task-placed" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Placed on Column
              </label>
              <input
                id="new-task-placed"
                type="date"
                value={placedOnColumnAt}
                onChange={(e) => setPlacedOnColumnAt(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-task-due" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Due Date
              </label>
              <input
                id="new-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-task-tags" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Tags (comma separated)
              </label>
              <input
                id="new-task-tags"
                type="text"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="design, api, q4"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-task-desc" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Notes
            </label>
            <textarea
              id="new-task-desc"
              rows={2}
              maxLength={LIMITS.TASK_DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Files & Repo Links */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Files &amp; Repo Links ({links.length}/{LIMITS.TASK_LINKS_MAX})
              </span>
            </div>

            {links.length > 0 && (
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li
                    key={link.url}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <LinkKindIcon kind={link.kind} />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {link.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 truncate">
                        {link.url}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinks(links.filter((l) => l.url !== link.url))}
                      aria-label={`Remove link ${link.label}`}
                      className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {links.length < LIMITS.TASK_LINKS_MAX && (
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
                  className="sm:col-span-6 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                  className="sm:col-span-1 inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Milestones / Important Dates */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Important Dates &amp; Milestones ({milestones.length}/{LIMITS.TASK_MILESTONES_MAX})
              </span>
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
                    <button
                      type="button"
                      onClick={() => setMilestones(milestones.filter((m) => m.id !== ms.id))}
                      aria-label={`Remove milestone ${ms.title}`}
                      className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {milestones.length < LIMITS.TASK_MILESTONES_MAX && (
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
                  placeholder="Milestone title (e.g. Design Freeze)"
                  aria-label="Milestone title"
                  className="sm:col-span-7 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                  className="sm:col-span-1 inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Task Notifications Toggle */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Due Date &amp; Milestone Notifications
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Include this task in top-bar upcoming deadline and milestone reminders.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              onClick={() => setNotificationsEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                notificationsEnabled
                  ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {notificationsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              <span>{notificationsEnabled ? 'On' : 'Off'}</span>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !columnId}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {submitting ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
