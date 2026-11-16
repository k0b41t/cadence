import { useEffect, useState } from 'react';
import { Check, Circle, Plus, Trash2, X } from 'lucide-react';
import {
  createSubtask,
  deleteSubtask,
  deleteTask,
  moveTask,
  subscribeSubtasks,
  toggleSubtaskCompleted,
  updateTaskDetails,
} from '../lib/kanbanService';
import { LIMITS, type Board, type Column, type Priority, type Subtask, type Task } from '../types/kanban';

interface TaskDetailModalProps {
  uid: string;
  board: Board;
  task: Task;
  columns: Column[];
  allTasks: Task[];
  assigneeOptions: Array<{ uid: string; label: string }>;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  onClose: () => void;
}

export function TaskDetailModal({
  uid,
  board,
  task,
  columns,
  allTasks,
  assigneeOptions,
  canCreateTasks,
  canEditTasks,
  canDeleteTasks,
  onClose,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [completed, setCompleted] = useState(task.completed);
  const [columnId, setColumnId] = useState(task.columnId);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [tags, setTags] = useState<string[]>(task.tags);
  const [tagInput, setTagInput] = useState('');

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(task.dueDate);
    setCompleted(task.completed);
    setColumnId(task.columnId);
    setAssigneeId(task.assigneeId ?? '');
    setTags(task.tags);
  }, [task]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditTasks || saving) return;
    if (!title.trim()) {
      setErrorMsg('Task title is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      if (columnId !== task.columnId) {
        const targetColTasks = allTasks.filter((t) => t.columnId === columnId);
        const maxPos = targetColTasks.reduce((m, t) => Math.max(m, t.position), 0);
        await moveTask(board.id, task.id, columnId, maxPos + 1000);
      }
      await updateTaskDetails(board.id, task.id, {
        title,
        description,
        priority,
        tags,
        dueDate,
        completed,
        assigneeId,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save task changes.');
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
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete task.');
      setSaving(false);
    }
  };

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
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              disabled={!canEditTasks}
              onClick={() => setCompleted(!completed)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                completed
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              } disabled:opacity-60`}
            >
              {completed ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              <span>{completed ? 'Completed' : 'Mark complete'}</span>
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
                  onChange={(e) => setColumnId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
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
                <label htmlFor="task-assignee-select" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Assignee
                </label>
                <select
                  id="task-assignee-select"
                  disabled={!canEditTasks}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((opt) => (
                    <option key={opt.uid} value={opt.uid}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                      onClick={() =>
                        toggleSubtaskCompleted(board.id, task.id, sub.id, !sub.completed)
                      }
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
              {!canEditTasks ? 'View-only access' : 'Task deletion restricted'}
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
                disabled={saving}
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
