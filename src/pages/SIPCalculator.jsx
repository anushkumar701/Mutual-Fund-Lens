// pages/SIPCalculator.jsx
import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import SIPSlider from '../components/SIPSlider';
import { calculateSIP, calculateLumpsum, adjustForInflation, calculateGoalSIP, calculateELSSTaxSaving } from '../utils/sipCalculations';
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

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SIP Calculator</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Estimate returns, plan your goal, and save tax with ELSS</p>
        </div>

        {/* Page Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 w-fit flex-wrap">
          {[['calc','📈 SIP / Lumpsum'],['goal','🎯 Goal Calculator'],['elss','🧾 ELSS Tax Saver'],['fire','🔥 FIRE Calculator']].map(([id, label]) => (
            <button key={id} onClick={() => setPageTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${pageTab === id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
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
              <ResponsiveContainer width="100%" height={280}>
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
          const monthlySIP = remaining > 0 && r > 0 ? remaining * r / ((Math.pow(1 + r, n) - 1) * (1 + r)) : remaining / Math.max(n, 1);
          const progress = Math.min(100, Math.round((fireCurrentCorpus / fireCorpus) * 100));
          const fmt = v => v >= 10000000 ? `₹${(v/10000000).toFixed(2)} Cr` : v >= 100000 ? `₹${(v/100000).toFixed(1)} L` : `₹${Math.round(v).toLocaleString('en-IN')}`;
          return (
            <div className="space-y-6">
              {ageError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 font-semibold">
                  ⚠️ Target retire age must be greater than your current age.
                </div>
              )}
              <div className="card p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border-orange-200 dark:border-orange-800">
                <h2 className="font-bold text-orange-700 dark:text-orange-300 mb-1">🔥 What is FIRE?</h2>
                <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed"><strong>Financial Independence, Retire Early.</strong> Build a corpus so large that investment returns alone cover all expenses — forever. Classic rule: save 25× your annual expenses (4% withdrawal rate).</p>
              </div>
              <div className="grid lg:grid-cols-[400px,1fr] gap-6">
                <div className="card p-5 space-y-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">Your FIRE Inputs</h3>
                  {[
                    ['Monthly Expenses (₹)', 'fire-monthly-expense', fireMonthlyExpense, setFireMonthlyExpense, 5000, 500000, 1000],
                    ['Current Age', 'fire-current-age', fireCurrentAge, setFireCurrentAge, 18, 65, 1],
                    ['Target Retire Age', 'fire-retire-age', fireRetireAge, setFireRetireAge, 25, 80, 1],
                    ['Portfolio Return (%)', 'fire-return-rate', fireReturnRate, setFireReturnRate, 6, 25, 0.5],
                    ['Withdrawal Rate (%)', 'fire-withdrawal-rate', fireWithdrawalRate, setFireWithdrawalRate, 2, 8, 0.5],
                    ['Inflation Rate (%)', 'fire-inflation', fireInflation, setFireInflation, 3, 12, 0.5],
                    ['Current Corpus (₹)', 'fire-corpus', fireCurrentCorpus, setFireCurrentCorpus, 0, 100000000, 10000],
                  ].map(([label, id, val, setter, min, max, step]) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1">
                        <label htmlFor={id} className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
                        <span className="text-xs font-bold text-orange-600 tabular-nums">{label.includes('₹') ? fmt(val) : `${val}${label.includes('%') ? '%' : ''}`}</span>
                      </div>
                      <input id={id} type="range" min={min} max={max} step={step} value={val} onChange={e => setter(Number(e.target.value))} className="w-full accent-orange-500" aria-label={label}/>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="card p-5 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border-orange-200 dark:border-orange-800 text-center">
                    <p className="text-xs text-orange-600 uppercase tracking-wider font-bold mb-1">🔥 Your FIRE Number</p>
                    <p className="text-4xl font-bold text-orange-700 dark:text-orange-300">{fmt(fireCorpus)}</p>
                    <p className="text-xs text-orange-600 mt-1">Total corpus needed by age {fireRetireAge}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Years to FIRE', `${yearsToFire} yrs`, `Age ${fireCurrentAge} → ${fireRetireAge}`, ''],
                      ['Monthly SIP Needed', fmt(monthlySIP), 'to reach FIRE', 'text-emerald-600 dark:text-emerald-400'],
                      ['Future Monthly Spend', fmt(futureMonthlyExpense), `at ${fireInflation}% inflation`, ''],
                      ['Corpus from SIP', fmt(Math.max(0, fireCorpus - existingGrowth)), 'wealth you will create', 'text-blue-600 dark:text-blue-400'],
                    ].map(([l,v,sub,cls]) => (
                      <div key={l} className="card p-4 text-center">
                        <p className="text-[10px] text-slate-400 mb-1">{l}</p>
                        <p className={`text-xl font-bold ${cls || 'text-slate-900 dark:text-white'}`}>{v}</p>
                        <p className="text-[10px] text-slate-400">{sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="card p-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">FIRE Progress</span>
                      <span className="text-xs font-bold text-orange-600">{progress}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full" style={{width:`${progress}%`}}/>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{fmt(fireCurrentCorpus)} of {fmt(fireCorpus)} goal</p>
                  </div>
                  <div className="card p-4">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">🗓️ Milestones</h4>
                    <div className="space-y-2">
                      {[0.25,0.5,0.75,1.0].map(pct => (
                        <div key={pct} className="flex justify-between text-xs items-center">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${(progress/100)>=pct?'bg-emerald-500':'bg-slate-200 dark:bg-slate-600'}`}/>
                            <span className="text-slate-500">{pct*100}% — {fmt(fireCorpus*pct)}</span>
                          </div>
                          <span className="font-semibold">{(progress/100)>=pct?'✅ Done':pct===1?`Age ${fireRetireAge}`:'—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card p-3 bg-blue-50 dark:bg-blue-950 border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
                    💡 The {fireWithdrawalRate}% withdrawal rate means withdrawing {fmt(futureAnnualExpense)}/year. Your corpus keeps growing — making this sustainable indefinitely.
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