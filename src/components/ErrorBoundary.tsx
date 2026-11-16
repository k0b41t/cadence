import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { firebaseProjectId, firestoreDatabaseId } from '../lib/firebase';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  isQuotaError: boolean;
  isFreeTierReadQuota: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
    isQuotaError: false,
    isFreeTierReadQuota: false,
  };

  static getDerivedStateFromError(error: Error): State {
    const raw = error?.message || 'An unexpected error occurred.';
    const isQuotaError = raw.includes('Quota exceeded');
    const isFreeTierReadQuota = raw.includes(
      "Quota exceeded for quota metric 'Free daily read units per project (free tier database)'"
    );

    let friendly = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        friendly = `${parsed.error} (${parsed.operationType} on ${parsed.path ?? 'unknown path'})`;
      }
    } catch {
      // keep raw message
    }

    return {
      hasError: true,
      errorMessage: friendly,
      isQuotaError,
      isFreeTierReadQuota,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught application error:', error, info);
  }

  handleReload = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
      isQuotaError: false,
      isFreeTierReadQuota: false,
    });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/firestore/databases/${firestoreDatabaseId}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {this.state.isQuotaError ? 'Firestore daily quota reached' : 'Workspace sync interrupted'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {this.state.isQuotaError
                  ? 'Your Firebase Firestore free-tier daily quota has been exceeded. Quota resets automatically the next day, or you can review plan limits under the Spark Enterprise edition.'
                  : this.state.errorMessage}
              </p>
            </div>
          </div>

          {this.state.isFreeTierReadQuota && (
            <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <span>Upgrade or inspect database usage in Firebase Console: </span>
              <a
                href={upgradeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 dark:text-blue-400 underline break-all"
              >
                {upgradeUrl}
              </a>
            </div>
          )}

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }
}
