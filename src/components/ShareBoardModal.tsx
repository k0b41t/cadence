import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  createBoardInvite,
  grantBoardAccessByEmail,
  grantBoardAccessByUid,
  revokeBoardAccess,
  revokeBoardInvite,
  subscribeBoardInvites,
  updateMemberPermissions,
} from '../lib/kanbanService';
import {
  LIMITS,
  ROLE_PRESETS,
  type Board,
  type BoardInvite,
  type BoardMember,
  type BoardPermissions,
  type BoardRole,
} from '../types/kanban';

interface ShareBoardModalProps {
  uid: string;
  board: Board;
  members: BoardMember[];
  canManageSharing: boolean;
  onClose: () => void;
}

export function ShareBoardModal({
  uid,
  board,
  members,
  canManageSharing,
  onClose,
}: ShareBoardModalProps) {
  const [invites, setInvites] = useState<BoardInvite[]>([]);
  const [shareMode, setShareMode] = useState<'email' | 'uid'>('email');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [targetDisplayName, setTargetDisplayName] = useState('');

  const [role, setRole] = useState<BoardRole>('contributor');
  const [permissions, setPermissions] = useState<BoardPermissions>(
    ROLE_PRESETS.contributor.permissions
  );

  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteRole, setInviteRole] = useState<BoardRole>('contributor');
  const [invitePerms, setInvitePerms] = useState<BoardPermissions>(
    ROLE_PRESETS.contributor.permissions
  );

  const [submitting, setSubmitting] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageSharing) return;
    const unsub = subscribeBoardInvites(board.id, setInvites);
    return () => unsub();
  }, [board.id, canManageSharing]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleRoleChange = (nextRole: BoardRole) => {
    setRole(nextRole);
    setPermissions({ ...ROLE_PRESETS[nextRole].permissions });
  };

  const handleInviteRoleChange = (nextRole: BoardRole) => {
    setInviteRole(nextRole);
    setInvitePerms({ ...ROLE_PRESETS[nextRole].permissions });
  };

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSharing || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (shareMode === 'email') {
        const cleanEmail = targetEmail.trim();
        if (!cleanEmail) throw new Error('Enter an email address.');
        const res = await grantBoardAccessByEmail(board, cleanEmail, role, permissions);
        setSuccessMsg(`Granted ${ROLE_PRESETS[role].label} access to ${res.displayName}.`);
        setTargetEmail('');
      } else {
        const cleanUid = targetUid.trim();
        if (!cleanUid) throw new Error('Enter a user ID.');
        await grantBoardAccessByUid(
          board,
          cleanUid,
          targetDisplayName.trim() || 'Collaborator',
          role,
          permissions
        );
        setSuccessMsg('Collaborator added to board.');
        setTargetUid('');
        setTargetDisplayName('');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to grant access.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleMemberPerm = async (
    member: BoardMember,
    field: keyof Omit<BoardPermissions, 'canView'>
  ) => {
    if (!canManageSharing) return;
    const nextPerms: BoardPermissions = {
      canView: true,
      canCreateTasks: member.canCreateTasks,
      canEditTasks: member.canEditTasks,
      canDeleteTasks: member.canDeleteTasks,
      canManageColumns: member.canManageColumns,
      [field]: !member[field],
    };

    const derivedRole: BoardRole = nextPerms.canManageColumns
      ? 'manager'
      : nextPerms.canDeleteTasks
        ? 'editor'
        : nextPerms.canCreateTasks || nextPerms.canEditTasks
          ? 'contributor'
          : 'viewer';

    await updateMemberPermissions(board, member.uid, derivedRole, nextPerms);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSharing || creatingInvite) return;
    setCreatingInvite(true);
    setErrorMsg(null);
    try {
      await createBoardInvite(uid, board, inviteLabel, inviteRole, invitePerms);
      setInviteLabel('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create invite link.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInviteLink = async (invite: BoardInvite) => {
    const url = `${window.location.origin}/?join=${encodeURIComponent(board.id)}&code=${encodeURIComponent(invite.id)}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId((prev) => (prev === invite.id ? null : prev)), 2000);
  };

  const activeInvites = invites.filter((i) => i.active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-board-heading"
        className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2
              id="share-board-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              Share & Permissions — {board.title}
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5"
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3.5 py-2.5">
              {successMsg}
            </div>
          )}

          {canManageSharing && board.status === 'active' && (
            <form
              onSubmit={handleGrantAccess}
              className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Add Collaborator</span>
                </h3>
                <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-md">
                  <button
                    type="button"
                    onClick={() => setShareMode('email')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                      shareMode === 'email'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    By Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareMode('uid')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                      shareMode === 'uid'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    By User ID
                  </button>
                </div>
              </div>

              {shareMode === 'email' ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-7">
                    <label htmlFor="share-email-input" className="sr-only">
                      Teammate email
                    </label>
                    <input
                      id="share-email-input"
                      type="email"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      placeholder="teammate@example.com"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label htmlFor="share-role-select" className="sr-only">
                      Preset role
                    </label>
                    <select
                      id="share-role-select"
                      value={role}
                      onChange={(e) => handleRoleChange(e.target.value as BoardRole)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {(Object.keys(ROLE_PRESETS) as BoardRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_PRESETS[r].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      value={targetUid}
                      onChange={(e) => setTargetUid(e.target.value)}
                      placeholder="User UID..."
                      className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      value={targetDisplayName}
                      onChange={(e) => setTargetDisplayName(e.target.value)}
                      placeholder="Display name"
                      maxLength={LIMITS.USER_DISPLAY_NAME_MAX}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      value={role}
                      onChange={(e) => handleRoleChange(e.target.value as BoardRole)}
                      className="w-full px-2.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {(Object.keys(ROLE_PRESETS) as BoardRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_PRESETS[r].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Utility permission checkboxes */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700 dark:text-slate-300">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.canCreateTasks}
                    onChange={(e) =>
                      setPermissions({ ...permissions, canCreateTasks: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Create tasks</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.canEditTasks}
                    onChange={(e) =>
                      setPermissions({ ...permissions, canEditTasks: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Edit & move tasks</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.canDeleteTasks}
                    onChange={(e) =>
                      setPermissions({ ...permissions, canDeleteTasks: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Delete tasks</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.canManageColumns}
                    onChange={(e) =>
                      setPermissions({ ...permissions, canManageColumns: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Manage columns & WIP</span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {ROLE_PRESETS[role].description}
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {submitting ? 'Granting...' : 'Grant access'}
                </button>
              </div>
            </form>
          )}

          {/* Current Board Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Board Access ({members.length + 1})
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Admins always have full access to all boards
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {/* Creator Row */}
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {board.ownerId === uid ? 'You (Board Creator)' : 'Board Creator'}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {board.ownerId}
                  </div>
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
                  Creator · All utilities
                </span>
              </div>

              {members.map((member) => (
                <div key={member.uid} className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {member.displayName} {member.uid === uid ? '(You)' : ''}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {ROLE_PRESETS[member.role]?.label ?? member.role} ·{' '}
                        <span className="font-mono">{member.uid.slice(0, 12)}</span>
                      </div>
                    </div>

                    {canManageSharing && (
                      <button
                        type="button"
                        onClick={() => revokeBoardAccess(board.id, member.uid)}
                        aria-label={`Revoke access for ${member.displayName}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    )}
                  </div>

                  {/* Interactive granular toggles for Creator/Admin */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    {(
                      [
                        ['canCreateTasks', 'Create tasks'],
                        ['canEditTasks', 'Edit & move'],
                        ['canDeleteTasks', 'Delete tasks'],
                        ['canManageColumns', 'Manage columns'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className={`inline-flex items-center gap-1.5 ${
                          canManageSharing && board.status === 'active'
                            ? 'cursor-pointer'
                            : 'opacity-75'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!canManageSharing || board.status !== 'active'}
                          checked={member[key]}
                          onChange={() => handleToggleMemberPerm(member, key)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shareable Invite Links */}
          {canManageSharing && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Invite Links</span>
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Teammates can join via link before signing in
                </span>
              </div>

              {board.status === 'active' && (
                <form onSubmit={handleCreateInvite} className="space-y-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        maxLength={LIMITS.INVITE_LABEL_MAX}
                        value={inviteLabel}
                        onChange={(e) => setInviteLabel(e.target.value)}
                        placeholder="Label (e.g. Design Team)"
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <select
                        value={inviteRole}
                        onChange={(e) => handleInviteRoleChange(e.target.value as BoardRole)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      >
                        {(Object.keys(ROLE_PRESETS) as BoardRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_PRESETS[r].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        disabled={creatingInvite}
                        className="w-full px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 rounded-lg whitespace-nowrap"
                      >
                        {creatingInvite ? 'Creating...' : 'Create link'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invitePerms.canCreateTasks}
                        onChange={(e) =>
                          setInvitePerms({ ...invitePerms, canCreateTasks: e.target.checked })
                        }
                      />
                      <span>Create tasks</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invitePerms.canEditTasks}
                        onChange={(e) =>
                          setInvitePerms({ ...invitePerms, canEditTasks: e.target.checked })
                        }
                      />
                      <span>Edit & move</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invitePerms.canDeleteTasks}
                        onChange={(e) =>
                          setInvitePerms({ ...invitePerms, canDeleteTasks: e.target.checked })
                        }
                      />
                      <span>Delete tasks</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invitePerms.canManageColumns}
                        onChange={(e) =>
                          setInvitePerms({ ...invitePerms, canManageColumns: e.target.checked })
                        }
                      />
                      <span>Manage columns</span>
                    </label>
                  </div>
                </form>
              )}

              {activeInvites.length > 0 && (
                <ul className="space-y-2">
                  {activeInvites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {inv.label || ROLE_PRESETS[inv.role].label} ·{' '}
                          <span className="text-slate-500 dark:text-slate-400">
                            {ROLE_PRESETS[inv.role].label}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          Code: {board.id}:{inv.id}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyInviteLink(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors whitespace-nowrap"
                        >
                          {copiedId === inv.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => revokeBoardInvite(board.id, inv.id)}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                        >
                          Revoke
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end bg-slate-50/70 dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
