// components/SIPSlider.jsx
import { useState } from 'react';

// eslint-disable-next-line react/prop-types
export default function SIPSlider({
  id, label, value, onChange, min, max, step = 1, prefix = '', suffix = '', formatFn,
}) {
  const [inputVal, setInputVal] = useState('');
  const [editing, setEditing] = useState(false);
  const display = formatFn ? formatFn(value) : `${prefix}${Number(value).toLocaleString('en-IN')}${suffix}`;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const isDark = document.documentElement.classList.contains('dark');

  const handleInputBlur = () => {
    setEditing(false);
    const num = Number(inputVal.replace(/,/g, ''));
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    }
    setInputVal('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex-1">
          {label}
        </label>
        {editing ? (
          <input
            autoFocus
            type="number"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={e => { if (e.key === 'Enter') handleInputBlur(); if (e.key === 'Escape') { setEditing(false); setInputVal(''); } }}
            className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-2 border-blue-400 px-2 py-1 rounded-lg w-32 text-right focus:outline-none"
            placeholder={String(value)}
          />
        ) : (
          <button
            onClick={() => { setEditing(true); setInputVal(String(value)); }}
            title="Click to type a value"
            className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 px-3 py-1 rounded-lg transition-all cursor-text border border-transparent hover:border-blue-300"
          >
            {display} ✎
          </button>
        )}
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #2563eb ${pct}%, ${isDark ? '#334155' : '#e2e8f0'} ${pct}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500">
        <span>{prefix}{Number(min).toLocaleString('en-IN')}{suffix}</span>
        <span className="text-[10px] text-slate-300 dark:text-slate-600">click value to type</span>
        <span>{prefix}{Number(max).toLocaleString('en-IN')}{suffix}</span>
      </div>
    </div>
  );
}
