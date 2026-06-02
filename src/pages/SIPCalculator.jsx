// pages/SIPCalculator.jsx
import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import SIPSlider from '../components/SIPSlider';
import { calculateSIP, calculateLumpsum, adjustForInflation, calculateGoalSIP, calculateELSSTaxSaving, calculateSWP } from '../utils/sipCalculations';
import { formatINR } from '../utils/formatCurrency';

function ResultCard({ label, value, accent, sub }) {
  return (
    <div className={`card p-5 text-center ${accent ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950' : ''}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// Dark-mode-safe custom tooltip for recharts
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-4 py-3 text-xs">
      <p className="font-bold text-slate-700 dark:text-slate-300 mb-2">Year {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-6 mb-1">
          <span style={{ color: entry.color }} className="font-medium">{entry.name}</span>
          <span className="font-bold text-slate-900 dark:text-white">{formatINR(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function FIRESlider({ id, label, value, onChange, min, max, step = 1, prefix = '', suffix = '', formatFn }) {
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
        <label htmlFor={id} className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1">
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
            className="text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border-2 border-orange-400 px-2 py-0.5 rounded-lg w-28 text-right focus:outline-none"
            placeholder={String(value)}
          />
        ) : (
          <button
            onClick={() => { setEditing(true); setInputVal(String(value)); }}
            title="Click to type a value"
            className="text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 hover:bg-orange-100 dark:hover:bg-orange-900 px-3 py-1 rounded-lg transition-all cursor-text border border-transparent hover:border-orange-300"
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
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-orange-500"
          style={{
            background: `linear-gradient(to right, #ea580c ${pct}%, ${isDark ? '#334155' : '#e2e8f0'} ${pct}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{prefix}{Number(min).toLocaleString('en-IN')}{suffix}</span>
        <span className="text-[9px] text-slate-300 dark:text-slate-600">click value to type</span>
        <span>{prefix}{Number(max).toLocaleString('en-IN')}{suffix}</span>
      </div>
    </div>
  );
}

export default function SIPCalculator() {
  const [isLumpsum, setIsLumpsum] = useState(false);
  const [inflationMode, setInflationMode] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [pageTab, setPageTab] = useState('calc'); // 'calc' | 'goal' | 'elss'
  const [amount, setAmount] = useState(5000);
  const [years, setYears] = useState(10);
  const [returns, setReturns] = useState(12);
  const [stepUp, setStepUp] = useState(0);
  const [inflation, setInflation] = useState(6);
  const [expenseRatio, setExpenseRatio] = useState(0.5); // Expense ratio in % p.a.
  // Goal Calculator state
  const [goalTarget, setGoalTarget] = useState(5000000);
  const [goalYears, setGoalYears] = useState(10);
  const [goalReturn, setGoalReturn] = useState(12);
  // ELSS state
  const [elssAmount, setElssAmount] = useState(150000);
  const [taxSlab, setTaxSlab] = useState(30);
  // SWP state
  const [swpInvestment, setSwpInvestment] = useState(1000000);
  const [swpWithdrawal, setSwpWithdrawal] = useState(10000);
  const [swpReturn, setSwpReturn] = useState(8);
  const [swpYears, setSwpYears] = useState(10);
  const [swpShowTable, setSwpShowTable] = useState(false);
  // FIRE state
  const [fireMonthlyExpense, setFireMonthlyExpense] = useState(50000);
  const [fireCurrentAge, setFireCurrentAge] = useState(28);
  const [fireRetireAge, setFireRetireAge] = useState(45);
  const [fireReturnRate, setFireReturnRate] = useState(12);
  const [fireWithdrawalRate, setFireWithdrawalRate] = useState(4);
  const [fireCurrentCorpus, setFireCurrentCorpus] = useState(500000);
  const [fireInflation, setFireInflation] = useState(6);

  const effectiveReturn = Math.max(0, returns - expenseRatio);
  const effectiveReturnWarning = expenseRatio > 0 && effectiveReturn === 0;

  const result = useMemo(() => {
    if (isLumpsum) return calculateLumpsum(amount, years, effectiveReturn);
    return calculateSIP(amount, years, effectiveReturn, stepUp);
  }, [isLumpsum, amount, years, effectiveReturn, stepUp]);

  const realValue = useMemo(() => {
    if (!inflationMode) return null;
    return adjustForInflation(result.maturity, inflation, years);
  }, [inflationMode, result.maturity, inflation, years]);

  const wealthMultiple = result.invested > 0
    ? (result.maturity / result.invested).toFixed(2)
    : '—';

  const goalSIP = useMemo(() => calculateGoalSIP(goalTarget, goalYears, goalReturn), [goalTarget, goalYears, goalReturn]);
  const goalTotal = goalSIP * goalYears * 12;
  const elssResult = useMemo(() => calculateELSSTaxSaving(elssAmount, taxSlab), [elssAmount, taxSlab]);
  const swpResult = useMemo(() => calculateSWP(swpInvestment, swpWithdrawal, swpReturn, swpYears), [swpInvestment, swpWithdrawal, swpReturn, swpYears]);

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SIP Calculator</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Estimate returns, plan your goal, save tax with ELSS, and structure SWP withdrawals</p>
        </div>

        {/* Page Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 overflow-x-auto no-scrollbar">
          {[['calc','📈 SIP / Lumpsum'],['swp','💸 SWP'],['goal','🎯 Goal'],['elss','🧾 ELSS Tax'],['fire','🔥 FIRE']].map(([id, label]) => (
            <button key={id} onClick={() => setPageTab(id)}
              className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${pageTab === id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ─ SIP / LUMPSUM ─ */}
        {pageTab === 'calc' && (
        <div className="grid lg:grid-cols-[420px,1fr] gap-6">
          {/* Left: Controls */}
          <div className="space-y-5">
            {/* Mode toggles */}
            <div className="card p-4 flex flex-col gap-3">
              {/* SIP / Lumpsum toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Investment Mode</span>
                <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5">
                  <button
                    id="mode-sip"
                    onClick={() => setIsLumpsum(false)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      !isLumpsum ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    SIP
                  </button>
                  <button
                    id="mode-lumpsum"
                    onClick={() => setIsLumpsum(true)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      isLumpsum ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Lumpsum
                  </button>
                </div>
              </div>

              {/* Inflation toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Inflation-Adjusted</span>
                <button
                  id="inflation-toggle"
                  onClick={() => setInflationMode(!inflationMode)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    inflationMode ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    inflationMode ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Sliders */}
            <div className="card p-5 space-y-6">
              <div className="space-y-3">
                <SIPSlider
                  id="amount-slider"
                  label={isLumpsum ? 'One-time Investment' : 'Monthly SIP Amount'}
                  value={amount}
                  onChange={setAmount}
                  min={isLumpsum ? 1000 : 500}
                  max={isLumpsum ? 5000000 : 100000}
                  step={isLumpsum ? 1000 : 500}
                  prefix="₹"
                  formatFn={(v) => formatINR(v)}
                />
                {/* Presets */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(isLumpsum
                    ? [10000, 50000, 100000, 500000]
                    : [1000, 5000, 10000, 25000]
                  ).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAmount(preset)}
                      className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        amount === preset
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset >= 100000 ? `₹${preset / 100000}L` : `₹${preset / 1000}K`}
                    </button>
                  ))}
                </div>
              </div>
              <SIPSlider
                id="years-slider"
                label="Investment Duration"
                value={years}
                onChange={setYears}
                min={1}
                max={30}
                suffix=" yr"
              />
              <SIPSlider
                id="return-slider"
                label="Expected Annual Return"
                value={returns}
                onChange={setReturns}
                min={1}
                max={30}
                step={0.5}
                suffix="%"
              />
              <SIPSlider
                id="expense-ratio-slider"
                label="Expense Ratio"
                value={expenseRatio}
                onChange={setExpenseRatio}
                min={0}
                max={3}
                step={0.05}
                suffix="%"
              />
              {expenseRatio > 0 && (
                <div className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${
                  effectiveReturnWarning
                    ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
                    : 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800'
                }`}>
                  <span className={effectiveReturnWarning ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}>
                    {effectiveReturnWarning ? '🚫 Expense ratio cancels all returns!' : '⚠️ Effective Return'}
                  </span>
                  <span className={`font-bold ${effectiveReturnWarning ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                    {returns}% − {expenseRatio}% = <strong>{effectiveReturn.toFixed(2)}%</strong> p.a.
                  </span>
                </div>
              )}
              {!isLumpsum && (
                <SIPSlider
                  id="stepup-slider"
                  label="Annual Step-Up"
                  value={stepUp}
                  onChange={setStepUp}
                  min={0}
                  max={25}
                  suffix="%"
                />
              )}
              {inflationMode && (
                <SIPSlider
                  id="inflation-slider"
                  label="Inflation Rate"
                  value={inflation}
                  onChange={setInflation}
                  min={1}
                  max={10}
                  suffix="%"
                />
              )}
            </div>
          </div>

          {/* Right: Results */}
          <div className="space-y-5">
            {/* Result cards */}
            <div className="grid grid-cols-2 gap-3">
              <ResultCard label="Total Invested" value={formatINR(result.invested)} />
              <ResultCard label="Estimated Returns" value={formatINR(result.returns)} />
              <ResultCard
                label="Maturity Value"
                value={formatINR(result.maturity)}
                accent
                sub={`${wealthMultiple}× wealth multiple`}
              />
              {inflationMode && realValue !== null && (
                <ResultCard
                  label={`Real Value (at ${inflation}% inflation)`}
                  value={formatINR(realValue)}
                  sub="Inflation-adjusted"
                />
              )}
            </div>

            {/* Wealth Multiple & FD Equivalent insight strip */}
            <div className="card p-4 space-y-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 border-emerald-100 dark:border-emerald-800">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">What this means</p>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {wealthMultiple}×
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Your money grew {wealthMultiple} times in {years} year{years > 1 ? 's' : ''}.
                  </p>
                </div>
              </div>
              <div className="border-t border-emerald-200/50 dark:border-emerald-800/50 pt-3">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">Equivalent fixed deposit rate:</span>{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {result.invested > 0 ? (((Math.pow(result.maturity / result.invested, 1 / years) - 1) * 100).toFixed(2)) : 0}% p.a.
                  </span>
                </p>
              </div>
            </div>

            {/* Growth Chart */}
            <div className="card p-5">
              <h2 className="font-bold text-slate-900 dark:text-white mb-4">Growth Over Time</h2>
              <ResponsiveContainer width="100%" height={220} className="sm:!h-[280px]">
                <AreaChart data={result.yearlyData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="investedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="returnsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `Yr ${v}`}
                    stroke="rgba(148,163,184,0.5)"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    stroke="rgba(148,163,184,0.5)"
                    tickFormatter={(v) => {
                      if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
                      if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
                      return `₹${(v / 1000).toFixed(0)}K`;
                    }}
                    width={65}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Area
                    type="monotone"
                    dataKey="baseInvested"
                    stackId="1"
                    name="Base SIP"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="#3b82f6"
                    fillOpacity={0.6}
                  />
                  {!isLumpsum && stepUp > 0 && (
                    <Area
                      type="monotone"
                      dataKey="stepUpInvested"
                      stackId="1"
                      name="Step-Up Extra"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="#a78bfa"
                      fillOpacity={0.6}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="returns"
                    stackId="1"
                    name="Wealth Generated"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="#34d399"
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Year-by-Year Breakdown */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowTable(!showTable)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <span className="font-bold text-slate-900 dark:text-white text-sm">📋 {showTable ? 'Hide Breakdown ▲' : 'Show Year-by-Year Breakdown ▼'}</span>
              </button>
              {showTable && (
                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
                  <div className="min-w-[500px] max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider shadow-sm">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Year</th>
                          <th className="px-4 py-3 text-right font-semibold">SIP Amount That Year (₹)</th>
                          <th className="px-4 py-3 text-right font-semibold">Total Invested So Far (₹)</th>
                          <th className="px-4 py-3 text-right font-semibold">Estimated Portfolio Value (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {result.yearlyData.map((row, index) => {
                          const prevInvested = index > 0 ? result.yearlyData[index - 1].invested : 0;
                          const yearlyInvested = row.invested - prevInvested;
                          return (
                            <tr key={row.year} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Yr {row.year}</td>
                              <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{formatINR(yearlyInvested)}</td>
                              <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{formatINR(row.invested)}</td>
                              <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white tabular-nums">{formatINR(row.value)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <strong>Disclaimer:</strong> Estimated returns are based on assumed rates and are not guaranteed.
                  Past performance does not indicate future results. Please consult a SEBI-registered financial advisor
                  before investing.
                </p>
              </div>
            </div>
          </div>
        </div>
        )} {/* end pageTab === 'calc' */}

        {/* ─ SYSTEMATIC WITHDRAWAL PLAN (SWP) ─ */}
        {pageTab === 'swp' && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            {/* Left Column: Controls */}
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white mb-1">💸 Systematic Withdrawal Plan (SWP)</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Calculate how much regular income you can withdraw from your lump sum corpus and how long it will last.</p>
              </div>

              <SIPSlider
                id="swp-investment"
                label="Total Investment (Initial Corpus)"
                value={swpInvestment}
                onChange={setSwpInvestment}
                min={50000}
                max={100000000}
                step={50000}
                prefix="₹"
                formatFn={(v) => formatINR(v)}
              />

              {/* Quick Presets for Investment */}
              <div className="flex flex-wrap gap-2">
                {[500000, 1000000, 5000000, 10000000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setSwpInvestment(preset)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${
                      swpInvestment === preset
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {preset >= 10000000 ? `₹${preset / 10000000}Cr` : `₹${preset / 100000}L`}
                  </button>
                ))}
              </div>

              <SIPSlider
                id="swp-withdrawal"
                label="Monthly Withdrawal Amount"
                value={swpWithdrawal}
                onChange={setSwpWithdrawal}
                min={1000}
                max={1000000}
                step={1000}
                prefix="₹"
                formatFn={(v) => formatINR(v)}
              />

              {/* Safe Withdrawal Presets (e.g. 0.5%, 0.8%, 1% monthly) */}
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Recommended monthly withdrawal: </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatINR(Math.round(swpInvestment * 0.005))} - {formatINR(Math.round(swpInvestment * 0.008))}
                </span> (0.5% - 0.8% of corpus)
              </div>

              <SIPSlider
                id="swp-return"
                label="Expected Annual Return"
                value={swpReturn}
                onChange={setSwpReturn}
                min={1}
                max={30}
                step={0.5}
                suffix="%"
              />

              <SIPSlider
                id="swp-years"
                label="Withdrawal Duration"
                value={swpYears}
                onChange={setSwpYears}
                min={1}
                max={40}
                step={1}
                suffix=" yr"
              />
            </div>

            {/* Right Column: Results */}
            <div className="space-y-5">
              {/* Output stats cards */}
              <div className="grid grid-cols-2 gap-3">
                <ResultCard label="Total Investment" value={formatINR(swpResult.invested)} />
                <ResultCard label="Total Withdrawn" value={formatINR(swpResult.totalWithdrawn)} />
                <ResultCard
                  label="Final Value (Corpus Remaining)"
                  value={formatINR(swpResult.finalValue)}
                  accent={swpResult.finalValue > 0}
                  sub={swpResult.finalValue === 0 ? "🚫 Corpus exhausted early" : "💼 Portfolio left"}
                />
                <ResultCard
                  label="Total Returns Earned"
                  value={formatINR(swpResult.totalReturns)}
                  sub="Accrued interest"
                />
              </div>

              {/* Status Alert: Ran out vs Sustainable */}
              {swpResult.ranOutYear !== null ? (
                <div className="card p-5 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300">
                  <div className="flex gap-3 items-start">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="font-bold text-sm">Corpus Exhausted Early!</p>
                      <p className="text-xs mt-1">
                        At your current withdrawal rate, your initial investment of {formatINR(swpResult.invested)} will last only{' '}
                        <strong className="text-red-700 dark:text-red-400">
                          {swpResult.ranOutYear} Year{swpResult.ranOutYear > 1 ? 's' : ''}
                          {swpResult.ranOutMonth > 0 ? ` & ${swpResult.ranOutMonth} Month${swpResult.ranOutMonth > 1 ? 's' : ''}` : ''}
                        </strong>.
                      </p>
                      <p className="text-xs mt-2 text-slate-500">
                        💡 Tip: Try lowering your monthly withdrawal amount or choosing a higher return asset allocation to make it sustainable.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card p-5 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                  <div className="flex gap-3 items-start">
                    <span className="text-2xl">🎉</span>
                    <div>
                      <p className="font-bold text-sm">Highly Sustainable Plan!</p>
                      <p className="text-xs mt-1">
                        Your corpus successfully lasts the full {swpYears} years and still grows to{' '}
                        <strong>{formatINR(swpResult.finalValue)}</strong>.
                      </p>
                      <p className="text-xs mt-1">
                        Total wealth withdrawn: <strong>{formatINR(swpResult.totalWithdrawn)}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Area Chart showing balance decline / stability */}
              <div className="card p-5">
                <h3 className="font-bold text-slate-900 dark:text-white mb-4">Portfolio Balance & Total Withdrawals</h3>
                <ResponsiveContainer width="100%" height={220} className="sm:!h-[280px]">
                  <AreaChart data={swpResult.yearlyData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="swpBalanceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="swpWithdrawnGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `Yr ${v}`}
                      stroke="rgba(148,163,184,0.5)"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      stroke="rgba(148,163,184,0.5)"
                      tickFormatter={(v) => {
                        if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
                        if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
                        return `₹${(v / 1000).toFixed(0)}K`;
                      }}
                      width={65}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Remaining Portfolio Value"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#swpBalanceGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="withdrawn"
                      name="Cumulative Withdrawn"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#swpWithdrawnGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Table breakdown */}
              <div className="card overflow-hidden">
                <button
                  onClick={() => setSwpShowTable(!swpShowTable)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <span className="font-bold text-slate-900 dark:text-white text-sm">📋 {swpShowTable ? 'Hide SWP Schedule ▲' : 'Show SWP Year-by-Year Schedule ▼'}</span>
                </button>
                {swpShowTable && (
                  <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
                    <div className="min-w-[500px] max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">Year</th>
                            <th className="px-4 py-3 text-right font-semibold">Total Withdrawn So Far (₹)</th>
                            <th className="px-4 py-3 text-right font-semibold">Interest Earned So Far (₹)</th>
                            <th className="px-4 py-3 text-right font-semibold">Remaining Balance (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {swpResult.yearlyData.map((row) => (
                            <tr key={row.year} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Yr {row.year}</td>
                              <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{formatINR(row.withdrawn)}</td>
                              <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{formatINR(row.returns)}</td>
                              <td className={`px-4 py-2 text-right font-bold tabular-nums ${row.value === 0 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>{formatINR(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─ GOAL CALCULATOR ─ */}
        {pageTab === 'goal' && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            {/* Controls */}
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white mb-1">🎯 Goal Calculator</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Find out how much monthly SIP you need to reach your financial goal.</p>
              </div>
              <SIPSlider id="goal-target" label="Target Amount" value={goalTarget} onChange={setGoalTarget}
                min={100000} max={100000000} step={100000} prefix="₹" formatFn={(v) => formatINR(v)} />
              <div className="flex flex-wrap gap-2">
                {[500000,1000000,5000000,10000000].map(p => (
                  <button key={p} onClick={() => setGoalTarget(p)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${goalTarget===p ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                    {p >= 10000000 ? `₹${p/10000000}Cr` : `₹${p/100000}L`}
                  </button>
                ))}
              </div>
              <SIPSlider id="goal-years" label="Time Horizon" value={goalYears} onChange={setGoalYears} min={1} max={30} suffix=" yr" />
              <SIPSlider id="goal-return" label="Expected Annual Return" value={goalReturn} onChange={setGoalReturn} min={1} max={30} step={0.5} suffix="%" />
            </div>

            {/* Results */}
            <div className="space-y-5">
              <div className="card p-8 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Monthly SIP Required</p>
                <p className="text-5xl font-black text-blue-600 dark:text-blue-400 tabular-nums">{formatINR(goalSIP)}</p>
                <p className="text-xs text-slate-500 mt-2">per month for {goalYears} year{goalYears>1?'s':''} at {goalReturn}% p.a.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">Total Invested</p>
                  <p className="font-bold text-slate-900 dark:text-white">{formatINR(goalTotal)}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">Gains</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatINR(Math.max(0, goalTarget - goalTotal))}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">Goal</p>
                  <p className="font-bold text-slate-900 dark:text-white">{formatINR(goalTarget)}</p>
                </div>
              </div>
              <div className="card p-4 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  💡 <strong>Tip:</strong> Enable the Annual Step-Up feature in the SIP Calculator tab. Even a 10% yearly increase can significantly reduce the required monthly SIP amount.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─ ELSS TAX SAVER ─ */}
        {pageTab === 'elss' && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white mb-1">🧾 ELSS Tax Saver</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">ELSS funds qualify for Section 80C deduction (max ₹1.5L). Calculate your tax savings.</p>
              </div>
              <SIPSlider id="elss-amount" label="Annual ELSS Investment" value={elssAmount} onChange={setElssAmount}
                min={500} max={150000} step={500} prefix="₹" formatFn={(v) => formatINR(v)} />
              <div>
                <p id="tax-slab-label" className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Your Tax Slab</p>
                <div className="flex gap-2 flex-wrap" role="radiogroup" aria-labelledby="tax-slab-label">
                  {[5,10,15,20,25,30].map(slab => (
                    <button key={slab} onClick={() => setTaxSlab(slab)}
                      role="radio"
                      aria-checked={taxSlab===slab}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all ${taxSlab===slab ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900 dark:text-violet-200' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                      {slab}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* ⚠️ New Tax Regime Disclaimer — critical: must be shown prominently */}
              <div className="card p-4 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700">
                <p className="text-xs text-amber-800 dark:text-amber-200 font-semibold">
                  ⚠️ Old Tax Regime Only — Section 80C deductions (including ELSS) are{' '}
                  <strong>not available under the New Tax Regime</strong> (default from FY 2023-24).
                  If you have opted for the new regime, your tax saving from ELSS is ₹0.
                  <a
                    href="https://incometaxindia.gov.in/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline ml-1 text-amber-700 dark:text-amber-300"
                    aria-label="Income Tax India website for regime information"
                  >
                    Learn more →
                  </a>
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-5 text-center border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950">
                  <p className="text-xs text-slate-400 mb-1">Tax Saved</p>
                  <p className="text-3xl font-black text-violet-600 dark:text-violet-400">{formatINR(elssResult.taxSaved)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">at {taxSlab}% slab + 4% cess</p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-xs text-slate-400 mb-1">80C Eligible</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatINR(elssResult.eligible)}</p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-xs text-slate-400 mb-1">Effective Cost</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatINR(elssResult.effectiveCost)}</p>
                </div>
              </div>
              <div className="card p-5 space-y-3">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Why ELSS?</h3>
                <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
                  {[
                    ['⏱️','Shortest Lock-in','Only 3 years — vs 5 years for PPF/NSC'],
                    ['📈','Equity Returns','Historically 12–15% CAGR over 10+ years'],
                    ['💸','Tax Efficient','LTCG up to ₹1L is tax-free annually'],
                    ['🔄','SIP Friendly','Start with ₹500/month in ELSS funds'],
                  ].map(([icon, title, desc]) => (
                    <div key={title} className="flex gap-2">
                      <span className="text-lg flex-shrink-0">{icon}</span>
                      <div><p className="font-semibold text-slate-800 dark:text-slate-200">{title}</p><p>{desc}</p></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-4 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                ⚠️ Tax savings shown are indicative. Actual savings depend on total 80C investments and your income. Consult a CA for precise calculations.
              </div>
            </div>
          </div>
        )}

        {/* ─ FIRE CALCULATOR ─ */}
        {pageTab === 'fire' && (() => {
          const yearsToFire = Math.max(1, fireRetireAge - fireCurrentAge);
          const ageError = fireRetireAge <= fireCurrentAge;
          const futureMonthlyExpense = fireMonthlyExpense * Math.pow(1 + fireInflation / 100, yearsToFire);
          const futureAnnualExpense = futureMonthlyExpense * 12;
          const fireCorpus = futureAnnualExpense / (fireWithdrawalRate / 100);
          const r = fireReturnRate / 100 / 12;
          const n = yearsToFire * 12;
          const existingGrowth = fireCurrentCorpus * Math.pow(1 + r, n);
          const remaining = Math.max(0, fireCorpus - existingGrowth);
          
          // Fix S = monthlySIP calculation to ensure division by zero doesn't crash
          const monthlySIP = remaining > 0 && r > 0 
            ? remaining * r / ((Math.pow(1 + r, n) - 1) * (1 + r)) 
            : remaining / Math.max(n, 1);
            
          const progress = Math.min(100, Math.round((fireCurrentCorpus / fireCorpus) * 100));
          const fmt = v => v >= 10000000 ? `₹${(v/10000000).toFixed(2)} Cr` : v >= 100000 ? `₹${(v/100000).toFixed(1)} L` : `₹${Math.round(v).toLocaleString('en-IN')}`;

          const calculateMilestoneAge = (targetPct) => {
            const milestoneTarget = fireCorpus * targetPct;
            if (fireCurrentCorpus >= milestoneTarget) {
              return { reached: true, age: fireCurrentAge, years: 0 };
            }
            const S = monthlySIP;
            const rateVal = fireReturnRate / 100 / 12;
            if (rateVal <= 0) {
              if (S <= 0) return { reached: false, age: null, years: null };
              const months = (milestoneTarget - fireCurrentCorpus) / S;
              const yrs = months / 12;
              return { reached: false, age: Math.round(fireCurrentAge + yrs), years: parseFloat(yrs.toFixed(1)) };
            }
            const numerator = milestoneTarget + S * ((1 + rateVal) / rateVal);
            const denominator = fireCurrentCorpus + S * ((1 + rateVal) / rateVal);
            if (denominator <= 0) return { reached: false, age: null, years: null };
            
            const months = Math.log(numerator / denominator) / Math.log(1 + rateVal);
            const yrs = months / 12;
            return {
              reached: false,
              age: Math.round(fireCurrentAge + yrs),
              years: parseFloat(yrs.toFixed(1)),
            };
          };

          return (
            <div className="space-y-6">
              {ageError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 font-semibold">
                  ⚠️ Target retire age must be greater than your current age.
                </div>
              )}

              {/* What is FIRE? intro card */}
              <div className="card p-5 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40 border-orange-100 dark:border-orange-900/50">
                <h2 className="font-bold text-orange-800 dark:text-orange-300 text-base mb-1 flex items-center gap-2">
                  <span>🔥</span> Financial Independence, Retire Early (FIRE)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  FIRE is the state where your accumulated investments yield returns that fully cover your cost of living.
                  Under the classic <strong className="text-orange-700 dark:text-orange-400">4% Rule</strong>, saving 25 times your annual expenses allows you to live off returns indefinitely.
                </p>
              </div>

              <div className="grid lg:grid-cols-[400px,1fr] gap-6">
                {/* Inputs Column */}
                <div className="card p-5 space-y-6 border-slate-100 dark:border-slate-800">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Your FIRE Parameters</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Adjust inputs or click on any number to type custom values.</p>
                  </div>

                  <FIRESlider
                    id="fire-monthly-expense"
                    label="Current Monthly Expenses"
                    value={fireMonthlyExpense}
                    onChange={setFireMonthlyExpense}
                    min={5000}
                    max={1000000}
                    step={1000}
                    prefix="₹"
                    formatFn={(v) => formatINR(v)}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FIRESlider
                      id="fire-current-age"
                      label="Current Age"
                      value={fireCurrentAge}
                      onChange={setFireCurrentAge}
                      min={15}
                      max={75}
                      suffix=" yrs"
                    />
                    <FIRESlider
                      id="fire-retire-age"
                      label="Target Retire Age"
                      value={fireRetireAge}
                      onChange={setFireRetireAge}
                      min={20}
                      max={85}
                      suffix=" yrs"
                    />
                  </div>

                  <FIRESlider
                    id="fire-corpus"
                    label="Current Saved Corpus"
                    value={fireCurrentCorpus}
                    onChange={setFireCurrentCorpus}
                    min={0}
                    max={100000000}
                    step={10000}
                    prefix="₹"
                    formatFn={(v) => formatINR(v)}
                  />

                  <FIRESlider
                    id="fire-return-rate"
                    label="Expected Annual Return"
                    value={fireReturnRate}
                    onChange={setFireReturnRate}
                    min={4}
                    max={25}
                    step={0.5}
                    suffix="%"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FIRESlider
                      id="fire-withdrawal-rate"
                      label="Safe Withdrawal Rate"
                      value={fireWithdrawalRate}
                      onChange={setFireWithdrawalRate}
                      min={1}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                    <FIRESlider
                      id="fire-inflation"
                      label="Expected Inflation"
                      value={fireInflation}
                      onChange={setFireInflation}
                      min={1}
                      max={15}
                      step={0.5}
                      suffix="%"
                    />
                  </div>
                </div>

                {/* Outputs Column */}
                <div className="space-y-5">
                  {/* FIRE Number Card */}
                  <div className="card p-6 bg-gradient-to-br from-orange-500 to-red-600 text-white border-none shadow-lg relative overflow-hidden">
                    {/* Background decorations */}
                    <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                    <div className="absolute left-1/3 top-2 w-16 h-16 bg-white/5 rounded-full blur-lg" />
                    
                    <p className="text-[10px] tracking-widest font-black uppercase text-orange-100">🔥 Your FIRE Target Number</p>
                    <p className="text-4xl font-extrabold mt-1 tracking-tight tabular-nums">{fmt(fireCorpus)}</p>
                    <p className="text-xs text-orange-50 font-medium mt-2 leading-relaxed">
                      This represents the inflation-adjusted corpus required to sustain a monthly lifestyle of {fmt(futureMonthlyExpense)} at age {fireRetireAge} under a {fireWithdrawalRate}% safe withdrawal rate.
                    </p>
                  </div>

                  {/* Summary Metric Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['Time Remaining', `${yearsToFire} years`, `Age ${fireCurrentAge} to ${fireRetireAge}`, ''],
                      ['Monthly SIP Needed', fmt(monthlySIP), 'To reach target', 'text-emerald-600 dark:text-emerald-400 font-bold'],
                      ['Future Monthly Spend', fmt(futureMonthlyExpense), `Adjusted for ${fireInflation}% inflation`, ''],
                      ['Saved Growth Value', fmt(existingGrowth), 'Current corpus compounded', 'text-blue-600 dark:text-blue-400 font-bold'],
                    ].map(([label, value, desc, extraClass]) => (
                      <div key={label} className="card p-4 text-center bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{label}</p>
                        <p className={`text-base font-extrabold ${extraClass || 'text-slate-900 dark:text-white'}`}>{value}</p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* FIRE Progress Gauge */}
                  <div className="card p-5 border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">FIRE Completion Progress</span>
                      <span className="text-xs font-extrabold text-orange-600 dark:text-orange-400">{progress}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                      <span>Currently Saved: {fmt(fireCurrentCorpus)}</span>
                      <span>Target: {fmt(fireCorpus)}</span>
                    </div>
                  </div>

                  {/* Milestones Stepper */}
                  <div className="card p-5 border-slate-100 dark:border-slate-800">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-4 flex items-center gap-1.5">
                      <span>🗓️</span> Retirement Milestones
                    </h4>
                    
                    <div className="space-y-4">
                      {[0.25, 0.5, 0.75, 1.0].map((pct) => {
                        const milestoneTarget = fireCorpus * pct;
                        const isCompleted = fireCurrentCorpus >= milestoneTarget;
                        const est = calculateMilestoneAge(pct);
                        return (
                          <div key={pct} className="relative flex gap-4 items-start pb-4 last:pb-0">
                            {/* Connector line */}
                            {pct !== 1.0 && (
                              <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-800" />
                            )}
                            
                            {/* Milestone Marker */}
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black z-10 shadow-sm ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-2 border-orange-200 dark:border-orange-800'
                            }`}>
                              {isCompleted ? '✓' : `${pct * 100}%`}
                            </div>
                            
                            {/* Milestone Data */}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center gap-4">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {pct === 0.25 ? '¼ Coast FIRE' : pct === 0.5 ? '½ Half FIRE' : pct === 0.75 ? '¾ Lean FIRE' : 'Full FIRE'} ({fmt(milestoneTarget)})
                                </span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  isCompleted
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400'
                                }`}>
                                  {isCompleted ? 'Achieved!' : est.age ? `Est. Age ${est.age}` : '—'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                {isCompleted
                                  ? 'Milestone cleared!'
                                  : est.years !== null
                                    ? `Reachable in ${est.years} years of regular SIP investing`
                                    : 'Need active monthly investment plan'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* FIRE Varieties Educational Card */}
                  <div className="card p-5 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10">
                    <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider">💡 FIRE Variations Guide</h4>
                    <div className="grid sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        <p className="font-bold text-orange-600 dark:text-orange-400 text-xs">Lean FIRE</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Retiring on a highly frugal budget that covers only basic survival expenses (utilities, simple food, shelter).</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        <p className="font-bold text-blue-600 dark:text-blue-400 text-xs">Coast FIRE</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Having enough invested early so that even without further savings, it will grow to Full FIRE by standard retirement age.</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        <p className="font-bold text-purple-600 dark:text-purple-400 text-xs">Fat FIRE</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Retiring with an abundant, luxurious budget allowing for premium healthcare, travel, dining, and luxury living.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}