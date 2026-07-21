// components/SIPSlider.jsx
import { useState } from "react";

// accent='orange' → FIRE calculator orange styling
// accent unset / default → standard blue styling
export default function SIPSlider({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix = "",
  suffix = "",
  formatFn,
  accent,
}) {
  const [inputVal, setInputVal] = useState("");
  const [editing, setEditing] = useState(false);

  const isOrange = accent === "orange";

  const display = formatFn
    ? formatFn(value)
    : `${prefix}${Number(value).toLocaleString("en-IN")}${suffix}`;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleInputBlur = () => {
    setEditing(false);
    let num = Number(inputVal.replace(/,/g, ""));
    if (!isNaN(num)) {
      num = Math.max(min, Math.min(max, num));
      onChange(num);
    }
    setInputVal("");
  };

  const valueColor = isOrange
    ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 hover:bg-orange-100 dark:hover:bg-orange-900 hover:border-orange-300"
    : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 hover:border-blue-300";

  const inputColor = isOrange
    ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border-orange-400"
    : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-400";

  const labelSize = isOrange ? "text-xs" : "text-sm";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={`${labelSize} font-semibold text-slate-700 dark:text-slate-300 flex-1`}
        >
          {label}
        </label>
        {editing ? (
          <input
            autoFocus
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInputBlur();
              if (e.key === "Escape") {
                setEditing(false);
                setInputVal("");
              }
            }}
            className={`text-sm font-bold tabular-nums border-2 px-2 py-1 rounded-lg w-32 text-right focus:outline-none ${inputColor}`}
            placeholder={String(value)}
          />
        ) : (
          <button
            onClick={() => {
              setEditing(true);
              setInputVal(String(value));
            }}
            title="Click to type a value"
            className={`text-sm font-bold tabular-nums px-3 py-1 rounded-lg transition-all cursor-text border border-transparent ${valueColor}`}
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
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full h-2 rounded-full appearance-none cursor-pointer ${isOrange ? "range-slider-orange" : "range-slider"}`}
          style={{ "--range-pct": `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-500">
        <span>
          {prefix}
          {Number(min).toLocaleString("en-IN")}
          {suffix}
        </span>
        <span className="text-[10px] text-slate-300 dark:text-slate-600">
          click value to type
        </span>
        <span>
          {prefix}
          {Number(max).toLocaleString("en-IN")}
          {suffix}
        </span>
      </div>
    </div>
  );
}
