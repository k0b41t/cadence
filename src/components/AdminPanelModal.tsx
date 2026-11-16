import { useEffect, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import {
  grantGlobalAdminByEmail,
  revokeGlobalAdmin,
  subscribeAdmins,
} from '../lib/kanbanService';
import { BOOTSTRAP_ADMIN_EMAIL, type AdminRecord } from '../types/kanban';

interface AdminPanelModalProps {
  uid: string;
  isBootstrapAdmin: boolean;
  totalBoardsCount: number;
  onClose: () => void;
}

export function AdminPanelModal({
  uid,
  isBootstrapAdmin,
  totalBoardsCount,
  onClose,
}: AdminPanelModalProps) {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isBootstrapAdmin) return;
    const unsub = subscribeAdmins(setAdmins);
    return () => unsub();
  }, [isBootstrapAdmin]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const added = await grantGlobalAdminByEmail(uid, emailInput.trim());
      setSuccessMsg(`Granted global admin role to ${added.displayName}.`);
      setEmailInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add admin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-panel-heading"
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 id="admin-panel-heading" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Workspace Admin Controls
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

        <div className="p-6 space-y-5">
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Global Admin Access Active
            </div>
            <p className="tabular-nums">
              Admins automatically have full read and write access to all {totalBoardsCount} boards across the workspace.
            </p>
          </div>

          {errorMsg && (
            <div role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3.5 py-2.5">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleAddAdmin} className="space-y-2.5">
            <label htmlFor="admin-email-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Grant Global Admin by Email
            </label>
            <div className="flex items-center gap-2">
              <input
                id="admin-email-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="admin-user@example.com"
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={submitting || !emailInput.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{submitting ? 'Adding...' : 'Add Admin'}</span>
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Registered Global Admins
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
              <div className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Primary Admin ({BOOTSTRAP_ADMIN_EMAIL})
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">Bootstrap owner</div>
                </div>
                <span className="font-medium text-blue-600 dark:text-blue-400">Permanent</span>
              </div>

              {admins.map((adm) => (
                <div key={adm.uid} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {adm.displayName}
                    </div>
                    <div className="font-mono text-slate-500 dark:text-slate-400 truncate">
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
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/70 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
