import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { ParsedImportedBoard } from './boardImport';
import { isValidBoardBackgroundUrl, normalizeBoardBackgroundUrl } from './boardBackgrounds';
import { isValidColumnColorValue, normalizeColumnColorValue } from './colorUtils';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  BOARD_TEMPLATES,
  BOOTSTRAP_ADMIN_EMAIL,
  hasAssignPermission,
  ID_REGEX,
  LIMITS,
  type AccessCode,
  type AdminRecord,
  type Board,
  type BoardBackground,
  type BoardBackgroundSourceType,
  type BoardCode,
  type BoardCustomRole,
  type BoardInvite,
  type BoardMember,
  type BoardPermissions,
  type BoardRef,
  type BoardRole,
  type BoardTemplate,
  type Column,
  type ColumnBgColor,
  type ColumnColorRule,
  type PendingBoardGrant,
  type PendingBoardMemberNotice,
  type Priority,
  type Subtask,
  type Task,
  type TaskLink,
  type TaskLinkKind,
  type TaskMessage,
  type TaskMilestone,
  type ThemeMode,
  type UserProfile,
  type WhitelistAccessStatus,
  type WhitelistEntry,
} from '../types/kanban';

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function normalizeTaskUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Link URL cannot be empty.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('Please enter a valid http:// or https:// URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are allowed.');
  }
  const normalized = parsed.toString();
  if (normalized.length > LIMITS.TASK_LINK_URL_MAX) {
    throw new Error(`URL must be ${LIMITS.TASK_LINK_URL_MAX} characters or fewer.`);
  }
  return normalized;
}

export function inferLinkKind(url: string): TaskLinkKind {
  const lower = url.toLowerCase();
  if (
    lower.includes('github.com') ||
    lower.includes('gitlab.com') ||
    lower.includes('bitbucket.org') ||
    lower.includes('codeberg.org')
  ) {
    return 'repo';
  }
  if (
    lower.includes('docs.google.com') ||
    lower.includes('notion.so') ||
    lower.includes('figma.com') ||
    lower.includes('confluence')
  ) {
    return 'doc';
  }
  if (
    lower.includes('drive.google.com') ||
    lower.includes('dropbox.com') ||
    /\.(pdf|zip|csv|json|yaml|yml|md|png|jpg)(\?|$)/i.test(lower)
  ) {
    return 'file';
  }
  return 'other';
}

function sanitizeDateKey(value: string | undefined): string {
  const clean = (value ?? '').trim().slice(0, LIMITS.TASK_DUE_DATE_MAX);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

function sanitizeTaskLinks(links: TaskLink[] | undefined): TaskLink[] {
  if (!links || links.length === 0) return [];
  const cleaned: TaskLink[] = [];
  for (const item of links) {
    if (cleaned.length >= LIMITS.TASK_LINKS_MAX) break;
    const url = normalizeTaskUrl(item.url);
    const fallbackLabel = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return 'External Link';
      }
    })();
    const label =
      sanitizeText(item.label || fallbackLabel, LIMITS.TASK_LINK_LABEL_MAX) || fallbackLabel;
    const kind: TaskLinkKind =
      item.kind === 'repo' || item.kind === 'file' || item.kind === 'doc' || item.kind === 'other'
        ? item.kind
        : inferLinkKind(url);
    if (!cleaned.some((existing) => existing.url === url)) {
      cleaned.push({ label, url, kind });
    }
  }
  return cleaned;
}

function sanitizeTaskMilestones(milestones: TaskMilestone[] | undefined): TaskMilestone[] {
  if (!milestones || milestones.length === 0) return [];
  const cleaned: TaskMilestone[] = [];
  for (const item of milestones) {
    if (cleaned.length >= LIMITS.TASK_MILESTONES_MAX) break;
    const title = sanitizeText(item.title, LIMITS.TASK_MILESTONE_TITLE_MAX);
    const date = sanitizeDateKey(item.date);
    if (!title || !date) continue;
    const id = item.id && ID_REGEX.test(item.id) ? item.id.slice(0, LIMITS.ID_MAX) : generateId('ms');
    cleaned.push({ id, title, date });
  }
  cleaned.sort((a, b) => a.date.localeCompare(b.date));
  return cleaned;
}

export function sanitizeColumnColorRules(rules: ColumnColorRule[] | undefined): ColumnColorRule[] {
  if (!rules || rules.length === 0) return [];
  const byThreshold = new Map<number, ColumnBgColor>();
  for (const item of rules) {
    if (!Number.isFinite(item.threshold)) continue;
    const threshold = Math.max(1, Math.min(LIMITS.COLUMN_WIP_MAX, Math.floor(item.threshold)));
    const color: ColumnBgColor =
      typeof item.color === 'string' && isValidColumnColorValue(item.color)
        ? normalizeColumnColorValue(item.color)
        : 'amber';
    byThreshold.set(threshold, color);
  }
  return Array.from(byThreshold.entries())
    .map(([threshold, color]) => ({ threshold, color }))
    .sort((a, b) => a.threshold - b.threshold)
    .slice(0, LIMITS.COLUMN_COLOR_RULES_MAX);
}

function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function clampPosition(pos: number): number {
  if (!Number.isFinite(pos)) return 1000;
  return Math.max(0, Math.min(LIMITS.POSITION_MAX, Math.round(pos * 1000) / 1000));
}

function sanitizeTags(tags: string[]): string[] {
  const cleaned: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().slice(0, LIMITS.TASK_TAG_LENGTH_MAX);
    if (t.length > 0 && !cleaned.includes(t)) {
      cleaned.push(t);
    }
    if (cleaned.length >= LIMITS.TASK_TAGS_MAX) break;
  }
  return cleaned;
}

function assertValidId(id: string, label: string) {
  if (!id || id.length > LIMITS.ID_MAX || !ID_REGEX.test(id)) {
    throw new Error(`Invalid ${label} identifier.`);
  }
}

export function generateId(prefix: string): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return `${prefix}_${raw}`;
}

export async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function checkIsAdmin(user: User): Promise<{ isAdmin: boolean; isBootstrapAdmin: boolean }> {
  const isBootstrap =
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  if (isBootstrap) {
    return { isAdmin: true, isBootstrapAdmin: true };
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return { isAdmin: snap.exists(), isBootstrapAdmin: false };
  } catch {
    return { isAdmin: false, isBootstrapAdmin: false };
  }
}

export async function ensureUserAndStarterWorkspace(
  user: User,
  _canCreateBoards = true
): Promise<UserProfile> {
  assertValidId(user.uid, 'userId');
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  let existingProfile: UserProfile | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingProfile = snap.data() as UserProfile;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const displayName =
    sanitizeText(
      user.displayName || user.email?.split('@')[0] || 'Workspace User',
      LIMITS.USER_DISPLAY_NAME_MAX
    ) || 'Workspace User';

  const photoUrl =
    user.photoURL && user.photoURL.length <= LIMITS.USER_PHOTO_URL_MAX
      ? user.photoURL
      : undefined;

  if (!existingProfile) {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const initialTheme: ThemeMode = prefersDark ? 'dark' : 'light';

    const profilePayload: Record<string, unknown> = {
      uid: user.uid,
      displayName,
      theme: initialTheme,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoUrl) {
      profilePayload.photoUrl = photoUrl;
    }

    try {
      await setDoc(userRef, profilePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }

    if (user.email) {
      try {
        await setDoc(privateRef, {
          uid: user.uid,
          email: sanitizeText(user.email, LIMITS.USER_EMAIL_MAX),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, privatePath);
      }
    }
  } else if (user.email) {
    try {
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email: sanitizeText(user.email, LIMITS.USER_EMAIL_MAX),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }

  // Register hashed email lookup so board creators can share boards by email without storing plaintext PII
  if (user.email && user.emailVerified) {
    const emailHash = await hashEmail(user.email);
    const lookupPath = `emailLookup/${emailHash}`;
    try {
      const lookupRef = doc(db, 'emailLookup', emailHash);
      const lookupSnap = await getDoc(lookupRef);
      if (!lookupSnap.exists()) {
        await setDoc(lookupRef, {
          emailHash,
          uid: user.uid,
          displayName,
          updatedAt: serverTimestamp(),
        });
      } else if (lookupSnap.data()?.displayName !== displayName) {
        await updateDoc(lookupRef, {
          displayName,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, lookupPath);
    }
  }

  // Ensure bootstrap admin also has an /admins/{uid} doc so tasks can be assigned to them securely
  if (user.emailVerified && user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    const adminPath = `admins/${user.uid}`;
    try {
      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      if (!adminSnap.exists()) {
        await setDoc(doc(db, 'admins', user.uid), {
          uid: user.uid,
          displayName,
          addedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, adminPath);
    }
  }

  try {
    const freshSnap = await getDoc(userRef);
    return freshSnap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function updateUserTheme(uid: string, theme: ThemeMode): Promise<void> {
  assertValidId(uid, 'userId');
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserActiveBoard(uid: string, boardId: string): Promise<void> {
  assertValidId(uid, 'userId');
  if (boardId !== '') {
    assertValidId(boardId, 'boardId');
  }
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      activeBoardId: boardId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserBoardOrder(uid: string, boardOrder: string[]): Promise<void> {
  assertValidId(uid, 'userId');
  const seen = new Set<string>();
  const sanitizedOrder: string[] = [];
  for (const rawId of boardOrder) {
    const trimmed = typeof rawId === 'string' ? rawId.trim() : '';
    if (!trimmed || trimmed.length > LIMITS.ID_MAX || !ID_REGEX.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    sanitizedOrder.push(trimmed);
    if (sanitizedOrder.length >= LIMITS.USER_BOARD_ORDER_MAX) break;
  }

  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      boardOrder: sanitizedOrder,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Subscribes to all boards accessible to the user:
 * - Bootstrap admin sees all boards in /boards
 * - Any user sees boards they own + boards shared with them via /users/{uid}/boardRefs
 */
export function subscribeAccessibleBoards(
  uid: string,
  isBootstrapAdmin: boolean,
  onData: (boards: Board[]) => void
): Unsubscribe {
  if (isBootstrapAdmin) {
    return onSnapshot(
      collection(db, 'boards'),
      (snapshot) => {
        const items = snapshot.docs.map((d) => d.data() as Board);
        items.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        onData(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'boards');
      }
    );
  }

  let ownedBoards: Board[] = [];
  const sharedBoardMap = new Map<string, Board>();
  const sharedDocUnsubs = new Map<string, Unsubscribe>();

  const emitCombined = () => {
    const merged = new Map<string, Board>();
    ownedBoards.forEach((b) => merged.set(b.id, b));
    sharedBoardMap.forEach((b, id) => {
      if (!merged.has(id)) merged.set(id, b);
    });
    const list = Array.from(merged.values());
    list.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    onData(list);
  };

  const unsubOwned = onSnapshot(
    query(collection(db, 'boards'), where('ownerId', '==', uid)),
    (snapshot) => {
      ownedBoards = snapshot.docs.map((d) => d.data() as Board);
      emitCombined();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'boards');
    }
  );

  const refsPath = `users/${uid}/boardRefs`;
  const unsubRefs = onSnapshot(
    query(collection(db, 'users', uid, 'boardRefs'), where('userId', '==', uid)),
    (snapshot) => {
      const activeIds = new Set(snapshot.docs.map((d) => (d.data() as BoardRef).boardId));

      // Remove unsubscribed board listeners
      for (const [bId, unsub] of sharedDocUnsubs.entries()) {
        if (!activeIds.has(bId)) {
          unsub();
          sharedDocUnsubs.delete(bId);
          sharedBoardMap.delete(bId);
        }
      }

      // Attach listeners for newly shared boards
      for (const bId of activeIds) {
        if (!sharedDocUnsubs.has(bId)) {
          const boardPath = `boards/${bId}`;
          const unsubBoard = onSnapshot(
            doc(db, 'boards', bId),
            (docSnap) => {
              if (docSnap.exists()) {
                sharedBoardMap.set(bId, docSnap.data() as Board);
              } else {
                sharedBoardMap.delete(bId);
              }
              emitCombined();
            },
            (err) => {
              // If membership was revoked concurrently, clean up silently if permission denied
              if (err instanceof Error && err.message.includes('permission')) {
                sharedBoardMap.delete(bId);
                emitCombined();
                return;
              }
              handleFirestoreError(err, OperationType.GET, boardPath);
            }
          );
          sharedDocUnsubs.set(bId, unsubBoard);
        }
      }

      emitCombined();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, refsPath);
    }
  );

  return () => {
    unsubOwned();
    unsubRefs();
    for (const unsub of sharedDocUnsubs.values()) {
      unsub();
    }
    sharedDocUnsubs.clear();
  };
}

export function subscribeColumns(boardId: string, onData: (columns: Column[]) => void): Unsubscribe {
  const path = `boards/${boardId}/columns`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'columns'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Column);
      items.sort((a, b) => a.position - b.position);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeTasks(boardId: string, onData: (tasks: Task[]) => void): Unsubscribe {
  const path = `boards/${boardId}/tasks`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'tasks'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Task);
      items.sort((a, b) => a.position - b.position);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllBoardsTasks(
  boards: Board[],
  onData: (tasks: Task[]) => void
): Unsubscribe {
  if (boards.length === 0) {
    onData([]);
    return () => {};
  }

  const byBoard = new Map<string, Task[]>();
  const emit = () => {
    const merged: Task[] = [];
    for (const list of byBoard.values()) {
      merged.push(...list);
    }
    onData(merged);
  };

  const unsubs = boards.map((board) => {
    const path = `boards/${board.id}/tasks`;
    return onSnapshot(
      collection(db, 'boards', board.id, 'tasks'),
      (snapshot) => {
        byBoard.set(
          board.id,
          snapshot.docs.map((d) => d.data() as Task)
        );
        emit();
      },
      (error) => {
        if (error instanceof Error && error.message.includes('permission')) {
          byBoard.delete(board.id);
          emit();
          return;
        }
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}

export function subscribeSubtasks(
  boardId: string,
  taskId: string,
  onData: (subtasks: Subtask[]) => void
): Unsubscribe {
  const path = `boards/${boardId}/tasks/${taskId}/subtasks`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'tasks', taskId, 'subtasks'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as Subtask);
      items.sort((a, b) => a.position - b.position);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeBoardSubtasks(
  boardId: string,
  taskIds: string[],
  onData: (subtasksByTask: Record<string, Subtask[]>) => void
): Unsubscribe {
  if (taskIds.length === 0) {
    onData({});
    return () => {};
  }

  const byTask: Record<string, Subtask[]> = {};
  const emit = () => {
    onData({ ...byTask });
  };

  const unsubs = taskIds.map((taskId) => {
    const path = `boards/${boardId}/tasks/${taskId}/subtasks`;
    return onSnapshot(
      collection(db, 'boards', boardId, 'tasks', taskId, 'subtasks'),
      (snapshot) => {
        const items = snapshot.docs.map((d) => d.data() as Subtask);
        items.sort((a, b) => a.position - b.position);
        byTask[taskId] = items;
        emit();
      },
      (error) => {
        if (error instanceof Error && error.message.includes('permission')) {
          delete byTask[taskId];
          emit();
          return;
        }
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}

export function subscribeBoardMembers(
  boardId: string,
  onData: (members: BoardMember[]) => void
): Unsubscribe {
  const path = `boards/${boardId}/members`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'members'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as BoardMember);
      items.sort((a, b) => a.displayName.localeCompare(b.displayName));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeBoardInvites(
  boardId: string,
  onData: (invites: BoardInvite[]) => void
): Unsubscribe {
  const path = `boards/${boardId}/invites`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'invites'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as BoardInvite);
      items.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdmins(onData: (admins: AdminRecord[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as AdminRecord);
      items.sort((a, b) => a.displayName.localeCompare(b.displayName));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admins');
    }
  );
}

export function subscribeBoardMessages(
  boardId: string,
  onData: (messages: TaskMessage[]) => void
): Unsubscribe {
  const path = `boards/${boardId}/messages`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'messages'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as TaskMessage);
      items.sort(
        (a, b) =>
          (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) -
          (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER)
      );
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllBoardsMessages(
  boards: Board[],
  onData: (messages: TaskMessage[]) => void
): Unsubscribe {
  if (boards.length === 0) {
    onData([]);
    return () => {};
  }

  const byBoard = new Map<string, TaskMessage[]>();
  const emit = () => {
    const merged: TaskMessage[] = [];
    for (const list of byBoard.values()) {
      merged.push(...list);
    }
    merged.sort(
      (a, b) =>
        (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) -
        (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER)
    );
    onData(merged);
  };

  const unsubs = boards.map((board) => {
    const path = `boards/${board.id}/messages`;
    return onSnapshot(
      collection(db, 'boards', board.id, 'messages'),
      (snapshot) => {
        byBoard.set(
          board.id,
          snapshot.docs.map((d) => d.data() as TaskMessage)
        );
        emit();
      },
      (error) => {
        if (error instanceof Error && error.message.includes('permission')) {
          byBoard.delete(board.id);
          emit();
          return;
        }
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function createBoard(
  uid: string,
  title: string,
  description: string,
  template: BoardTemplate = 'standard',
  seedStarterTasks = false,
  ownerDisplayName?: string
): Promise<string> {
  assertValidId(uid, 'userId');
  const cleanTitle = sanitizeText(title, LIMITS.BOARD_TITLE_MAX);
  if (!cleanTitle) throw new Error('Board title cannot be empty.');
  const cleanDescription = sanitizeText(description, LIMITS.BOARD_DESC_MAX);
  const cleanOwnerName = ownerDisplayName
    ? sanitizeText(ownerDisplayName, LIMITS.USER_DISPLAY_NAME_MAX)
    : '';

  const boardId = generateId('brd');
  const boardPath = `boards/${boardId}`;
  const boardPayload: Record<string, unknown> = {
    id: boardId,
    ownerId: uid,
    title: cleanTitle,
    description: cleanDescription,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (cleanOwnerName) {
    boardPayload.ownerDisplayName = cleanOwnerName;
  }
  try {
    await setDoc(doc(db, 'boards', boardId), boardPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, boardPath);
  }

  const colNames = BOARD_TEMPLATES[template].columns;
  const colIds: string[] = [];
  const colBatch = writeBatch(db);
  colNames.forEach((colTitle, index) => {
    const colId = generateId('col');
    colIds.push(colId);
    const colPayload: Record<string, unknown> = {
      id: colId,
      boardId,
      ownerId: uid,
      createdBy: uid,
      title: sanitizeText(colTitle, LIMITS.COLUMN_TITLE_MAX),
      position: (index + 1) * 1000,
      wipLimit: colTitle === 'In Progress' ? 4 : 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (colTitle === 'In Progress') {
      colPayload.colorRules = [
        { threshold: 3, color: 'amber' },
        { threshold: 4, color: 'red' },
      ];
    }
    colBatch.set(doc(db, 'boards', boardId, 'columns', colId), colPayload);
  });

  try {
    await colBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/columns`);
  }

  if (seedStarterTasks && colIds.length >= 4) {
    const today = getTodayDateKey();
    const starterTasks: Array<{
      columnId: string;
      title: string;
      description: string;
      priority: Priority;
      tags: string[];
      dueDate: string;
      completed: boolean;
      placedOnColumnAt: string;
      completedAt: string;
      links: TaskLink[];
      milestones: TaskMilestone[];
      position: number;
    }> = [
      {
        columnId: colIds[0],
        title: 'Define onboarding checklist for new teammates',
        description: 'Document local setup, security rules walkthrough, and initial permissions.',
        priority: 'medium',
        tags: ['docs', 'onboarding'],
        dueDate: addDaysToDateKey(today, 6),
        completed: false,
        placedOnColumnAt: addDaysToDateKey(today, -2),
        completedAt: '',
        links: [
          {
            label: 'Onboarding Guide',
            url: 'https://github.com/example/cadence-handbook',
            kind: 'repo',
          },
        ],
        milestones: [
          {
            id: generateId('ms'),
            title: 'Draft Review',
            date: addDaysToDateKey(today, 2),
          },
        ],
        position: 1000,
      },
      {
        columnId: colIds[1],
        title: 'Audit Firestore composite index requirements',
        description: 'Verify all workspace listeners resolve without missing index errors.',
        priority: 'high',
        tags: ['firestore', 'infra'],
        dueDate: addDaysToDateKey(today, 4),
        completed: false,
        placedOnColumnAt: addDaysToDateKey(today, -3),
        completedAt: '',
        links: [],
        milestones: [
          {
            id: generateId('ms'),
            title: 'Load Check',
            date: addDaysToDateKey(today, 1),
          },
        ],
        position: 1000,
      },
      {
        columnId: colIds[2],
        title: 'Finalize release notes for v1.0 workspace launch',
        description: 'Summarize drag-and-drop workflow, WIP limits, and dark theme support.',
        priority: 'urgent',
        tags: ['release'],
        dueDate: addDaysToDateKey(today, 2),
        completed: false,
        placedOnColumnAt: addDaysToDateKey(today, -4),
        completedAt: '',
        links: [],
        milestones: [
          {
            id: generateId('ms'),
            title: 'Copy Freeze',
            date: today,
          },
        ],
        position: 1000,
      },
      {
        columnId: colIds[3],
        title: 'Configure Firebase Auth and security rule validation',
        description: 'Verified Google OAuth flow and zero-trust Firestore ruleset deployed.',
        priority: 'low',
        tags: ['security'],
        dueDate: today,
        completed: true,
        placedOnColumnAt: addDaysToDateKey(today, -5),
        completedAt: addDaysToDateKey(today, -1),
        links: [],
        milestones: [
          {
            id: generateId('ms'),
            title: 'Rules Audit',
            date: addDaysToDateKey(today, -2),
          },
        ],
        position: 1000,
      },
    ];

    const taskBatch = writeBatch(db);
    starterTasks.forEach((t) => {
      const taskId = generateId('tsk');
      taskBatch.set(doc(db, 'boards', boardId, 'tasks', taskId), {
        id: taskId,
        boardId,
        columnId: t.columnId,
        ownerId: uid,
        createdBy: uid,
        assigneeId: '',
        title: sanitizeText(t.title, LIMITS.TASK_TITLE_MAX),
        description: sanitizeText(t.description, LIMITS.TASK_DESC_MAX),
        priority: t.priority,
        position: t.position,
        tags: sanitizeTags(t.tags),
        dueDate: t.dueDate,
        completed: t.completed,
        placedOnColumnAt: t.placedOnColumnAt,
        completedAt: t.completedAt,
        links: t.links,
        milestones: t.milestones,
        notificationsEnabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await taskBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/tasks`);
    }
  }

  return boardId;
}

export async function importBoardFromParsed(
  uid: string,
  parsed: ParsedImportedBoard,
  overrideTitle?: string,
  overrideDescription?: string,
  ownerDisplayName?: string
): Promise<string> {
  assertValidId(uid, 'userId');
  const cleanTitle = sanitizeText(
    overrideTitle !== undefined ? overrideTitle : parsed.title,
    LIMITS.BOARD_TITLE_MAX
  );
  if (!cleanTitle) throw new Error('Board title cannot be empty.');
  const cleanDescription = sanitizeText(
    overrideDescription !== undefined ? overrideDescription : parsed.description,
    LIMITS.BOARD_DESC_MAX
  );
  const cleanOwnerName = ownerDisplayName
    ? sanitizeText(ownerDisplayName, LIMITS.USER_DISPLAY_NAME_MAX)
    : '';

  const boardId = generateId('brd');
  const boardPath = `boards/${boardId}`;

  const sanitizedCustomRoles = parsed.customRoles
    .slice(0, LIMITS.BOARD_CUSTOM_ROLES_MAX)
    .map((cr, idx) => ({
      id: cr.id && ID_REGEX.test(cr.id) ? cr.id.slice(0, LIMITS.ID_MAX) : `role_${idx}_${Date.now().toString(36)}`,
      name: sanitizeText(cr.name, LIMITS.CUSTOM_ROLE_NAME_MAX) || `Role ${idx + 1}`,
      canCreateTasks: Boolean(cr.canCreateTasks),
      canEditTasks: Boolean(cr.canEditTasks),
      canDeleteTasks: Boolean(cr.canDeleteTasks),
      canManageColumns: Boolean(cr.canManageColumns),
      canAssignTasks: Boolean(cr.canAssignTasks),
    }));

  const boardPayload: Record<string, unknown> = {
    id: boardId,
    ownerId: uid,
    title: cleanTitle,
    description: cleanDescription,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (cleanOwnerName) {
    boardPayload.ownerDisplayName = cleanOwnerName;
  }
  if (sanitizedCustomRoles.length > 0) {
    boardPayload.customRoles = sanitizedCustomRoles;
  }

  try {
    await setDoc(doc(db, 'boards', boardId), boardPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, boardPath);
  }

  const columnsToCreate =
    parsed.columns.length > 0
      ? parsed.columns
      : [{ title: 'To Do', wipLimit: 0, tasks: [] }];

  // Commit columns in chunks (<= 400 per batch) before tasks
  const colIdByIndex: string[] = [];
  const BATCH_LIMIT = 400;

  for (let start = 0; start < columnsToCreate.length; start += BATCH_LIMIT) {
    const chunk = columnsToCreate.slice(start, start + BATCH_LIMIT);
    const colBatch = writeBatch(db);
    chunk.forEach((col, offset) => {
      const idx = start + offset;
      const colId = generateId('col');
      colIdByIndex[idx] = colId;
      colBatch.set(doc(db, 'boards', boardId, 'columns', colId), {
        id: colId,
        boardId,
        ownerId: uid,
        createdBy: uid,
        title: sanitizeText(col.title, LIMITS.COLUMN_TITLE_MAX) || `Column ${idx + 1}`,
        position: clampPosition((idx + 1) * 1000),
        wipLimit: Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Math.round(col.wipLimit || 0))),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await colBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/columns`);
    }
  }

  // Prepare tasks and subtasks
  const today = getTodayDateKey();
  interface QueuedTask {
    taskId: string;
    columnId: string;
    payload: Record<string, unknown>;
    subtasks: Array<{ title: string; completed: boolean }>;
  }
  const queuedTasks: QueuedTask[] = [];

  columnsToCreate.forEach((col, colIdx) => {
    const columnId = colIdByIndex[colIdx];
    col.tasks.forEach((t, tIdx) => {
      const cleanTaskTitle = sanitizeText(t.title, LIMITS.TASK_TITLE_MAX);
      if (!cleanTaskTitle) return;
      const taskId = generateId('tsk');
      const safeLinks = (() => {
        try {
          return sanitizeTaskLinks(t.links);
        } catch {
          return [];
        }
      })();
      const dueDate = sanitizeDateKey(t.dueDate);
      const completed = Boolean(t.completed);
      queuedTasks.push({
        taskId,
        columnId,
        payload: {
          id: taskId,
          boardId,
          columnId,
          ownerId: uid,
          createdBy: uid,
          assigneeId: '',
          title: cleanTaskTitle,
          description: sanitizeText(t.description, LIMITS.TASK_DESC_MAX),
          priority: t.priority,
          position: clampPosition((tIdx + 1) * 1000),
          tags: sanitizeTags(t.tags),
          dueDate,
          completed,
          placedOnColumnAt: today,
          completedAt: completed ? today : '',
          links: safeLinks,
          milestones: sanitizeTaskMilestones(t.milestones),
          notificationsEnabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        subtasks: t.subtasks,
      });
    });
  });

  // Commit tasks in chunks before subtasks
  for (let start = 0; start < queuedTasks.length; start += BATCH_LIMIT) {
    const chunk = queuedTasks.slice(start, start + BATCH_LIMIT);
    const taskBatch = writeBatch(db);
    chunk.forEach((qt) => {
      taskBatch.set(doc(db, 'boards', boardId, 'tasks', qt.taskId), qt.payload);
    });
    try {
      await taskBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/tasks`);
    }
  }

  // Commit subtasks in chunks
  const queuedSubtasks: Array<{
    taskId: string;
    subtaskId: string;
    payload: Record<string, unknown>;
  }> = [];

  queuedTasks.forEach((qt) => {
    qt.subtasks.forEach((sub, sIdx) => {
      const cleanSubTitle = sanitizeText(sub.title, LIMITS.SUBTASK_TITLE_MAX);
      if (!cleanSubTitle) return;
      const subtaskId = generateId('sub');
      queuedSubtasks.push({
        taskId: qt.taskId,
        subtaskId,
        payload: {
          id: subtaskId,
          boardId,
          taskId: qt.taskId,
          ownerId: uid,
          createdBy: uid,
          title: cleanSubTitle,
          completed: Boolean(sub.completed),
          position: clampPosition((sIdx + 1) * 1000),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    });
  });

  for (let start = 0; start < queuedSubtasks.length; start += BATCH_LIMIT) {
    const chunk = queuedSubtasks.slice(start, start + BATCH_LIMIT);
    const subBatch = writeBatch(db);
    chunk.forEach((qs) => {
      subBatch.set(
        doc(db, 'boards', boardId, 'tasks', qs.taskId, 'subtasks', qs.subtaskId),
        qs.payload
      );
    });
    try {
      await subBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/subtasks`);
    }
  }

  return boardId;
}

export async function cloneBoard(
  uid: string,
  sourceBoard: Board,
  options: {
    title: string;
    description: string;
    includeTasks?: boolean;
    resetProgress?: boolean;
    ownerDisplayName?: string;
  }
): Promise<string> {
  assertValidId(uid, 'userId');
  assertValidId(sourceBoard.id, 'boardId');

  const cleanTitle = sanitizeText(options.title, LIMITS.BOARD_TITLE_MAX);
  if (!cleanTitle) throw new Error('Board name cannot be empty.');
  const cleanDescription = sanitizeText(options.description, LIMITS.BOARD_DESC_MAX);
  const cleanOwnerName = options.ownerDisplayName
    ? sanitizeText(options.ownerDisplayName, LIMITS.USER_DISPLAY_NAME_MAX)
    : '';
  const includeTasks = options.includeTasks !== false;
  const resetProgress = options.resetProgress !== false;

  // 1. Read source columns
  let sourceColumns: Column[] = [];
  try {
    const colSnaps = await getDocs(collection(db, 'boards', sourceBoard.id, 'columns'));
    sourceColumns = colSnaps.docs
      .map((d) => d.data() as Column)
      .sort((a, b) => a.position - b.position);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `boards/${sourceBoard.id}/columns`);
  }

  // 2. Optionally read source tasks & subtasks
  let sourceTasks: Task[] = [];
  const subtasksBySourceTask = new Map<string, Subtask[]>();

  if (includeTasks) {
    try {
      const taskSnaps = await getDocs(collection(db, 'boards', sourceBoard.id, 'tasks'));
      sourceTasks = taskSnaps.docs
        .map((d) => d.data() as Task)
        .sort((a, b) => a.position - b.position);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `boards/${sourceBoard.id}/tasks`);
    }

    const READ_CONCURRENCY = 10;
    for (let i = 0; i < sourceTasks.length; i += READ_CONCURRENCY) {
      const slice = sourceTasks.slice(i, i + READ_CONCURRENCY);
      await Promise.all(
        slice.map(async (t) => {
          try {
            const subSnaps = await getDocs(
              collection(db, 'boards', sourceBoard.id, 'tasks', t.id, 'subtasks')
            );
            const items = subSnaps.docs
              .map((d) => d.data() as Subtask)
              .sort((a, b) => a.position - b.position);
            subtasksBySourceTask.set(t.id, items);
          } catch (error) {
            handleFirestoreError(
              error,
              OperationType.LIST,
              `boards/${sourceBoard.id}/tasks/${t.id}/subtasks`
            );
          }
        })
      );
    }
  }

  // 3. Create new board document
  const newBoardId = generateId('brd');
  const boardPayload: Record<string, unknown> = {
    id: newBoardId,
    ownerId: uid,
    title: cleanTitle,
    description: cleanDescription,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (cleanOwnerName) {
    boardPayload.ownerDisplayName = cleanOwnerName;
  }

  const rawBg = (sourceBoard.backgroundImageUrl ?? '').trim();
  if (rawBg && isValidBoardBackgroundUrl(rawBg, false)) {
    boardPayload.backgroundImageUrl = rawBg;
  }
  if (typeof sourceBoard.surfaceOpacityEnabled === 'boolean') {
    boardPayload.surfaceOpacityEnabled = sourceBoard.surfaceOpacityEnabled;
  }
  if (typeof sourceBoard.surfaceOpacity === 'number' && Number.isFinite(sourceBoard.surfaceOpacity)) {
    boardPayload.surfaceOpacity = Math.round(Math.max(0, Math.min(100, sourceBoard.surfaceOpacity)));
  }
  if (Array.isArray(sourceBoard.customRoles) && sourceBoard.customRoles.length > 0) {
    boardPayload.customRoles = sourceBoard.customRoles
      .slice(0, LIMITS.BOARD_CUSTOM_ROLES_MAX)
      .filter((cr) => Boolean(cr.id && ID_REGEX.test(cr.id) && sanitizeText(cr.name, LIMITS.CUSTOM_ROLE_NAME_MAX)))
      .map((cr) => ({
        id: cr.id,
        name: sanitizeText(cr.name, LIMITS.CUSTOM_ROLE_NAME_MAX),
        canCreateTasks: Boolean(cr.canCreateTasks),
        canEditTasks: Boolean(cr.canEditTasks),
        canDeleteTasks: Boolean(cr.canDeleteTasks),
        canManageColumns: Boolean(cr.canManageColumns),
        canAssignTasks: Boolean(cr.canAssignTasks),
      }));
  }

  try {
    await setDoc(doc(db, 'boards', newBoardId), boardPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `boards/${newBoardId}`);
  }

  // 4. Create cloned columns (pre-mapping IDs so autoMoveTargetColumnId remaps cleanly)
  const colIdMap = new Map<string, string>();
  sourceColumns.forEach((col) => {
    colIdMap.set(col.id, generateId('col'));
  });

  const BATCH_LIMIT = 400;
  for (let start = 0; start < sourceColumns.length; start += BATCH_LIMIT) {
    const chunk = sourceColumns.slice(start, start + BATCH_LIMIT);
    const colBatch = writeBatch(db);
    chunk.forEach((col, offset) => {
      const newColId = colIdMap.get(col.id)!;
      const idx = start + offset;
      const colPayload: Record<string, unknown> = {
        id: newColId,
        boardId: newBoardId,
        ownerId: uid,
        createdBy: uid,
        title: sanitizeText(col.title, LIMITS.COLUMN_TITLE_MAX) || `Column ${idx + 1}`,
        position: clampPosition(col.position ?? (idx + 1) * 1000),
        wipLimit: Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Math.floor(col.wipLimit || 0))),
        colorRules: sanitizeColumnColorRules(col.colorRules),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (typeof col.autoMoveOnComplete === 'boolean') {
        colPayload.autoMoveOnComplete = col.autoMoveOnComplete;
      }
      if (typeof col.autoMoveTargetColumnId === 'string') {
        const mappedTarget = col.autoMoveTargetColumnId
          ? colIdMap.get(col.autoMoveTargetColumnId) ?? ''
          : '';
        colPayload.autoMoveTargetColumnId = mappedTarget !== newColId ? mappedTarget : '';
      }
      if (typeof col.requireReviewBeforeMove === 'boolean') {
        colPayload.requireReviewBeforeMove = col.requireReviewBeforeMove;
      }
      colBatch.set(doc(db, 'boards', newBoardId, 'columns', newColId), colPayload);
    });

    try {
      await colBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `boards/${newBoardId}/columns`);
    }
  }

  // 5. Create cloned tasks & subtasks
  if (includeTasks && sourceTasks.length > 0) {
    const today = getTodayDateKey();
    const validTasks = sourceTasks.filter((t) => colIdMap.has(t.columnId));
    const taskIdMap = new Map<string, string>();
    validTasks.forEach((t) => {
      taskIdMap.set(t.id, generateId('tsk'));
    });

    for (let start = 0; start < validTasks.length; start += BATCH_LIMIT) {
      const chunk = validTasks.slice(start, start + BATCH_LIMIT);
      const taskBatch = writeBatch(db);
      chunk.forEach((t, offset) => {
        const newTaskId = taskIdMap.get(t.id)!;
        const newColId = colIdMap.get(t.columnId)!;
        const cleanTaskTitle = sanitizeText(t.title, LIMITS.TASK_TITLE_MAX) || 'Untitled task';
        const safeLinks = (() => {
          try {
            return sanitizeTaskLinks(t.links);
          } catch {
            return [];
          }
        })();
        const isCompleted = resetProgress ? false : Boolean(t.completed);
        const isReviewed = resetProgress ? false : Boolean(t.reviewed);
        const taskPayload: Record<string, unknown> = {
          id: newTaskId,
          boardId: newBoardId,
          columnId: newColId,
          ownerId: uid,
          createdBy: uid,
          assigneeId: '',
          reviewerId: '',
          title: cleanTaskTitle,
          description: sanitizeText(t.description ?? '', LIMITS.TASK_DESC_MAX),
          priority: t.priority ?? 'medium',
          position: clampPosition(t.position ?? (start + offset + 1) * 1000),
          tags: sanitizeTags(t.tags ?? []),
          dueDate: sanitizeDateKey(t.dueDate),
          completed: isCompleted,
          placedOnColumnAt: resetProgress
            ? today
            : sanitizeDateKey(t.placedOnColumnAt) || today,
          completedAt: isCompleted
            ? sanitizeDateKey(t.completedAt) || today
            : '',
          reviewed: isReviewed,
          reviewedAt: isReviewed ? sanitizeDateKey(t.reviewedAt) || today : '',
          reviewedBy: '',
          links: safeLinks,
          milestones: sanitizeTaskMilestones(t.milestones),
          notificationsEnabled: t.notificationsEnabled !== false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        taskBatch.set(doc(db, 'boards', newBoardId, 'tasks', newTaskId), taskPayload);
      });

      try {
        await taskBatch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `boards/${newBoardId}/tasks`);
      }
    }

    const queuedSubtasks: Array<{
      taskId: string;
      subtaskId: string;
      payload: Record<string, unknown>;
    }> = [];

    validTasks.forEach((t) => {
      const newTaskId = taskIdMap.get(t.id);
      if (!newTaskId) return;
      const subs = subtasksBySourceTask.get(t.id) ?? [];
      subs.forEach((sub, sIdx) => {
        const cleanSubTitle = sanitizeText(sub.title, LIMITS.SUBTASK_TITLE_MAX);
        if (!cleanSubTitle) return;
        const subtaskId = generateId('sub');
        queuedSubtasks.push({
          taskId: newTaskId,
          subtaskId,
          payload: {
            id: subtaskId,
            boardId: newBoardId,
            taskId: newTaskId,
            ownerId: uid,
            createdBy: uid,
            title: cleanSubTitle,
            completed: resetProgress ? false : Boolean(sub.completed),
            position: clampPosition(sub.position ?? (sIdx + 1) * 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      });
    });

    for (let start = 0; start < queuedSubtasks.length; start += BATCH_LIMIT) {
      const chunk = queuedSubtasks.slice(start, start + BATCH_LIMIT);
      const subBatch = writeBatch(db);
      chunk.forEach((qs) => {
        subBatch.set(
          doc(db, 'boards', newBoardId, 'tasks', qs.taskId, 'subtasks', qs.subtaskId),
          qs.payload
        );
      });
      try {
        await subBatch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `boards/${newBoardId}/subtasks`);
      }
    }
  }

  return newBoardId;
}

export async function updateBoardDetails(
  boardId: string,
  title: string,
  description: string,
  appearance?: {
    backgroundImageUrl?: string;
    surfaceOpacityEnabled?: boolean;
    surfaceOpacity?: number;
  }
): Promise<void> {
  assertValidId(boardId, 'boardId');
  const cleanTitle = sanitizeText(title, LIMITS.BOARD_TITLE_MAX);
  if (!cleanTitle) throw new Error('Board title cannot be empty.');
  const path = `boards/${boardId}`;

  const payload: Record<string, unknown> = {
    title: cleanTitle,
    description: sanitizeText(description, LIMITS.BOARD_DESC_MAX),
    updatedAt: serverTimestamp(),
  };

  if (appearance) {
    const rawBg = normalizeBoardBackgroundUrl(appearance.backgroundImageUrl ?? '');
    payload.backgroundImageUrl = rawBg;
    payload.surfaceOpacityEnabled = Boolean(appearance.surfaceOpacityEnabled);
    const rawOpacity =
      typeof appearance.surfaceOpacity === 'number' && Number.isFinite(appearance.surfaceOpacity)
        ? appearance.surfaceOpacity
        : 80;
    payload.surfaceOpacity = Math.round(Math.max(0, Math.min(100, rawOpacity)));
  }

  try {
    await updateDoc(doc(db, 'boards', boardId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateBoardAppearance(
  boardId: string,
  appearance: {
    backgroundImageUrl: string;
    surfaceOpacityEnabled: boolean;
    surfaceOpacity: number;
  }
): Promise<void> {
  assertValidId(boardId, 'boardId');
  const path = `boards/${boardId}`;
  const cleanBg = normalizeBoardBackgroundUrl(appearance.backgroundImageUrl ?? '');
  const rawOpacity =
    typeof appearance.surfaceOpacity === 'number' && Number.isFinite(appearance.surfaceOpacity)
      ? appearance.surfaceOpacity
      : 80;

  try {
    await updateDoc(doc(db, 'boards', boardId), {
      backgroundImageUrl: cleanBg,
      surfaceOpacityEnabled: Boolean(appearance.surfaceOpacityEnabled),
      surfaceOpacity: Math.round(Math.max(0, Math.min(100, rawOpacity))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateBoardCustomRoles(
  boardId: string,
  customRoles: BoardCustomRole[]
): Promise<void> {
  assertValidId(boardId, 'boardId');
  const sanitized = customRoles
    .slice(0, LIMITS.BOARD_CUSTOM_ROLES_MAX)
    .map((cr) => {
      const cleanId = assertValidId(cr.id, 'customRoleId');
      const cleanName = sanitizeText(cr.name, LIMITS.CUSTOM_ROLE_NAME_MAX);
      if (!cleanName) throw new Error('Custom role name cannot be empty.');
      return {
        id: cleanId,
        name: cleanName,
        canCreateTasks: Boolean(cr.canCreateTasks),
        canEditTasks: Boolean(cr.canEditTasks),
        canDeleteTasks: Boolean(cr.canDeleteTasks),
        canManageColumns: Boolean(cr.canManageColumns),
        canAssignTasks: Boolean(cr.canAssignTasks),
      };
    });

  const path = `boards/${boardId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId), {
      customRoles: sanitized,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function archiveBoard(boardId: string): Promise<void> {
  assertValidId(boardId, 'boardId');
  const path = `boards/${boardId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBoard(boardId: string): Promise<void> {
  assertValidId(boardId, 'boardId');

  // Delete all tasks & subtasks
  const tasksPath = `boards/${boardId}/tasks`;
  try {
    const taskSnaps = await getDocs(collection(db, 'boards', boardId, 'tasks'));
    for (const taskDoc of taskSnaps.docs) {
      const subtasksSnap = await getDocs(
        collection(db, 'boards', boardId, 'tasks', taskDoc.id, 'subtasks')
      );
      if (!subtasksSnap.empty) {
        const subBatch = writeBatch(db);
        subtasksSnap.docs.forEach((s) => subBatch.delete(s.ref));
        await subBatch.commit();
      }
      await deleteDoc(taskDoc.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, tasksPath);
  }

  // Delete all columns
  try {
    const colSnaps = await getDocs(collection(db, 'boards', boardId, 'columns'));
    if (!colSnaps.empty) {
      const colBatch = writeBatch(db);
      colSnaps.docs.forEach((c) => colBatch.delete(c.ref));
      await colBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/columns`);
  }

  // Delete all invites and clean up any mapped short board codes
  try {
    const inviteSnaps = await getDocs(collection(db, 'boards', boardId, 'invites'));
    if (!inviteSnaps.empty) {
      const codeIds: string[] = [];
      const invBatch = writeBatch(db);
      inviteSnaps.docs.forEach((i) => {
        const invData = i.data() as BoardInvite;
        if (
          invData.joinCode &&
          ID_REGEX.test(invData.joinCode) &&
          invData.joinCode.length >= LIMITS.ACCESS_CODE_MIN
        ) {
          codeIds.push(invData.joinCode);
        }
        invBatch.delete(i.ref);
      });
      for (const codeId of codeIds) {
        await deleteDoc(doc(db, 'boardCodes', codeId)).catch(() => {});
      }
      await invBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/invites`);
  }

  // Delete all task chat messages
  try {
    const msgSnaps = await getDocs(collection(db, 'boards', boardId, 'messages'));
    if (!msgSnaps.empty) {
      const msgBatch = writeBatch(db);
      msgSnaps.docs.forEach((m) => msgBatch.delete(m.ref));
      await msgBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/messages`);
  }

  // Delete all pending member notices
  try {
    const pendingSnaps = await getDocs(collection(db, 'boards', boardId, 'pendingMembers'));
    if (!pendingSnaps.empty) {
      const pendBatch = writeBatch(db);
      pendingSnaps.docs.forEach((p) => pendBatch.delete(p.ref));
      await pendBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/pendingMembers`);
  }

  // Delete all members and their boardRefs
  try {
    const memberSnaps = await getDocs(collection(db, 'boards', boardId, 'members'));
    if (!memberSnaps.empty) {
      const memBatch = writeBatch(db);
      memberSnaps.docs.forEach((m) => {
        memBatch.delete(m.ref);
        memBatch.delete(doc(db, 'users', m.id, 'boardRefs', boardId));
      });
      await memBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/members`);
  }

  // Delete board document
  try {
    await deleteDoc(doc(db, 'boards', boardId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}`);
  }
}

export async function createColumn(
  actorUid: string,
  board: Board,
  title: string,
  position: number,
  wipLimit = 0,
  colorRules: ColumnColorRule[] = []
): Promise<string> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');
  const cleanTitle = sanitizeText(title, LIMITS.COLUMN_TITLE_MAX);
  if (!cleanTitle) throw new Error('Column title cannot be empty.');
  const cleanWip = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Math.floor(wipLimit)));
  const cleanRules = sanitizeColumnColorRules(colorRules);

  const columnId = generateId('col');
  const path = `boards/${board.id}/columns/${columnId}`;
  try {
    await setDoc(doc(db, 'boards', board.id, 'columns', columnId), {
      id: columnId,
      boardId: board.id,
      ownerId: board.ownerId,
      createdBy: actorUid,
      title: cleanTitle,
      position: clampPosition(position),
      wipLimit: cleanWip,
      colorRules: cleanRules,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return columnId;
}

export async function updateColumnDetails(
  boardId: string,
  columnId: string,
  title: string,
  wipLimit: number,
  colorRules: ColumnColorRule[] = [],
  automation?: {
    autoMoveOnComplete: boolean;
    autoMoveTargetColumnId: string;
    requireReviewBeforeMove?: boolean;
  }
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(columnId, 'columnId');
  const cleanTitle = sanitizeText(title, LIMITS.COLUMN_TITLE_MAX);
  if (!cleanTitle) throw new Error('Column title cannot be empty.');
  const cleanWip = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Math.floor(wipLimit)));
  const cleanRules = sanitizeColumnColorRules(colorRules);

  const payload: Record<string, unknown> = {
    title: cleanTitle,
    wipLimit: cleanWip,
    colorRules: cleanRules,
    updatedAt: serverTimestamp(),
  };

  if (automation) {
    const cleanTargetId = automation.autoMoveTargetColumnId.trim();
    if (cleanTargetId && cleanTargetId !== columnId) {
      assertValidId(cleanTargetId, 'targetColumnId');
      payload.autoMoveTargetColumnId = cleanTargetId;
    } else {
      payload.autoMoveTargetColumnId = '';
    }
    payload.autoMoveOnComplete = Boolean(automation.autoMoveOnComplete);
    if (typeof automation.requireReviewBeforeMove === 'boolean') {
      payload.requireReviewBeforeMove = automation.requireReviewBeforeMove;
    }
  }

  const path = `boards/${boardId}/columns/${columnId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function reorderColumn(
  boardId: string,
  columnId: string,
  position: number
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(columnId, 'columnId');
  const path = `boards/${boardId}/columns/${columnId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), {
      position: clampPosition(position),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteColumnAndHandleTasks(
  boardId: string,
  columnId: string,
  columnTasks: Task[],
  targetColumnId: string | null,
  targetColumnMaxPosition: number
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(columnId, 'columnId');

  if (columnTasks.length > 0) {
    if (targetColumnId) {
      assertValidId(targetColumnId, 'targetColumnId');
      const moveBatch = writeBatch(db);
      columnTasks.forEach((t, idx) => {
        moveBatch.update(doc(db, 'boards', boardId, 'tasks', t.id), {
          columnId: targetColumnId,
          position: clampPosition(targetColumnMaxPosition + (idx + 1) * 1000),
          updatedAt: serverTimestamp(),
        });
      });
      try {
        await moveBatch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `boards/${boardId}/tasks`);
      }
    } else {
      for (const t of columnTasks) {
        await deleteTask(boardId, t.id);
      }
    }
  }

  const path = `boards/${boardId}/columns/${columnId}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'columns', columnId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createTask(
  actorUid: string,
  board: Board,
  columnId: string,
  input: {
    title: string;
    description?: string;
    priority?: Priority;
    position: number;
    tags?: string[];
    dueDate?: string;
    assigneeId?: string;
    placedOnColumnAt?: string;
    links?: TaskLink[];
    milestones?: TaskMilestone[];
    notificationsEnabled?: boolean;
  }
): Promise<string> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');
  assertValidId(columnId, 'columnId');
  if (input.assigneeId) {
    assertValidId(input.assigneeId, 'assigneeId');
  }

  const cleanTitle = sanitizeText(input.title, LIMITS.TASK_TITLE_MAX);
  if (!cleanTitle) throw new Error('Task title cannot be empty.');
  const placedAt = sanitizeDateKey(input.placedOnColumnAt) || getTodayDateKey();

  const taskId = generateId('tsk');
  const path = `boards/${board.id}/tasks/${taskId}`;
  try {
    await setDoc(doc(db, 'boards', board.id, 'tasks', taskId), {
      id: taskId,
      boardId: board.id,
      columnId,
      ownerId: board.ownerId,
      createdBy: actorUid,
      assigneeId: input.assigneeId ?? '',
      title: cleanTitle,
      description: sanitizeText(input.description ?? '', LIMITS.TASK_DESC_MAX),
      priority: input.priority ?? 'medium',
      position: clampPosition(input.position),
      tags: sanitizeTags(input.tags ?? []),
      dueDate: sanitizeDateKey(input.dueDate),
      completed: false,
      placedOnColumnAt: placedAt,
      completedAt: '',
      links: sanitizeTaskLinks(input.links),
      milestones: sanitizeTaskMilestones(input.milestones),
      notificationsEnabled: input.notificationsEnabled ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return taskId;
}

export async function moveTask(
  boardId: string,
  taskId: string,
  columnId: string,
  position: number,
  columnChanged = true
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  assertValidId(columnId, 'columnId');

  const path = `boards/${boardId}/tasks/${taskId}`;
  const payload: Record<string, unknown> = {
    columnId,
    position: clampPosition(position),
    updatedAt: serverTimestamp(),
  };
  if (columnChanged) {
    payload.placedOnColumnAt = getTodayDateKey();
  }
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskDetails(
  boardId: string,
  taskId: string,
  input: {
    title: string;
    description: string;
    priority: Priority;
    tags: string[];
    dueDate: string;
    completed: boolean;
    completedAt?: string;
    placedOnColumnAt?: string;
    assigneeId: string;
    links?: TaskLink[];
    milestones?: TaskMilestone[];
    notificationsEnabled?: boolean;
  }
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  if (input.assigneeId) {
    assertValidId(input.assigneeId, 'assigneeId');
  }

  const cleanTitle = sanitizeText(input.title, LIMITS.TASK_TITLE_MAX);
  if (!cleanTitle) throw new Error('Task title cannot be empty.');
  const cleanCompletedAt = input.completed
    ? sanitizeDateKey(input.completedAt) || getTodayDateKey()
    : '';
  const cleanPlacedAt = sanitizeDateKey(input.placedOnColumnAt) || getTodayDateKey();

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), {
      title: cleanTitle,
      description: sanitizeText(input.description, LIMITS.TASK_DESC_MAX),
      priority: input.priority,
      tags: sanitizeTags(input.tags),
      dueDate: sanitizeDateKey(input.dueDate),
      completed: input.completed,
      completedAt: cleanCompletedAt,
      placedOnColumnAt: cleanPlacedAt,
      assigneeId: input.assigneeId,
      links: sanitizeTaskLinks(input.links),
      milestones: sanitizeTaskMilestones(input.milestones),
      notificationsEnabled: input.notificationsEnabled ?? true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleTaskCompleted(
  boardId: string,
  taskId: string,
  completed: boolean
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), {
      completed,
      completedAt: completed ? getTodayDateKey() : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleTaskNotifications(
  boardId: string,
  taskId: string,
  notificationsEnabled: boolean
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), {
      notificationsEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskAssignee(
  boardId: string,
  taskId: string,
  assigneeId: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  if (assigneeId) {
    assertValidId(assigneeId, 'assigneeId');
  }

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), {
      assigneeId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskReviewer(
  boardId: string,
  taskId: string,
  reviewerId: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  if (reviewerId) {
    assertValidId(reviewerId, 'reviewerId');
  }

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), {
      reviewerId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleTaskReviewed(
  boardId: string,
  taskId: string,
  reviewed: boolean,
  actorUid: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  assertValidId(actorUid, 'actorUid');

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId), {
      reviewed,
      reviewedAt: reviewed ? getTodayDateKey() : '',
      reviewedBy: reviewed ? actorUid : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTask(boardId: string, taskId: string): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');

  const subtasksPath = `boards/${boardId}/tasks/${taskId}/subtasks`;
  try {
    const subSnaps = await getDocs(collection(db, 'boards', boardId, 'tasks', taskId, 'subtasks'));
    if (!subSnaps.empty) {
      const batch = writeBatch(db);
      subSnaps.docs.forEach((s) => batch.delete(s.ref));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, subtasksPath);
  }

  const messagesPath = `boards/${boardId}/messages`;
  try {
    const msgSnaps = await getDocs(
      query(collection(db, 'boards', boardId, 'messages'), where('taskId', '==', taskId))
    );
    if (!msgSnaps.empty) {
      const batch = writeBatch(db);
      msgSnaps.docs.forEach((m) => batch.delete(m.ref));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, messagesPath);
  }

  const path = `boards/${boardId}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createSubtask(
  actorUid: string,
  board: Board,
  taskId: string,
  title: string,
  position: number
): Promise<string> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');
  assertValidId(taskId, 'taskId');

  const cleanTitle = sanitizeText(title, LIMITS.SUBTASK_TITLE_MAX);
  if (!cleanTitle) throw new Error('Subtask title cannot be empty.');

  const subtaskId = generateId('sub');
  const path = `boards/${board.id}/tasks/${taskId}/subtasks/${subtaskId}`;
  try {
    await setDoc(doc(db, 'boards', board.id, 'tasks', taskId, 'subtasks', subtaskId), {
      id: subtaskId,
      boardId: board.id,
      taskId,
      ownerId: board.ownerId,
      createdBy: actorUid,
      title: cleanTitle,
      completed: false,
      position: clampPosition(position),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return subtaskId;
}

export async function toggleSubtaskCompleted(
  boardId: string,
  taskId: string,
  subtaskId: string,
  completed: boolean
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  assertValidId(subtaskId, 'subtaskId');

  const path = `boards/${boardId}/tasks/${taskId}/subtasks/${subtaskId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'tasks', taskId, 'subtasks', subtaskId), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSubtask(
  boardId: string,
  taskId: string,
  subtaskId: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(taskId, 'taskId');
  assertValidId(subtaskId, 'subtaskId');

  const path = `boards/${boardId}/tasks/${taskId}/subtasks/${subtaskId}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'tasks', taskId, 'subtasks', subtaskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendTaskMessage(
  actorUid: string,
  senderName: string,
  board: Board,
  task: Pick<Task, 'id' | 'title'>,
  text: string
): Promise<string> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');
  assertValidId(task.id, 'taskId');

  const cleanText = sanitizeText(text, LIMITS.MESSAGE_TEXT_MAX);
  if (!cleanText) throw new Error('Message cannot be empty.');
  const cleanSender =
    sanitizeText(senderName || 'Team Member', LIMITS.USER_DISPLAY_NAME_MAX) || 'Team Member';
  const cleanTaskTitle =
    sanitizeText(task.title || 'Untitled Task', LIMITS.TASK_TITLE_MAX) || 'Untitled Task';

  const messageId = generateId('msg');
  const path = `boards/${board.id}/messages/${messageId}`;
  try {
    await setDoc(doc(db, 'boards', board.id, 'messages', messageId), {
      id: messageId,
      boardId: board.id,
      taskId: task.id,
      taskTitle: cleanTaskTitle,
      ownerId: board.ownerId,
      senderId: actorUid,
      senderName: cleanSender,
      text: cleanText,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return messageId;
}

export async function deleteTaskMessage(boardId: string, messageId: string): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(messageId, 'messageId');

  const path = `boards/${boardId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Sharing, Granular Permissions, Invites & Admin Management
// -----------------------------------------------------------------------------
export function maskEmailForNotice(emailKey: string): string {
  const [localPart = '', domainPart = ''] = emailKey.split('@');
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  const masked = `${visible}***@${domainPart}`;
  return masked.slice(0, LIMITS.WHITELIST_LABEL_MAX);
}

export function subscribeBoardPendingMembers(
  boardId: string,
  onData: (notices: PendingBoardMemberNotice[]) => void
): Unsubscribe {
  const path = `boards/${boardId}/pendingMembers`;
  return onSnapshot(
    collection(db, 'boards', boardId, 'pendingMembers'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as PendingBoardMemberNotice);
      items.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function revokePendingBoardInvite(
  boardId: string,
  emailHash: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  if (!/^[a-f0-9]{64}$/.test(emailHash)) {
    throw new Error('Invalid pending invite identifier.');
  }
  const path = `boards/${boardId}/pendingMembers/${emailHash}`;
  try {
    await deleteDoc(doc(db, 'boards', boardId, 'pendingMembers', emailHash));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function grantBoardAccessByEmail(
  actorUid: string,
  board: Board,
  email: string,
  role: BoardRole,
  permissions: BoardPermissions,
  customRoleName?: string
): Promise<{ uid?: string; displayName: string; pending: boolean }> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');

  const emailKey = normalizeEmailKey(email);
  const emailHash = await hashEmail(emailKey);
  const lookupPath = `emailLookup/${emailHash}`;
  let targetUid = '';
  let displayName = '';
  let hasLookup = false;

  try {
    const snap = await getDoc(doc(db, 'emailLookup', emailHash));
    if (snap.exists()) {
      const data = snap.data();
      targetUid = data.uid as string;
      displayName = data.displayName as string;
      hasLookup = true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, lookupPath);
  }

  if (hasLookup) {
    if (targetUid === board.ownerId) {
      throw new Error('This user is already the creator of this board.');
    }
    await grantBoardAccessByUid(board, targetUid, displayName, role, permissions, customRoleName);
    return { uid: targetUid, displayName, pending: false };
  }

  // User has not signed in yet: auto-whitelist (strictly without Board creation permissions)
  // and queue a pending board grant claimed automatically on their first sign-in.
  const whitelistRef = doc(db, 'whitelist', emailKey);
  let whitelistStatusKnown = false;
  try {
    const wlSnap = await getDoc(whitelistRef);
    whitelistStatusKnown = true;
    if (wlSnap.exists()) {
      const entry = wlSnap.data() as WhitelistEntry;
      if (entry.active === false) {
        throw new Error(
          "This email's workspace access is currently paused by an administrator. Ask an admin to re-enable it before sharing."
        );
      }
    } else {
      await setDoc(whitelistRef, {
        email: emailKey,
        label: '',
        active: true,
        canCreateBoards: false,
        addedBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('currently paused')) {
      throw error;
    }
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('permission') || msg.includes('insufficient')) {
      if (!whitelistStatusKnown) {
        throw new Error(
          'This email has not signed in yet and you do not have permission to add new workspace users. Ask an Admin to whitelist them or share an Invite Link instead.'
        );
      }
      throw new Error(
        'Only Admins or users with Board Creation permissions can auto-add new emails to the workspace. Share an Invite Link instead.'
      );
    }
    handleFirestoreError(error, OperationType.WRITE, `whitelist/${emailKey}`);
  }

  const cleanBoardTitle = sanitizeText(board.title, LIMITS.BOARD_TITLE_MAX) || 'Shared Board';
  const cleanRoleName =
    role === 'custom' && customRoleName
      ? sanitizeText(customRoleName, LIMITS.CUSTOM_ROLE_NAME_MAX)
      : '';

  const pendingBoardRef = doc(db, 'whitelist', emailKey, 'pendingBoards', board.id);
  const pendingBoardPath = `whitelist/${emailKey}/pendingBoards/${board.id}`;
  try {
    const existingGrant = await getDoc(pendingBoardRef);
    if (existingGrant.exists()) {
      await updateDoc(pendingBoardRef, {
        boardTitle: cleanBoardTitle,
        role,
        customRoleName: cleanRoleName,
        canCreateTasks: permissions.canCreateTasks,
        canEditTasks: permissions.canEditTasks,
        canDeleteTasks: permissions.canDeleteTasks,
        canManageColumns: permissions.canManageColumns,
        canAssignTasks: permissions.canAssignTasks,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(pendingBoardRef, {
        boardId: board.id,
        email: emailKey,
        emailHash,
        boardTitle: cleanBoardTitle,
        ownerId: board.ownerId,
        createdBy: actorUid,
        role,
        customRoleName: cleanRoleName,
        canCreateTasks: permissions.canCreateTasks,
        canEditTasks: permissions.canEditTasks,
        canDeleteTasks: permissions.canDeleteTasks,
        canManageColumns: permissions.canManageColumns,
        canAssignTasks: permissions.canAssignTasks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pendingBoardPath);
  }

  const noticeRef = doc(db, 'boards', board.id, 'pendingMembers', emailHash);
  const noticePath = `boards/${board.id}/pendingMembers/${emailHash}`;
  const maskedEmail = maskEmailForNotice(emailKey);
  try {
    const existingNotice = await getDoc(noticeRef);
    if (existingNotice.exists()) {
      await updateDoc(noticeRef, {
        maskedEmail,
        role,
        customRoleName: cleanRoleName,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(noticeRef, {
        emailHash,
        boardId: board.id,
        ownerId: board.ownerId,
        createdBy: actorUid,
        maskedEmail,
        role,
        customRoleName: cleanRoleName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, noticePath);
  }

  return { displayName: emailKey, pending: true };
}

export async function claimPendingBoardGrants(user: User): Promise<string[]> {
  if (!user.email || !user.emailVerified) return [];
  assertValidId(user.uid, 'userId');

  const emailKey = user.email.trim().toLowerCase();
  if (!EMAIL_KEY_REGEX.test(emailKey)) return [];
  const emailHash = await hashEmail(emailKey);

  let snap;
  try {
    snap = await getDocs(collection(db, 'whitelist', emailKey, 'pendingBoards'));
  } catch {
    return [];
  }

  if (snap.empty) return [];

  const cleanName =
    sanitizeText(
      user.displayName || user.email.split('@')[0] || 'Collaborator',
      LIMITS.USER_DISPLAY_NAME_MAX
    ) || 'Collaborator';

  const claimedBoardIds: string[] = [];

  for (const grantDoc of snap.docs) {
    const grant = grantDoc.data() as PendingBoardGrant;
    if (!grant.boardId || !ID_REGEX.test(grant.boardId)) {
      await deleteDoc(grantDoc.ref).catch(() => {});
      continue;
    }

    if (grant.ownerId === user.uid) {
      await deleteDoc(grantDoc.ref).catch(() => {});
      await deleteDoc(doc(db, 'boards', grant.boardId, 'pendingMembers', emailHash)).catch(() => {});
      continue;
    }

    // Check if already a member
    let alreadyMember = false;
    try {
      const memSnap = await getDoc(doc(db, 'boards', grant.boardId, 'members', user.uid));
      if (memSnap.exists()) {
        alreadyMember = true;
      }
    } catch {
      // expected when not a member yet
    }

    if (alreadyMember) {
      await deleteDoc(grantDoc.ref).catch(() => {});
      await deleteDoc(doc(db, 'boards', grant.boardId, 'pendingMembers', emailHash)).catch(() => {});
      claimedBoardIds.push(grant.boardId);
      continue;
    }

    const memberPayload: Record<string, unknown> = {
      uid: user.uid,
      boardId: grant.boardId,
      ownerId: grant.ownerId,
      displayName: cleanName,
      role: grant.role,
      canView: true,
      canCreateTasks: Boolean(grant.canCreateTasks),
      canEditTasks: Boolean(grant.canEditTasks),
      canDeleteTasks: Boolean(grant.canDeleteTasks),
      canManageColumns: Boolean(grant.canManageColumns),
      canAssignTasks: hasAssignPermission(grant),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const refPayload: Record<string, unknown> = {
      boardId: grant.boardId,
      userId: user.uid,
      boardTitle: sanitizeText(grant.boardTitle || 'Shared Board', LIMITS.BOARD_TITLE_MAX) || 'Shared Board',
      boardOwnerId: grant.ownerId,
      role: grant.role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (typeof grant.customRoleName === 'string') {
      memberPayload.customRoleName = grant.customRoleName;
      refPayload.customRoleName = grant.customRoleName;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'boards', grant.boardId, 'members', user.uid), memberPayload);
    batch.set(doc(db, 'users', user.uid, 'boardRefs', grant.boardId), refPayload);
    batch.delete(grantDoc.ref);

    try {
      await batch.commit();
      await deleteDoc(doc(db, 'boards', grant.boardId, 'pendingMembers', emailHash)).catch(() => {});
      claimedBoardIds.push(grant.boardId);
    } catch {
      // Grant may have been revoked (pendingMembers deleted) or board archived/deleted; clean up stale doc
      await deleteDoc(grantDoc.ref).catch(() => {});
    }
  }

  return claimedBoardIds;
}

export async function grantBoardAccessByUid(
  board: Board,
  targetUid: string,
  displayName: string,
  role: BoardRole,
  permissions: BoardPermissions,
  customRoleName?: string
): Promise<void> {
  assertValidId(board.id, 'boardId');
  assertValidId(targetUid, 'userId');
  if (targetUid === board.ownerId) {
    throw new Error('The board creator already has full access.');
  }

  const cleanName = sanitizeText(displayName || 'Collaborator', LIMITS.USER_DISPLAY_NAME_MAX) || 'Collaborator';
  const cleanRoleName =
    role === 'custom' && customRoleName
      ? sanitizeText(customRoleName, LIMITS.CUSTOM_ROLE_NAME_MAX)
      : '';
  const batch = writeBatch(db);

  batch.set(doc(db, 'boards', board.id, 'members', targetUid), {
    uid: targetUid,
    boardId: board.id,
    ownerId: board.ownerId,
    displayName: cleanName,
    role,
    customRoleName: cleanRoleName,
    canView: true,
    canCreateTasks: permissions.canCreateTasks,
    canEditTasks: permissions.canEditTasks,
    canDeleteTasks: permissions.canDeleteTasks,
    canManageColumns: permissions.canManageColumns,
    canAssignTasks: permissions.canAssignTasks,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', targetUid, 'boardRefs', board.id), {
    boardId: board.id,
    userId: targetUid,
    boardTitle: sanitizeText(board.title, LIMITS.BOARD_TITLE_MAX),
    boardOwnerId: board.ownerId,
    role,
    customRoleName: cleanRoleName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `boards/${board.id}/members/${targetUid}`);
  }
}

export async function updateMemberPermissions(
  board: Board,
  memberUid: string,
  role: BoardRole,
  permissions: BoardPermissions,
  customRoleName?: string
): Promise<void> {
  assertValidId(board.id, 'boardId');
  assertValidId(memberUid, 'memberUid');

  const cleanRoleName =
    role === 'custom' && customRoleName
      ? sanitizeText(customRoleName, LIMITS.CUSTOM_ROLE_NAME_MAX)
      : '';

  const batch = writeBatch(db);
  batch.update(doc(db, 'boards', board.id, 'members', memberUid), {
    role,
    customRoleName: cleanRoleName,
    canView: true,
    canCreateTasks: permissions.canCreateTasks,
    canEditTasks: permissions.canEditTasks,
    canDeleteTasks: permissions.canDeleteTasks,
    canManageColumns: permissions.canManageColumns,
    canAssignTasks: permissions.canAssignTasks,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', memberUid, 'boardRefs', board.id), {
    role,
    customRoleName: cleanRoleName,
    boardTitle: sanitizeText(board.title, LIMITS.BOARD_TITLE_MAX),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `boards/${board.id}/members/${memberUid}`);
  }
}

export async function revokeBoardAccess(boardId: string, memberUid: string): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(memberUid, 'memberUid');

  const batch = writeBatch(db);
  batch.delete(doc(db, 'boards', boardId, 'members', memberUid));
  batch.delete(doc(db, 'users', memberUid, 'boardRefs', boardId));

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/members/${memberUid}`);
  }
}

export async function createBoardInvite(
  actorUid: string,
  board: Board,
  label: string,
  role: BoardRole,
  permissions: BoardPermissions,
  customRoleName?: string,
  customCode?: string
): Promise<{ inviteId: string; joinCode: string }> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');

  const trimmedCustom = customCode?.trim() ?? '';
  let joinCode = '';
  if (trimmedCustom) {
    joinCode = normalizeBoardCodeId(trimmedCustom);
    try {
      const existingSnap = await getDoc(doc(db, 'boardCodes', joinCode));
      if (existingSnap.exists()) {
        throw new Error(
          `Board code "${joinCode}" already exists. Choose another code or leave blank to auto-generate.`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, `boardCodes/${joinCode}`);
    }
  } else {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateRandomBoardCode('BRD');
      const snap = await getDoc(doc(db, 'boardCodes', candidate)).catch(() => null);
      if (!snap || !snap.exists()) {
        joinCode = candidate;
        break;
      }
    }
    if (!joinCode) {
      joinCode = generateRandomBoardCode('BRD');
    }
  }

  const inviteId = generateId('inv');
  const cleanRoleName =
    role === 'custom' && customRoleName
      ? sanitizeText(customRoleName, LIMITS.CUSTOM_ROLE_NAME_MAX)
      : '';
  const cleanBoardTitle = sanitizeText(board.title, LIMITS.BOARD_TITLE_MAX) || 'Shared Board';
  const path = `boards/${board.id}/invites/${inviteId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'boards', board.id, 'invites', inviteId), {
      id: inviteId,
      boardId: board.id,
      boardTitle: cleanBoardTitle,
      joinCode,
      ownerId: board.ownerId,
      createdBy: actorUid,
      label: sanitizeText(label, LIMITS.INVITE_LABEL_MAX),
      role,
      customRoleName: cleanRoleName,
      canCreateTasks: permissions.canCreateTasks,
      canEditTasks: permissions.canEditTasks,
      canDeleteTasks: permissions.canDeleteTasks,
      canManageColumns: permissions.canManageColumns,
      canAssignTasks: permissions.canAssignTasks,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'boardCodes', joinCode), {
      id: joinCode,
      boardId: board.id,
      inviteId,
      ownerId: board.ownerId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return { inviteId, joinCode };
}

export async function revokeBoardInvite(
  boardId: string,
  inviteId: string,
  joinCode?: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(inviteId, 'inviteId');
  const path = `boards/${boardId}/invites/${inviteId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'invites', inviteId), {
      active: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  if (joinCode && ID_REGEX.test(joinCode) && joinCode.length >= LIMITS.ACCESS_CODE_MIN) {
    await deleteDoc(doc(db, 'boardCodes', joinCode)).catch(() => {});
  }
}

export async function resolveBoardCode(
  rawCode: string
): Promise<{ codeId: string; boardId: string; inviteId: string }> {
  const codeId = normalizeBoardCodeId(rawCode);
  const path = `boardCodes/${codeId}`;
  try {
    const snap = await getDoc(doc(db, 'boardCodes', codeId));
    if (!snap.exists()) {
      throw new Error(
        'Board code not found or no longer active. Double-check the code with the board creator.'
      );
    }
    const data = snap.data() as BoardCode;
    return {
      codeId,
      boardId: data.boardId,
      inviteId: data.inviteId,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Board code not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface BoardInvitePreview {
  boardId: string;
  inviteId: string;
  boardTitle: string;
  label: string;
  role: BoardRole;
  customRoleName?: string;
  active: boolean;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canManageColumns: boolean;
  canAssignTasks: boolean;
}

export async function getBoardInvitePreview(
  boardId: string,
  inviteId: string
): Promise<BoardInvitePreview | null> {
  assertValidId(boardId, 'boardId');
  assertValidId(inviteId, 'inviteId');

  const path = `boards/${boardId}/invites/${inviteId}`;
  try {
    const snap = await getDoc(doc(db, 'boards', boardId, 'invites', inviteId));
    if (!snap.exists()) return null;
    const inv = snap.data() as BoardInvite;
    const boardTitle =
      inv.boardTitle ||
      (inv.label ? `Shared Board (${inv.label})` : 'Shared Board');
    return {
      boardId,
      inviteId,
      boardTitle,
      label: inv.label || '',
      role: inv.role,
      customRoleName: inv.customRoleName,
      active: inv.active,
      canCreateTasks: inv.canCreateTasks,
      canEditTasks: inv.canEditTasks,
      canDeleteTasks: inv.canDeleteTasks,
      canManageColumns: inv.canManageColumns,
      canAssignTasks: hasAssignPermission(inv),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function tryWhitelistFromBoardInvite(
  user: User,
  boardId: string,
  inviteId: string
): Promise<{ email: string; canCreateBoards: boolean }> {
  assertValidId(user.uid, 'userId');
  assertValidId(boardId, 'boardId');
  assertValidId(inviteId, 'inviteId');

  if (!user.email || !user.emailVerified) {
    throw new Error('A verified Google email address is required to join via invite link.');
  }

  const emailKey = normalizeEmailKey(user.email);
  const whitelistPath = `whitelist/${emailKey}`;

  try {
    const existingSnap = await getDoc(doc(db, 'whitelist', emailKey));
    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as WhitelistEntry;
      if (existingData.active) {
        return { email: emailKey, canCreateBoards: existingData.canCreateBoards === true };
      }
      throw new Error(
        'Access for this email is currently paused by an administrator. Contact your admin to re-enable your account.'
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('currently paused')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, whitelistPath);
  }

  const invitePath = `boards/${boardId}/invites/${inviteId}`;
  let invData: BoardInvite | null = null;
  try {
    const invSnap = await getDoc(doc(db, 'boards', boardId, 'invites', inviteId));
    if (!invSnap.exists()) {
      throw new Error('This board invite link is invalid or no longer exists.');
    }
    invData = invSnap.data() as BoardInvite;
  } catch (error) {
    if (error instanceof Error && error.message.includes('invite link is invalid')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, invitePath);
  }

  if (!invData.active) {
    throw new Error('This board invite link has been revoked by the board creator.');
  }

  try {
    await setDoc(doc(db, 'whitelist', emailKey), {
      email: emailKey,
      label: sanitizeText(invData.label || 'Board Invite', LIMITS.WHITELIST_LABEL_MAX),
      active: true,
      canCreateBoards: false,
      addedBy: user.uid,
      boardInviteBoardId: boardId,
      boardInviteId: inviteId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('permission') || msg.includes('insufficient')) {
      throw new Error(
        'Unable to activate workspace access with this board invite link. The board may have been archived or removed.'
      );
    }
    handleFirestoreError(error, OperationType.CREATE, whitelistPath);
  }

  return { email: emailKey, canCreateBoards: false };
}

export async function redeemBoardInvite(
  user: User,
  boardId: string,
  inviteId: string
): Promise<{ boardId: string; alreadyMember: boolean }> {
  assertValidId(user.uid, 'userId');
  assertValidId(boardId, 'boardId');
  assertValidId(inviteId, 'inviteId');

  // Ensure non-admin users who arrive via a board invite link are whitelisted first
  const adminCheck = await checkIsAdmin(user);
  if (!adminCheck.isAdmin) {
    await tryWhitelistFromBoardInvite(user, boardId, inviteId);
  }

  let boardData: Board | null = null;
  try {
    const bSnap = await getDoc(doc(db, 'boards', boardId));
    if (bSnap.exists()) {
      boardData = bSnap.data() as Board;
    }
  } catch {
    // non-members cannot read board before joining; read invite first
  }

  if (boardData && boardData.ownerId === user.uid) {
    return { boardId, alreadyMember: true };
  }

  try {
    const existingMember = await getDoc(doc(db, 'boards', boardId, 'members', user.uid));
    if (existingMember.exists()) {
      return { boardId, alreadyMember: true };
    }
  } catch {
    // expected when not a member yet
  }

  const invitePath = `boards/${boardId}/invites/${inviteId}`;
  let invite: BoardInvite | null = null;
  try {
    const invSnap = await getDoc(doc(db, 'boards', boardId, 'invites', inviteId));
    if (!invSnap.exists()) {
      throw new Error('Invite link is invalid or no longer exists.');
    }
    invite = invSnap.data() as BoardInvite;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invite link is invalid')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, invitePath);
  }

  if (!invite.active) {
    throw new Error('This invite link has been revoked by the board creator.');
  }

  const cleanName =
    sanitizeText(
      user.displayName || user.email?.split('@')[0] || 'Collaborator',
      LIMITS.USER_DISPLAY_NAME_MAX
    ) || 'Collaborator';

  const resolvedTitle =
    sanitizeText(
      invite.boardTitle || (invite.label ? `Shared Board (${invite.label})` : 'Shared Board'),
      LIMITS.BOARD_TITLE_MAX
    ) || 'Shared Board';

  const memberPayload: Record<string, unknown> = {
    uid: user.uid,
    boardId,
    ownerId: invite.ownerId,
    displayName: cleanName,
    role: invite.role,
    canView: true,
    canCreateTasks: invite.canCreateTasks,
    canEditTasks: invite.canEditTasks,
    canDeleteTasks: invite.canDeleteTasks,
    canManageColumns: invite.canManageColumns,
    canAssignTasks: hasAssignPermission(invite),
    inviteId: invite.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const refPayload: Record<string, unknown> = {
    boardId,
    userId: user.uid,
    boardTitle: resolvedTitle,
    boardOwnerId: invite.ownerId,
    role: invite.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof invite.customRoleName === 'string') {
    memberPayload.customRoleName = invite.customRoleName;
    refPayload.customRoleName = invite.customRoleName;
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'boards', boardId, 'members', user.uid), memberPayload);
  batch.set(doc(db, 'users', user.uid, 'boardRefs', boardId), refPayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/members/${user.uid}`);
  }

  return { boardId, alreadyMember: false };
}

export async function grantGlobalAdminByEmail(
  actorUid: string,
  email: string
): Promise<{ uid: string; displayName: string }> {
  assertValidId(actorUid, 'userId');
  const emailHash = await hashEmail(email);
  const lookupPath = `emailLookup/${emailHash}`;

  let targetUid = '';
  let displayName = '';
  try {
    const snap = await getDoc(doc(db, 'emailLookup', emailHash));
    if (!snap.exists()) {
      throw new Error('User must sign in at least once before being promoted to Admin.');
    }
    const data = snap.data();
    targetUid = data.uid as string;
    displayName = data.displayName as string;
  } catch (error) {
    if (error instanceof Error && error.message.includes('User must sign in')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, lookupPath);
  }

  const adminPath = `admins/${targetUid}`;
  try {
    await setDoc(doc(db, 'admins', targetUid), {
      uid: targetUid,
      displayName: sanitizeText(displayName, LIMITS.USER_DISPLAY_NAME_MAX) || 'Admin',
      addedBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, adminPath);
  }

  return { uid: targetUid, displayName };
}

export async function revokeGlobalAdmin(targetUid: string): Promise<void> {
  assertValidId(targetUid, 'adminUid');
  const path = `admins/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'admins', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Workspace Access Whitelist & Join Access Codes
// -----------------------------------------------------------------------------
const EMAIL_KEY_REGEX = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeEmailKey(rawEmail: string): string {
  const normalized = rawEmail.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > LIMITS.USER_EMAIL_MAX ||
    !EMAIL_KEY_REGEX.test(normalized)
  ) {
    throw new Error(`Invalid email address: "${rawEmail.trim() || '(empty)'}".`);
  }
  return normalized;
}

export function normalizeAccessCodeId(rawCode: string): string {
  const normalized = rawCode.trim().toUpperCase();
  if (
    normalized.length < LIMITS.ACCESS_CODE_MIN ||
    normalized.length > LIMITS.ID_MAX ||
    !ID_REGEX.test(normalized)
  ) {
    throw new Error(
      `Access codes must be ${LIMITS.ACCESS_CODE_MIN}-${LIMITS.ID_MAX} characters using only letters, numbers, hyphens, or underscores.`
    );
  }
  return normalized;
}

export function normalizeBoardCodeId(rawCode: string): string {
  const normalized = rawCode.trim().toUpperCase();
  if (
    normalized.length < LIMITS.ACCESS_CODE_MIN ||
    normalized.length > LIMITS.ID_MAX ||
    !ID_REGEX.test(normalized)
  ) {
    throw new Error(
      `Board codes must be ${LIMITS.ACCESS_CODE_MIN}-${LIMITS.ID_MAX} characters using only letters, numbers, hyphens, or underscores.`
    );
  }
  return normalized;
}

export function generateRandomAccessCode(prefix = 'CAD'): string {
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  let suffix = '';
  for (let i = 0; i < randomBytes.length; i += 1) {
    suffix += ACCESS_CODE_ALPHABET[randomBytes[i] % ACCESS_CODE_ALPHABET.length];
  }
  return `${prefix}-${suffix}`;
}

export function generateRandomBoardCode(prefix = 'BRD'): string {
  return generateRandomAccessCode(prefix);
}

export async function checkUserWhitelistAccess(
  user: User,
  isAdminFlag = false
): Promise<WhitelistAccessStatus> {
  const rawEmail = user.email?.trim().toLowerCase() ?? '';
  if (isAdminFlag) {
    return { allowed: true, suspended: false, canCreateBoards: true, email: rawEmail };
  }
  if (!user.emailVerified || !rawEmail || !EMAIL_KEY_REGEX.test(rawEmail)) {
    return { allowed: false, suspended: false, canCreateBoards: false, email: rawEmail };
  }

  const path = `whitelist/${rawEmail}`;
  try {
    const snap = await getDoc(doc(db, 'whitelist', rawEmail));
    if (!snap.exists()) {
      return { allowed: false, suspended: false, canCreateBoards: false, email: rawEmail };
    }
    const entry = snap.data() as WhitelistEntry;
    if (entry.active === true) {
      return {
        allowed: true,
        suspended: false,
        canCreateBoards: entry.canCreateBoards === true,
        email: rawEmail,
      };
    }
    return { allowed: false, suspended: true, canCreateBoards: false, email: rawEmail };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeMyWhitelistEntry(
  emailKey: string,
  onData: (entry: WhitelistEntry | null) => void
): Unsubscribe {
  const normalized = emailKey.trim().toLowerCase();
  const path = `whitelist/${normalized}`;
  return onSnapshot(
    doc(db, 'whitelist', normalized),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as WhitelistEntry) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function redeemAccessCode(
  user: User,
  rawCode: string
): Promise<{ codeId: string; label: string; canCreateBoards: boolean }> {
  assertValidId(user.uid, 'userId');
  if (!user.email || !user.emailVerified) {
    throw new Error('A verified Google email address is required to redeem an access code.');
  }

  const emailKey = normalizeEmailKey(user.email);
  const codeId = normalizeAccessCodeId(rawCode);

  const whitelistPath = `whitelist/${emailKey}`;
  try {
    const existingSnap = await getDoc(doc(db, 'whitelist', emailKey));
    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as WhitelistEntry;
      if (existingData.active) {
        return {
          codeId,
          label: existingData.label || '',
          canCreateBoards: existingData.canCreateBoards === true,
        };
      }
      throw new Error(
        'Access for this email is currently paused by an administrator. Contact your admin to re-enable your account.'
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('currently paused')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, whitelistPath);
  }

  const codePath = `accessCodes/${codeId}`;
  let codeData: AccessCode | null = null;
  try {
    const codeSnap = await getDoc(doc(db, 'accessCodes', codeId));
    if (!codeSnap.exists()) {
      throw new Error('Access code not found. Double-check the code with your administrator.');
    }
    codeData = codeSnap.data() as AccessCode;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Access code not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, codePath);
  }

  if (!codeData.active) {
    throw new Error('This access code is inactive or expired. Ask an administrator for a current code.');
  }

  const cleanLabel = sanitizeText(codeData.label || '', LIMITS.WHITELIST_LABEL_MAX);
  const canCreateBoards = codeData.canCreateBoards === true;
  try {
    await setDoc(doc(db, 'whitelist', emailKey), {
      email: emailKey,
      label: cleanLabel,
      active: true,
      canCreateBoards,
      addedBy: user.uid,
      inviteCode: codeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, whitelistPath);
  }

  return { codeId, label: cleanLabel, canCreateBoards };
}

export function subscribeWhitelist(onData: (entries: WhitelistEntry[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'whitelist'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as WhitelistEntry);
      items.sort((a, b) => a.email.localeCompare(b.email));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'whitelist');
    }
  );
}

export async function upsertWhitelistEntry(
  actorUid: string,
  rawEmail: string,
  label: string,
  canCreateBoards = false
): Promise<{ email: string; updatedExisting: boolean }> {
  assertValidId(actorUid, 'userId');
  const emailKey = normalizeEmailKey(rawEmail);
  const cleanLabel = sanitizeText(label, LIMITS.WHITELIST_LABEL_MAX);
  const path = `whitelist/${emailKey}`;

  try {
    const ref = doc(db, 'whitelist', emailKey);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        label: cleanLabel || (snap.data() as WhitelistEntry).label || '',
        active: true,
        canCreateBoards,
        updatedAt: serverTimestamp(),
      });
      return { email: emailKey, updatedExisting: true };
    }
    await setDoc(ref, {
      email: emailKey,
      label: cleanLabel,
      active: true,
      canCreateBoards,
      addedBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { email: emailKey, updatedExisting: false };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bulkAddWhitelistEmails(
  actorUid: string,
  rawText: string,
  label: string,
  canCreateBoards: boolean,
  existingEntries: WhitelistEntry[]
): Promise<{ added: number; reactivated: number; invalid: string[] }> {
  assertValidId(actorUid, 'userId');
  const cleanLabel = sanitizeText(label, LIMITS.WHITELIST_LABEL_MAX);
  const tokens = rawText
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const uniqueValid = new Set<string>();
  const invalid: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (
      lower.length >= 3 &&
      lower.length <= LIMITS.USER_EMAIL_MAX &&
      EMAIL_KEY_REGEX.test(lower)
    ) {
      uniqueValid.add(lower);
    } else {
      invalid.push(token);
    }
  }

  const existingByEmail = new Map<string, WhitelistEntry>();
  existingEntries.forEach((entry) => existingByEmail.set(entry.email, entry));

  let added = 0;
  let reactivated = 0;
  const emails = Array.from(uniqueValid);

  for (let i = 0; i < emails.length; i += 400) {
    const chunk = emails.slice(i, i + 400);
    const batch = writeBatch(db);
    let ops = 0;

    for (const emailKey of chunk) {
      const existingEntry = existingByEmail.get(emailKey);
      const ref = doc(db, 'whitelist', emailKey);
      if (existingEntry) {
        if (
          !existingEntry.active ||
          (cleanLabel && cleanLabel !== existingEntry.label) ||
          (existingEntry.canCreateBoards === true) !== canCreateBoards
        ) {
          batch.update(ref, {
            label: cleanLabel || existingEntry.label || '',
            active: true,
            canCreateBoards,
            updatedAt: serverTimestamp(),
          });
          reactivated += 1;
          ops += 1;
        }
      } else {
        batch.set(ref, {
          email: emailKey,
          label: cleanLabel,
          active: true,
          canCreateBoards,
          addedBy: actorUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        added += 1;
        ops += 1;
      }
    }

    if (ops > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'whitelist');
      }
    }
  }

  return { added, reactivated, invalid };
}

export async function bulkAddWhitelistByCreator(
  actorUid: string,
  rawText: string,
  label: string
): Promise<{
  added: number;
  alreadyActive: number;
  paused: number;
  invalid: string[];
}> {
  assertValidId(actorUid, 'userId');
  const cleanLabel = sanitizeText(label, LIMITS.WHITELIST_LABEL_MAX);
  const tokens = rawText
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const uniqueValid = new Set<string>();
  const invalid: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (
      lower.length >= 3 &&
      lower.length <= LIMITS.USER_EMAIL_MAX &&
      EMAIL_KEY_REGEX.test(lower)
    ) {
      uniqueValid.add(lower);
    } else {
      invalid.push(token);
    }
  }

  const emailsToAdd: string[] = [];
  let alreadyActive = 0;
  let paused = 0;

  for (const emailKey of uniqueValid) {
    const path = `whitelist/${emailKey}`;
    try {
      const snap = await getDoc(doc(db, 'whitelist', emailKey));
      if (snap.exists()) {
        const data = snap.data() as WhitelistEntry;
        if (data.active) {
          alreadyActive += 1;
        } else {
          paused += 1;
        }
      } else {
        emailsToAdd.push(emailKey);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  let added = 0;
  for (let i = 0; i < emailsToAdd.length; i += 400) {
    const chunk = emailsToAdd.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const emailKey of chunk) {
      batch.set(doc(db, 'whitelist', emailKey), {
        email: emailKey,
        label: cleanLabel,
        active: true,
        canCreateBoards: false,
        addedBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      added += 1;
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'whitelist');
    }
  }

  return { added, alreadyActive, paused, invalid };
}

export async function setWhitelistEntryActive(rawEmail: string, active: boolean): Promise<void> {
  const emailKey = normalizeEmailKey(rawEmail);
  const path = `whitelist/${emailKey}`;
  try {
    await updateDoc(doc(db, 'whitelist', emailKey), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setWhitelistEntryCanCreateBoards(
  rawEmail: string,
  canCreateBoards: boolean
): Promise<void> {
  const emailKey = normalizeEmailKey(rawEmail);
  const path = `whitelist/${emailKey}`;
  try {
    await updateDoc(doc(db, 'whitelist', emailKey), {
      canCreateBoards,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeWhitelistEntry(rawEmail: string): Promise<void> {
  const emailKey = normalizeEmailKey(rawEmail);
  const path = `whitelist/${emailKey}`;
  try {
    await deleteDoc(doc(db, 'whitelist', emailKey));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAccessCodes(onData: (codes: AccessCode[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'accessCodes'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as AccessCode);
      items.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      );
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'accessCodes');
    }
  );
}

export async function createAccessCode(
  actorUid: string,
  label: string,
  customCode?: string,
  canCreateBoards = false
): Promise<string> {
  assertValidId(actorUid, 'userId');
  const cleanLabel = sanitizeText(label, LIMITS.WHITELIST_LABEL_MAX);
  const codeId = customCode?.trim()
    ? normalizeAccessCodeId(customCode)
    : generateRandomAccessCode();

  const path = `accessCodes/${codeId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'accessCodes', codeId));
    if (existingSnap.exists()) {
      throw new Error(`Access code "${codeId}" already exists. Choose another code or leave blank to auto-generate.`);
    }
    await setDoc(doc(db, 'accessCodes', codeId), {
      id: codeId,
      label: cleanLabel,
      active: true,
      canCreateBoards,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return codeId;
}

export async function setAccessCodeActive(codeId: string, active: boolean): Promise<void> {
  const cleanId = normalizeAccessCodeId(codeId);
  const path = `accessCodes/${cleanId}`;
  try {
    await updateDoc(doc(db, 'accessCodes', cleanId), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setAccessCodeCanCreateBoards(
  codeId: string,
  canCreateBoards: boolean
): Promise<void> {
  const cleanId = normalizeAccessCodeId(codeId);
  const path = `accessCodes/${cleanId}`;
  try {
    await updateDoc(doc(db, 'accessCodes', cleanId), {
      canCreateBoards,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAccessCode(codeId: string): Promise<void> {
  const cleanId = normalizeAccessCodeId(codeId);
  const path = `accessCodes/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'accessCodes', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Admin-Managed Board Backgrounds Library
// -----------------------------------------------------------------------------

function clampBackgroundSortOrder(val: number | undefined): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 1000;
  return Math.max(0, Math.min(LIMITS.POSITION_MAX, Math.round(val)));
}

export function subscribeBoardBackgrounds(
  onData: (backgrounds: BoardBackground[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'boardBackgrounds'),
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as BoardBackground);
      items.sort((a, b) => {
        const orderDiff = (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000);
        if (orderDiff !== 0) return orderDiff;
        const timeDiff = (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
        if (timeDiff !== 0) return timeDiff;
        return a.label.localeCompare(b.label);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'boardBackgrounds');
    }
  );
}

export async function createBoardBackground(
  actorUid: string,
  input: {
    label: string;
    imageUrl: string;
    sourceType: BoardBackgroundSourceType;
    active?: boolean;
    sortOrder?: number;
  }
): Promise<string> {
  assertValidId(actorUid, 'userId');
  const cleanLabel = sanitizeText(input.label, LIMITS.BOARD_BG_LABEL_MAX);
  if (!cleanLabel) throw new Error('Background label cannot be empty.');
  const cleanUrl = normalizeBoardBackgroundUrl(input.imageUrl);
  if (!cleanUrl) throw new Error('Background image URL or build path cannot be empty.');

  const bgId = generateId('bg');
  const path = `boardBackgrounds/${bgId}`;

  try {
    await setDoc(doc(db, 'boardBackgrounds', bgId), {
      id: bgId,
      label: cleanLabel,
      imageUrl: cleanUrl,
      sourceType: input.sourceType,
      active: input.active !== false,
      sortOrder: clampBackgroundSortOrder(input.sortOrder),
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return bgId;
}

export async function updateBoardBackground(
  backgroundId: string,
  current: BoardBackground,
  patch: {
    label?: string;
    imageUrl?: string;
    sourceType?: BoardBackgroundSourceType;
    active?: boolean;
    sortOrder?: number;
  }
): Promise<void> {
  assertValidId(backgroundId, 'backgroundId');
  const cleanLabel =
    patch.label !== undefined
      ? sanitizeText(patch.label, LIMITS.BOARD_BG_LABEL_MAX)
      : sanitizeText(current.label, LIMITS.BOARD_BG_LABEL_MAX);
  if (!cleanLabel) throw new Error('Background label cannot be empty.');

  const cleanUrl =
    patch.imageUrl !== undefined
      ? normalizeBoardBackgroundUrl(patch.imageUrl)
      : normalizeBoardBackgroundUrl(current.imageUrl);
  if (!cleanUrl) throw new Error('Background image URL or build path cannot be empty.');

  const path = `boardBackgrounds/${backgroundId}`;
  try {
    await updateDoc(doc(db, 'boardBackgrounds', backgroundId), {
      label: cleanLabel,
      imageUrl: cleanUrl,
      sourceType: patch.sourceType ?? current.sourceType,
      active: patch.active !== undefined ? Boolean(patch.active) : Boolean(current.active),
      sortOrder: clampBackgroundSortOrder(
        patch.sortOrder !== undefined ? patch.sortOrder : current.sortOrder
      ),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBoardBackground(backgroundId: string): Promise<void> {
  assertValidId(backgroundId, 'backgroundId');
  const path = `boardBackgrounds/${backgroundId}`;
  try {
    await deleteDoc(doc(db, 'boardBackgrounds', backgroundId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function includeBundledBoardBackgrounds(
  actorUid: string,
  items: Array<{ label: string; imageUrl: string }>,
  existingBackgrounds: BoardBackground[]
): Promise<number> {
  assertValidId(actorUid, 'userId');
  const existingUrls = new Set(existingBackgrounds.map((bg) => bg.imageUrl.trim()));
  let maxSort = existingBackgrounds.reduce((max, bg) => Math.max(max, bg.sortOrder ?? 0), 0);

  const toCreate = items.filter((item) => {
    const cleanUrl = normalizeBoardBackgroundUrl(item.imageUrl);
    return cleanUrl && !existingUrls.has(cleanUrl);
  });
  if (toCreate.length === 0) return 0;

  let added = 0;
  for (let start = 0; start < toCreate.length; start += 400) {
    const chunk = toCreate.slice(start, start + 400);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      maxSort += 100;
      const bgId = generateId('bg');
      const cleanLabel =
        sanitizeText(item.label, LIMITS.BOARD_BG_LABEL_MAX) || 'Workspace Background';
      const cleanUrl = normalizeBoardBackgroundUrl(item.imageUrl);
      batch.set(doc(db, 'boardBackgrounds', bgId), {
        id: bgId,
        label: cleanLabel,
        imageUrl: cleanUrl,
        sourceType: 'build',
        active: true,
        sortOrder: clampBackgroundSortOrder(maxSort),
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      added += 1;
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'boardBackgrounds');
    }
  }

  return added;
}

