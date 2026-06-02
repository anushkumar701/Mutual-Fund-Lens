import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
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
          </div>
          <button
            className="btn-primary px-6 py-3"
            onClick={() => window.location.reload()}
          >
            🔄 Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
