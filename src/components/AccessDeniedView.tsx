import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  BookOpen,
  Cog,
  KeyRound,
  LogOut,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import { redeemAccessCode } from '../lib/kanbanService';
import type { ThemeMode } from '../types/kanban';
import { DocsModal } from './DocsModal';

interface AccessDeniedViewProps {
  user: User;
  suspended: boolean;
  initialAccessCode?: string | null;
  initialError?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenThemeSettings: () => void;
  onAccessGranted: () => Promise<void>;
  onRecheckAccess: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function AccessDeniedView({
  user,
  suspended,
  initialAccessCode = null,
  initialError = null,
  theme,
  onToggleTheme,
  onOpenThemeSettings,
  onAccessGranted,
  onRecheckAccess,
  onSignOut,
}: AccessDeniedViewProps) {
  const [codeInput, setCodeInput] = useState(initialAccessCode ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    if (initialAccessCode) {
      setCodeInput(initialAccessCode);
    }
  }, [initialAccessCode]);

  useEffect(() => {
    if (initialError) {
      setErrorMsg(initialError);
    }
  }, [initialError]);

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim() || submitting || suspended) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await redeemAccessCode(user, codeInput);
      await onAccessGranted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to redeem access code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecheck = async () => {
    if (rechecking) return;
    setRechecking(true);
    setErrorMsg(null);
    try {
      await onRecheckAccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to verify access status.');
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="flex items-center justify-between gap-6 px-6 lg:px-10 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          Cadence
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setDocsOpen(true)}
            aria-label="Open Cadence build documentation"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Docs</span>
          </button>

          <button
            type="button"
            onClick={onOpenThemeSettings}
            aria-label="Appearance and color palette settings"
            title="Appearance & Color Palette"
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <Cog className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              void onSignOut();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{suspended ? 'Workspace Access Paused' : 'Whitelist Approval Required'}</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {suspended ? 'Your access is currently paused' : 'This workspace is invite-only'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Signed in as{' '}
              <span className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                {user.email || 'Unknown email'}
              </span>
              .{' '}
              {suspended
                ? 'An administrator has paused access for your email address. Reach out to your instructor or workspace admin to re-activate your account.'
                : 'Your email is not on the workspace whitelist yet. Enter an admin-issued access code below to join automatically, or ask an administrator to whitelist your address.'}
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3"
            >
              {errorMsg}
            </div>
          )}

          {!suspended && (
            <form onSubmit={handleRedeemCode} className="space-y-3 pt-1">
              <label
                htmlFor="workspace-access-code"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Join with Access Code
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="workspace-access-code"
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. CAD-8K2M9P"
                    autoComplete="off"
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono uppercase bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !codeInput.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{submitting ? 'Joining...' : 'Join Workspace'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Redeeming a valid code adds your verified Google email to the whitelist immediately.
              </p>
            </form>
          )}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleRecheck}
              disabled={rechecking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
              <span>{rechecking ? 'Checking...' : 'Recheck Access'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void onSignOut();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch Google account</span>
            </button>
          </div>
        </div>
      </main>

      {docsOpen && <DocsModal onClose={() => setDocsOpen(false)} />}
    </div>
  );
}
