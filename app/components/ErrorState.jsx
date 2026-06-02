export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Something went wrong</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
        {message || 'Unable to load data. Please check your connection and try again.'}
      </p>
      {onRetry && (
        <button id="retry-btn" onClick={onRetry} className="btn-primary">
          Try Again
        </button>
      )}
    </div>
  );
}
