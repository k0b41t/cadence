import { useEffect, useState } from 'react';
import { Info, UserPlus, X } from 'lucide-react';
import { bulkAddWhitelistByCreator } from '../lib/kanbanService';
import { LIMITS } from '../types/kanban';

interface AddUsersModalProps {
  uid: string;
  onClose: () => void;
}

export function AddUsersModal({ uid, onClose }: AddUsersModalProps) {
  const [entryMode, setEntryMode] = useState<'single' | 'bulk'>('bulk');
  const [singleEmail, setSingleEmail] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const rawText = entryMode === 'single' ? singleEmail.trim() : bulkEmails.trim();
    if (!rawText) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await bulkAddWhitelistByCreator(uid, rawText, label);
      const parts: string[] = [];
      if (res.added > 0) {
        parts.push(`${res.added} ${res.added === 1 ? 'user added' : 'users added'}`);
      }
      if (res.alreadyActive > 0) {
        parts.push(`${res.alreadyActive} already active`);
      }
      if (res.paused > 0) {
        parts.push(`${res.paused} paused by admin (unchanged)`);
      }
      if (res.invalid.length > 0) {
        parts.push(
          `${res.invalid.length} invalid (${res.invalid.slice(0, 3).join(', ')})`
        );
      }

      const isPureFailure = res.added === 0 && res.alreadyActive === 0 && (res.invalid.length > 0 || res.paused > 0);
      setFeedback({
        kind: isPureFailure ? 'error' : 'success',
        text:
          parts.length > 0
            ? `${parts.join(' · ')}.`
            : 'No new emails found.',
      });

      if (res.added > 0 && res.invalid.length === 0) {
        if (entryMode === 'single') {
          setSingleEmail('');
        } else {
          setBulkEmails('');
        }
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to add users to workspace.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hasInput = entryMode === 'single' ? Boolean(singleEmail.trim()) : Boolean(bulkEmails.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-users-heading"
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2
              id="add-users-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Add Workspace Users
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Users you add can sign in and join shared Boards, but they{' '}
              <span className="font-semibold">cannot create their own Boards</span>. Only an
              administrator can grant Board creation permissions.
            </p>
          </div>

          {feedback && (
            <div
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              className={`text-xs rounded-lg px-3.5 py-2.5 border ${
                feedback.kind === 'error'
                  ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
                  : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Entry Mode
            </span>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setEntryMode('single')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  entryMode === 'single'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Single Email
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('bulk')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  entryMode === 'bulk'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Bulk Paste
              </button>
            </div>
          </div>

          {entryMode === 'single' ? (
            <div className="space-y-1.5">
              <label
                htmlFor="creator-add-single-email"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Google Email Address
              </label>
              <input
                id="creator-add-single-email"
                type="email"
                autoFocus
                required
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                placeholder="student@example.org"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="creator-add-bulk-emails"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Email Addresses (one per line, comma, or semicolon separated)
              </label>
              <textarea
                id="creator-add-bulk-emails"
                rows={4}
                autoFocus
                required
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.target.value)}
                placeholder={'student1@example.org\nstudent2@example.org, student3@example.org'}
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="creator-add-label"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Group / Roster Label (optional)
            </label>
            <input
              id="creator-add-label"
              type="text"
              maxLength={LIMITS.WHITELIST_LABEL_MAX}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Period 3, Robotics Team"
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg whitespace-nowrap"
            >
              Done
            </button>
            <button
              type="submit"
              disabled={submitting || !hasInput}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {submitting ? 'Adding...' : entryMode === 'single' ? 'Add User' : 'Add Users'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
