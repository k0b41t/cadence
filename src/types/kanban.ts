import type { Timestamp } from 'firebase/firestore';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ThemeMode = 'light' | 'dark';
export type BoardStatus = 'active' | 'archived';
export type BuiltInBoardRole = 'viewer' | 'contributor' | 'editor' | 'manager';
export type BoardRole = BuiltInBoardRole | 'custom';

export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export const BOOTSTRAP_ADMIN_EMAIL = 'btuttle@orangeusd.org';

export const LIMITS = {
  ID_MAX: 128,
  USER_DISPLAY_NAME_MAX: 80,
  USER_PHOTO_URL_MAX: 500,
  USER_EMAIL_MAX: 254,
  USER_BOARD_ORDER_MAX: 200,
  BOARD_TITLE_MAX: 80,
  BOARD_DESC_MAX: 300,
  BOARD_BG_URL_MAX: 500,
  BOARD_CUSTOM_ROLES_MAX: 8,
  CUSTOM_ROLE_NAME_MAX: 40,
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
  WHITELIST_LABEL_MAX: 80,
  ACCESS_CODE_MIN: 4,
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

export const BUILTIN_ROLE_KEYS: BuiltInBoardRole[] = [
  'viewer',
  'contributor',
  'editor',
  'manager',
];

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
    description: 'Create, edit, delete tasks, plus add & manage columns',
    permissions: {
      canView: true,
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageColumns: true,
    },
  },
  custom: {
    label: 'Custom',
    description: 'Custom permission set (does not match a saved role)',
    permissions: {
      canView: true,
      canCreateTasks: false,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageColumns: false,
    },
  },
};

export interface BoardCustomRole {
  id: string;
  name: string;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
}

export interface PermissionShape {
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
}

export function permissionsMatch(a: PermissionShape, b: PermissionShape): boolean {
  return (
    a.canCreateTasks === b.canCreateTasks &&
    a.canEditTasks === b.canEditTasks &&
    a.canDeleteTasks === b.canDeleteTasks &&
    a.canManageColumns === b.canManageColumns
  );
}

export interface ResolvedBoardRole {
  role: BoardRole;
  customRoleId?: string;
  customRoleName?: string;
  selectValue: string;
  label: string;
  description: string;
}

export function resolveRoleFromPermissions(
  perms: PermissionShape,
  customRoles: BoardCustomRole[] = []
): ResolvedBoardRole {
  for (const key of BUILTIN_ROLE_KEYS) {
    if (permissionsMatch(perms, ROLE_PRESETS[key].permissions)) {
      return {
        role: key,
        selectValue: key,
        label: ROLE_PRESETS[key].label,
        description: ROLE_PRESETS[key].description,
      };
    }
  }

  for (const cr of customRoles) {
    if (permissionsMatch(perms, cr)) {
      return {
        role: 'custom',
        customRoleId: cr.id,
        customRoleName: cr.name,
        selectValue: `custom:${cr.id}`,
        label: cr.name,
        description: `Custom board role (${cr.name})`,
      };
    }
  }

  return {
    role: 'custom',
    selectValue: 'custom',
    label: ROLE_PRESETS.custom.label,
    description: ROLE_PRESETS.custom.description,
  };
}

export function getRoleSelectionForValue(
  selectValue: string,
  currentPerms: BoardPermissions,
  customRoles: BoardCustomRole[] = []
): { role: BoardRole; customRoleName?: string; permissions: BoardPermissions } {
  if (
    selectValue === 'viewer' ||
    selectValue === 'contributor' ||
    selectValue === 'editor' ||
    selectValue === 'manager'
  ) {
    return {
      role: selectValue,
      permissions: { ...ROLE_PRESETS[selectValue].permissions },
    };
  }

  if (selectValue.startsWith('custom:')) {
    const targetId = selectValue.slice('custom:'.length);
    const matched = customRoles.find((cr) => cr.id === targetId);
    if (matched) {
      return {
        role: 'custom',
        customRoleName: matched.name,
        permissions: {
          canView: true,
          canCreateTasks: matched.canCreateTasks,
          canEditTasks: matched.canEditTasks,
          canDeleteTasks: matched.canDeleteTasks,
          canManageColumns: matched.canManageColumns,
        },
      };
    }
  }

  return {
    role: 'custom',
    permissions: { ...currentPerms, canView: true },
  };
}

export interface AdminRecord {
  uid: string;
  displayName: string;
  addedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WhitelistEntry {
  email: string;
  label: string;
  active: boolean;
  canCreateBoards?: boolean;
  addedBy: string;
  inviteCode?: string;
  boardInviteBoardId?: string;
  boardInviteId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface AccessCode {
  id: string;
  label: string;
  active: boolean;
  canCreateBoards?: boolean;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WhitelistAccessStatus {
  allowed: boolean;
  suspended: boolean;
  canCreateBoards: boolean;
  email: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  activeBoardId?: string;
  boardOrder?: string[];
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
  customRoleName?: string;
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
  backgroundImageUrl?: string;
  surfaceOpacityEnabled?: boolean;
  surfaceOpacity?: number;
  customRoles?: BoardCustomRole[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface BoardMember {
  uid: string;
  boardId: string;
  ownerId: string;
  displayName: string;
  role: BoardRole;
  customRoleName?: string;
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
  boardTitle?: string;
  joinCode?: string;
  ownerId: string;
  createdBy: string;
  label: string;
  role: BoardRole;
  customRoleName?: string;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
  active: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface BoardCode {
  id: string;
  boardId: string;
  inviteId: string;
  ownerId: string;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PendingBoardJoinTarget {
  boardId?: string;
  inviteId?: string;
  boardCode?: string;
}

export interface PendingBoardGrant {
  boardId: string;
  email: string;
  emailHash: string;
  boardTitle: string;
  ownerId: string;
  createdBy: string;
  role: BoardRole;
  customRoleName?: string;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PendingBoardMemberNotice {
  emailHash: string;
  boardId: string;
  ownerId: string;
  createdBy: string;
  maskedEmail: string;
  role: BoardRole;
  customRoleName?: string;
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
  autoMoveOnComplete?: boolean;
  autoMoveTargetColumnId?: string;
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
