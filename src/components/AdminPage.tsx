import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Link2,
  MailPlus,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  bulkAddWhitelistEmails,
  createAccessCode,
  deleteAccessCode,
  grantGlobalAdminByEmail,
  removeWhitelistEntry,
  revokeGlobalAdmin,
  setAccessCodeActive,
  setAccessCodeCanCreateBoards,
  setWhitelistEntryActive,
  setWhitelistEntryCanCreateBoards,
  subscribeAccessCodes,
  subscribeAdmins,
  subscribeWhitelist,
  upsertWhitelistEntry,
} from '../lib/kanbanService';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  LIMITS,
  type AccessCode,
  type AdminRecord,
  type WhitelistEntry,
} from '../types/kanban';

interface AdminPageProps {
  uid: string;
  isBootstrapAdmin: boolean;
  totalBoardsCount: number;
  onBackToWorkspace: () => void;
}

export function AdminPage({
  uid,
  isBootstrapAdmin,
  totalBoardsCount,
  onBackToWorkspace,
}: AdminPageProps) {
  // Subscriptions
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);

  // Whitelist add state
  const [entryMode, setEntryMode] = useState<'single' | 'bulk'>('single');
  const [emailInput, setEmailInput] = useState('');
  const [bulkEmailsInput, setBulkEmailsInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [allowBoardCreate, setAllowBoardCreate] = useState(false);
  const [whitelistBusy, setWhitelistBusy] = useState(false);
  const [whitelistFeedback, setWhitelistFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  // Access code generator state
  const [codeLabelInput, setCodeLabelInput] = useState('');
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [codeAllowBoardCreate, setCodeAllowBoardCreate] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Global admin grant state
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsubWhitelist = subscribeWhitelist(setWhitelist);
    const unsubCodes = subscribeAccessCodes(setAccessCodes);
    return () => {
      unsubWhitelist();
      unsubCodes();
    };
  }, []);

  useEffect(() => {
    if (!isBootstrapAdmin) return;
    const unsubAdmins = subscribeAdmins(setAdmins);
    return () => unsubAdmins();
  }, [isBootstrapAdmin]);

  const activeWhitelistCount = useMemo(
    () => whitelist.filter((w) => w.active).length,
    [whitelist]
  );
  const pausedWhitelistCount = useMemo(
    () => whitelist.filter((w) => !w.active).length,
    [whitelist]
  );
  const activeCodesCount = useMemo(
    () => accessCodes.filter((c) => c.active).length,
    [accessCodes]
  );

  const filteredWhitelist = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return whitelist.filter((entry) => {
      if (statusFilter === 'active' && !entry.active) return false;
      if (statusFilter === 'paused' && entry.active) return false;
      if (q) {
        const matchEmail = entry.email.toLowerCase().includes(q);
        const matchLabel = entry.label.toLowerCase().includes(q);
        const matchCode = entry.inviteCode?.toLowerCase().includes(q) ?? false;
        if (!matchEmail && !matchLabel && !matchCode) return false;
      }
      return true;
    });
  }, [whitelist, searchQuery, statusFilter]);

  const handleCopyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => {
      setCopiedId((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  const handleAddSingleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || whitelistBusy) return;
    setWhitelistBusy(true);
    setWhitelistFeedback(null);
    try {
      const res = await upsertWhitelistEntry(uid, emailInput, labelInput, allowBoardCreate);
      setWhitelistFeedback({
        kind: 'success',
        text: res.updatedExisting
          ? `Updated & activated whitelist access for ${res.email}.`
          : `Added ${res.email} to the workspace whitelist.`,
      });
      setEmailInput('');
    } catch (err) {
      setWhitelistFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to add email to whitelist.',
      });
    } finally {
      setWhitelistBusy(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkEmailsInput.trim() || whitelistBusy) return;
    setWhitelistBusy(true);
    setWhitelistFeedback(null);
    try {
      const res = await bulkAddWhitelistEmails(
        uid,
        bulkEmailsInput,
        labelInput,
        allowBoardCreate,
        whitelist
      );
      const parts: string[] = [];
      if (res.added > 0) parts.push(`${res.added} added`);
      if (res.reactivated > 0) parts.push(`${res.reactivated} updated`);
      if (res.invalid.length > 0) {
        parts.push(`${res.invalid.length} skipped invalid (${res.invalid.slice(0, 3).join(', ')})`);
      }
      setWhitelistFeedback({
        kind: res.added === 0 && res.reactivated === 0 && res.invalid.length > 0 ? 'error' : 'success',
        text: parts.length > 0 ? `Whitelist import: ${parts.join(', ')}.` : 'All entered emails are already active.',
      });
      if (res.invalid.length === 0) {
        setBulkEmailsInput('');
      }
    } catch (err) {
      setWhitelistFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Bulk whitelist import failed.',
      });
    } finally {
      setWhitelistBusy(false);
    }
  };

  const handleToggleWhitelistActive = async (entry: WhitelistEntry) => {
    setWhitelistFeedback(null);
    try {
      await setWhitelistEntryActive(entry.email, !entry.active);
    } catch (err) {
      setWhitelistFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to update whitelist status.',
      });
    }
  };

  const handleToggleWhitelistCreateBoards = async (entry: WhitelistEntry) => {
    setWhitelistFeedback(null);
    try {
      await setWhitelistEntryCanCreateBoards(entry.email, !(entry.canCreateBoards === true));
    } catch (err) {
      setWhitelistFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to update board creation permission.',
      });
    }
  };

  const handleRemoveWhitelist = async (entry: WhitelistEntry) => {
    setWhitelistFeedback(null);
    try {
      await removeWhitelistEntry(entry.email);
      setWhitelistFeedback({
        kind: 'success',
        text: `Removed ${entry.email} from the whitelist.`,
      });
    } catch (err) {
      setWhitelistFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to remove whitelist entry.',
      });
    }
  };

  const handleGenerateAccessCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codeBusy) return;
    setCodeBusy(true);
    setCodeFeedback(null);
    try {
      const generatedId = await createAccessCode(
        uid,
        codeLabelInput,
        customCodeInput,
        codeAllowBoardCreate
      );
      setCodeFeedback({
        kind: 'success',
        text: `Created join access code ${generatedId}. Anyone who signs in with it is automatically whitelisted.`,
      });
      setCustomCodeInput('');
      setCodeLabelInput('');
    } catch (err) {
      setCodeFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to create access code.',
      });
    } finally {
      setCodeBusy(false);
    }
  };

  const handleToggleCodeActive = async (code: AccessCode) => {
    setCodeFeedback(null);
    try {
      await setAccessCodeActive(code.id, !code.active);
    } catch (err) {
      setCodeFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to update access code status.',
      });
    }
  };

  const handleToggleCodeCreateBoards = async (code: AccessCode) => {
    setCodeFeedback(null);
    try {
      await setAccessCodeCanCreateBoards(code.id, !(code.canCreateBoards === true));
    } catch (err) {
      setCodeFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to update access code permission.',
      });
    }
  };

  const handleDeleteCode = async (code: AccessCode) => {
    setCodeFeedback(null);
    try {
      await deleteAccessCode(code.id);
    } catch (err) {
      setCodeFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete access code.',
      });
    }
  };

  const handleAddGlobalAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmailInput.trim() || adminBusy) return;
    setAdminBusy(true);
    setAdminFeedback(null);
    try {
      const added = await grantGlobalAdminByEmail(uid, adminEmailInput.trim());
      setAdminFeedback({
        kind: 'success',
        text: `Granted global admin role to ${added.displayName}.`,
      });
      setAdminEmailInput('');
    } catch (err) {
      setAdminFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to add global admin.',
      });
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Boards</span>
            </button>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Workspace Access &amp; Admin
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Control which Google accounts can enter Cadence, issue join codes that auto-whitelist participants, and manage workspace administrators.
            </p>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Whitelisted
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {activeWhitelistCount}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Paused Accounts
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {pausedWhitelistCount}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Active Join Codes
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {activeCodesCount}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Workspace Boards
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {totalBoardsCount}
            </div>
          </div>
        </div>

        {/* Main 2-Column Admin Console */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: Access Whitelist */}
          <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Allowed Emails Whitelist
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Only admins and active whitelisted emails can provision workspaces or write to Firestore.
                  </p>
                </div>
              </div>

              <div
                role="group"
                aria-label="Whitelist add mode"
                className="flex items-center gap-0.5 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setEntryMode('single')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    entryMode === 'single'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Single Email
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('bulk')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    entryMode === 'bulk'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Bulk Paste
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {whitelistFeedback && (
                <div
                  role={whitelistFeedback.kind === 'error' ? 'alert' : 'status'}
                  className={`text-xs rounded-lg px-3.5 py-2.5 border ${
                    whitelistFeedback.kind === 'error'
                      ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
                      : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
                  }`}
                >
                  {whitelistFeedback.text}
                </div>
              )}

              {entryMode === 'single' ? (
                <form onSubmit={handleAddSingleEmail} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-6">
                      <label htmlFor="whitelist-email-input" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Google Email Address
                      </label>
                      <input
                        id="whitelist-email-input"
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="student@orangeusd.org"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <label htmlFor="whitelist-label-input" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Cohort / Note (Optional)
                      </label>
                      <input
                        id="whitelist-label-input"
                        type="text"
                        maxLength={LIMITS.WHITELIST_LABEL_MAX}
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        placeholder="Period 3 · Engineering"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowBoardCreate}
                        onChange={(e) => setAllowBoardCreate(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span>Allow creating new boards</span>
                    </label>
                    <button
                      type="submit"
                      disabled={whitelistBusy || !emailInput.trim()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <MailPlus className="w-3.5 h-3.5" />
                      <span>{whitelistBusy ? 'Saving...' : 'Allow Email'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleBulkImport} className="space-y-3">
                  <div>
                    <label htmlFor="whitelist-bulk-input" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Paste Emails (separated by newlines, commas, or spaces)
                    </label>
                    <textarea
                      id="whitelist-bulk-input"
                      rows={3}
                      value={bulkEmailsInput}
                      onChange={(e) => setBulkEmailsInput(e.target.value)}
                      placeholder={'alice@orangeusd.org\nbob@orangeusd.org, carol@orangeusd.org'}
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                    <div className="flex-1">
                      <label htmlFor="whitelist-bulk-label" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Shared Cohort / Label (Optional)
                      </label>
                      <input
                        id="whitelist-bulk-label"
                        type="text"
                        maxLength={LIMITS.WHITELIST_LABEL_MAX}
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        placeholder="Period 3 Roster"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={whitelistBusy || !bulkEmailsInput.trim()}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <MailPlus className="w-3.5 h-3.5" />
                      <span>{whitelistBusy ? 'Importing...' : 'Import Emails'}</span>
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowBoardCreate}
                      onChange={(e) => setAllowBoardCreate(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Allow imported users to create new boards</span>
                  </label>
                </form>
              )}

              {/* Search + Filter */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search email, label, or join code..."
                    aria-label="Search whitelist"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Filter whitelist status"
                  className="flex items-center gap-0.5 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  {(['all', 'active', 'paused'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                        statusFilter === st
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Whitelist Entries Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
                {/* Permanent Bootstrap Admin Row */}
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs bg-slate-50/70 dark:bg-slate-950/50">
                  <div className="min-w-0">
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                      {BOOTSTRAP_ADMIN_EMAIL}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Active · Bootstrap Workspace Owner
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
                    Permanent
                  </span>
                </div>

                {filteredWhitelist.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    {whitelist.length === 0
                      ? 'No additional emails whitelisted yet. Add emails above or share an access code.'
                      : 'No whitelist entries match your current filter.'}
                  </div>
                ) : (
                  filteredWhitelist.map((entry) => {
                    const canCreate = entry.canCreateBoards === true;
                    return (
                      <div
                        key={entry.email}
                        className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="min-w-0 space-y-0.5 flex-1">
                          <div className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                            {entry.email}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span
                              className={
                                entry.active
                                  ? 'font-medium text-emerald-600 dark:text-emerald-400'
                                  : 'font-medium text-amber-600 dark:text-amber-400'
                              }
                            >
                              {entry.active ? 'Active' : 'Paused'}
                            </span>
                            {entry.label && (
                              <>
                                <span>·</span>
                                <span className="truncate">{entry.label}</span>
                              </>
                            )}
                            {entry.inviteCode && (
                              <>
                                <span>·</span>
                                <span className="font-mono">Code: {entry.inviteCode}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={canCreate}
                              onChange={() => handleToggleWhitelistCreateBoards(entry)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            />
                            <span>Create Boards</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleToggleWhitelistActive(entry)}
                            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                            title={entry.active ? 'Pause access for this user' : 'Resume access'}
                          >
                            {entry.active ? (
                              <>
                                <PauseCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <PlayCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Resume</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveWhitelist(entry)}
                            aria-label={`Remove ${entry.email} from whitelist`}
                            className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Right Column: Join Access Codes + Global Admins */}
          <div className="xl:col-span-5 space-y-6">
            {/* Join Access Codes Generator */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Join Access Codes
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Anyone who signs in with an active code is added to the whitelist automatically.
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {codeFeedback && (
                  <div
                    role={codeFeedback.kind === 'error' ? 'alert' : 'status'}
                    className={`text-xs rounded-lg px-3.5 py-2.5 border ${
                      codeFeedback.kind === 'error'
                        ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
                        : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
                    }`}
                  >
                    {codeFeedback.text}
                  </div>
                )}

                <form onSubmit={handleGenerateAccessCode} className="space-y-3">
                  <div>
                    <label htmlFor="code-label-input" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Cohort / Group Label (Applied on Join)
                    </label>
                    <input
                      id="code-label-input"
                      type="text"
                      maxLength={LIMITS.WHITELIST_LABEL_MAX}
                      value={codeLabelInput}
                      onChange={(e) => setCodeLabelInput(e.target.value)}
                      placeholder="e.g. Period 3 · Spring 2026"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="custom-code-input" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Custom Code (Optional — leave blank to auto-generate)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="custom-code-input"
                        type="text"
                        maxLength={LIMITS.ID_MAX}
                        value={customCodeInput}
                        onChange={(e) => setCustomCodeInput(e.target.value.toUpperCase())}
                        placeholder="Auto (e.g. CAD-8K2M9P)"
                        className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="submit"
                        disabled={codeBusy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{codeBusy ? 'Creating...' : 'Generate Code'}</span>
                      </button>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={codeAllowBoardCreate}
                      onChange={(e) => setCodeAllowBoardCreate(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Allow users joining with this code to create boards</span>
                  </label>
                </form>

                {/* Active/Paused Access Codes List */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {accessCodes.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No join codes generated yet.
                    </div>
                  ) : (
                    accessCodes.map((code) => {
                      const joinUrl =
                        typeof window !== 'undefined'
                          ? `${window.location.origin}${window.location.pathname}?access=${encodeURIComponent(code.id)}`
                          : `?access=${encodeURIComponent(code.id)}`;
                      const copiedCode = copiedId === `code:${code.id}`;
                      const copiedLink = copiedId === `link:${code.id}`;

                      return (
                        <div key={code.id} className="p-3.5 space-y-2 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-mono text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">
                                {code.id}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                <span
                                  className={
                                    code.active
                                      ? 'font-medium text-emerald-600 dark:text-emerald-400'
                                      : 'font-medium text-amber-600 dark:text-amber-400'
                                  }
                                >
                                  {code.active ? 'Active' : 'Paused'}
                                </span>
                                {code.label ? ` · ${code.label}` : ' · No cohort label'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={code.canCreateBoards === true}
                                  onChange={() => handleToggleCodeCreateBoards(code)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                />
                                <span>Create Boards</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleToggleCodeActive(code)}
                                className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                              >
                                {code.active ? 'Pause' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCode(code)}
                                aria-label={`Delete access code ${code.id}`}
                                className="text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleCopyText(`code:${code.id}`, code.id)}
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

                            <button
                              type="button"
                              onClick={() => handleCopyText(`link:${code.id}`, joinUrl)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap"
                            >
                              {copiedLink ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied Link</span>
                                </>
                              ) : (
                                <>
                                  <Link2 className="w-3 h-3" />
                                  <span>Copy Join Link</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            {/* Global Workspace Admins */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Global Workspace Admins
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Global admins can manage access controls and all workspace boards.
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {!isBootstrapAdmin ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    You have active global admin privileges. Only the primary workspace owner ({BOOTSTRAP_ADMIN_EMAIL}) can list, promote, or revoke global admins.
                  </p>
                ) : (
                  <>
                    {adminFeedback && (
                      <div
                        role={adminFeedback.kind === 'error' ? 'alert' : 'status'}
                        className={`text-xs rounded-lg px-3.5 py-2.5 border ${
                          adminFeedback.kind === 'error'
                            ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
                            : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
                        }`}
                      >
                        {adminFeedback.text}
                      </div>
                    )}

                    <form onSubmit={handleAddGlobalAdmin} className="space-y-2">
                      <label htmlFor="global-admin-email-input" className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Grant Global Admin by Email (must have signed in once)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="global-admin-email-input"
                          type="email"
                          value={adminEmailInput}
                          onChange={(e) => setAdminEmailInput(e.target.value)}
                          placeholder="co-instructor@orangeusd.org"
                          className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="submit"
                          disabled={adminBusy || !adminEmailInput.trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{adminBusy ? 'Adding...' : 'Add Admin'}</span>
                        </button>
                      </div>
                    </form>

                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                      <div className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {BOOTSTRAP_ADMIN_EMAIL}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Bootstrap owner
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                          Permanent
                        </span>
                      </div>

                      {admins.map((adm) => (
                        <div key={adm.uid} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {adm.displayName}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {adm.uid}
                            </div>
                          </div>
                          {adm.uid !== uid && (
                            <button
                              type="button"
                              onClick={() => revokeGlobalAdmin(adm.uid)}
                              className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline whitespace-nowrap shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
