import type { Timestamp } from 'firebase/firestore';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ThemeMode = 'light' | 'dark';
export type BoardStatus = 'active' | 'archived';
export type BoardRole = 'viewer' | 'contributor' | 'editor' | 'manager';

export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const BOOTSTRAP_ADMIN_EMAIL = 'btuttle@orangeusd.org';

export const LIMITS = {
  ID_MAX: 128,
  USER_DISPLAY_NAME_MAX: 80,
  USER_PHOTO_URL_MAX: 500,
  USER_EMAIL_MAX: 254,
  BOARD_TITLE_MAX: 80,
  BOARD_DESC_MAX: 300,
  COLUMN_TITLE_MAX: 50,
  COLUMN_WIP_MAX: 100,
  COLUMN_COLOR_RULES_MAX: 6,
  TASK_TITLE_MAX: 140,
  TASK_DESC_MAX: 2000,
  TASK_TAGS_MAX: 5,
  TASK_TAG_LENGTH_MAX: 24,
  TASK_DUE_DATE_MAX: 32,
  TASK_LINKS_MAX: 8,
  TASK_LINK_LABEL_MAX: 60,
  TASK_LINK_URL_MAX: 500,
  TASK_MILESTONES_MAX: 8,
  TASK_MILESTONE_TITLE_MAX: 60,
  SUBTASK_TITLE_MAX: 140,
  MESSAGE_TEXT_MAX: 1000,
  INVITE_LABEL_MAX: 60,
  POSITION_MAX: 1000000,
} as const;

export type TaskLinkKind = 'repo' | 'file' | 'doc' | 'other';

export interface TaskLink {
  label: string;
  url: string;
  kind: TaskLinkKind;
}

export interface TaskMilestone {
  id: string;
  title: string;
  date: string;
}

export type PresetColumnBgColor = 'slate' | 'amber' | 'red' | 'emerald' | 'blue' | 'violet';
export type ColumnBgColor = PresetColumnBgColor | (string & {});

export interface ColumnColorRule {
  threshold: number;
  color: ColumnBgColor;
}

export interface BoardPermissions {
  canView: boolean;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
}

export const ROLE_PRESETS: Record<
  BoardRole,
  { label: string; description: string; permissions: BoardPermissions }
> = {
  viewer: {
    label: 'Viewer',
    description: 'View board, columns, and tasks only',
    permissions: {
      canView: true,
      canCreateTasks: false,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageColumns: false,
    },
  },
  contributor: {
    label: 'Contributor',
    description: 'View, create tasks, edit & move cards',
    permissions: {
      canView: true,
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: false,
      canManageColumns: false,
    },
  },
  editor: {
    label: 'Editor',
    description: 'Create, edit, move, and delete tasks',
    permissions: {
      canView: true,
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageColumns: false,
    },
  },
  manager: {
    label: 'Board Manager',
    description: 'Full task utilities plus column & WIP management',
    permissions: {
      canView: true,
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageColumns: true,
    },
  },
};

export interface AdminRecord {
  uid: string;
  displayName: string;
  addedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  activeBoardId?: string;
  theme: ThemeMode;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface BoardRef {
  boardId: string;
  userId: string;
  boardTitle: string;
  boardOwnerId: string;
  role: BoardRole;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Board {
  id: string;
  ownerId: string;
  ownerDisplayName?: string;
  title: string;
  description: string;
  status: BoardStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface BoardMember {
  uid: string;
  boardId: string;
  ownerId: string;
  displayName: string;
  role: BoardRole;
  canView: boolean;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
  inviteId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface BoardInvite {
  id: string;
  boardId: string;
  ownerId: string;
  createdBy: string;
  label: string;
  role: BoardRole;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Column {
  id: string;
  boardId: string;
  ownerId: string;
  createdBy?: string;
  title: string;
  position: number;
  wipLimit: number;
  colorRules?: ColumnColorRule[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  ownerId: string;
  createdBy?: string;
  assigneeId?: string;
  title: string;
  description: string;
  priority: Priority;
  position: number;
  tags: string[];
  dueDate: string;
  completed: boolean;
  placedOnColumnAt?: string;
  completedAt?: string;
  links?: TaskLink[];
  milestones?: TaskMilestone[];
  notificationsEnabled?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Subtask {
  id: string;
  boardId: string;
  taskId: string;
  ownerId: string;
  createdBy?: string;
  title: string;
  completed: boolean;
  position: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TaskMessage {
  id: string;
  boardId: string;
  taskId: string;
  taskTitle: string;
  ownerId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type BoardTemplate = 'standard' | 'engineering' | 'minimal';

export const BOARD_TEMPLATES: Record<BoardTemplate, { label: string; columns: string[] }> = {
  standard: {
    label: 'Standard (Backlog, In Progress, Review, Done)',
    columns: ['Backlog', 'In Progress', 'Review', 'Done'],
  },
  engineering: {
    label: 'Engineering (Triage, Ready, Building, QA, Shipped)',
    columns: ['Triage', 'Ready', 'Building', 'QA', 'Shipped'],
  },
  minimal: {
    label: 'Minimal (To Do, Doing, Done)',
    columns: ['To Do', 'Doing', 'Done'],
  },
};
