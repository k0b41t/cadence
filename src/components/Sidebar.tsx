import { useState, type DragEvent } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Cog,
  Copy,
  FolderKanban,
  GripVertical,
  Link2,
  LogOut,
  Moon,
  PanelLeftClose,
  Plus,
  ShieldCheck,
  Sun,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Board, ThemeMode, UserProfile } from '../types/kanban';

type BoardSectionKey = 'mine' | 'shared' | 'archived';

interface SidebarProps {
  uid: string;
  boards: Board[];
  activeBoardId: string | null;
  profile: UserProfile | null;
  userEmail: string | null;
  isAdmin: boolean;
  canCreateBoards: boolean;
  isAdminPageActive: boolean;
  theme: ThemeMode;
  mobileOpen: boolean;
  desktopCollapsed?: boolean;
  onCloseMobile: () => void;
  onToggleDesktopCollapse?: () => void;
  onSelectBoard: (boardId: string) => void;
  onReorderBoards: (nextBoardOrder: string[]) => void;
  onOpenNewBoard: () => void;
  onOpenJoinBoard: () => void;
  onOpenAddUsers: () => void;
  onOpenAdminPanel: () => void;
  onOpenDocs: () => void;
  onOpenThemeSettings: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

function mergeSectionOrder(
  allBoards: Board[],
  sectionIdsOld: string[],
  sectionIdsNew: string[]
): string[] {
  const sectionSet = new Set(sectionIdsOld);
  const fullIds = allBoards.map((b) => b.id);
  let cursor = 0;
  return fullIds.map((id) => {
    if (!sectionSet.has(id)) return id;
    const replacement = sectionIdsNew[cursor];
    cursor += 1;
    return replacement ?? id;
  });
}

export function Sidebar({
  uid,
  boards,
  activeBoardId,
  profile,
  userEmail,
  isAdmin,
  canCreateBoards,
  isAdminPageActive,
  theme,
  mobileOpen,
  desktopCollapsed = false,
  onCloseMobile,
  onToggleDesktopCollapse,
  onSelectBoard,
  onReorderBoards,
  onOpenNewBoard,
  onOpenJoinBoard,
  onOpenAddUsers,
  onOpenAdminPanel,
  onOpenDocs,
  onOpenThemeSettings,
  onToggleTheme,
  onSignOut,
}: SidebarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [dragState, setDragState] = useState<{
    boardId: string;
    section: BoardSectionKey;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    section: BoardSectionKey;
    targetBoardId: string;
    position: 'before' | 'after';
  } | null>(null);

  const myActiveBoards = boards.filter((b) => b.status === 'active' && b.ownerId === uid);
  const sharedOrOtherBoards = boards.filter((b) => b.status === 'active' && b.ownerId !== uid);
  const archivedBoards = boards.filter((b) => b.status === 'archived');

  const initials = (profile?.displayName || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const handleCopyUid = async () => {
    await navigator.clipboard.writeText(uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 1800);
  };

  const handleMoveByStep = (
    sectionBoards: Board[],
    index: number,
    delta: -1 | 1
  ) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= sectionBoards.length) return;
    const sectionIdsOld = sectionBoards.map((b) => b.id);
    const sectionIdsNew = [...sectionIdsOld];
    const [moved] = sectionIdsNew.splice(index, 1);
    sectionIdsNew.splice(nextIndex, 0, moved);
    onReorderBoards(mergeSectionOrder(boards, sectionIdsOld, sectionIdsNew));
  };

  const handleBoardDragStart = (
    e: DragEvent<HTMLLIElement>,
    boardId: string,
    section: BoardSectionKey
  ) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', boardId);
    setDragState({ boardId, section });
    setDropTarget(null);
  };

  const handleBoardDragOver = (
    e: DragEvent<HTMLLIElement>,
    targetBoardId: string,
    section: BoardSectionKey
  ) => {
    if (!dragState || dragState.section !== section) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (dragState.boardId === targetBoardId) {
      if (dropTarget) setDropTarget(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const position: 'before' | 'after' =
      e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

    setDropTarget((prev) =>
      prev &&
      prev.section === section &&
      prev.targetBoardId === targetBoardId &&
      prev.position === position
        ? prev
        : { section, targetBoardId, position }
    );
  };

  const handleBoardDrop = (
    e: DragEvent<HTMLLIElement>,
    sectionBoards: Board[],
    targetBoardId: string,
    section: BoardSectionKey
  ) => {
    if (!dragState || dragState.section !== section) return;
    e.preventDefault();

    const draggedId = dragState.boardId;
    const resolvedPos: 'before' | 'after' =
      dropTarget &&
      dropTarget.section === section &&
      dropTarget.targetBoardId === targetBoardId
        ? dropTarget.position
        : e.clientY <
            e.currentTarget.getBoundingClientRect().top +
              e.currentTarget.getBoundingClientRect().height / 2
          ? 'before'
          : 'after';

    setDragState(null);
    setDropTarget(null);

    if (draggedId === targetBoardId) return;

    const sectionIdsOld = sectionBoards.map((b) => b.id);
    const fromIdx = sectionIdsOld.indexOf(draggedId);
    const targetIdx = sectionIdsOld.indexOf(targetBoardId);
    if (fromIdx === -1 || targetIdx === -1) return;

    const withoutDragged = sectionIdsOld.filter((id) => id !== draggedId);
    const adjustedTargetIdx = withoutDragged.indexOf(targetBoardId);
    const insertIdx =
      resolvedPos === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
    withoutDragged.splice(insertIdx, 0, draggedId);

    const changed = withoutDragged.some((id, idx) => id !== sectionIdsOld[idx]);
    if (changed) {
      onReorderBoards(mergeSectionOrder(boards, sectionIdsOld, withoutDragged));
    }
  };

  const handleBoardDragEnd = () => {
    setDragState(null);
    setDropTarget(null);
  };

  const renderBoardRow = (
    board: Board,
    index: number,
    sectionBoards: Board[],
    section: BoardSectionKey
  ) => {
    const isSelected = board.id === activeBoardId;
    const canReorder = sectionBoards.length > 1;
    const isDragging = dragState?.boardId === board.id && dragState.section === section;
    const showBeforeLine =
      dropTarget?.section === section &&
      dropTarget.targetBoardId === board.id &&
      dropTarget.position === 'before';
    const showAfterLine =
      dropTarget?.section === section &&
      dropTarget.targetBoardId === board.id &&
      dropTarget.position === 'after';

    const rowStyleClass =
      section === 'archived'
        ? isSelected
          ? 'bg-slate-200/80 text-slate-900 font-medium dark:bg-slate-800 dark:text-slate-100'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
        : isSelected && !isAdminPageActive
          ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/60 dark:text-blue-300'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70';

    const RowIcon =
      section === 'archived'
        ? Archive
        : section === 'shared'
          ? Users
          : FolderKanban;

    return (
      <li
        key={board.id}
        draggable={canReorder}
        onDragStart={(e) => handleBoardDragStart(e, board.id, section)}
        onDragOver={(e) => handleBoardDragOver(e, board.id, section)}
        onDrop={(e) => handleBoardDrop(e, sectionBoards, board.id, section)}
        onDragEnd={handleBoardDragEnd}
        className={`group relative flex items-center rounded-lg transition-colors ${rowStyleClass} ${
          isDragging ? 'opacity-45' : ''
        }`}
      >
        {showBeforeLine && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-blue-500 z-10"
          />
        )}

        <button
          type="button"
          onClick={() => {
            onSelectBoard(board.id);
            onCloseMobile();
          }}
          className="flex-1 min-w-0 flex items-center gap-2 pl-2.5 pr-1.5 py-2 text-xs text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <RowIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{board.title}</span>
        </button>

        {canReorder && (
          <div className="flex lg:hidden lg:group-hover:flex lg:group-focus-within:flex items-center gap-0.5 pr-1 shrink-0">
            <span
              aria-hidden="true"
              title="Drag to reorder"
              className="hidden lg:inline-flex items-center justify-center p-0.5 text-slate-400 dark:text-slate-500 cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveByStep(sectionBoards, index, -1);
              }}
              disabled={index === 0}
              aria-label={`Move ${board.title} up`}
              title="Move up"
              className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveByStep(sectionBoards, index, 1);
              }}
              disabled={index === sectionBoards.length - 1}
              aria-label={`Move ${board.title} down`}
              title="Move down"
              className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {showAfterLine && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-blue-500 z-10"
          />
        )}
      </li>
    );
  };

  const content = (
    <div className="h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Brand header */}
      <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          Cadence
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleDesktopCollapse && (
            <button
              type="button"
              onClick={onToggleDesktopCollapse}
              aria-label="Collapse left panel"
              title="Collapse left panel"
              className="hidden lg:inline-flex p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Boards list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4 space-y-6"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget(null);
          }
        }}
      >
        <div className="space-y-1.5">
          <div className="px-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              My Boards
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onOpenJoinBoard();
                  onCloseMobile();
                }}
                aria-label="Join shared board"
                title="Join shared board via invite link"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Join</span>
              </button>
              {canCreateBoards && (
                <button
                  type="button"
                  onClick={onOpenNewBoard}
                  aria-label="Create new board"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              )}
            </div>
          </div>

          {myActiveBoards.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
              No personal boards yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {myActiveBoards.map((board, index) =>
                renderBoardRow(board, index, myActiveBoards, 'mine')
              )}
            </ul>
          )}
        </div>

        {/* Shared Boards or All Workspace Boards for Admins */}
        {sharedOrOtherBoards.length > 0 && (
          <div className="space-y-1.5">
            <div className="px-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isAdmin ? 'All Workspace Boards' : 'Shared with Me'}
              </span>
            </div>
            <ul className="space-y-0.5">
              {sharedOrOtherBoards.map((board, index) =>
                renderBoardRow(board, index, sharedOrOtherBoards, 'shared')
              )}
            </ul>
          </div>
        )}

        {archivedBoards.length > 0 && (
          <div className="space-y-1.5">
            <div className="px-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Archived
              </span>
            </div>
            <ul className="space-y-0.5">
              {archivedBoards.map((board, index) =>
                renderBoardRow(board, index, archivedBoards, 'archived')
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Workspace Utilities, Admin Controls & User Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              onOpenAdminPanel();
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              isAdminPageActive
                ? 'bg-blue-600 text-white'
                : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Workspace Admin</span>
            </span>
            <span className="text-[11px]">{isAdminPageActive ? 'Active' : 'Manage'}</span>
          </button>
        ) : (
          canCreateBoards && (
            <button
              type="button"
              onClick={() => {
                onOpenAddUsers();
                onCloseMobile();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70"
            >
              <span className="inline-flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Users</span>
              </span>
              <span className="text-[11px]">Workspace</span>
            </button>
          )
        )}

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => {
              onOpenDocs();
              onCloseMobile();
            }}
            aria-label="Open Cadence build documentation"
            title="Documentation"
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Docs</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenThemeSettings();
              onCloseMobile();
            }}
            aria-label="Appearance and theme settings"
            title="Appearance & Theme"
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Cog className="w-3.5 h-3.5 shrink-0" />
            <span>Theme</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 shrink-0" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 shrink-0" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1.5 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            {profile?.photoUrl && !avatarFailed ? (
              <img
                src={profile.photoUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {profile?.displayName || 'Workspace User'}
              </div>
              {userEmail && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {userEmail}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCopyUid}
              title="Copy your User ID for sharing"
              aria-label="Copy your User ID"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              {copiedUid ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {!desktopCollapsed && <aside className="hidden lg:block shrink-0">{content}</aside>}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
