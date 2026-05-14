// components/EmptyState.jsx
export default function EmptyState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
        {title || 'No results found'}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        {subtitle || 'Try adjusting your search or filters.'}
      </p>
    </div>
  );
}
