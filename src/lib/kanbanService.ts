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
import { isValidColumnColorValue, normalizeColumnColorValue } from './colorUtils';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  BOARD_TEMPLATES,
  BOOTSTRAP_ADMIN_EMAIL,
  ID_REGEX,
  LIMITS,
  type AdminRecord,
  type Board,
  type BoardInvite,
  type BoardMember,
  type BoardPermissions,
  type BoardRef,
  type BoardRole,
  type BoardTemplate,
  type Column,
  type ColumnBgColor,
  type ColumnColorRule,
  type Priority,
  type Subtask,
  type Task,
  type TaskLink,
  type TaskLinkKind,
  type TaskMessage,
  type TaskMilestone,
  type ThemeMode,
  type UserProfile,
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

export async function ensureUserAndStarterWorkspace(user: User): Promise<UserProfile> {
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

  // Provision starter board only if the user owns 0 boards and has 0 shared boards
  try {
    const [ownedSnaps, sharedSnaps] = await Promise.all([
      getDocs(query(collection(db, 'boards'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'users', user.uid, 'boardRefs'), where('userId', '==', user.uid))),
    ]);
    if (ownedSnaps.empty && sharedSnaps.empty) {
      const boardId = await createBoard(
        user.uid,
        'Product Launch',
        'Track milestones, design reviews, and release engineering tasks.',
        'standard',
        true,
        displayName
      );
      await updateUserActiveBoard(user.uid, boardId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'boards');
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

export async function updateBoardDetails(
  boardId: string,
  title: string,
  description: string
): Promise<void> {
  assertValidId(boardId, 'boardId');
  const cleanTitle = sanitizeText(title, LIMITS.BOARD_TITLE_MAX);
  if (!cleanTitle) throw new Error('Board title cannot be empty.');
  const path = `boards/${boardId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId), {
      title: cleanTitle,
      description: sanitizeText(description, LIMITS.BOARD_DESC_MAX),
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

  // Delete all invites
  try {
    const inviteSnaps = await getDocs(collection(db, 'boards', boardId, 'invites'));
    if (!inviteSnaps.empty) {
      const invBatch = writeBatch(db);
      inviteSnaps.docs.forEach((i) => invBatch.delete(i.ref));
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
  colorRules: ColumnColorRule[] = []
): Promise<void> {
  assertValidId(boardId, 'boardId');
  assertValidId(columnId, 'columnId');
  const cleanTitle = sanitizeText(title, LIMITS.COLUMN_TITLE_MAX);
  if (!cleanTitle) throw new Error('Column title cannot be empty.');
  const cleanWip = Math.max(0, Math.min(LIMITS.COLUMN_WIP_MAX, Math.floor(wipLimit)));
  const cleanRules = sanitizeColumnColorRules(colorRules);

  const path = `boards/${boardId}/columns/${columnId}`;
  try {
    await updateDoc(doc(db, 'boards', boardId, 'columns', columnId), {
      title: cleanTitle,
      wipLimit: cleanWip,
      colorRules: cleanRules,
      updatedAt: serverTimestamp(),
    });
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
export async function grantBoardAccessByEmail(
  board: Board,
  email: string,
  role: BoardRole,
  permissions: BoardPermissions
): Promise<{ uid: string; displayName: string }> {
  const emailHash = await hashEmail(email);
  const lookupPath = `emailLookup/${emailHash}`;
  let targetUid = '';
  let displayName = '';

  try {
    const snap = await getDoc(doc(db, 'emailLookup', emailHash));
    if (!snap.exists()) {
      throw new Error(
        'No signed-in user found for that email yet. Generate an invite link below so they can join upon signing in.'
      );
    }
    const data = snap.data();
    targetUid = data.uid as string;
    displayName = data.displayName as string;
  } catch (error) {
    if (error instanceof Error && error.message.includes('No signed-in user')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, lookupPath);
  }

  if (targetUid === board.ownerId) {
    throw new Error('This user is already the creator of this board.');
  }

  await grantBoardAccessByUid(board, targetUid, displayName, role, permissions);
  return { uid: targetUid, displayName };
}

export async function grantBoardAccessByUid(
  board: Board,
  targetUid: string,
  displayName: string,
  role: BoardRole,
  permissions: BoardPermissions
): Promise<void> {
  assertValidId(board.id, 'boardId');
  assertValidId(targetUid, 'userId');
  if (targetUid === board.ownerId) {
    throw new Error('The board creator already has full access.');
  }

  const cleanName = sanitizeText(displayName || 'Collaborator', LIMITS.USER_DISPLAY_NAME_MAX) || 'Collaborator';
  const batch = writeBatch(db);

  batch.set(doc(db, 'boards', board.id, 'members', targetUid), {
    uid: targetUid,
    boardId: board.id,
    ownerId: board.ownerId,
    displayName: cleanName,
    role,
    canView: true,
    canCreateTasks: permissions.canCreateTasks,
    canEditTasks: permissions.canEditTasks,
    canDeleteTasks: permissions.canDeleteTasks,
    canManageColumns: permissions.canManageColumns,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', targetUid, 'boardRefs', board.id), {
    boardId: board.id,
    userId: targetUid,
    boardTitle: sanitizeText(board.title, LIMITS.BOARD_TITLE_MAX),
    boardOwnerId: board.ownerId,
    role,
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
  permissions: BoardPermissions
): Promise<void> {
  assertValidId(board.id, 'boardId');
  assertValidId(memberUid, 'memberUid');

  const batch = writeBatch(db);
  batch.update(doc(db, 'boards', board.id, 'members', memberUid), {
    role,
    canView: true,
    canCreateTasks: permissions.canCreateTasks,
    canEditTasks: permissions.canEditTasks,
    canDeleteTasks: permissions.canDeleteTasks,
    canManageColumns: permissions.canManageColumns,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', memberUid, 'boardRefs', board.id), {
    role,
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
  permissions: BoardPermissions
): Promise<string> {
  assertValidId(actorUid, 'userId');
  assertValidId(board.id, 'boardId');

  const inviteId = generateId('inv');
  const path = `boards/${board.id}/invites/${inviteId}`;
  try {
    await setDoc(doc(db, 'boards', board.id, 'invites', inviteId), {
      id: inviteId,
      boardId: board.id,
      ownerId: board.ownerId,
      createdBy: actorUid,
      label: sanitizeText(label, LIMITS.INVITE_LABEL_MAX),
      role,
      canCreateTasks: permissions.canCreateTasks,
      canEditTasks: permissions.canEditTasks,
      canDeleteTasks: permissions.canDeleteTasks,
      canManageColumns: permissions.canManageColumns,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return inviteId;
}

export async function revokeBoardInvite(boardId: string, inviteId: string): Promise<void> {
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
}

export async function redeemBoardInvite(
  user: User,
  boardId: string,
  inviteId: string
): Promise<{ boardId: string; alreadyMember: boolean }> {
  assertValidId(user.uid, 'userId');
  assertValidId(boardId, 'boardId');
  assertValidId(inviteId, 'inviteId');

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

  const batch = writeBatch(db);
  batch.set(doc(db, 'boards', boardId, 'members', user.uid), {
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
    inviteId: invite.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', user.uid, 'boardRefs', boardId), {
    boardId,
    userId: user.uid,
    boardTitle: invite.label ? `Shared Board (${invite.label})` : 'Shared Board',
    boardOwnerId: invite.ownerId,
    role: invite.role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

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
