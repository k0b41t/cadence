import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, CheckSquare, Columns3, Moon, Sun } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import type { ThemeMode } from '../types/kanban';

interface SignInViewProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export function SignInView({ theme, onToggleTheme }: SignInViewProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to complete Google sign-in. Please allow popups and try again.';
      setAuthError(msg);
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          Cadence
        </span>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a href="#workflow" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
            Workflow
          </a>
          <a href="#persistence" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
            Sync
          </a>
        </nav>
        <div className="flex items-center gap-3 shrink-0">
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
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12 lg:py-16">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left column: Value prop + Sign In CTA */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-wide">
                Kanban Workspace
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.12] text-balance">
                Organize every sprint with real-time clarity.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
                Manage boards, custom workflow columns, WIP limits, checklists, and drag-and-drop priorities backed directly by Cloud Firestore.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3"
              >
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="inline-flex items-center gap-2.5 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span>{signingIn ? 'Connecting with Google...' : 'Continue with Google'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Verified Google account required
              </span>
            </div>

            <div id="workflow" className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Columns3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Structured Columns</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Reorder lanes, enforce WIP limits, and drag tasks seamlessly across stages.
                </p>
              </div>
              <div id="persistence" className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Instant Firestore Sync</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Boards, subtasks, tags, and preferences persist securely per user in real time.
                </p>
              </div>
            </div>
          </div>

          {/* Right column: Clean board preview mockup */}
          <div className="lg:col-span-6 flex items-stretch">
            <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Product Launch
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  3 columns · 5 tasks
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Backlog</span>
                    <span className="font-mono tabular-nums text-slate-400">2</span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      Finalize onboarding checklist
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Medium · docs
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      Review keyboard navigation
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Low · accessibility
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>In Progress</span>
                    <span className="font-mono tabular-nums text-slate-400">2 / 4</span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      Audit Firestore security rules
                    </div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                      High · Nov 22
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      Ship drag-and-drop sorting
                    </div>
                    <div className="text-[11px] text-red-600 dark:text-red-400 tabular-nums">
                      Urgent · release
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Done</span>
                    <span className="font-mono tabular-nums text-slate-400">1</span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2.5 space-y-1.5 opacity-80">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 line-through">
                      Configure Firebase Auth
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                      Completed
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
