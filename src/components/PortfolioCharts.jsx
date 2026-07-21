import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useState, useEffect } from "react";
import { formatCurrencyINR } from "../utils/formatCurrency";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];

const RANGE_LABELS = {
  "30d": "1M",
  "90d": "3M",
  "180d": "6M",
  "365d": "1Y",
  all: "ALL",
};

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const portfolioItem = payload.find((p) => p.name === "Portfolio Value");
    const investedItem = payload.find((p) => p.name === "Invested Capital");
    const benchmarkItem = payload.find((p) => p.name === "Benchmark Value");

    const portfolioVal = portfolioItem?.value || 0;
    const investedVal = investedItem?.value || 0;
    const benchmarkVal = benchmarkItem?.value || 0;

    const gain = portfolioVal - investedVal;
    const gainPct = investedVal > 0 ? (gain / investedVal) * 100 : 0;
    const isProfit = gain >= 0;

    return (
      <div className="bg-[#0f172a]/95 border border-slate-800 backdrop-blur-md p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[180px]">
        <p className="text-slate-400 font-semibold mb-1">{label}</p>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Portfolio Value:</span>
          <span className="font-bold text-blue-400">{formatCurrencyINR(portfolioVal)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Invested Capital:</span>
          <span className="font-bold text-slate-400">{formatCurrencyINR(investedVal)}</span>
        </div>
        {benchmarkItem && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-350">Benchmark Value:</span>
            <span className="font-bold text-purple-400">{formatCurrencyINR(benchmarkVal)}</span>
          </div>
        )}
        <div className="border-t border-slate-800/80 pt-1.5 mt-1.5 flex items-center justify-between gap-4">
          <span className="text-slate-400">Total Profit:</span>
          <span className={`font-bold ${isProfit ? "text-emerald-500" : "text-rose-500"}`}>
            {isProfit ? "+" : ""}
            {formatCurrencyINR(gain)} ({gainPct.toFixed(2)}%)
          </span>
        </div>
      </div>
    );
  }
  return null;
}

export default function PortfolioCharts({
  chartRange,
  setChartRange,
  detailsLoading,
  filteredChartData,
  pieChartData,
  totalCurrent,
  activeBenchmark,
  setActiveBenchmark,
  loadingBenchmark,
  BENCHMARKS = [],
}) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col min-h-[350px]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold">Historical Valuation Growth</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Portfolio current value vs step-line of invested capital over time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Benchmark index overlay */}
            <div className="flex items-center bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/40 gap-0.5 shadow-sm">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 px-1.5 uppercase tracking-wide">Vs Index:</span>
              {BENCHMARKS.map((bm) => (
                <button
                  key={bm.id}
                  onClick={() => setActiveBenchmark(activeBenchmark === bm.id ? null : bm.id)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                    activeBenchmark === bm.id
                      ? "bg-purple-650 dark:bg-purple-900 text-white shadow-sm font-black"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {activeBenchmark === bm.id && loadingBenchmark && (
                    <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {bm.label}
                </button>
              ))}
            </div>

            {/* Time range selector */}
            <div className="flex bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/40 gap-0.5 shadow-sm">
              {["30d", "90d", "180d", "365d", "all"].map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    chartRange === r
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-[260px]">
          {detailsLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Loading historical valuation curves...
            </div>
          ) : filteredChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
              No historical valuation data within the selected range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData} margin={{ top: 15, right: 15, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.08)" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={45}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={isMobile ? 9 : 10}
                  tickLine={false}
                  axisLine={false}
                  width={isMobile ? 48 : 75}
                  domain={["auto", "auto"]}
                  padding={{ top: 20, bottom: 20 }}
                  tickFormatter={(v) => {
                    if (v === 0) return "₹0";
                    if (v >= 10000000) {
                      return `₹${(v / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}Cr`;
                    }
                    if (v >= 100000) {
                      return `₹${(v / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
                    }
                    if (v >= 1000) {
                      return `₹${(v / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}k`;
                    }
                    return `₹${v.toLocaleString("en-IN")}`;
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  formatter={(value) => (
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{value}</span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="Portfolio Value"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  activeDot={{ r: 6, strokeWidth: 0, fill: "#3b82f6" }}
                  fillOpacity={1}
                  fill="url(#valGrad)"
                />
                <Area
                  type="step"
                  dataKey="Invested Capital"
                  stroke="#10b981"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  activeDot={{ r: 4, strokeWidth: 0, fill: "#10b981" }}
                  fill="none"
                />
                {activeBenchmark && (
                  <Area
                    type="monotone"
                    dataKey="Benchmark Value"
                    stroke={BENCHMARKS.find((b) => b.id === activeBenchmark)?.color || "#a855f7"}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    activeDot={{
                      r: 5,
                      strokeWidth: 0,
                      fill: BENCHMARKS.find((b) => b.id === activeBenchmark)?.color || "#a855f7",
                    }}
                    fill="none"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col min-h-[350px]">
        <div className="mb-4">
          <h3 className="text-base font-bold">Fund Allocation Split</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Holdings value concentration breakdown.</p>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-[220px]">
          {pieChartData.length === 0 ? (
            <div className="text-xs text-slate-400">No holdings to allocate</div>
          ) : (
            <div className="w-full h-full flex flex-col items-center">
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 32 : 45}
                      outerRadius={isMobile ? 50 : 65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "none",
                        borderRadius: "12px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [formatCurrencyINR(value), ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[85px] w-full mt-2 text-left space-y-1.5 px-2">
                {pieChartData.map((entry, index) => {
                  const pct = (entry.value / totalCurrent) * 100;
                  return (
                    <div key={entry.name} className="flex items-center justify-between text-[11px] font-medium">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="truncate text-slate-600 dark:text-slate-300">{entry.name}</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
