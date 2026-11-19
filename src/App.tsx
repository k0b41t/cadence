import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  Columns3,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { AccessDeniedView } from './components/AccessDeniedView';
import { AddUsersModal } from './components/AddUsersModal';
import { AdminPage } from './components/AdminPage';
import { AllChatsModal } from './components/AllChatsModal';
import { BoardModal } from './components/BoardModal';
import { CalendarTimelineView } from './components/CalendarTimelineView';
import { ColumnSettingsModal } from './components/ColumnSettingsModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import { DocsModal } from './components/DocsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { JoinBoardModal } from './components/JoinBoardModal';
import { KanbanColumn } from './components/KanbanColumn';
import { buildTaskNotifications, NotificationsModal } from './components/NotificationsModal';
import { ShareBoardModal } from './components/ShareBoardModal';
import { Sidebar } from './components/Sidebar';
import { SignInView } from './components/SignInView';
import { TaskDetailModal } from './components/TaskDetailModal';
import { ThemeSettingsModal } from './components/ThemeSettingsModal';
import { auth } from './lib/firebase';
import {
  applyFontsToDocument,
  loadStoredFonts,
  saveStoredFonts,
  type FontPreferences,
} from './lib/themeFonts';
import {
  applyPaletteToDocument,
  loadStoredPalettes,
  saveStoredPalettes,
  type AppColorPalettes,
} from './lib/themePalette';
import {
  checkIsAdmin,
  checkUserWhitelistAccess,
  claimPendingBoardGrants,
  createColumn,
  createTask,
  ensureUserAndStarterWorkspace,
  getTodayDateKey,
  moveTask,
  redeemAccessCode,
  redeemBoardInvite,
  resolveBoardCode,
  subscribeAccessibleBoards,
  subscribeAllBoardsMessages,
  subscribeAllBoardsTasks,
  subscribeBoardMembers,
  subscribeBoardMessages,
  subscribeBoardSubtasks,
  subscribeColumns,
  subscribeMyWhitelistEntry,
  subscribeTasks,
  subscribeUserProfile,
  toggleSubtaskCompleted,
  toggleTaskCompleted,
  tryWhitelistFromBoardInvite,
  updateUserActiveBoard,
  updateUserBoardOrder,
  updateUserTheme,
} from './lib/kanbanService';
import {
  ID_REGEX,
  LIMITS,
  resolveRoleFromPermissions,
  type Board,
  type BoardMember,
  type Column,
  type PendingBoardJoinTarget,
  type Priority,
  type Subtask,
  type Task,
  type TaskMessage,
  type ThemeMode,
  type UserProfile,
} from './types/kanban';

function computeInsertPosition(sortedTasks: Task[], insertIndex: number): number {
  if (sortedTasks.length === 0) return 1000;
  if (insertIndex <= 0) {
    return Math.max(1, sortedTasks[0].position / 2);
  }
  if (insertIndex >= sortedTasks.length) {
    return Math.min(LIMITS.POSITION_MAX, sortedTasks[sortedTasks.length - 1].position + 1000);
  }
  const prev = sortedTasks[insertIndex - 1].position;
  const next = sortedTasks[insertIndex].position;
  return (prev + next) / 2;
}

const PENDING_ACCESS_STORAGE_KEY = 'cadence_pending_access';
const PENDING_JOIN_STORAGE_KEY = 'cadence_pending_join';

function readStoredPendingJoin(): PendingBoardJoinTarget | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PENDING_JOIN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      boardId?: unknown;
      inviteId?: unknown;
      boardCode?: unknown;
    };
    if (
      typeof parsed.boardCode === 'string' &&
      parsed.boardCode.trim().length >= LIMITS.ACCESS_CODE_MIN &&
      ID_REGEX.test(parsed.boardCode.trim())
    ) {
      return { boardCode: parsed.boardCode.trim().toUpperCase() };
    }
    if (
      typeof parsed.boardId === 'string' &&
      typeof parsed.inviteId === 'string' &&
      parsed.boardId &&
      parsed.inviteId
    ) {
      return { boardId: parsed.boardId, inviteId: parsed.inviteId };
    }
  } catch {
    // ignore malformed session storage
  }
  return null;
}

function readInitialInviteParams(): {
  accessCode: string | null;
  boardInvite: PendingBoardJoinTarget | null;
} {
  if (typeof window === 'undefined') {
    return { accessCode: null, boardInvite: null };
  }

  const params = new URLSearchParams(window.location.search);
  let mutatedUrl = false;

  const fromUrlAccess = params.get('access')?.trim().toUpperCase();
  if (fromUrlAccess) {
    window.sessionStorage.setItem(PENDING_ACCESS_STORAGE_KEY, fromUrlAccess);
    params.delete('access');
    mutatedUrl = true;
  }

  const rawJoin = params.get('join')?.trim() ?? '';
  const rawCode = params.get('code')?.trim() ?? '';
  let parsedBoardInvite: PendingBoardJoinTarget | null = null;
  if (rawJoin && rawCode) {
    parsedBoardInvite = { boardId: rawJoin, inviteId: rawCode };
  } else if (rawJoin && rawJoin.includes(':')) {
    const [b, c] = rawJoin.split(':').map((s) => s.trim());
    if (b && c) parsedBoardInvite = { boardId: b, inviteId: c };
  } else if (
    rawJoin &&
    rawJoin.length >= LIMITS.ACCESS_CODE_MIN &&
    rawJoin.length <= LIMITS.ID_MAX &&
    ID_REGEX.test(rawJoin)
  ) {
    parsedBoardInvite = { boardCode: rawJoin.toUpperCase() };
  }
  if (parsedBoardInvite) {
    window.sessionStorage.setItem(PENDING_JOIN_STORAGE_KEY, JSON.stringify(parsedBoardInvite));
    params.delete('join');
    params.delete('code');
    mutatedUrl = true;
  }

  if (mutatedUrl) {
    const remaining = params.toString();
    const nextUrl = remaining
      ? `${window.location.pathname}?${remaining}`
      : window.location.pathname;
    window.history.replaceState({}, '', nextUrl);
  }

  return {
    accessCode: fromUrlAccess || window.sessionStorage.getItem(PENDING_ACCESS_STORAGE_KEY) || null,
    boardInvite: parsedBoardInvite || readStoredPendingJoin(),
  };
}

function WorkspaceApp() {
  const initialInvites = useMemo(() => readInitialInviteParams(), []);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBootstrapAdmin, setIsBootstrapAdmin] = useState(false);
  const [canCreateBoards, setCanCreateBoards] = useState(false);
  const [accessStatus, setAccessStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [accessSuspended, setAccessSuspended] = useState(false);
  const [accessGateError, setAccessGateError] = useState<string | null>(null);
  const [pendingAccessCode, setPendingAccessCode] = useState<string | null>(initialInvites.accessCode);
  const [pendingBoardInvite, setPendingBoardInvite] =
    useState<PendingBoardJoinTarget | null>(initialInvites.boardInvite);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspacePage, setWorkspacePage] = useState<'workspace' | 'admin'>('workspace');
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [optimisticBoardOrder, setOptimisticBoardOrder] = useState<string[] | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [boardMessages, setBoardMessages] = useState<TaskMessage[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [allMessages, setAllMessages] = useState<TaskMessage[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('cadence_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });
  const [palettes, setPalettes] = useState<AppColorPalettes>(() => loadStoredPalettes());
  const [fonts, setFonts] = useState<FontPreferences>(() => loadStoredFonts());
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);

  // Filters, search & view mode
  const [viewMode, setViewMode] = useState<'board' | 'calendar'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement | null>(null);

  // Modals & UI drawers
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [boardModalState, setBoardModalState] = useState<{
    mode: 'create' | 'edit';
    board?: Board;
  } | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [allChatsOpen, setAllChatsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [addUsersOpen, setAddUsersOpen] = useState(false);
  const [joinModalState, setJoinModalState] = useState<{
    boardId?: string;
    inviteId?: string;
    boardCode?: string;
    initialError?: string;
  } | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskModalFocusChat, setTaskModalFocusChat] = useState(false);
  const [pendingOpenTask, setPendingOpenTask] = useState<{
    boardId: string;
    taskId: string;
    focusChat: boolean;
  } | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

  // Add column inline composer
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [savingColumn, setSavingColumn] = useState(false);

  // Drag state
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null);

  // Checklist auto-move undo toast
  const [autoMoveToast, setAutoMoveToast] = useState<{
    id: string;
    boardId: string;
    taskId: string;
    taskTitle: string;
    fromColumnId: string;
    fromColumnTitle: string;
    fromPosition: number;
    toColumnId: string;
    toColumnTitle: string;
  } | null>(null);

  useEffect(() => {
    if (!autoMoveToast) return;
    const timer = window.setTimeout(() => {
      setAutoMoveToast(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [autoMoveToast]);

  // Sync theme, active mode color palette & fonts to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('cadence_theme', theme);
    applyPaletteToDocument(palettes, theme);
  }, [theme, palettes]);

  useEffect(() => {
    applyFontsToDocument(fonts);
  }, [fonts]);

  useEffect(() => {
    if (!filtersOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (filtersMenuRef.current && !filtersMenuRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [filtersOpen]);

  const verifyAndProvisionUser = async (
    nextUser: User,
    autoRedeemCode: string | null,
    autoJoinInvite: PendingBoardJoinTarget | null
  ) => {
    setAccessStatus('checking');
    setAccessSuspended(false);
    setAccessGateError(null);
    setWorkspaceReady(false);

    const adminStatus = await checkIsAdmin(nextUser);
    let wlStatus = await checkUserWhitelistAccess(nextUser, adminStatus.isAdmin);

    let resolvedAutoJoin: { boardId: string; inviteId: string } | null = null;
    let autoJoinResolutionError: string | null = null;
    if (autoJoinInvite) {
      if (autoJoinInvite.boardId && autoJoinInvite.inviteId) {
        resolvedAutoJoin = {
          boardId: autoJoinInvite.boardId,
          inviteId: autoJoinInvite.inviteId,
        };
      } else if (autoJoinInvite.boardCode) {
        try {
          const mapped = await resolveBoardCode(autoJoinInvite.boardCode);
          resolvedAutoJoin = { boardId: mapped.boardId, inviteId: mapped.inviteId };
        } catch (resolveErr) {
          autoJoinResolutionError =
            resolveErr instanceof Error
              ? resolveErr.message
              : 'Board invite code is invalid or no longer active.';
        }
      }
    }

    if (!wlStatus.allowed && !wlStatus.suspended && autoRedeemCode) {
      try {
        const redeemed = await redeemAccessCode(nextUser, autoRedeemCode);
        window.sessionStorage.removeItem(PENDING_ACCESS_STORAGE_KEY);
        setPendingAccessCode(null);
        wlStatus = {
          allowed: true,
          suspended: false,
          canCreateBoards: redeemed.canCreateBoards,
          email: wlStatus.email,
        };
      } catch (redeemErr) {
        setAccessGateError(
          redeemErr instanceof Error ? redeemErr.message : 'Unable to redeem access code.'
        );
      }
    } else if (wlStatus.allowed && autoRedeemCode) {
      window.sessionStorage.removeItem(PENDING_ACCESS_STORAGE_KEY);
      setPendingAccessCode(null);
    }

    if (!wlStatus.allowed && !wlStatus.suspended && autoJoinInvite) {
      if (resolvedAutoJoin) {
        try {
          const onboarded = await tryWhitelistFromBoardInvite(
            nextUser,
            resolvedAutoJoin.boardId,
            resolvedAutoJoin.inviteId
          );
          wlStatus = {
            allowed: true,
            suspended: false,
            canCreateBoards: onboarded.canCreateBoards,
            email: onboarded.email,
          };
        } catch (inviteErr) {
          window.sessionStorage.removeItem(PENDING_JOIN_STORAGE_KEY);
          setPendingBoardInvite(null);
          setAccessGateError(
            inviteErr instanceof Error ? inviteErr.message : 'Unable to join via board invite link.'
          );
        }
      } else if (autoJoinResolutionError) {
        window.sessionStorage.removeItem(PENDING_JOIN_STORAGE_KEY);
        setPendingBoardInvite(null);
        setAccessGateError(autoJoinResolutionError);
      }
    }

    if (!wlStatus.allowed) {
      setIsAdmin(false);
      setIsBootstrapAdmin(false);
      setCanCreateBoards(false);
      setAccessSuspended(wlStatus.suspended);
      setAccessStatus('denied');
      setWorkspaceReady(false);
      return;
    }

    const effectiveCanCreateBoards = adminStatus.isAdmin || wlStatus.canCreateBoards;
    const ensured = await ensureUserAndStarterWorkspace(nextUser, effectiveCanCreateBoards);

    // Automatically convert any pre-assigned email board grants into live memberships
    const claimedBoardIds = await claimPendingBoardGrants(nextUser);

    let targetBoardId = ensured.activeBoardId || '';

    // Auto-redeem any pending ?join= board code or invite link directly into the board
    if (autoJoinInvite) {
      if (resolvedAutoJoin) {
        try {
          const res = await redeemBoardInvite(
            nextUser,
            resolvedAutoJoin.boardId,
            resolvedAutoJoin.inviteId
          );
          targetBoardId = res.boardId;
          await updateUserActiveBoard(nextUser.uid, res.boardId).catch(() => {});
        } catch (joinErr) {
          setJoinModalState({
            boardId: resolvedAutoJoin.boardId,
            inviteId: resolvedAutoJoin.inviteId,
            boardCode: autoJoinInvite.boardCode,
            initialError:
              joinErr instanceof Error ? joinErr.message : 'Unable to join shared board.',
          });
        } finally {
          window.sessionStorage.removeItem(PENDING_JOIN_STORAGE_KEY);
          setPendingBoardInvite(null);
        }
      } else if (autoJoinResolutionError) {
        window.sessionStorage.removeItem(PENDING_JOIN_STORAGE_KEY);
        setPendingBoardInvite(null);
        setJoinModalState({
          boardCode: autoJoinInvite.boardCode,
          initialError: autoJoinResolutionError,
        });
      }
    }

    if (!targetBoardId && claimedBoardIds.length > 0) {
      targetBoardId = claimedBoardIds[0];
    }

    const effectiveProfile =
      targetBoardId && ensured.activeBoardId !== targetBoardId
        ? { ...ensured, activeBoardId: targetBoardId }
        : ensured;

    setProfile(effectiveProfile);
    setIsAdmin(adminStatus.isAdmin);
    setIsBootstrapAdmin(adminStatus.isBootstrapAdmin);
    setCanCreateBoards(effectiveCanCreateBoards);
    setAccessSuspended(false);
    setAccessGateError(null);
    setAccessStatus('granted');
    if (effectiveProfile.theme) setTheme(effectiveProfile.theme);
    if (targetBoardId) setActiveBoardId(targetBoardId);
    setWorkspaceReady(true);
  };

  // Listen to Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setWorkspaceReady(false);
      setWorkspacePage('workspace');

      if (!nextUser) {
        setIsAdmin(false);
        setIsBootstrapAdmin(false);
        setCanCreateBoards(false);
        setAccessStatus('checking');
        setAccessSuspended(false);
        setAccessGateError(null);
        setProfile(null);
        setBoards([]);
        setActiveBoardId(null);
        setColumns([]);
        setTasks([]);
        setMembers([]);
        setBoardMessages([]);
        setSubtasksByTask({});
        setAllMessages([]);
        setAllTasks([]);
        return;
      }

      try {
        const storedCode = window.sessionStorage.getItem(PENDING_ACCESS_STORAGE_KEY);
        const storedJoin = readStoredPendingJoin();
        await verifyAndProvisionUser(
          nextUser,
          storedCode || pendingAccessCode,
          storedJoin || pendingBoardInvite
        );
      } catch (err) {
        setAsyncError(err instanceof Error ? err : new Error(String(err)));
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to profile & accessible boards once workspace is provisioned
  useEffect(() => {
    if (!user || !workspaceReady) return;
    const unsubProfile = subscribeUserProfile(user.uid, (p) => {
      if (p) {
        setProfile(p);
        setTheme(p.theme);
        setOptimisticBoardOrder(null);
      }
    });
    const unsubBoards = subscribeAccessibleBoards(user.uid, isBootstrapAdmin, (nextBoards) => {
      setBoards(nextBoards);
      setActiveBoardId((prev) => {
        if (prev && nextBoards.some((b) => b.id === prev)) return prev;
        const preferred =
          profile?.activeBoardId && nextBoards.some((b) => b.id === profile.activeBoardId)
            ? profile.activeBoardId
            : nextBoards.find((b) => b.status === 'active')?.id ?? nextBoards[0]?.id ?? null;
        return preferred;
      });
    });

    return () => {
      unsubProfile();
      unsubBoards();
    };
  }, [user, workspaceReady, isBootstrapAdmin]);

  // Keep whitelist status & canCreateBoards permission in sync in real time
  useEffect(() => {
    if (!user || !workspaceReady || isAdmin || !user.email) return;
    const unsubWhitelist = subscribeMyWhitelistEntry(user.email, (entry) => {
      if (!entry || !entry.active) {
        setCanCreateBoards(false);
        setWorkspaceReady(false);
        setAccessSuspended(Boolean(entry && !entry.active));
        setAccessStatus('denied');
        return;
      }
      setCanCreateBoards(entry.canCreateBoards === true);
    });
    return () => unsubWhitelist();
  }, [user, workspaceReady, isAdmin]);

  // Subscribe to all task chats & tasks across accessible boards for top-bar hubs
  useEffect(() => {
    if (!user || !workspaceReady) {
      setAllMessages([]);
      setAllTasks([]);
      return;
    }
    const unsubAllMessages = subscribeAllBoardsMessages(boards, setAllMessages);
    const unsubAllTasks = subscribeAllBoardsTasks(boards, setAllTasks);
    return () => {
      unsubAllMessages();
      unsubAllTasks();
    };
  }, [user, workspaceReady, boards]);

  // Subscribe to columns, tasks, members, and messages for active board
  useEffect(() => {
    if (!user || !workspaceReady || !activeBoardId) {
      setColumns([]);
      setTasks([]);
      setMembers([]);
      setBoardMessages([]);
      setSubtasksByTask({});
      return;
    }

    const unsubCols = subscribeColumns(activeBoardId, setColumns);
    const unsubTasks = subscribeTasks(activeBoardId, setTasks);
    const unsubMembers = subscribeBoardMembers(activeBoardId, setMembers);
    const unsubMessages = subscribeBoardMessages(activeBoardId, setBoardMessages);
    return () => {
      unsubCols();
      unsubTasks();
      unsubMembers();
      unsubMessages();
    };
  }, [user, workspaceReady, activeBoardId]);

  const taskIdsKey = useMemo(() => tasks.map((t) => t.id).sort().join(','), [tasks]);

  // Subscribe to checklist subtasks for active board tasks
  useEffect(() => {
    if (!user || !workspaceReady || !activeBoardId || !taskIdsKey) {
      setSubtasksByTask({});
      return;
    }
    const taskIds = taskIdsKey.split(',').filter(Boolean);
    const unsub = subscribeBoardSubtasks(activeBoardId, taskIds, setSubtasksByTask);
    return () => unsub();
  }, [user, workspaceReady, activeBoardId, taskIdsKey]);

  // Resolve cross-board task navigation from All Chats / Notifications modal
  useEffect(() => {
    if (!pendingOpenTask) return;
    if (activeBoardId === pendingOpenTask.boardId && tasks.some((t) => t.id === pendingOpenTask.taskId)) {
      setSelectedTaskId(pendingOpenTask.taskId);
      setTaskModalFocusChat(pendingOpenTask.focusChat);
      setPendingOpenTask(null);
    }
  }, [pendingOpenTask, activeBoardId, tasks]);

  if (asyncError) {
    throw asyncError;
  }

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? null,
    [boards, activeBoardId]
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const editingColumn = useMemo(
    () => columns.find((c) => c.id === editingColumnId) ?? null,
    [columns, editingColumnId]
  );

  // Compute caller's effective permissions on activeBoard
  const effectivePermissions = useMemo(() => {
    if (!activeBoard || !user) {
      return {
        canCreateTasks: false,
        canEditTasks: false,
        canDeleteTasks: false,
        canManageColumns: false,
        canManageSharing: false,
        roleLabel: 'Viewer',
      };
    }

    const isBoardArchived = activeBoard.status === 'archived';
    if (isAdmin) {
      return {
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: true,
        canManageColumns: true,
        canManageSharing: true,
        roleLabel: 'Admin',
      };
    }

    if (activeBoard.ownerId === user.uid) {
      return {
        canCreateTasks: !isBoardArchived,
        canEditTasks: !isBoardArchived,
        canDeleteTasks: !isBoardArchived,
        canManageColumns: !isBoardArchived,
        canManageSharing: true,
        roleLabel: 'Creator',
      };
    }

    const myMembership = members.find((m) => m.uid === user.uid);
    if (!myMembership) {
      return {
        canCreateTasks: false,
        canEditTasks: false,
        canDeleteTasks: false,
        canManageColumns: false,
        canManageSharing: false,
        roleLabel: 'Viewer',
      };
    }

    return {
      canCreateTasks: !isBoardArchived && myMembership.canCreateTasks,
      canEditTasks: !isBoardArchived && myMembership.canEditTasks,
      canDeleteTasks: !isBoardArchived && myMembership.canDeleteTasks,
      canManageColumns: !isBoardArchived && myMembership.canManageColumns,
      canManageSharing: false,
      roleLabel: resolveRoleFromPermissions(myMembership, activeBoard.customRoles ?? []).label,
    };
  }, [activeBoard, user, isAdmin, members]);

  // Assignee dropdown options (Creator + Members + current Admin)
  const assigneeOptions = useMemo(() => {
    if (!activeBoard) return [];
    const options: Array<{ uid: string; label: string; shortName: string }> = [];
    const seen = new Set<string>();

    if (user && activeBoard.ownerId === user.uid) {
      const name = profile?.displayName || 'You';
      options.push({ uid: user.uid, label: `${name} (Creator)`, shortName: name });
      seen.add(user.uid);
    } else {
      const creatorName = activeBoard.ownerDisplayName || 'Board Creator';
      options.push({
        uid: activeBoard.ownerId,
        label: activeBoard.ownerDisplayName ? `${creatorName} (Creator)` : 'Board Creator',
        shortName: creatorName,
      });
      seen.add(activeBoard.ownerId);
    }

    members.forEach((m) => {
      if (!seen.has(m.uid)) {
        const roleLabel = resolveRoleFromPermissions(m, activeBoard.customRoles ?? []).label;
        options.push({
          uid: m.uid,
          label: `${m.displayName} (${roleLabel})`,
          shortName: m.displayName,
        });
        seen.add(m.uid);
      }
    });

    if (user && !seen.has(user.uid)) {
      const myName = profile?.displayName || 'You';
      options.push({
        uid: user.uid,
        label: isAdmin ? `${myName} (Admin)` : myName,
        shortName: myName,
      });
    }

    return options;
  }, [activeBoard, members, user, profile, isAdmin]);

  const assigneeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    assigneeOptions.forEach((opt) => {
      map[opt.uid] = opt.shortName;
    });
    return map;
  }, [assigneeOptions]);

  const messageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const msg of boardMessages) {
      counts[msg.taskId] = (counts[msg.taskId] ?? 0) + 1;
    }
    return counts;
  }, [boardMessages]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (hideCompleted && t.completed) return false;
      if (myTasksOnly && t.assigneeId !== user?.uid) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (q) {
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description.toLowerCase().includes(q);
        const matchesTag = t.tags.some((tag) => tag.toLowerCase().includes(q));
        const matchesAssignee = t.assigneeId
          ? (assigneeNameMap[t.assigneeId]?.toLowerCase().includes(q) ?? false)
          : false;
        if (!matchesTitle && !matchesDesc && !matchesTag && !matchesAssignee) return false;
      }
      return true;
    });
  }, [tasks, hideCompleted, myTasksOnly, user?.uid, priorityFilter, searchQuery, assigneeNameMap]);

  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);

  const effectiveBoardOrder = optimisticBoardOrder ?? profile?.boardOrder;

  const orderedBoards = useMemo(() => {
    if (!effectiveBoardOrder || effectiveBoardOrder.length === 0) return boards;
    const rank = new Map<string, number>();
    effectiveBoardOrder.forEach((id, idx) => {
      if (!rank.has(id)) rank.set(id, idx);
    });
    return [...boards].sort((a, b) => {
      const idxA = rank.get(a.id);
      const idxB = rank.get(b.id);
      if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
      if (idxA !== undefined) return -1;
      if (idxB !== undefined) return 1;
      return 0;
    });
  }, [boards, effectiveBoardOrder]);

  const boardMap = useMemo(() => {
    const map = new Map<string, Board>();
    orderedBoards.forEach((b) => map.set(b.id, b));
    return map;
  }, [orderedBoards]);

  const upcomingNotificationsCount = useMemo(
    () => buildTaskNotifications(allTasks, boardMap, getTodayDateKey(), 7).length,
    [allTasks, boardMap]
  );

  const safeBoardBackgroundUrl = useMemo(() => {
    const raw = activeBoard?.backgroundImageUrl?.trim();
    if (!raw || !/^https?:\/\/[^\s]+$/i.test(raw)) return null;
    try {
      return new URL(raw).href;
    } catch {
      return null;
    }
  }, [activeBoard?.backgroundImageUrl]);

  const handleSetTheme = async (next: ThemeMode) => {
    setTheme(next);
    if (user && workspaceReady) {
      await updateUserTheme(user.uid, next);
    }
  };

  const handleToggleTheme = async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    await handleSetTheme(next);
  };

  const handleReorderBoards = async (nextOrder: string[]) => {
    setOptimisticBoardOrder(nextOrder);
    if (user && workspaceReady) {
      await updateUserBoardOrder(user.uid, nextOrder);
    }
  };

  const handleChangePalettes = (next: AppColorPalettes) => {
    setPalettes(next);
    saveStoredPalettes(next);
  };

  const handleChangeFonts = (next: FontPreferences) => {
    setFonts(next);
    saveStoredFonts(next);
  };

  const handleSelectBoard = async (boardId: string) => {
    setWorkspacePage('workspace');
    setActiveBoardId(boardId);
    setSelectedTaskId(null);
    setTaskModalFocusChat(false);
    setEditingColumnId(null);
    if (user) {
      await updateUserActiveBoard(user.uid, boardId);
    }
  };

  const handleOpenTaskFromChats = async (boardId: string, taskId: string) => {
    setAllChatsOpen(false);
    if (activeBoardId === boardId) {
      setSelectedTaskId(taskId);
      setTaskModalFocusChat(true);
    } else {
      setPendingOpenTask({ boardId, taskId, focusChat: true });
      await handleSelectBoard(boardId);
    }
  };

  const handleOpenTaskFromNotification = async (boardId: string, taskId: string) => {
    setNotificationsOpen(false);
    if (activeBoardId === boardId) {
      setSelectedTaskId(taskId);
      setTaskModalFocusChat(false);
    } else {
      setPendingOpenTask({ boardId, taskId, focusChat: false });
      await handleSelectBoard(boardId);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleQuickCreateTask = async (columnId: string, title: string) => {
    if (!user || !activeBoard || !effectivePermissions.canCreateTasks) return;
    const colTasks = tasks.filter((t) => t.columnId === columnId);
    const maxPos = colTasks.reduce((m, t) => Math.max(m, t.position), 0);
    await createTask(user.uid, activeBoard, columnId, {
      title,
      position: maxPos + 1000,
      priority: 'medium',
    });
  };

  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !user ||
      !activeBoard ||
      !newColumnTitle.trim() ||
      savingColumn ||
      !effectivePermissions.canManageColumns
    ) {
      return;
    }
    setSavingColumn(true);
    try {
      const maxPos = columns.reduce((m, c) => Math.max(m, c.position), 0);
      await createColumn(user.uid, activeBoard, newColumnTitle, maxPos + 1000, 0);
      setNewColumnTitle('');
      setAddingColumn(false);
    } finally {
      setSavingColumn(false);
    }
  };

  const handleDragStartTask = (e: DragEvent<HTMLDivElement>, task: Task) => {
    if (!effectivePermissions.canEditTasks) return;
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragEndTask = () => {
    setDraggedTask(null);
    setDropTarget(null);
  };

  const handleDragOverColumn = (
    e: DragEvent<HTMLElement>,
    columnId: string,
    index: number
  ) => {
    e.preventDefault();
    if (!draggedTask || !effectivePermissions.canEditTasks) return;
    setDropTarget((prev) =>
      prev && prev.columnId === columnId && prev.index === index
        ? prev
        : { columnId, index }
    );
  };

  const handleDragLeaveColumn = (columnId: string) => {
    setDropTarget((prev) => (prev?.columnId === columnId ? null : prev));
  };

  const handleDropOnColumn = async (
    e: DragEvent<HTMLElement>,
    targetColumnId: string,
    insertIndex: number
  ) => {
    e.preventDefault();
    if (!draggedTask || !activeBoardId || !effectivePermissions.canEditTasks) {
      setDraggedTask(null);
      setDropTarget(null);
      return;
    }

    const taskToMove = draggedTask;
    setDraggedTask(null);
    setDropTarget(null);

    const colTasks = tasks
      .filter((t) => t.columnId === targetColumnId && t.id !== taskToMove.id)
      .sort((a, b) => a.position - b.position);

    let adjustedIndex = insertIndex;
    if (taskToMove.columnId === targetColumnId) {
      const origColTasks = tasks
        .filter((t) => t.columnId === targetColumnId)
        .sort((a, b) => a.position - b.position);
      const origIdx = origColTasks.findIndex((t) => t.id === taskToMove.id);
      if (origIdx !== -1 && origIdx < insertIndex) {
        adjustedIndex = Math.max(0, insertIndex - 1);
      }
    }

    const nextPosition = computeInsertPosition(colTasks, adjustedIndex);
    await moveTask(
      activeBoardId,
      taskToMove.id,
      targetColumnId,
      nextPosition,
      taskToMove.columnId !== targetColumnId
    );
  };

  const handleToggleSubtask = async (
    task: Task,
    subtask: Subtask,
    currentSubtasksOverride?: Subtask[]
  ) => {
    if (!activeBoard || !effectivePermissions.canEditTasks) return;
    const boardId = activeBoard.id;
    const nextCompleted = !subtask.completed;
    await toggleSubtaskCompleted(boardId, task.id, subtask.id, nextCompleted);

    if (!nextCompleted) return;

    const taskSubtasks = currentSubtasksOverride ?? subtasksByTask[task.id] ?? [];
    if (taskSubtasks.length === 0) return;
    const allComplete = taskSubtasks.every((s) =>
      s.id === subtask.id ? true : s.completed
    );
    if (!allComplete) return;

    const sourceIndex = columns.findIndex((c) => c.id === task.columnId);
    if (sourceIndex === -1) return;
    const sourceColumn = columns[sourceIndex];
    if (!sourceColumn?.autoMoveOnComplete) return;

    const targetColumn = sourceColumn.autoMoveTargetColumnId
      ? columns.find(
          (c) => c.id === sourceColumn.autoMoveTargetColumnId && c.id !== sourceColumn.id
        )
      : columns[sourceIndex + 1];
    if (!targetColumn) return;

    const targetColTasks = tasks.filter(
      (t) => t.columnId === targetColumn.id && t.id !== task.id
    );
    const maxPos = targetColTasks.reduce((m, t) => Math.max(m, t.position), 0);
    const nextPos = Math.min(LIMITS.POSITION_MAX, maxPos + 1000);

    await moveTask(boardId, task.id, targetColumn.id, nextPos, true);

    setAutoMoveToast({
      id: `${task.id}-${Date.now()}`,
      boardId,
      taskId: task.id,
      taskTitle: task.title,
      fromColumnId: sourceColumn.id,
      fromColumnTitle: sourceColumn.title,
      fromPosition: task.position,
      toColumnId: targetColumn.id,
      toColumnTitle: targetColumn.title,
    });
  };

  const handleUndoAutoMove = async () => {
    if (!autoMoveToast) return;
    const toast = autoMoveToast;
    setAutoMoveToast(null);
    await moveTask(toast.boardId, toast.taskId, toast.fromColumnId, toast.fromPosition, true);
  };

  const themeModal = themeSettingsOpen ? (
    <ThemeSettingsModal
      activeTheme={theme}
      palettes={palettes}
      fonts={fonts}
      onChangePalettes={handleChangePalettes}
      onChangeFonts={handleChangeFonts}
      onSwitchTheme={(nextMode) => {
        void handleSetTheme(nextMode);
      }}
      onClose={() => setThemeSettingsOpen(false)}
    />
  ) : null;

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading workspace...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SignInView
          theme={theme}
          pendingAccessCode={pendingAccessCode}
          pendingBoardInvite={pendingBoardInvite}
          onToggleTheme={handleToggleTheme}
          onOpenThemeSettings={() => setThemeSettingsOpen(true)}
        />
        {themeModal}
      </>
    );
  }

  if (accessStatus === 'denied') {
    return (
      <>
        <AccessDeniedView
          user={user}
          suspended={accessSuspended}
          initialAccessCode={pendingAccessCode}
          pendingBoardInvite={pendingBoardInvite}
          initialError={accessGateError}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenThemeSettings={() => setThemeSettingsOpen(true)}
          onAccessGranted={async () => {
            window.sessionStorage.removeItem(PENDING_ACCESS_STORAGE_KEY);
            setPendingAccessCode(null);
            await verifyAndProvisionUser(user, null, readStoredPendingJoin() || pendingBoardInvite);
          }}
          onRecheckAccess={async () => {
            await verifyAndProvisionUser(user, null, readStoredPendingJoin() || pendingBoardInvite);
          }}
          onSignOut={handleSignOut}
        />
        {themeModal}
      </>
    );
  }

  if (!workspaceReady) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
        <div className="hidden lg:block w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="space-y-2 pt-4">
            <div className="h-8 bg-slate-100 dark:bg-slate-800/70 rounded-lg" />
            <div className="h-8 bg-slate-100 dark:bg-slate-800/70 rounded-lg" />
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between">
            <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
          <div className="flex-1 p-6 flex gap-4 overflow-hidden">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="w-[320px] shrink-0 bg-slate-100/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="h-5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg" />
                <div className="h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isArchived = activeBoard?.status === 'archived';

  const boardOpacityActive = Boolean(activeBoard?.surfaceOpacityEnabled);
  const boardOpacityPercent =
    typeof activeBoard?.surfaceOpacity === 'number'
      ? Math.max(0, Math.min(100, activeBoard.surfaceOpacity))
      : 80;

  const boardCanvasStyle: CSSProperties | undefined =
    workspacePage !== 'admin' && activeBoard && viewMode === 'board' && (safeBoardBackgroundUrl || boardOpacityActive)
      ? ({
          ...(safeBoardBackgroundUrl ? { '--board-bg-image': `url("${safeBoardBackgroundUrl}")` } : {}),
          ...(boardOpacityActive ? { '--board-surface-alpha': `${boardOpacityPercent}%` } : {}),
        } as CSSProperties)
      : undefined;

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex overflow-hidden">
      <Sidebar
        uid={user.uid}
        boards={orderedBoards}
        activeBoardId={activeBoardId}
        profile={profile}
        userEmail={user.email}
        isAdmin={isAdmin}
        canCreateBoards={isAdmin || canCreateBoards}
        isAdminPageActive={workspacePage === 'admin' && isAdmin}
        theme={theme}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSelectBoard={handleSelectBoard}
        onReorderBoards={handleReorderBoards}
        onOpenNewBoard={() => setBoardModalState({ mode: 'create' })}
        onOpenJoinBoard={() => setJoinModalState({})}
        onOpenAddUsers={() => setAddUsersOpen(true)}
        onOpenAdminPanel={() => setWorkspacePage('admin')}
        onOpenDocs={() => setDocsOpen(true)}
        onOpenThemeSettings={() => setThemeSettingsOpen(true)}
        onToggleTheme={handleToggleTheme}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Workspace Header */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open boards navigation"
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-[13px] min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                {workspacePage === 'admin' && isAdmin ? 'Admin' : 'Boards'}
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-display text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                {workspacePage === 'admin' && isAdmin
                  ? 'Workspace Access & Admin'
                  : activeBoard
                    ? activeBoard.title
                    : 'Workspace'}
              </h1>
              {workspacePage !== 'admin' && isArchived && (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap shrink-0">
                  · Archived
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notifications"
              title={
                upcomingNotificationsCount > 0
                  ? `Notifications (${upcomingNotificationsCount} upcoming)`
                  : 'Notifications'
              }
              className={`inline-flex items-center gap-1 p-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                upcomingNotificationsCount > 0
                  ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-950/50'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              {upcomingNotificationsCount > 0 && (
                <span className="text-[11px] leading-none">{upcomingNotificationsCount}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAllChatsOpen(true)}
              aria-label="All task chats"
              title={allMessages.length > 0 ? `Task chats (${allMessages.length})` : 'Task chats'}
              className="inline-flex items-center gap-1 p-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              {allMessages.length > 0 && (
                <span className="text-[11px] leading-none">{allMessages.length}</span>
              )}
            </button>

            {workspacePage !== 'admin' && activeBoard && (
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                aria-label="Share and permissions"
                title={`Share & permissions (${members.length + 1})`}
                className="inline-flex items-center gap-1 p-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
              >
                <Users className="w-4 h-4 shrink-0" />
                {members.length > 0 && (
                  <span className="text-[11px] leading-none">{members.length + 1}</span>
                )}
              </button>
            )}

            {workspacePage !== 'admin' && activeBoard && (isAdmin || activeBoard.ownerId === user.uid) && (
              <button
                type="button"
                onClick={() => setBoardModalState({ mode: 'edit', board: activeBoard })}
                aria-label="Board Settings"
                title="Board Settings"
                className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shrink-0"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {workspacePage !== 'admin' && activeBoard && effectivePermissions.canCreateTasks && columns.length > 0 && (
              <button
                type="button"
                onClick={() => setCreateTaskOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>New task</span>
              </button>
            )}
          </div>
        </header>

        {/* Workspace Filter & Telemetry Bar */}
        {workspacePage !== 'admin' && activeBoard && (
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks or tags..."
                  aria-label="Search tasks or tags"
                  className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {(() => {
                const activeFilterCount =
                  (priorityFilter !== 'all' ? 1 : 0) +
                  (hideCompleted ? 1 : 0) +
                  (myTasksOnly ? 1 : 0);

                const resetAllFilters = () => {
                  setPriorityFilter('all');
                  setHideCompleted(false);
                  setMyTasksOnly(false);
                };

                return (
                  <div ref={filtersMenuRef} className="relative flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-expanded={filtersOpen}
                      aria-haspopup="dialog"
                      onClick={() => setFiltersOpen((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        activeFilterCount > 0 || filtersOpen
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                          filtersOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        aria-label="Clear active filters"
                        title="Reset all filters"
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {filtersOpen && (
                      <div
                        role="dialog"
                        aria-label="Task filters"
                        className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-30 p-4 space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Priority
                          </div>
                          <div
                            role="group"
                            aria-label="Filter by priority"
                            className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                          >
                            {(['all', 'urgent', 'high', 'medium', 'low'] as const).map((level) => {
                              const active = priorityFilter === level;
                              return (
                                <button
                                  key={level}
                                  type="button"
                                  onClick={() => setPriorityFilter(level)}
                                  className={`px-1.5 py-1 text-[11px] font-medium rounded-md transition-colors capitalize whitespace-nowrap ${
                                    active
                                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                                  }`}
                                >
                                  {level}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Visibility
                          </div>
                          <div className="space-y-2">
                            <label className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={hideCompleted}
                                onChange={(e) => setHideCompleted(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                                  Hide completed
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Conceal tasks already marked complete
                                </div>
                              </div>
                            </label>

                            <label className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={myTasksOnly}
                                onChange={(e) => setMyTasksOnly(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                                  My Tasks Only
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Show only tasks assigned to you
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={activeFilterCount === 0}
                            onClick={resetAllFilters}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                          >
                            Reset filters
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiltersOpen(false)}
                            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div
                role="group"
                aria-label="Workspace view"
                className="flex items-center gap-0.5 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  aria-pressed={viewMode === 'board'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'board'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  <span>Board</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  aria-pressed={viewMode === 'calendar'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'calendar'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Calendar</span>
                </button>
              </div>

              <div className="hidden md:block text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                {effectivePermissions.roleLabel} · {tasks.length}{' '}
                {tasks.length === 1 ? 'task' : 'tasks'} · {completedCount} completed ·{' '}
                {columns.length} {columns.length === 1 ? 'column' : 'columns'}
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Canvas or Admin Page */}
        {workspacePage === 'admin' && isAdmin ? (
          <AdminPage
            uid={user.uid}
            isBootstrapAdmin={isBootstrapAdmin}
            totalBoardsCount={boards.length}
            onBackToWorkspace={() => setWorkspacePage('workspace')}
          />
        ) : (
        <main
          style={boardCanvasStyle}
          className={`flex-1 p-4 sm:p-6 ${
            activeBoard && viewMode === 'calendar'
              ? 'overflow-hidden flex flex-col'
              : 'overflow-x-auto overflow-y-hidden'
          } ${
            activeBoard && viewMode === 'board' && safeBoardBackgroundUrl ? 'board-custom-bg' : ''
          } ${
            activeBoard && viewMode === 'board' && boardOpacityActive ? 'board-translucent-surfaces' : ''
          }`}
        >
          {!activeBoard ? (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-sm text-center space-y-3">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  No Board Selected
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isAdmin || canCreateBoards
                    ? "Create a new board or join a teammate's shared board with a board code or link."
                    : "Join a teammate's shared board with a board code or link, or ask an administrator for permission to create boards."}
                </p>
                <div className="flex items-center justify-center gap-3 pt-1">
                  {(isAdmin || canCreateBoards) && (
                    <button
                      type="button"
                      onClick={() => setBoardModalState({ mode: 'create' })}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Board</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setJoinModalState({})}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <span>Join Board</span>
                  </button>
                </div>
              </div>
            </div>
          ) : viewMode === 'calendar' ? (
            <CalendarTimelineView
              board={activeBoard}
              columns={columns}
              tasks={filteredTasks}
              assigneeNames={assigneeNameMap}
              messageCounts={messageCounts}
              canToggleComplete={effectivePermissions.canEditTasks}
              onSelectTask={(task) => {
                setTaskModalFocusChat(false);
                setSelectedTaskId(task.id);
              }}
              onToggleTaskComplete={(task) =>
                toggleTaskCompleted(activeBoard.id, task.id, !task.completed)
              }
            />
          ) : (
            <div className="h-full flex items-start gap-4 min-w-max">
              {columns.map((col) => {
                const colTasks = filteredTasks
                  .filter((t) => t.columnId === col.id)
                  .sort((a, b) => a.position - b.position);

                return (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    tasks={colTasks}
                    canCreateTasks={effectivePermissions.canCreateTasks}
                    canEditTasks={effectivePermissions.canEditTasks}
                    canManageColumns={effectivePermissions.canManageColumns}
                    assigneeNames={assigneeNameMap}
                    messageCounts={messageCounts}
                    subtasksByTask={subtasksByTask}
                    draggedTaskId={draggedTask?.id ?? null}
                    dropTarget={dropTarget}
                    onDragStartTask={handleDragStartTask}
                    onDragEndTask={handleDragEndTask}
                    onDragOverColumn={handleDragOverColumn}
                    onDragLeaveColumn={handleDragLeaveColumn}
                    onDropOnColumn={handleDropOnColumn}
                    onSelectTask={(task) => {
                      setTaskModalFocusChat(false);
                      setSelectedTaskId(task.id);
                    }}
                    onToggleTaskComplete={(task) =>
                      toggleTaskCompleted(activeBoard.id, task.id, !task.completed)
                    }
                    onToggleSubtask={(task, sub) => void handleToggleSubtask(task, sub)}
                    onQuickCreateTask={handleQuickCreateTask}
                    onOpenColumnSettings={(column) => setEditingColumnId(column.id)}
                  />
                );
              })}

              {effectivePermissions.canManageColumns && (
                <div className="w-[280px] shrink-0">
                  {addingColumn ? (
                    <form
                      onSubmit={handleCreateColumn}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5"
                    >
                      <input
                        type="text"
                        autoFocus
                        maxLength={LIMITS.COLUMN_TITLE_MAX}
                        value={newColumnTitle}
                        onChange={(e) => setNewColumnTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setAddingColumn(false);
                            setNewColumnTitle('');
                          }
                        }}
                        placeholder="Column name..."
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={savingColumn || !newColumnTitle.trim()}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md whitespace-nowrap"
                        >
                          {savingColumn ? 'Adding...' : 'Add column'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingColumn(false);
                            setNewColumnTitle('');
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingColumn(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100/60 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add column</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
        )}
      </div>

      {/* Modals */}
      {boardModalState && (
        <BoardModal
          uid={user.uid}
          ownerDisplayName={profile?.displayName}
          mode={boardModalState.mode}
          board={boardModalState.board}
          isAdmin={isAdmin}
          canCreateBoards={isAdmin || canCreateBoards}
          columns={boardModalState.mode === 'edit' ? columns : undefined}
          tasks={boardModalState.mode === 'edit' ? tasks : undefined}
          subtasksByTask={boardModalState.mode === 'edit' ? subtasksByTask : undefined}
          messages={boardModalState.mode === 'edit' ? boardMessages : undefined}
          assigneeNames={boardModalState.mode === 'edit' ? assigneeNameMap : undefined}
          onCreated={handleSelectBoard}
          onDeleted={(deletedId) => {
            if (activeBoardId === deletedId) {
              const remaining = boards.filter((b) => b.id !== deletedId);
              setActiveBoardId(remaining[0]?.id ?? null);
            }
          }}
          onClose={() => setBoardModalState(null)}
        />
      )}

      {docsOpen && <DocsModal onClose={() => setDocsOpen(false)} />}

      {notificationsOpen && (
        <NotificationsModal
          uid={user.uid}
          isAdmin={isAdmin}
          boards={orderedBoards}
          activeBoard={activeBoard}
          activeBoardCanEdit={effectivePermissions.canEditTasks}
          allTasks={allTasks}
          onOpenTask={handleOpenTaskFromNotification}
          onClose={() => setNotificationsOpen(false)}
        />
      )}

      {allChatsOpen && (
        <AllChatsModal
          uid={user.uid}
          senderName={profile?.displayName || user.displayName || 'Team Member'}
          isAdmin={isAdmin}
          boards={orderedBoards}
          activeBoard={activeBoard}
          activeBoardColumns={columns}
          activeBoardTasks={tasks}
          allMessages={allMessages}
          onOpenTask={handleOpenTaskFromChats}
          onClose={() => setAllChatsOpen(false)}
        />
      )}

      {shareModalOpen && activeBoard && (
        <ShareBoardModal
          uid={user.uid}
          board={activeBoard}
          members={members}
          canManageSharing={effectivePermissions.canManageSharing}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {joinModalState && (
        <JoinBoardModal
          user={user}
          initialBoardId={joinModalState.boardId}
          initialInviteId={joinModalState.inviteId}
          initialBoardCode={joinModalState.boardCode}
          initialError={joinModalState.initialError}
          onJoined={handleSelectBoard}
          onClose={() => setJoinModalState(null)}
        />
      )}

      {addUsersOpen && (isAdmin || canCreateBoards) && (
        <AddUsersModal
          uid={user.uid}
          onClose={() => setAddUsersOpen(false)}
        />
      )}

      {createTaskOpen && activeBoard && (
        <CreateTaskModal
          uid={user.uid}
          board={activeBoard}
          columns={columns}
          tasks={tasks}
          assigneeOptions={assigneeOptions}
          onClose={() => setCreateTaskOpen(false)}
        />
      )}

      {selectedTask && activeBoard && (
        <TaskDetailModal
          uid={user.uid}
          senderName={profile?.displayName || user.displayName || 'Team Member'}
          isAdmin={isAdmin}
          board={activeBoard}
          task={selectedTask}
          columns={columns}
          allTasks={tasks}
          messages={boardMessages}
          assigneeOptions={assigneeOptions}
          canCreateTasks={effectivePermissions.canCreateTasks}
          canEditTasks={effectivePermissions.canEditTasks}
          canDeleteTasks={effectivePermissions.canDeleteTasks}
          initialFocusChat={taskModalFocusChat}
          onToggleSubtask={handleToggleSubtask}
          onClose={() => {
            setSelectedTaskId(null);
            setTaskModalFocusChat(false);
          }}
        />
      )}

      {editingColumn && activeBoard && (
        <ColumnSettingsModal
          boardId={activeBoard.id}
          column={editingColumn}
          columns={columns}
          allTasks={tasks}
          onClose={() => setEditingColumnId(null)}
        />
      )}

      {autoMoveToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-[60] sm:max-w-md bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 border border-slate-700 dark:border-slate-300 rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-3"
        >
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium truncate">
              Moved &ldquo;{autoMoveToast.taskTitle}&rdquo;
            </p>
            <p className="text-slate-300 dark:text-slate-600 flex items-center gap-1 truncate mt-0.5">
              <span className="truncate">{autoMoveToast.fromColumnTitle}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
              <span className="font-medium text-white dark:text-slate-950 truncate">
                {autoMoveToast.toColumnTitle}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleUndoAutoMove()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={() => setAutoMoveToast(null)}
              aria-label="Dismiss notification"
              className="p-1 text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-900 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {themeModal}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceApp />
    </ErrorBoundary>
  );
}
