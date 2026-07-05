// utils/schemeMergers.js
import mergers from "../data/schemeMergers.json";

/**
 * Returns an array of scheme codes representing the full history of a fund.
 * The first element is the active (newest) scheme code, followed by older merged codes.
 */
export function getMergerChain(code) {
  let activeCode = String(code);
  let depth = 0;
  // Step 1: Find the absolute newest code in the forward direction
  while (mergers[activeCode] && depth < 5) {
    activeCode = String(mergers[activeCode]);
    depth++;
  }
  
  // Step 2: Traverse backwards to find all historical codes that merged into this
  const chain = [activeCode];
  let currentLayer = [activeCode];
  depth = 0;
  
  while (currentLayer.length > 0 && depth < 5) {
    const nextLayer = [];
    for (const c of currentLayer) {
      const parents = Object.entries(mergers)
        .filter(([, newCode]) => newCode === c)
        .map(([oldCode]) => oldCode);
      nextLayer.push(...parents);
      chain.push(...parents);
    }
    currentLayer = nextLayer;
    depth++;
  }
  
  return chain;
}

/**
 * Splices NAV histories together for merged funds to ensure continuity in XIRR.
 * Expects newer data first (descending by date).
 */
export function spliceNavHistories(oldNavData, newNavData) {
  if (!oldNavData || oldNavData.length === 0) return newNavData || [];
  if (!newNavData || newNavData.length === 0) return oldNavData || [];

  // Find the earliest date in the new NAV data
  const earliestNewDateStr = newNavData[newNavData.length - 1].date;
  const parts = earliestNewDateStr.split("-");
  const earliestNewTs = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();

  // Filter old data to only include dates strictly before the new data starts
  const filteredOld = oldNavData.filter((d) => {
    const p = d.date.split("-");
    const ts = new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
    return ts < earliestNewTs;
  });

  return [...newNavData, ...filteredOld];
}
