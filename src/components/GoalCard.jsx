import { useState, useMemo } from "react";
import { formatCurrencyINR } from "../utils/formatCurrency";
import { useDebounce } from "../hooks/useDebounce";
import { 
  projectedCorpus, 
  requiredSIP, 
  whatIfScenario,
  monthlyRateFromAnnual
} from "../utils/goalCalculations";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function getMonthsBetween(d1, d2) {
  let months = (d2.getFullYear() - d1.getFullYear()) * 12;
  months -= d1.getMonth();
  months += d2.getMonth();
  return months;
}

export default function GoalCard({ goal, portfolioHoldings, onEdit, onDelete }) {
  const [whatIfMode, setWhatIfMode] = useState("permanent"); // "permanent" | "one-time"
  const [deltaInput, setDeltaInput] = useState("0");
  const debouncedDelta = useDebounce(deltaInput, 300);

  // Compute Current Value (C)
  const C = useMemo(() => {
    if (!goal.linkedSchemeCodes || goal.linkedSchemeCodes.length === 0) return 0;
    return goal.linkedSchemeCodes.reduce((sum, code) => {
      const holding = portfolioHoldings.find(h => String(h.schemeCode) === String(code));
      return sum + (holding ? holding.currentValue : 0);
    }, 0);
  }, [goal.linkedSchemeCodes, portfolioHoldings]);

  // Compute months to target (n)
  const n = useMemo(() => {
    const months = getMonthsBetween(new Date(), new Date(goal.targetDate));
    return months <= 0 ? 0 : months;
  }, [goal.targetDate]);

  const r = monthlyRateFromAnnual(goal.expectedAnnualReturn);
  
  // Base Projections
  const projected = useMemo(() => {
    if (n === 0) return C;
    return projectedCorpus(n, r, C, goal.monthlySIP);
  }, [n, r, C, goal.monthlySIP]);

  const required = useMemo(() => {
    if (n === 0) return 0;
    return requiredSIP(n, r, C, goal.targetAmount);
  }, [n, r, C, goal.targetAmount]);

  // Status
  let status = "On Track";
  let statusColor = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  if (C >= goal.targetAmount) {
    status = "Achieved";
    statusColor = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  } else if (n === 0) {
    status = "Time Up";
    statusColor = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  } else if (projected >= goal.targetAmount) {
    status = "Ahead";
    statusColor = "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
  } else if (projected < goal.targetAmount * 0.95) {
    status = "Behind";
    statusColor = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  }

  // What-If
  const delta = parseFloat(debouncedDelta) || 0;
  
  const whatIf = useMemo(() => {
    if (n === 0 || delta === 0) return null;
    return whatIfScenario(n, goal.expectedAnnualReturn, C, goal.monthlySIP, goal.targetAmount, delta, whatIfMode);
  }, [n, goal, C, delta, whatIfMode]);

  // Chart Data
  const chartData = useMemo(() => {
    if (n === 0) return [];
    const data = [];
    // Just plot 10 points to keep it light
    const step = Math.max(1, Math.floor(n / 10));
    for (let i = 0; i <= n; i += step) {
      if (i > n) i = n;
      const point = { month: i };
      point.baseline = projectedCorpus(i, r, C, goal.monthlySIP);
      point.ideal = projectedCorpus(i, r, C, Math.max(0, required));
      
      if (whatIf) {
        point.adjusted = projectedCorpus(i, r, whatIf.effectiveC, whatIf.effectiveSIP);
      }
      data.push(point);
      if (i === n) break;
    }
    return data;
  }, [n, r, C, goal.monthlySIP, required, whatIf]);

  const progressPct = Math.min(100, Math.max(0, (C / goal.targetAmount) * 100));

  return (
    <div className="card p-5 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            {goal.name}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
              {status}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Target: {formatCurrencyINR(goal.targetAmount)} by {new Date(goal.targetDate).toLocaleDateString()} ({n} months)
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(goal)} className="text-blue-500 hover:text-blue-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          </button>
          <button onClick={() => onDelete(goal.id)} className="text-red-500 hover:text-red-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-600 dark:text-slate-400">Current: {formatCurrencyINR(C)}</span>
          <span className="font-bold">{progressPct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-sm">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Projected at target</div>
          <div className="font-bold text-slate-900 dark:text-white">{formatCurrencyINR(projected)}</div>
          {projected < goal.targetAmount && n > 0 && (
            <div className="text-xs text-red-500 mt-1">
              Shortfall: {formatCurrencyINR(goal.targetAmount - projected)}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Required SIP</div>
          <div className="font-bold text-slate-900 dark:text-white">
            {required <= 0 ? "Goal Funded" : formatCurrencyINR(required)}
            <span className="text-xs font-normal text-slate-500 ml-1">/mo</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Current: {formatCurrencyINR(goal.monthlySIP)}
          </div>
        </div>
      </div>

      {/* Chart */}
      {n > 0 && (
        <div className="h-40 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(val) => `₹${(val/100000).toFixed(1)}L`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip 
                formatter={(value) => formatCurrencyINR(value)}
                labelFormatter={(label) => `Month ${label}`}
                contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
              />
              <Line type="monotone" dataKey="baseline" stroke="#3b82f6" strokeWidth={2} dot={false} name="Current Path" />
              <Line type="monotone" dataKey="ideal" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Ideal Path" />
              {whatIf && (
                <Line type="monotone" dataKey="adjusted" stroke="#f59e0b" strokeWidth={2} dot={false} name="Adjusted Path" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* What-If Simulator */}
      {n > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4 mt-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3">What-If Simulator</h4>
          
          <div className="flex gap-2 mb-3">
            <button 
              onClick={() => setWhatIfMode("one-time")}
              className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-colors ${whatIfMode === "one-time" ? "bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-500"}`}
            >
              This Month Only
            </button>
            <button 
              onClick={() => setWhatIfMode("permanent")}
              className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-colors ${whatIfMode === "permanent" ? "bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-transparent border-slate-200 dark:border-slate-700 text-slate-500"}`}
            >
              Ongoing SIP
            </button>
          </div>

          <div className="mb-4">
            <label className="text-[10px] text-slate-500 block mb-1">Adjust by ±₹ (e.g. 5000 or -2000)</label>
            <input 
              type="number" 
              value={deltaInput}
              onChange={(e) => setDeltaInput(e.target.value)}
              className="input-base w-full text-sm py-1.5"
              placeholder="0"
            />
          </div>

          {whatIf && (
            <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-3 text-xs space-y-3">
              <div>
                <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Impact on Corpus at Target Date</div>
                <div className="flex justify-between items-end">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrencyINR(whatIf.projected)}</span>
                  <span className={`font-semibold ${whatIf.projected >= goal.targetAmount ? "text-emerald-500" : "text-red-500"}`}>
                    {whatIf.projected >= goal.targetAmount 
                      ? `Surplus: ${formatCurrencyINR(whatIf.projected - goal.targetAmount)}`
                      : `Shortfall: ${formatCurrencyINR(goal.targetAmount - whatIf.projected)}`}
                  </span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
                <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">When will I hit the goal?</div>
                {whatIf.monthsToTarget === null ? (
                  <span className="text-red-500 font-bold">Not reachable within 50 years at this rate.</span>
                ) : (
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">In {whatIf.monthsToTarget} months</span>
                    <span className="text-slate-500 ml-2">
                      ({Math.abs(n - whatIf.monthsToTarget)} months {whatIf.monthsToTarget < n ? "earlier" : "later"})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
