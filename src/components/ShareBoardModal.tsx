import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Copy, Link2, Plus, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  createBoardInvite,
  grantBoardAccessByEmail,
  grantBoardAccessByUid,
  revokeBoardAccess,
  revokeBoardInvite,
  revokePendingBoardInvite,
  subscribeBoardInvites,
  subscribeBoardPendingMembers,
  updateBoardCustomRoles,
  updateMemberPermissions,
} from '../lib/kanbanService';
import {
  BUILTIN_ROLE_KEYS,
  getRoleSelectionForValue,
  hasAssignPermission,
  LIMITS,
  permissionsMatch,
  resolveRoleFromPermissions,
  ROLE_PRESETS,
  type Board,
  type BoardCustomRole,
  type BoardInvite,
  type BoardMember,
  type BoardPermissions,
  type PendingBoardMemberNotice,
  type PermissionShape,
} from '../types/kanban';

interface ShareBoardModalProps {
  uid: string;
  board: Board;
  members: BoardMember[];
  canManageSharing: boolean;
  onClose: () => void;
}

const PERMISSION_FIELDS: ReadonlyArray<{
  key: keyof Omit<BoardPermissions, 'canView'>;
  label: string;
  shortLabel: string;
}> = [
  { key: 'canCreateTasks', label: 'Create tasks', shortLabel: 'Create tasks' },
  { key: 'canEditTasks', label: 'Edit & move tasks', shortLabel: 'Edit & move' },
  { key: 'canDeleteTasks', label: 'Delete tasks', shortLabel: 'Delete tasks' },
  { key: 'canManageColumns', label: 'Add & manage columns', shortLabel: 'Manage columns' },
  { key: 'canAssignTasks', label: 'Add assignee / reviewer', shortLabel: 'Assign/Reviewer' },
];

function summarizePermissions(perms: PermissionShape): string {
  const parts = PERMISSION_FIELDS.filter((f) =>
    f.key === 'canAssignTasks' ? hasAssignPermission(perms) : perms[f.key]
  ).map((f) => f.shortLabel);
  return parts.length > 0 ? parts.join(' · ') : 'View only';
}

const RESERVED_ROLE_NAMES = new Set([
  'viewer',
  'contributor',
  'editor',
  'board manager',
  'manager',
  'custom',
  'creator',
  'admin',
]);

export function ShareBoardModal({
  uid,
  board,
  members,
  canManageSharing,
  onClose,
}: ShareBoardModalProps) {
  const customRoles = useMemo(() => board.customRoles ?? [], [board.customRoles]);

  const [invites, setInvites] = useState<BoardInvite[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingBoardMemberNotice[]>([]);
  const [shareMode, setShareMode] = useState<'email' | 'uid'>('email');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [targetDisplayName, setTargetDisplayName] = useState('');

  const [permissions, setPermissions] = useState<BoardPermissions>({
    ...ROLE_PRESETS.contributor.permissions,
  });

  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteCustomCode, setInviteCustomCode] = useState('');
  const [invitePerms, setInvitePerms] = useState<BoardPermissions>({
    ...ROLE_PRESETS.contributor.permissions,
  });

  const [showNewRoleForm, setShowNewRoleForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<PermissionShape>({
    canCreateTasks: true,
    canEditTasks: false,
    canDeleteTasks: false,
    canManageColumns: false,
    canAssignTasks: false,
  });
  const [savingRoles, setSavingRoles] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageSharing) return;
    const unsubInvites = subscribeBoardInvites(board.id, setInvites);
    const unsubPending = subscribeBoardPendingMembers(board.id, setPendingMembers);
    return () => {
      unsubInvites();
      unsubPending();
    };
  }, [board.id, canManageSharing]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const resolvedGrantRole = useMemo(
    () => resolveRoleFromPermissions(permissions, customRoles),
    [permissions, customRoles]
  );

  const resolvedInviteRole = useMemo(
    () => resolveRoleFromPermissions(invitePerms, customRoles),
    [invitePerms, customRoles]
  );

  const newRoleConflict = useMemo(() => {
    const trimmed = newRoleName.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed && RESERVED_ROLE_NAMES.has(lower)) {
      return `"${trimmed}" is a reserved role name.`;
    }
    if (trimmed && customRoles.some((cr) => cr.name.trim().toLowerCase() === lower)) {
      return `A board role named "${trimmed}" already exists.`;
    }
    for (const key of BUILTIN_ROLE_KEYS) {
      if (permissionsMatch(newRolePerms, ROLE_PRESETS[key].permissions)) {
        return `These permissions already match the built-in "${ROLE_PRESETS[key].label}" role.`;
      }
    }
    for (const cr of customRoles) {
      if (permissionsMatch(newRolePerms, cr)) {
        return `These permissions already match the "${cr.name}" role.`;
      }
    }
    return null;
  }, [newRoleName, newRolePerms, customRoles]);

  const handleGrantRoleSelect = (selectValue: string) => {
    const sel = getRoleSelectionForValue(selectValue, permissions, customRoles);
    setPermissions(sel.permissions);
  };

  const handleInviteRoleSelect = (selectValue: string) => {
    const sel = getRoleSelectionForValue(selectValue, invitePerms, customRoles);
    setInvitePerms(sel.permissions);
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
        const res = await grantBoardAccessByEmail(
          uid,
          board,
          cleanEmail,
          resolvedGrantRole.role,
          permissions,
          resolvedGrantRole.customRoleName
        );
        if (res.pending) {
          setSuccessMsg(
            `Added ${res.displayName} to the workspace (without Board creation permissions) and queued ${resolvedGrantRole.label} Board access until they sign in.`
          );
        } else {
          setSuccessMsg(`Granted ${resolvedGrantRole.label} access to ${res.displayName}.`);
        }
        setTargetEmail('');
      } else {
        const cleanUid = targetUid.trim();
        if (!cleanUid) throw new Error('Enter a user ID.');
        await grantBoardAccessByUid(
          board,
          cleanUid,
          targetDisplayName.trim() || 'Collaborator',
          resolvedGrantRole.role,
          permissions,
          resolvedGrantRole.customRoleName
        );
        setSuccessMsg(`Collaborator added with ${resolvedGrantRole.label} access.`);
        setTargetUid('');
        setTargetDisplayName('');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to grant access.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMemberRoleSelect = async (member: BoardMember, selectValue: string) => {
    if (!canManageSharing || board.status !== 'active') return;
    setErrorMsg(null);
    const currentPerms: BoardPermissions = {
      canView: true,
      canCreateTasks: member.canCreateTasks,
      canEditTasks: member.canEditTasks,
      canDeleteTasks: member.canDeleteTasks,
      canManageColumns: member.canManageColumns,
      canAssignTasks: hasAssignPermission(member),
    };
    const sel = getRoleSelectionForValue(selectValue, currentPerms, customRoles);
    try {
      await updateMemberPermissions(
        board,
        member.uid,
        sel.role,
        sel.permissions,
        sel.customRoleName
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update member role.');
    }
  };

  const handleToggleMemberPerm = async (
    member: BoardMember,
    field: keyof Omit<BoardPermissions, 'canView'>
  ) => {
    if (!canManageSharing || board.status !== 'active') return;
    setErrorMsg(null);
    const currentAssign = hasAssignPermission(member);
    const nextPerms: BoardPermissions = {
      canView: true,
      canCreateTasks: member.canCreateTasks,
      canEditTasks: member.canEditTasks,
      canDeleteTasks: member.canDeleteTasks,
      canManageColumns: member.canManageColumns,
      canAssignTasks: currentAssign,
      [field]: field === 'canAssignTasks' ? !currentAssign : !member[field],
    };

    const nextResolved = resolveRoleFromPermissions(nextPerms, customRoles);
    try {
      await updateMemberPermissions(
        board,
        member.uid,
        nextResolved.role,
        nextPerms,
        nextResolved.customRoleName
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update member permissions.');
    }
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSharing || board.status !== 'active' || savingRoles) return;
    const cleanName = newRoleName.trim();
    if (!cleanName) {
      setErrorMsg('Enter a name for the board role.');
      return;
    }
    if (newRoleConflict) {
      setErrorMsg(newRoleConflict);
      return;
    }
    if (customRoles.length >= LIMITS.BOARD_CUSTOM_ROLES_MAX) {
      setErrorMsg(`Maximum of ${LIMITS.BOARD_CUSTOM_ROLES_MAX} custom roles per board reached.`);
      return;
    }

    setSavingRoles(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const nextRole: BoardCustomRole = {
        id: `role_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName.slice(0, LIMITS.CUSTOM_ROLE_NAME_MAX),
        canCreateTasks: newRolePerms.canCreateTasks,
        canEditTasks: newRolePerms.canEditTasks,
        canDeleteTasks: newRolePerms.canDeleteTasks,
        canManageColumns: newRolePerms.canManageColumns,
        canAssignTasks: Boolean(newRolePerms.canAssignTasks),
      };
      await updateBoardCustomRoles(board.id, [...customRoles, nextRole]);
      setSuccessMsg(`Created board role "${nextRole.name}".`);
      setNewRoleName('');
      setShowNewRoleForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create custom role.');
    } finally {
      setSavingRoles(false);
    }
  };

  const handleDeleteCustomRole = async (roleId: string, roleName: string) => {
    if (!canManageSharing || board.status !== 'active' || savingRoles) return;
    setSavingRoles(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const remaining = customRoles.filter((cr) => cr.id !== roleId);
      await updateBoardCustomRoles(board.id, remaining);
      setSuccessMsg(`Removed board role "${roleName}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to remove custom role.');
    } finally {
      setSavingRoles(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSharing || creatingInvite) return;
    setCreatingInvite(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const created = await createBoardInvite(
        uid,
        board,
        inviteLabel,
        resolvedInviteRole.role,
        invitePerms,
        resolvedInviteRole.customRoleName,
        inviteCustomCode
      );
      setInviteLabel('');
      setInviteCustomCode('');
      setSuccessMsg(`Created board invite code ${created.joinCode}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create board invite.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInviteText = async (copyKey: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(copyKey);
    setTimeout(() => setCopiedId((prev) => (prev === copyKey ? null : prev)), 2000);
  };

  const getInviteJoinUrl = (invite: BoardInvite): string => {
    const base = `${window.location.origin}${window.location.pathname}`;
    if (invite.joinCode) {
      return `${base}?join=${encodeURIComponent(invite.joinCode)}`;
    }
    return `${base}?join=${encodeURIComponent(board.id)}&code=${encodeURIComponent(invite.id)}`;
  };

  const activeInvites = invites.filter((i) => i.active);

  const renderRoleOptions = (currentSelectValue: string) => (
    <>
      <optgroup label="Built-in Roles">
        {BUILTIN_ROLE_KEYS.map((key) => (
          <option key={key} value={key}>
            {ROLE_PRESETS[key].label}
          </option>
        ))}
      </optgroup>
      {customRoles.length > 0 && (
        <optgroup label="Board Roles">
          {customRoles.map((cr) => (
            <option key={cr.id} value={`custom:${cr.id}`}>
              {cr.name}
            </option>
          ))}
        </optgroup>
      )}
      <option value="custom" disabled={currentSelectValue !== 'custom'}>
        Custom
      </option>
    </>
  );

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
                <div className="space-y-2">
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
                        Collaborator role
                      </label>
                      <select
                        id="share-role-select"
                        value={resolvedGrantRole.selectValue}
                        onChange={(e) => handleGrantRoleSelect(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {renderRoleOptions(resolvedGrantRole.selectValue)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Unregistered emails are automatically added to the workspace (without Board creation permissions) and receive Board access immediately upon signing in.
                  </p>
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
                      aria-label="Collaborator role"
                      value={resolvedGrantRole.selectValue}
                      onChange={(e) => handleGrantRoleSelect(e.target.value)}
                      className="w-full px-2.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {renderRoleOptions(resolvedGrantRole.selectValue)}
                    </select>
                  </div>
                </div>
              )}

              {/* Collaborator permissions */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Collaborator Permissions
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {PERMISSION_FIELDS.map(({ key, label }) => (
                    <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions[key]}
                        onChange={(e) =>
                          setPermissions({ ...permissions, [key]: e.target.checked })
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {resolvedGrantRole.description}
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

              {members.map((member) => {
                const resolvedMemberRole = resolveRoleFromPermissions(member, customRoles);
                return (
                  <div key={member.uid} className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {member.displayName} {member.uid === uid ? '(You)' : ''}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {resolvedMemberRole.label} ·{' '}
                          <span className="font-mono">{member.uid.slice(0, 12)}</span>
                        </div>
                      </div>

                      {canManageSharing && (
                        <div className="flex items-center gap-3 shrink-0">
                          {board.status === 'active' && (
                            <select
                              aria-label={`Role for ${member.displayName}`}
                              value={resolvedMemberRole.selectValue}
                              onChange={(e) => handleMemberRoleSelect(member, e.target.value)}
                              className="px-2.5 py-1 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                            >
                              {renderRoleOptions(resolvedMemberRole.selectValue)}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => revokeBoardAccess(board.id, member.uid)}
                            aria-label={`Revoke access for ${member.displayName}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revoke</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      {PERMISSION_FIELDS.map(({ key, label }) => (
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
                            checked={
                              key === 'canAssignTasks'
                                ? hasAssignPermission(member)
                                : member[key]
                            }
                            onChange={() => handleToggleMemberPerm(member, key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {canManageSharing && pendingMembers.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Pending First Sign-In ({pendingMembers.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Activates automatically when they sign in with Google
                  </span>
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                  {pendingMembers.map((notice) => {
                    const roleLabel =
                      notice.role === 'custom' && notice.customRoleName
                        ? notice.customRoleName
                        : ROLE_PRESETS[notice.role].label;
                    return (
                      <div
                        key={notice.emailHash}
                        className="px-4 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-900 dark:text-slate-100 font-mono truncate">
                            {notice.maskedEmail}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {roleLabel} · Awaiting first sign-in
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => revokePendingBoardInvite(board.id, notice.emailHash)}
                          aria-label={`Revoke pending access for ${notice.maskedEmail}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Board Custom Roles */}
          {(canManageSharing || customRoles.length > 0) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      Board Custom Roles ({customRoles.length}/{LIMITS.BOARD_CUSTOM_ROLES_MAX})
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Define reusable named permission sets. Changing a member&apos;s checkboxes
                    automatically updates their role to match—or switches to Custom.
                  </p>
                </div>
                {canManageSharing &&
                  board.status === 'active' &&
                  customRoles.length < LIMITS.BOARD_CUSTOM_ROLES_MAX && (
                    <button
                      type="button"
                      onClick={() => setShowNewRoleForm((v) => !v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showNewRoleForm ? 'Close' : 'New role'}</span>
                    </button>
                  )}
              </div>

              {showNewRoleForm && canManageSharing && board.status === 'active' && (
                <form
                  onSubmit={handleCreateCustomRole}
                  className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <label htmlFor="custom-role-name-input" className="sr-only">
                      Custom role name
                    </label>
                    <input
                      id="custom-role-name-input"
                      type="text"
                      maxLength={LIMITS.CUSTOM_ROLE_NAME_MAX}
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="Role name (e.g. Triage Lead, Column Moderator)"
                      className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={savingRoles || !newRoleName.trim() || Boolean(newRoleConflict)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      {savingRoles ? 'Saving...' : 'Save role'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {PERMISSION_FIELDS.map(({ key, label }) => (
                      <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(newRolePerms[key])}
                          onChange={(e) =>
                            setNewRolePerms({ ...newRolePerms, [key]: e.target.checked })
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  {newRoleConflict && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">
                      {newRoleConflict}
                    </div>
                  )}
                </form>
              )}

              {customRoles.length > 0 && (
                <ul className="space-y-2">
                  {customRoles.map((cr) => (
                    <li
                      key={cr.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {cr.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {summarizePermissions(cr)}
                        </div>
                      </div>
                      {canManageSharing && board.status === 'active' && (
                        <button
                          type="button"
                          disabled={savingRoles}
                          onClick={() => handleDeleteCustomRole(cr.id, cr.name)}
                          aria-label={`Delete role ${cr.name}`}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Shareable Invite Codes & Links */}
          {canManageSharing && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Board Invite Codes &amp; Links</span>
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Existing users can enter the code directly; new users can open the link
                </span>
              </div>

              {board.status === 'active' && (
                <form
                  onSubmit={handleCreateInvite}
                  className="space-y-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        maxLength={LIMITS.INVITE_LABEL_MAX}
                        value={inviteLabel}
                        onChange={(e) => setInviteLabel(e.target.value)}
                        placeholder="Label (e.g. Period 3)"
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        maxLength={LIMITS.ID_MAX}
                        value={inviteCustomCode}
                        onChange={(e) => setInviteCustomCode(e.target.value.toUpperCase())}
                        placeholder="Code: Auto"
                        aria-label="Custom board invite code (optional)"
                        className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:normal-case placeholder:font-sans"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        aria-label="Invite link role"
                        value={resolvedInviteRole.selectValue}
                        onChange={(e) => handleInviteRoleSelect(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      >
                        {renderRoleOptions(resolvedInviteRole.selectValue)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={creatingInvite}
                        className="w-full px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 disabled:opacity-50 rounded-lg whitespace-nowrap"
                      >
                        {creatingInvite ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {PERMISSION_FIELDS.map(({ key, label }) => (
                      <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={invitePerms[key]}
                          onChange={(e) =>
                            setInvitePerms({ ...invitePerms, [key]: e.target.checked })
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </form>
              )}

              {activeInvites.length > 0 && (
                <ul className="space-y-2">
                  {activeInvites.map((inv) => {
                    const resolvedInvRole = resolveRoleFromPermissions(inv, customRoles);
                    const invRoleLabel =
                      resolvedInvRole.selectValue === 'custom' && inv.customRoleName
                        ? inv.customRoleName
                        : resolvedInvRole.label;
                    const joinUrl = getInviteJoinUrl(inv);
                    const copiedCode = copiedId === `code:${inv.id}`;
                    const copiedLink = copiedId === `link:${inv.id}`;

                    return (
                      <li
                        key={inv.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      >
                        <div className="min-w-0 space-y-0.5">
                          {inv.joinCode && (
                            <div className="font-mono text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">
                              {inv.joinCode}
                            </div>
                          )}
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {inv.label || invRoleLabel} ·{' '}
                            <span className="text-slate-500 dark:text-slate-400">
                              {invRoleLabel}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {summarizePermissions(inv)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {inv.joinCode && (
                            <button
                              type="button"
                              onClick={() => copyInviteText(`code:${inv.id}`, inv.joinCode!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap"
                            >
                              {copiedCode ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied Code</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Code</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyInviteText(`link:${inv.id}`, joinUrl)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors whitespace-nowrap"
                          >
                            {copiedLink ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copied Link</span>
                              </>
                            ) : (
                              <>
                                <Link2 className="w-3 h-3" />
                                <span>Copy Join Link</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeBoardInvite(board.id, inv.id, inv.joinCode)}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                          >
                            Revoke
                          </button>
                        </div>
                      </li>
                    );
                  })}
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

