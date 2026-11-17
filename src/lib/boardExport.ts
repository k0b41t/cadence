import type { Board, Column, Subtask, Task, TaskMessage } from '../types/kanban';

export type BoardExportFormat = 'json' | 'csv' | 'markdown';

export interface BoardExportInput {
  board: Board;
  columns: Column[];
  tasks: Task[];
  subtasksByTask?: Record<string, Subtask[]>;
  messages?: TaskMessage[];
  assigneeNames?: Record<string, string>;
}

function slugifyBoardTitle(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'board';
}

function formatDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildBoardExportFilename(title: string, format: BoardExportFormat): string {
  const ext = format === 'markdown' ? 'md' : format;
  return `${slugifyBoardTitle(title)}-${formatDateStamp()}.${ext}`;
}

export function serializeBoardExport(
  input: BoardExportInput,
  format: BoardExportFormat
): { content: string; mimeType: string } {
  const {
    board,
    columns,
    tasks,
    subtasksByTask = {},
    messages = [],
    assigneeNames = {},
  } = input;

  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);
  const columnTitleMap = new Map(sortedColumns.map((c) => [c.id, c.title]));
  const messagesByTask = new Map<string, TaskMessage[]>();
  for (const msg of messages) {
    const arr = messagesByTask.get(msg.taskId) ?? [];
    arr.push(msg);
    messagesByTask.set(msg.taskId, arr);
  }

  if (format === 'json') {
    const payload = {
      exportedAt: new Date().toISOString(),
      board: {
        id: board.id,
        title: board.title,
        description: board.description,
        status: board.status,
        customRoles: board.customRoles ?? [],
      },
      columns: sortedColumns.map((col) => {
        const colTasks = tasks
          .filter((t) => t.columnId === col.id)
          .sort((a, b) => a.position - b.position)
          .map((task) => {
            const subs = [...(subtasksByTask[task.id] ?? [])].sort(
              (a, b) => a.position - b.position
            );
            const taskMsgs = messagesByTask.get(task.id) ?? [];
            return {
              id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              completed: task.completed,
              dueDate: task.dueDate || null,
              assignee: task.assigneeId ? assigneeNames[task.assigneeId] ?? task.assigneeId : null,
              tags: task.tags,
              links: task.links ?? [],
              milestones: task.milestones ?? [],
              subtasks: subs.map((s) => ({
                title: s.title,
                completed: s.completed,
              })),
              comments: taskMsgs.map((m) => ({
                senderName: m.senderName,
                text: m.text,
              })),
            };
          });

        return {
          id: col.id,
          title: col.title,
          wipLimit: col.wipLimit,
          tasks: colTasks,
        };
      }),
    };

    return {
      content: JSON.stringify(payload, null, 2),
      mimeType: 'application/json;charset=utf-8',
    };
  }

  if (format === 'csv') {
    const headers = [
      'Column',
      'Title',
      'Description',
      'Priority',
      'Completed',
      'Due Date',
      'Assignee',
      'Tags',
      'Checklist',
      'Milestones',
      'Links',
      'Comments',
    ];

    const sortedTasks = [...tasks].sort((a, b) => {
      const colA = sortedColumns.findIndex((c) => c.id === a.columnId);
      const colB = sortedColumns.findIndex((c) => c.id === b.columnId);
      if (colA !== colB) return colA - colB;
      return a.position - b.position;
    });

    const rows = sortedTasks.map((task) => {
      const subs = subtasksByTask[task.id] ?? [];
      const doneCount = subs.filter((s) => s.completed).length;
      const checklistSummary = subs.length > 0 ? `${doneCount}/${subs.length}` : '';
      const milestoneSummary = (task.milestones ?? [])
        .map((m) => `${m.title} (${m.date})`)
        .join('; ');
      const linkSummary = (task.links ?? []).map((l) => `${l.label}: ${l.url}`).join('; ');
      const commentCount = (messagesByTask.get(task.id) ?? []).length;

      return [
        columnTitleMap.get(task.columnId) ?? '',
        task.title,
        task.description,
        task.priority,
        task.completed ? 'Yes' : 'No',
        task.dueDate,
        task.assigneeId ? assigneeNames[task.assigneeId] ?? task.assigneeId : '',
        task.tags.join(', '),
        checklistSummary,
        milestoneSummary,
        linkSummary,
        commentCount > 0 ? `${commentCount}` : '0',
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    const csv = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
    return {
      content: csv,
      mimeType: 'text/csv;charset=utf-8',
    };
  }

  // Markdown format
  const lines: string[] = [`# ${board.title}`];
  if (board.description) {
    lines.push('', board.description);
  }
  lines.push('', `_Exported on ${formatDateStamp()} · Status: ${board.status}_`);

  for (const col of sortedColumns) {
    const colTasks = tasks
      .filter((t) => t.columnId === col.id)
      .sort((a, b) => a.position - b.position);
    lines.push('', `## ${col.title} (${colTasks.length})`);

    if (colTasks.length === 0) {
      lines.push('', '_No tasks_');
      continue;
    }

    for (const task of colTasks) {
      const metaParts = [
        `Priority: ${task.priority}`,
        task.dueDate ? `Due: ${task.dueDate}` : null,
        task.assigneeId
          ? `Assignee: ${assigneeNames[task.assigneeId] ?? task.assigneeId}`
          : null,
        task.tags.length > 0 ? `Tags: ${task.tags.join(', ')}` : null,
      ].filter(Boolean);

      lines.push(
        `- [${task.completed ? 'x' : ' '}] **${task.title}**${
          metaParts.length > 0 ? ` — ${metaParts.join(' · ')}` : ''
        }`
      );

      if (task.description) {
        lines.push(`  - ${task.description.replace(/\r?\n/g, ' ')}`);
      }
      const subs = [...(subtasksByTask[task.id] ?? [])].sort((a, b) => a.position - b.position);
      for (const sub of subs) {
        lines.push(`  - [${sub.completed ? 'x' : ' '}] ${sub.title}`);
      }
      for (const link of task.links ?? []) {
        lines.push(`  - Link: [${link.label}](${link.url})`);
      }
    }
  }

  return {
    content: lines.join('\n'),
    mimeType: 'text/markdown;charset=utf-8',
  };
}

export function exportBoardToFile(input: BoardExportInput, format: BoardExportFormat): string {
  const filename = buildBoardExportFilename(input.board.title, format);
  const { content, mimeType } = serializeBoardExport(input, format);
  triggerFileDownload(filename, content, mimeType);
  return filename;
}
