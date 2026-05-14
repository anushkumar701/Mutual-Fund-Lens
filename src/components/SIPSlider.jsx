// components/SIPSlider.jsx
import { formatINR } from '../utils/formatCurrency';

export default function SIPSlider({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix = '',
  suffix = '',
  formatFn,
}) {
  const display = formatFn ? formatFn(value) : `${prefix}${Number(value).toLocaleString('en-IN')}${suffix}`;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <span className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-3 py-1 rounded-lg">
          {display}
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none bg-slate-200 dark:bg-slate-700 accent-blue-600 cursor-pointer"
          style={{
            background: `linear-gradient(to right, #2563eb ${pct}%, ${
              document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0'
            } ${pct}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>{prefix}{Number(min).toLocaleString('en-IN')}{suffix}</span>
        <span>{prefix}{Number(max).toLocaleString('en-IN')}{suffix}</span>
      </div>
    </div>
  );
}
