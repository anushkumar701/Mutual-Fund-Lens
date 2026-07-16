import { useState } from "react";
import { formatCurrencyINR } from "../utils/formatCurrency";

export default function GoalForm({ onSave, onCancel, initialGoal, holdings }) {
  const [name, setName] = useState(initialGoal?.name || "");
  const [targetAmount, setTargetAmount] = useState(initialGoal?.targetAmount || "");
  const [targetDate, setTargetDate] = useState(initialGoal?.targetDate || "");
  const [monthlySIP, setMonthlySIP] = useState(initialGoal?.monthlySIP || "");
  const [expectedAnnualReturn, setExpectedAnnualReturn] = useState(
    initialGoal?.expectedAnnualReturn ? (initialGoal.expectedAnnualReturn * 100).toString() : ""
  );
  
  const [linkedSchemeCodes, setLinkedSchemeCodes] = useState(
    initialGoal?.linkedSchemeCodes || []
  );

  const [error, setError] = useState("");

  // Deduplicate holdings by schemeCode for the multi-select
  const uniqueHoldings = holdings.reduce((acc, current) => {
    const x = acc.find((item) => item.schemeCode === current.schemeCode);
    if (!x) {
      return acc.concat([current]);
    } else {
      return acc;
    }
  }, []);

  const handleLinkToggle = (code) => {
    setLinkedSchemeCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAutoFillReturn = () => {
    if (linkedSchemeCodes.length > 0) {
      let avgXirr = 0;
      let count = 0;
      for (const code of linkedSchemeCodes) {
        const h = uniqueHoldings.find(x => String(x.schemeCode) === String(code));
        if (h && typeof h.xirr === 'number' && !isNaN(h.xirr)) {
          avgXirr += h.xirr;
          count++;
        }
      }
      if (count > 0) {
        setExpectedAnnualReturn((avgXirr / count).toFixed(1));
        return;
      }
    }
    setExpectedAnnualReturn("12");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) return setError("Goal name is required.");
    const amt = parseFloat(targetAmount);
    if (isNaN(amt) || amt <= 0) return setError("Target amount must be > 0.");
    
    if (!targetDate) return setError("Target date is required.");
    const dateObj = new Date(targetDate);
    if (dateObj <= new Date()) return setError("Target date must be in the future.");

    let sip = parseFloat(monthlySIP);
    if (isNaN(sip)) sip = 0;

    let ret = parseFloat(expectedAnnualReturn);
    if (isNaN(ret)) ret = 12;

    if (linkedSchemeCodes.length === 0 && sip <= 0) {
      return setError("Please provide a Monthly SIP amount or link an existing fund.");
    }

    onSave({
      id: initialGoal?.id,
      name: name.trim(),
      targetAmount: amt,
      targetDate: dateObj.toISOString().split("T")[0], // YYYY-MM-DD
      linkedSchemeCodes,
      monthlySIP: sip,
      expectedAnnualReturn: ret / 100, // convert percentage back to decimal
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <h3 className="font-bold text-lg text-slate-900 dark:text-white">
        {initialGoal ? "Edit Goal" : "Create New Goal"}
      </h3>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
          Goal Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Retirement, Child's Education"
          className="input-base w-full"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Target Amount (₹)
          </label>
          <input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="e.g. 5000000"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Target Date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="input-base w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Monthly SIP (₹)
          </label>
          <input
            type="number"
            value={monthlySIP}
            onChange={(e) => setMonthlySIP(e.target.value)}
            placeholder="0"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex justify-between">
            <span>Expected Annual Return (%)</span>
            <button
              type="button"
              onClick={handleAutoFillReturn}
              className="text-blue-500 hover:underline"
            >
              Auto-fill Return
            </button>
          </label>
          <input
            type="number"
            value={expectedAnnualReturn}
            onChange={(e) => setExpectedAnnualReturn(e.target.value)}
            placeholder="12"
            step="0.1"
            className="input-base w-full"
          />
        </div>
      </div>

      {uniqueHoldings.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Link Existing Holdings (Optional)
          </label>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            {uniqueHoldings.map((h) => {
              const code = String(h.schemeCode);
              const isLinked = linkedSchemeCodes.includes(code);
              return (
                <label
                  key={code}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isLinked
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isLinked}
                    onChange={() => handleLinkToggle(code)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {h.schemeName}
                    </div>
                    <div className="text-xs text-slate-500">
                      Code: {code} · Value: {formatCurrencyINR(h.currentValue)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary flex-1 py-2.5"
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1 py-2.5">
          {initialGoal ? "Save Changes" : "Create Goal"}
        </button>
      </div>
    </form>
  );
}
