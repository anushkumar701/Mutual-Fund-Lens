// components/GlossaryCard.jsx
export default function GlossaryCard({ term, definition, emoji }) {
  return (
    <div className="flex-shrink-0 w-48 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 border border-blue-100 dark:border-slate-600 transition-all hover:scale-105">
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">{term}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{definition}</div>
    </div>
  );
}
