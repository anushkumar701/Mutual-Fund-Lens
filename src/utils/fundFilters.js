import { inferCategory } from './goalFilters';

const KNOWN_AMCS = [
  'HDFC','SBI','ICICI Prudential','Axis','Mirae Asset','Kotak','Nippon India',
  'UTI','DSP','Franklin','Tata','Aditya Birla','Parag Parikh','Canara Robeco',
  'Edelweiss','IDFC','Invesco','L&T','Motilal Oswal','Quant','PGIM','Sundaram',
  'Navi','WhiteOak','Samco','ITI','Bandhan','Union','Mahindra Manulife',
];

export function extractAMC(name) {
  const n = name.toLowerCase();
  for (const amc of KNOWN_AMCS) {
    if (n.includes(amc.toLowerCase())) return amc;
  }
  return name.split(' ').slice(0,2).join(' ');
}

export function getPlanType(name) {
  const n = name.toLowerCase();
  if (n.includes('direct')) return 'Direct';
  if (n.includes('regular')) return 'Regular';
  return 'Other';
}

export function getFundType(name) {
  const n = name.toLowerCase();
  if (n.includes('idcw') || n.includes('dividend')) return 'IDCW/Dividend';
  if (n.includes('growth')) return 'Growth';
  return 'Other';
}

export function estimateER(name) {
  const n = name.toLowerCase();
  const isDirect = n.includes('direct');
  if (n.includes('liquid') || n.includes('overnight') || n.includes('money market')) return isDirect ? 0.1 : 0.3;
  if (n.includes('index') || n.includes('nifty') || n.includes('sensex') || n.includes('etf')) return isDirect ? 0.1 : 0.5;
  if (n.includes('debt') || n.includes('bond') || n.includes('gilt') || n.includes('income')) return isDirect ? 0.4 : 1.0;
  if (n.includes('elss') || n.includes('tax')) return isDirect ? 0.7 : 1.5;
  if (n.includes('hybrid') || n.includes('balanced') || n.includes('aggressive') || n.includes('dynamic')) return isDirect ? 0.6 : 1.4;
  return isDirect ? 0.8 : 1.6;
}

export function getERBand(er) {
  if (er <= 0.3) return 'Ultra Low (<0.3%)';
  if (er <= 0.7) return 'Low (0.3–0.7%)';
  if (er <= 1.2) return 'Medium (0.7–1.2%)';
  return 'High (>1.2%)';
}

export function filterFunds(funds, { search, category, planType, fundType, erBand, amc, goals, matchesGoal }) {
  let list = funds;
  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(f => f.schemeName.toLowerCase().includes(q));
  }
  if (category !== 'All') list = list.filter(f => inferCategory(f.schemeName) === category);
  if (planType !== 'All') list = list.filter(f => getPlanType(f.schemeName) === planType);
  if (fundType !== 'All') list = list.filter(f => getFundType(f.schemeName) === fundType);
  if (erBand !== 'All') list = list.filter(f => getERBand(estimateER(f.schemeName)) === erBand);
  if (amc !== 'All') list = list.filter(f => extractAMC(f.schemeName) === amc);
  if (goals && goals.length > 0) list = list.filter(f => goals.some(g => matchesGoal(f, g)));
  return list;
}
