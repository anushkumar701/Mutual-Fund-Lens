// components/ErrorBoundary.jsx
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null, eventId: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console for local debugging
    console.error('[ErrorBoundary] Uncaught React error:', error, errorInfo);

    // Log to Sentry if available (loaded asynchronously in main.jsx)
    try {
      import('@sentry/react').then((Sentry) => {
        const eventId = Sentry.captureException(error, {
          extra: {
            componentStack: errorInfo?.componentStack,
            errorBoundary: this.constructor.name,
          },
        });
        this.setState({ eventId });
      }).catch(() => {/* Sentry not configured — safe to ignore */});
    } catch {/* no-op */}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-slate-50 dark:bg-[#0d1117]">
          <div className="text-6xl">⚠️</div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Something went wrong</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">
              An unexpected error occurred. Please reload the page to continue.
            </p>
            {this.state.eventId && (
              <p className="text-xs text-slate-400 mt-2">Error ID: {this.state.eventId}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              className="btn-primary px-6 py-3"
              onClick={() => window.location.reload()}
            >
              🔄 Reload App
            </button>
            <button
              className="btn-secondary px-6 py-3"
              onClick={() => this.setState({ hasError: false, error: null, eventId: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
