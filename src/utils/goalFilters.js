// utils/goalFilters.js

export const GOALS = [
  { id: 'save-tax', label: 'Save Tax', icon: '🧾' },
  { id: 'retirement', label: 'Retirement', icon: '🏖️' },
  { id: 'child-education', label: 'Child Education', icon: '🎓' },
  { id: 'wealth-building', label: 'Wealth Building', icon: '📈' },
  { id: 'short-term', label: 'Short-term Parking', icon: '⏱️' },
  { id: 'emergency', label: 'Emergency Fund', icon: '🛡️' },
];

export function matchesGoal(fund, goalId) {
  const name = (fund.schemeName || '').toLowerCase();
  switch (goalId) {
    case 'save-tax':
      return name.includes('elss') || name.includes('tax');
    case 'retirement':
      return name.includes('retirement') || name.includes('pension');
    case 'child-education':
      return name.includes('child') || name.includes('children');
    case 'wealth-building':
      return name.includes('equity') || name.includes('growth') || name.includes('flexi');
    case 'short-term':
      return name.includes('liquid') || name.includes('ultra short') || name.includes('money market');
    case 'emergency':
      return name.includes('liquid') || name.includes('overnight') || name.includes('ultra short');
    default:
      return false;
  }
}

export function getGoalForFund(fund) {
  for (const goal of GOALS) {
    if (matchesGoal(fund, goal.id)) return goal;
  }
  return null;
}

/**
 * Infer category from fund name
 */
export function inferCategory(schemeName) {
  const name = (schemeName || '').toLowerCase();
  if (name.includes('elss') || name.includes('tax saver') || name.includes('tax saving')) return 'ELSS';
  if (name.includes('liquid') || name.includes('overnight') || name.includes('money market')) return 'Liquid';
  if (name.includes('index') || name.includes('nifty') || name.includes('sensex') || name.includes('bse') || name.includes('nse')) return 'Index';
  if (name.includes('debt') || name.includes('bond') || name.includes('gilt') || name.includes('credit') || name.includes('income') || name.includes('corporate')) return 'Debt';
  if (name.includes('hybrid') || name.includes('balanced') || name.includes('arbitrage') || name.includes('equity savings')) return 'Hybrid';
  if (name.includes('equity') || name.includes('growth') || name.includes('flexi') || name.includes('large cap') || name.includes('mid cap') || name.includes('small cap') || name.includes('multi cap') || name.includes('bluechip')) return 'Equity';
  return 'Other';
}

export const CATEGORY_COLORS = {
  Equity: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  Debt: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  Hybrid: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  ELSS: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  Liquid: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  Index: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  Other: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};
