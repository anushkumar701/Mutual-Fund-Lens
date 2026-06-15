import { inferCategory } from "./goalFilters";

// Lazy-loaded: getER pulls in the 91KB expense ratio JSON, so we only load
// it when filterFunds actually filters by expense ratio band.
let _getER = null;
async function loadGetER() {
  if (!_getER) {
    const mod = await import("./expenseRatio");
    _getER = mod.getER;
  }
  return _getER;
}

const KNOWN_AMCS = [
  "HDFC",
  "SBI",
  "ICICI Prudential",
  "Axis",
  "Mirae Asset",
  "Kotak",
  "Nippon India",
  "UTI",
  "DSP",
  "Franklin",
  "Tata",
  "Aditya Birla",
  "Parag Parikh",
  "Canara Robeco",
  "Edelweiss",
  "IDFC",
  "Invesco",
  "L&T",
  "Motilal Oswal",
  "Quant",
  "PGIM",
  "Sundaram",
  "Navi",
  "WhiteOak",
  "Samco",
  "ITI",
  "Bandhan",
  "Union",
  "Mahindra Manulife",
];

export function extractAMC(name) {
  const n = name.toLowerCase();
  for (const amc of KNOWN_AMCS) {
    if (n.includes(amc.toLowerCase())) return amc;
  }
  return name.split(" ").slice(0, 2).join(" ");
}

export function getPlanType(name) {
  const n = name.toLowerCase();
  if (n.includes("direct")) return "Direct";
  if (n.includes("regular")) return "Regular";
  return "Other";
}

export function getFundType(name) {
  const n = name.toLowerCase();
  if (n.includes("idcw") || n.includes("dividend")) return "IDCW/Dividend";
  if (n.includes("growth")) return "Growth";
  return "Other";
}

export function getERBand(er) {
  if (er === null || er === undefined) return "Unknown";
  if (er <= 0.3) return "Ultra Low (<0.3%)";
  if (er <= 0.7) return "Low (0.3–0.7%)";
  if (er <= 1.2) return "Medium (0.7–1.2%)";
  return "High (>1.2%)";
}

export function filterFunds(
  funds,
  { search, category, planType, fundType, erBand, amc, goals, matchesGoal },
) {
  let list = funds;
  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter((f) => f.schemeName.toLowerCase().includes(q));
  }
  if (category !== "All")
    list = list.filter((f) => inferCategory(f.schemeName) === category);
  if (planType !== "All")
    list = list.filter((f) => getPlanType(f.schemeName) === planType);
  if (fundType !== "All")
    list = list.filter((f) => getFundType(f.schemeName) === fundType);
  if (erBand !== "All")
    list = list.filter(
      (f) => getERBand(_getER ? _getER(f.schemeName, f.schemeCode) : 0) === erBand,
    );
  if (amc !== "All")
    list = list.filter((f) => extractAMC(f.schemeName) === amc);
  if (goals && goals.length > 0)
    list = list.filter((f) => goals.some((g) => matchesGoal(f, g)));
  return list;
}

// Detect likely closed / matured funds from name
export function isFundClosed(name) {
  const n = name.toLowerCase();
  return (
    n.includes(" fmp ") ||
    n.includes("fmp-") ||
    n.includes("fixed maturity") ||
    n.includes("fixed term plan") ||
    n.includes("close ended") ||
    n.includes("interval fund") ||
    (n.includes("series") &&
      (n.includes("plan a") ||
        n.includes("plan b") ||
        n.includes("plan c") ||
        n.includes("plan d") ||
        n.includes("plan e") ||
        n.includes("plan f") ||
        n.includes("quarterly") ||
        n.includes("annual plan") ||
        n.includes("monthly plan")))
  );
}

// Infer investment horizon recommendation from category
export function getHorizon(name) {
  const cat = inferCategory(name);
  if (cat === "Liquid") return "<1Y";
  if (cat === "Debt") return "1–3Y";
  if (cat === "Hybrid") return "3–5Y";
  if (cat === "ELSS") return "3Y+";
  if (cat === "Index") return "7Y+";
  if (cat === "Equity") return "7Y+";
  return "3–5Y";
}
