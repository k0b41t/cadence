import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { AlertCircle, CheckCircle2, KeyRound, Shield, X } from 'lucide-react';
import {
  getBoardInvitePreview,
  redeemBoardInvite,
  resolveBoardCode,
  type BoardInvitePreview,
} from '../lib/kanbanService';
import { hasAssignPermission, ID_REGEX, LIMITS, ROLE_PRESETS } from '../types/kanban';

interface JoinBoardModalProps {
  user: User;
  initialBoardId?: string;
  initialInviteId?: string;
  initialBoardCode?: string;
  initialError?: string | null;
  onJoined: (boardId: string) => void;
  onClose: () => void;
}

export type ParsedBoardJoinInput =
  | { kind: 'ids'; boardId: string; inviteId: string }
  | { kind: 'code'; code: string };

export function parseJoinInput(raw: string): ParsedBoardJoinInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const b = url.searchParams.get('join')?.trim() ?? '';
      const c = url.searchParams.get('code')?.trim() ?? '';
      if (b && c) return { kind: 'ids', boardId: b, inviteId: c };
      if (b && b.includes(':')) {
        const [boardId, inviteId] = b.split(':').map((s) => s.trim());
        if (boardId && inviteId) return { kind: 'ids', boardId, inviteId };
      }
      if (
        b &&
        b.length >= LIMITS.ACCESS_CODE_MIN &&
        b.length <= LIMITS.ID_MAX &&
        ID_REGEX.test(b)
      ) {
        return { kind: 'code', code: b.toUpperCase() };
      }
    }
  } catch {
    // fall through to colon / code syntax
  }

  if (trimmed.includes(':')) {
    const [boardId, inviteId] = trimmed.split(':').map((s) => s.trim());
    if (boardId && inviteId) return { kind: 'ids', boardId, inviteId };
  }

  if (
    trimmed.length >= LIMITS.ACCESS_CODE_MIN &&
    trimmed.length <= LIMITS.ID_MAX &&
    ID_REGEX.test(trimmed)
  ) {
    return { kind: 'code', code: trimmed.toUpperCase() };
  }

  return null;
}

function summarizeInvitePermissions(preview: BoardInvitePreview): string {
  const parts: string[] = [];
  if (preview.canCreateTasks) parts.push('Create tasks');
  if (preview.canEditTasks) parts.push('Edit & move');
  if (preview.canDeleteTasks) parts.push('Delete tasks');
  if (preview.canManageColumns) parts.push('Manage columns');
  if (hasAssignPermission(preview)) parts.push('Add assignee / reviewer');
  return parts.length > 0 ? parts.join(' · ') : 'View only';
}

export function JoinBoardModal({
  user,
  initialBoardId = '',
  initialInviteId = '',
  initialBoardCode = '',
  initialError = null,
  onJoined,
  onClose,
}: JoinBoardModalProps) {
  const [rawCode, setRawCode] = useState(() => {
    if (initialBoardCode) return initialBoardCode.toUpperCase();
    if (initialBoardId && initialInviteId && typeof window !== 'undefined') {
      return `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(initialBoardId)}&code=${encodeURIComponent(initialInviteId)}`;
    }
    return '';
  });
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [preview, setPreview] = useState<BoardInvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const parsedInput = useMemo(() => parseJoinInput(rawCode), [rawCode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!parsedInput) {
      setPreview(null);
      setLoadingPreview(false);
      return;
    }

    let cancelled = false;
    setLoadingPreview(true);
    const timer = window.setTimeout(() => {
      const fetchPreview =
        parsedInput.kind === 'ids'
          ? getBoardInvitePreview(parsedInput.boardId, parsedInput.inviteId)
          : resolveBoardCode(parsedInput.code).then(({ boardId, inviteId }) =>
              getBoardInvitePreview(boardId, inviteId)
            );

      void fetchPreview
        .then((res) => {
          if (!cancelled) {
            setPreview(res);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreview(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingPreview(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [parsedInput]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joining) return;

    if (!parsedInput) {
      setErrorMsg('Enter a valid Board Code (e.g. BRD-8K2M9P) or paste a board invite link.');
      return;
    }

    setJoining(true);
    setErrorMsg(null);
    try {
      const target =
        parsedInput.kind === 'ids'
          ? { boardId: parsedInput.boardId, inviteId: parsedInput.inviteId }
          : await resolveBoardCode(parsedInput.code);
      const res = await redeemBoardInvite(user, target.boardId, target.inviteId);
      onJoined(res.boardId);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to join board.');
      setJoining(false);
    }
  };

  const roleLabel = preview
    ? preview.role === 'custom' && preview.customRoleName
      ? preview.customRoleName
      : ROLE_PRESETS[preview.role].label
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-board-heading"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2
              id="join-board-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Join Shared Board
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleJoin} className="p-6 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5"
            >
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="join-code-input"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Board Code or Invite Link
            </label>
            <input
              id="join-code-input"
              type="text"
              autoFocus
              required
              value={rawCode}
              onChange={(e) => {
                setRawCode(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="e.g. BRD-8K2M9P or paste join link"
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Enter a short board code from the board creator or paste the full join URL.
            </p>
          </div>

          {parsedInput && loadingPreview && (
            <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5">
              Checking board invite details...
            </div>
          )}

          {parsedInput && !loadingPreview && preview && (
            <div
              className={`rounded-lg border px-3.5 py-3 space-y-1.5 ${
                preview.active
                  ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                  : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {preview.boardTitle}
                </div>
                {preview.active ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{roleLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300 shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Revoked</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                <Shield className="w-3 h-3 shrink-0" />
                <span>
                  {preview.active
                    ? summarizeInvitePermissions(preview)
                    : 'This board invite has been revoked by the board creator.'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={joining || !rawCode.trim() || (preview !== null && !preview.active)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {joining ? 'Joining...' : 'Join Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
