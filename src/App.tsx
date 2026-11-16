import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  Bell,
  BookOpen,
  CalendarDays,
  Columns3,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AccessDeniedView } from './components/AccessDeniedView';
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
import { auth } from './lib/firebase';
import {
  checkIsAdmin,
  checkUserWhitelistAccess,
  createColumn,
  createTask,
  ensureUserAndStarterWorkspace,
  getTodayDateKey,
  moveTask,
  redeemAccessCode,
  subscribeAccessibleBoards,
  subscribeAllBoardsMessages,
  subscribeAllBoardsTasks,
  subscribeBoardMembers,
  subscribeBoardMessages,
  subscribeBoardSubtasks,
  subscribeColumns,
  subscribeTasks,
  subscribeUserProfile,
  toggleSubtaskCompleted,
  toggleTaskCompleted,
  updateUserActiveBoard,
  updateUserTheme,
} from './lib/kanbanService';
import {
  LIMITS,
  ROLE_PRESETS,
  type Board,
  type BoardMember,
  type Column,
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

function WorkspaceApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBootstrapAdmin, setIsBootstrapAdmin] = useState(false);
  const [accessStatus, setAccessStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [accessSuspended, setAccessSuspended] = useState(false);
  const [accessGateError, setAccessGateError] = useState<string | null>(null);
  const [pendingAccessCode, setPendingAccessCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('access')?.trim().toUpperCase();
    if (fromUrl) {
      window.sessionStorage.setItem('cadence_pending_access', fromUrl);
      params.delete('access');
      const remaining = params.toString();
      const nextUrl = remaining
        ? `${window.location.pathname}?${remaining}`
        : window.location.pathname;
      window.history.replaceState({}, '', nextUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem('cadence_pending_access') || null;
  });
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspacePage, setWorkspacePage] = useState<'workspace' | 'admin'>('workspace');
  const [asyncError, setAsyncError] = useState<Error | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
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

  // Filters, search & view mode
  const [viewMode, setViewMode] = useState<'board' | 'calendar'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);

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
  const [joinModalState, setJoinModalState] = useState<{
    boardId?: string;
    inviteId?: string;
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

  // Sync theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('cadence_theme', theme);
  }, [theme]);

  const verifyAndProvisionUser = async (nextUser: User, autoRedeemCode: string | null) => {
    setAccessStatus('checking');
    setAccessSuspended(false);
    setAccessGateError(null);
    setWorkspaceReady(false);

    const adminStatus = await checkIsAdmin(nextUser);
    let wlStatus = await checkUserWhitelistAccess(nextUser, adminStatus.isAdmin);

    if (!wlStatus.allowed && !wlStatus.suspended && autoRedeemCode) {
      try {
        await redeemAccessCode(nextUser, autoRedeemCode);
        window.sessionStorage.removeItem('cadence_pending_access');
        setPendingAccessCode(null);
        wlStatus = { allowed: true, suspended: false, email: wlStatus.email };
      } catch (redeemErr) {
        setAccessGateError(
          redeemErr instanceof Error ? redeemErr.message : 'Unable to redeem access code.'
        );
      }
    } else if (wlStatus.allowed && autoRedeemCode) {
      window.sessionStorage.removeItem('cadence_pending_access');
      setPendingAccessCode(null);
    }

    if (!wlStatus.allowed) {
      setIsAdmin(false);
      setIsBootstrapAdmin(false);
      setAccessSuspended(wlStatus.suspended);
      setAccessStatus('denied');
      setWorkspaceReady(false);
      return;
    }

    const ensured = await ensureUserAndStarterWorkspace(nextUser);
    setProfile(ensured);
    setIsAdmin(adminStatus.isAdmin);
    setIsBootstrapAdmin(adminStatus.isBootstrapAdmin);
    setAccessSuspended(false);
    setAccessGateError(null);
    setAccessStatus('granted');
    if (ensured.theme) setTheme(ensured.theme);
    if (ensured.activeBoardId) setActiveBoardId(ensured.activeBoardId);
    setWorkspaceReady(true);

    // Check URL for ?join=boardId&code=inviteId
    const params = new URLSearchParams(window.location.search);
    const joinBoardId = params.get('join');
    const joinCode = params.get('code');
    if (joinBoardId && joinCode) {
      setJoinModalState({ boardId: joinBoardId, inviteId: joinCode });
      window.history.replaceState({}, '', window.location.pathname);
    }
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
        const storedCode = window.sessionStorage.getItem('cadence_pending_access');
        await verifyAndProvisionUser(nextUser, storedCode || pendingAccessCode);
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
      roleLabel: ROLE_PRESETS[myMembership.role]?.label ?? myMembership.role,
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
        const roleLabel = ROLE_PRESETS[m.role]?.label ?? m.role;
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

  const boardMap = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach((b) => map.set(b.id, b));
    return map;
  }, [boards]);

  const upcomingNotificationsCount = useMemo(
    () => buildTaskNotifications(allTasks, boardMap, getTodayDateKey(), 7).length,
    [allTasks, boardMap]
  );

  const handleToggleTheme = async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (user && workspaceReady) {
      await updateUserTheme(user.uid, next);
    }
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

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading workspace...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <SignInView
        theme={theme}
        pendingAccessCode={pendingAccessCode}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  if (accessStatus === 'denied') {
    return (
      <AccessDeniedView
        user={user}
        suspended={accessSuspended}
        initialAccessCode={pendingAccessCode}
        initialError={accessGateError}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onAccessGranted={async () => {
          window.sessionStorage.removeItem('cadence_pending_access');
          setPendingAccessCode(null);
          await verifyAndProvisionUser(user, null);
        }}
        onRecheckAccess={async () => {
          await verifyAndProvisionUser(user, null);
        }}
        onSignOut={handleSignOut}
      />
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

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex overflow-hidden">
      <Sidebar
        uid={user.uid}
        boards={boards}
        activeBoardId={activeBoardId}
        profile={profile}
        userEmail={user.email}
        isAdmin={isAdmin}
        isAdminPageActive={workspacePage === 'admin' && isAdmin}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSelectBoard={handleSelectBoard}
        onOpenNewBoard={() => setBoardModalState({ mode: 'create' })}
        onOpenJoinBoard={() => setJoinModalState({})}
        onOpenAdminPanel={() => setWorkspacePage('admin')}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Workspace Header */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open boards navigation"
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                {workspacePage === 'admin' && isAdmin ? 'Admin' : 'Boards'}
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {workspacePage === 'admin' && isAdmin
                  ? 'Workspace Access & Admin'
                  : activeBoard
                    ? activeBoard.title
                    : 'Workspace'}
              </h1>
              {workspacePage !== 'admin' && isArchived && (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                  · Archived
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDocsOpen(true)}
              aria-label="Open Cadence build documentation"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Docs</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() =>
                  setWorkspacePage((prev) => (prev === 'admin' ? 'workspace' : 'admin'))
                }
                aria-label="Workspace Admin and Whitelist"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  workspacePage === 'admin'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label="View due date and milestone notifications"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                upcomingNotificationsCount > 0
                  ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-950/50'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Notifications</span>
              {upcomingNotificationsCount > 0 && <span>· {upcomingNotificationsCount}</span>}
            </button>

            <button
              type="button"
              onClick={() => setAllChatsOpen(true)}
              aria-label="View all task chats"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chats</span>
              {allMessages.length > 0 && <span>· {allMessages.length}</span>}
            </button>

            {workspacePage !== 'admin' && activeBoard && (
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                aria-label="Share and permissions"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
                {members.length > 0 && <span>· {members.length + 1}</span>}
              </button>
            )}

            {workspacePage !== 'admin' && activeBoard && (isAdmin || activeBoard.ownerId === user.uid) && (
              <button
                type="button"
                onClick={() => setBoardModalState({ mode: 'edit', board: activeBoard })}
                aria-label="Board settings"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Board</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {workspacePage !== 'admin' && activeBoard && effectivePermissions.canCreateTasks && columns.length > 0 && (
              <button
                type="button"
                onClick={() => setCreateTaskOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
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

              <div
                role="group"
                aria-label="Filter by priority"
                className="flex items-center gap-0.5 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto"
              >
                {(['all', 'urgent', 'high', 'medium', 'low'] as const).map((level) => {
                  const active = priorityFilter === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setPriorityFilter(level)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-pressed={hideCompleted}
                onClick={() => setHideCompleted(!hideCompleted)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  hideCompleted
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {hideCompleted ? 'Completed hidden' : 'Hide completed'}
              </button>

              <button
                type="button"
                aria-pressed={myTasksOnly}
                onClick={() => setMyTasksOnly(!myTasksOnly)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  myTasksOnly
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                My Tasks Only
              </button>
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
          className={`flex-1 p-4 sm:p-6 ${
            activeBoard && viewMode === 'calendar'
              ? 'overflow-hidden flex flex-col'
              : 'overflow-x-auto overflow-y-hidden'
          }`}
        >
          {!activeBoard ? (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-sm text-center space-y-3">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  No board selected
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create a new Kanban board or join a teammate&apos;s shared board with an invite code.
                </p>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setBoardModalState({ mode: 'create' })}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Board</span>
                  </button>
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
                    onDropOnColumn={handleDropOnColumn}
                    onSelectTask={(task) => {
                      setTaskModalFocusChat(false);
                      setSelectedTaskId(task.id);
                    }}
                    onToggleTaskComplete={(task) =>
                      toggleTaskCompleted(activeBoard.id, task.id, !task.completed)
                    }
                    onToggleSubtask={(task, sub) =>
                      toggleSubtaskCompleted(activeBoard.id, task.id, sub.id, !sub.completed)
                    }
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
          boards={boards}
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
          boards={boards}
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
          onJoined={handleSelectBoard}
          onClose={() => setJoinModalState(null)}
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
