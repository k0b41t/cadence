import { useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  FolderKanban,
  Link2,
  LogOut,
  Plus,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { Board, UserProfile } from '../types/kanban';

interface SidebarProps {
  uid: string;
  boards: Board[];
  activeBoardId: string | null;
  profile: UserProfile | null;
  userEmail: string | null;
  isAdmin: boolean;
  isBootstrapAdmin: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectBoard: (boardId: string) => void;
  onOpenNewBoard: () => void;
  onOpenJoinBoard: () => void;
  onOpenAdminPanel: () => void;
  onSignOut: () => void;
}

export function Sidebar({
  uid,
  boards,
  activeBoardId,
  profile,
  userEmail,
  isAdmin,
  isBootstrapAdmin,
  mobileOpen,
  onCloseMobile,
  onSelectBoard,
  onOpenNewBoard,
  onOpenJoinBoard,
  onOpenAdminPanel,
  onSignOut,
}: SidebarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

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

  const content = (
    <div className="h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Brand header */}
      <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          Cadence
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Boards list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
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
                title="Join board via link or code"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Join</span>
              </button>
              <button
                type="button"
                onClick={onOpenNewBoard}
                aria-label="Create new board"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          {myActiveBoards.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
              No personal boards yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {myActiveBoards.map((board) => {
                const isSelected = board.id === activeBoardId;
                return (
                  <li key={board.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBoard(board.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/60 dark:text-blue-300'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <FolderKanban className="w-4 h-4 shrink-0" />
                      <span className="truncate">{board.title}</span>
                    </button>
                  </li>
                );
              })}
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
              {sharedOrOtherBoards.map((board) => {
                const isSelected = board.id === activeBoardId;
                return (
                  <li key={board.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBoard(board.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/60 dark:text-blue-300'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="truncate">{board.title}</span>
                    </button>
                  </li>
                );
              })}
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
              {archivedBoards.map((board) => {
                const isSelected = board.id === activeBoardId;
                return (
                  <li key={board.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBoard(board.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'bg-slate-200/80 text-slate-900 font-medium dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <Archive className="w-4 h-4 shrink-0" />
                      <span className="truncate">{board.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Admin Controls & User Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (isBootstrapAdmin) {
                onOpenAdminPanel();
                onCloseMobile();
              }
            }}
            disabled={!isBootstrapAdmin}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 rounded-lg transition-colors disabled:opacity-75"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Workspace Admin</span>
            </span>
            {isBootstrapAdmin && <span className="text-[11px]">Manage</span>}
          </button>
        )}

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
      <aside className="hidden lg:block shrink-0">{content}</aside>

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
