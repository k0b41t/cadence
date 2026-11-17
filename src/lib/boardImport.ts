import {
  ID_REGEX,
  LIMITS,
  type BoardCustomRole,
  type Priority,
  type TaskLink,
  type TaskLinkKind,
  type TaskMilestone,
} from '../types/kanban';

export type BoardImportSource = 'cadence-json' | 'trello-json' | 'csv';

export interface ImportedSubtaskInput {
  title: string;
  completed: boolean;
}

export interface ImportedTaskInput {
  title: string;
  description: string;
  priority: Priority;
  completed: boolean;
  dueDate: string;
  tags: string[];
  links: TaskLink[];
  milestones: TaskMilestone[];
  subtasks: ImportedSubtaskInput[];
}

export interface ImportedColumnInput {
  title: string;
  wipLimit: number;
  tasks: ImportedTaskInput[];
}

export interface ParsedImportedBoard {
  title: string;
  description: string;
  customRoles: BoardCustomRole[];
  columns: ImportedColumnInput[];
  sourceFormat: BoardImportSource;
  summary: {
    columnCount: number;
    taskCount: number;
    subtaskCount: number;
  };
}

function cleanStr(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function normalizePriority(raw: unknown): Priority {
  if (typeof raw !== 'string') return 'medium';
  const v = raw.trim().toLowerCase();
  if (v === 'urgent' || v === 'critical' || v === 'p0') return 'urgent';
  if (v === 'high' || v === 'p1') return 'high';
  if (v === 'low' || v === 'p3' || v === 'minor') return 'low';
  return 'medium';
}

function normalizeDateString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return '';
}

function normalizeBoolean(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === 'yes' || v === '1' || v === 'done' || v === 'completed';
  }
  return false;
}

function normalizeTags(raw: unknown): string[] {
  const out: string[] = [];
  const candidates: string[] = Array.isArray(raw)
    ? raw
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'name' in item) {
            return String((item as { name?: unknown }).name ?? '');
          }
          return '';
        })
    : typeof raw === 'string'
      ? raw.split(/[,;/|]/)
      : [];

  for (const tag of candidates) {
    const clean = tag.trim().slice(0, LIMITS.TASK_TAG_LENGTH_MAX);
    if (clean && !out.includes(clean)) {
      out.push(clean);
      if (out.length >= LIMITS.TASK_TAGS_MAX) break;
    }
  }
  return out;
}

function normalizeLinks(raw: unknown): TaskLink[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: TaskLink[] = [];
  for (const item of raw) {
    if (cleaned.length >= LIMITS.TASK_LINKS_MAX) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const rawUrl = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!rawUrl || !/^https?:\/\/[^\s]+$/i.test(rawUrl)) continue;
    try {
      const url = new URL(rawUrl).toString();
      if (url.length > LIMITS.TASK_LINK_URL_MAX) continue;
      const fallbackLabel = new URL(url).hostname.replace(/^www\./, '');
      const label = cleanStr(rec.label, LIMITS.TASK_LINK_LABEL_MAX) || fallbackLabel;
      const kind: TaskLinkKind =
        rec.kind === 'repo' || rec.kind === 'file' || rec.kind === 'doc' || rec.kind === 'other'
          ? rec.kind
          : 'other';
      if (!cleaned.some((l) => l.url === url)) {
        cleaned.push({ label, url, kind });
      }
    } catch {
      // Skip malformed URLs during import
    }
  }
  return cleaned;
}

function normalizeMilestones(raw: unknown): TaskMilestone[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: TaskMilestone[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (cleaned.length >= LIMITS.TASK_MILESTONES_MAX) break;
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const title = cleanStr(rec.title, LIMITS.TASK_MILESTONE_TITLE_MAX);
    const date = normalizeDateString(rec.date);
    if (!title || !date) continue;
    const rawId = typeof rec.id === 'string' ? rec.id.trim() : '';
    const id =
      rawId && ID_REGEX.test(rawId)
        ? rawId.slice(0, LIMITS.ID_MAX)
        : `ms_${Date.now().toString(36)}_${i}`;
    cleaned.push({ id, title, date });
  }
  return cleaned;
}

function normalizeCustomRoles(raw: unknown): BoardCustomRole[] {
  if (!Array.isArray(raw)) return [];
  const out: BoardCustomRole[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (out.length >= LIMITS.BOARD_CUSTOM_ROLES_MAX) break;
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = cleanStr(rec.name, LIMITS.CUSTOM_ROLE_NAME_MAX);
    if (!name) continue;
    const rawId = typeof rec.id === 'string' ? rec.id.trim() : '';
    const id =
      rawId && ID_REGEX.test(rawId)
        ? rawId.slice(0, LIMITS.ID_MAX)
        : `role_${Date.now().toString(36)}_${i}`;
    out.push({
      id,
      name,
      canCreateTasks: Boolean(rec.canCreateTasks),
      canEditTasks: Boolean(rec.canEditTasks),
      canDeleteTasks: Boolean(rec.canDeleteTasks),
      canManageColumns: Boolean(rec.canManageColumns),
    });
  }
  return out;
}

function normalizeSubtasks(raw: unknown): ImportedSubtaskInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedSubtaskInput[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const title = cleanStr(item, LIMITS.SUBTASK_TITLE_MAX);
      if (title) out.push({ title, completed: false });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const title = cleanStr(rec.title ?? rec.name, LIMITS.SUBTASK_TITLE_MAX);
    if (!title) continue;
    const completed =
      typeof rec.completed === 'boolean'
        ? rec.completed
        : typeof rec.state === 'string'
          ? rec.state.toLowerCase() === 'complete'
          : false;
    out.push({ title, completed });
  }
  return out;
}

function parseCadenceJson(data: Record<string, unknown>, fallbackName: string): ParsedImportedBoard {
  const boardMeta =
    data.board && typeof data.board === 'object'
      ? (data.board as Record<string, unknown>)
      : data;

  const title = cleanStr(boardMeta.title ?? boardMeta.name, LIMITS.BOARD_TITLE_MAX) || fallbackName;
  const description = cleanStr(boardMeta.description ?? boardMeta.desc, LIMITS.BOARD_DESC_MAX);
  const customRoles = normalizeCustomRoles(boardMeta.customRoles);

  const rawCols = Array.isArray(data.columns) ? data.columns : [];
  const columns: ImportedColumnInput[] = [];

  for (const colItem of rawCols) {
    if (!colItem || typeof colItem !== 'object') continue;
    const colRec = colItem as Record<string, unknown>;
    const colTitle = cleanStr(colRec.title ?? colRec.name, LIMITS.COLUMN_TITLE_MAX) || 'Column';
    const rawWip = typeof colRec.wipLimit === 'number' && Number.isFinite(colRec.wipLimit)
      ? Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Math.round(colRec.wipLimit)))
      : 0;

    const rawTasks = Array.isArray(colRec.tasks) ? colRec.tasks : [];
    const tasks: ImportedTaskInput[] = [];
    for (const taskItem of rawTasks) {
      if (!taskItem || typeof taskItem !== 'object') continue;
      const tRec = taskItem as Record<string, unknown>;
      const tTitle = cleanStr(tRec.title ?? tRec.name, LIMITS.TASK_TITLE_MAX);
      if (!tTitle) continue;
      tasks.push({
        title: tTitle,
        description: cleanStr(tRec.description ?? tRec.desc, LIMITS.TASK_DESC_MAX),
        priority: normalizePriority(tRec.priority),
        completed: normalizeBoolean(tRec.completed),
        dueDate: normalizeDateString(tRec.dueDate ?? tRec.due),
        tags: normalizeTags(tRec.tags),
        links: normalizeLinks(tRec.links),
        milestones: normalizeMilestones(tRec.milestones),
        subtasks: normalizeSubtasks(tRec.subtasks),
      });
    }

    columns.push({ title: colTitle, wipLimit: rawWip, tasks });
  }

  if (columns.length === 0) {
    columns.push({ title: 'To Do', wipLimit: 0, tasks: [] });
  }

  return buildSummaryResult(title, description, customRoles, columns, 'cadence-json');
}

function parseTrelloJson(data: Record<string, unknown>, fallbackName: string): ParsedImportedBoard {
  const title = cleanStr(data.name, LIMITS.BOARD_TITLE_MAX) || fallbackName;
  const description = cleanStr(data.desc, LIMITS.BOARD_DESC_MAX);

  const rawLists = Array.isArray(data.lists) ? (data.lists as Array<Record<string, unknown>>) : [];
  const rawCards = Array.isArray(data.cards) ? (data.cards as Array<Record<string, unknown>>) : [];
  const rawChecklists = Array.isArray(data.checklists)
    ? (data.checklists as Array<Record<string, unknown>>)
    : [];

  const openLists = rawLists.filter((l) => l && typeof l === 'object' && l.closed !== true);
  const listsToUse = (openLists.length > 0 ? openLists : rawLists).sort(
    (a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0)
  );

  // Map checklist IDs & card IDs to subtask items
  const checklistsByCardId = new Map<string, ImportedSubtaskInput[]>();
  const checklistsById = new Map<string, ImportedSubtaskInput[]>();

  for (const cl of rawChecklists) {
    if (!cl || typeof cl !== 'object') continue;
    const checkItems = Array.isArray(cl.checkItems)
      ? [...(cl.checkItems as Array<Record<string, unknown>>)].sort(
          (a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0)
        )
      : [];
    const parsedItems = normalizeSubtasks(checkItems);
    if (typeof cl.id === 'string') {
      checklistsById.set(cl.id, parsedItems);
    }
    if (typeof cl.idCard === 'string') {
      const existing = checklistsByCardId.get(cl.idCard) ?? [];
      checklistsByCardId.set(cl.idCard, [...existing, ...parsedItems]);
    }
  }

  const colMap = new Map<string, ImportedColumnInput>();
  const columns: ImportedColumnInput[] = [];

  for (const list of listsToUse) {
    const listId = typeof list.id === 'string' ? list.id : '';
    const colTitle = cleanStr(list.name, LIMITS.COLUMN_TITLE_MAX) || 'List';
    const colObj: ImportedColumnInput = { title: colTitle, wipLimit: 0, tasks: [] };
    if (listId) colMap.set(listId, colObj);
    columns.push(colObj);
  }

  const openCards = rawCards
    .filter((c) => c && typeof c === 'object' && c.closed !== true)
    .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0));

  for (const card of openCards) {
    const cardTitle = cleanStr(card.name, LIMITS.TASK_TITLE_MAX);
    if (!cardTitle) continue;
    const listId = typeof card.idList === 'string' ? card.idList : '';
    let targetCol = listId ? colMap.get(listId) : undefined;
    if (!targetCol) {
      if (columns.length === 0) {
        targetCol = { title: 'To Do', wipLimit: 0, tasks: [] };
        columns.push(targetCol);
      } else {
        targetCol = columns[0];
      }
    }

    let subtasks: ImportedSubtaskInput[] = [];
    if (typeof card.id === 'string' && checklistsByCardId.has(card.id)) {
      subtasks = checklistsByCardId.get(card.id) ?? [];
    } else if (Array.isArray(card.idChecklists)) {
      for (const clId of card.idChecklists) {
        if (typeof clId === 'string' && checklistsById.has(clId)) {
          subtasks.push(...(checklistsById.get(clId) ?? []));
        }
      }
    }

    targetCol.tasks.push({
      title: cardTitle,
      description: cleanStr(card.desc, LIMITS.TASK_DESC_MAX),
      priority: 'medium',
      completed: Boolean(card.dueComplete),
      dueDate: normalizeDateString(card.due),
      tags: normalizeTags(card.labels),
      links: [],
      milestones: [],
      subtasks,
    });
  }

  if (columns.length === 0) {
    columns.push({ title: 'To Do', wipLimit: 0, tasks: [] });
  }

  return buildSummaryResult(title, description, [], columns, 'trello-json');
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseCsvBoard(text: string, fallbackName: string): ParsedImportedBoard {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    throw new Error('CSV file must include a header row and at least one task row.');
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const findCol = (candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const colIdx = findCol(['column', 'list', 'stage', 'status']);
  const titleIdx = findCol(['title', 'name', 'task', 'card', 'summary']);
  const descIdx = findCol(['description', 'desc', 'notes', 'details']);
  const priorityIdx = findCol(['priority', 'severity']);
  const completedIdx = findCol(['completed', 'done', 'finished']);
  const dueIdx = findCol(['due date', 'due', 'deadline']);
  const tagsIdx = findCol(['tags', 'labels', 'category']);

  if (titleIdx === -1) {
    throw new Error('CSV must include a "Title", "Name", or "Task" column header.');
  }

  const columnsMap = new Map<string, ImportedColumnInput>();
  const columns: ImportedColumnInput[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const taskTitle = cleanStr(row[titleIdx], LIMITS.TASK_TITLE_MAX);
    if (!taskTitle) continue;

    const colName =
      colIdx !== -1
        ? cleanStr(row[colIdx], LIMITS.COLUMN_TITLE_MAX) || 'To Do'
        : 'To Do';

    let colObj = columnsMap.get(colName);
    if (!colObj) {
      colObj = { title: colName, wipLimit: 0, tasks: [] };
      columnsMap.set(colName, colObj);
      columns.push(colObj);
    }

    colObj.tasks.push({
      title: taskTitle,
      description: descIdx !== -1 ? cleanStr(row[descIdx], LIMITS.TASK_DESC_MAX) : '',
      priority: priorityIdx !== -1 ? normalizePriority(row[priorityIdx]) : 'medium',
      completed: completedIdx !== -1 ? normalizeBoolean(row[completedIdx]) : false,
      dueDate: dueIdx !== -1 ? normalizeDateString(row[dueIdx]) : '',
      tags: tagsIdx !== -1 ? normalizeTags(row[tagsIdx]) : [],
      links: [],
      milestones: [],
      subtasks: [],
    });
  }

  if (columns.length === 0) {
    throw new Error('No valid tasks were found in the CSV file.');
  }

  return buildSummaryResult(fallbackName, '', [], columns, 'csv');
}

function buildSummaryResult(
  title: string,
  description: string,
  customRoles: BoardCustomRole[],
  columns: ImportedColumnInput[],
  sourceFormat: BoardImportSource
): ParsedImportedBoard {
  let taskCount = 0;
  let subtaskCount = 0;
  for (const col of columns) {
    taskCount += col.tasks.length;
    for (const task of col.tasks) {
      subtaskCount += task.subtasks.length;
    }
  }

  return {
    title: cleanStr(title, LIMITS.BOARD_TITLE_MAX) || 'Imported Board',
    description: cleanStr(description, LIMITS.BOARD_DESC_MAX),
    customRoles,
    columns,
    sourceFormat,
    summary: {
      columnCount: columns.length,
      taskCount,
      subtaskCount,
    },
  };
}

export function parseImportedBoardFile(fileName: string, rawText: string): ParsedImportedBoard {
  const baseName =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .slice(0, LIMITS.BOARD_TITLE_MAX) || 'Imported Board';

  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error('The selected file is empty.');
  }

  if (fileName.toLowerCase().endsWith('.csv') || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return parseCsvBoard(trimmed, baseName);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid JSON file. Upload a Cadence JSON, Trello JSON, or CSV export.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Unrecognized JSON format. Expected a Board export object.');
  }

  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.columns)) {
    return parseCadenceJson(obj, baseName);
  }
  if (Array.isArray(obj.lists) || Array.isArray(obj.cards)) {
    return parseTrelloJson(obj, baseName);
  }

  throw new Error(
    'Unrecognized Board JSON structure. Supported formats: Cadence JSON, Trello JSON, and CSV.'
  );
}
