#!/usr/bin/env node
/**
 * fetch-ter-data.mjs
 * ------------------
 * Downloads the latest TER (Total Expense Ratio) data from the community-maintained
 * AMFI TER tracker and converts it into a compact JSON lookup shipped with the app.
 *
 * Source:  https://github.com/captn3m0/india-mutual-fund-ter-tracker
 * Output: src/data/expenseRatios.json
 *         → { [normalizedName]: { d: directTotalTER, r: regularTotalTER } }
 *
 * The key is a normalized (lowercased, whitespace-collapsed) fund base name, so
 * the runtime lookup can fuzzy-match against schemeName from mfapi.in.
 *
 * Usage:
 *   node scripts/fetch-ter-data.mjs          # fetch + generate JSON
 *   npm run fetch-ter                        # via package.json script
 *
 * The generated file is committed to git so the app works offline / without re-fetching.
 * Re-run monthly (or via CI) to keep TER data fresh.
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../src/data');
const OUT_FILE = path.join(OUT_DIR, 'expenseRatios.json');

const CSV_URL =
  'https://raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/main/data.csv';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'FundLens-TER-Fetch/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse a CSV row that may contain quoted fields with commas inside.
 */
function parseRow(line) {
  const row = [];
  let inQuote = false;
  let field = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { row.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  row.push(field.trim());
  return row;
}

/**
 * Normalize a fund name into a compact key for fast lookup.
 * Strips plan type suffixes (Direct/Regular/Growth/IDCW) and normalizes whitespace.
 */
function normalizeKey(name) {
  return name
    .toLowerCase()
    .replace(/\s*-\s*(direct|regular|growth|idcw|dividend|payout|reinvestment)\s*/gi, ' ')
    .replace(/\s*(direct|regular)\s*plan\s*/gi, ' ')
    .replace(/\s*(growth|idcw|dividend)\s*option\s*/gi, ' ')
    .replace(/\(formerly known as[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the AMFI TER tracker CSV.
 * Actual format (2024+):
 *   "Scheme Name","Regular Plan - Base TER (%)","...(4 more regular cols)","Regular Plan - Total TER (%)",
 *   "Direct Plan - Base TER (%)","...(4 more direct cols)","Direct Plan - Total TER (%)"
 *
 * We only need: col[0] = name, col[5] = regular total TER, col[10] = direct total TER
 */
function parseCsv(raw) {
  const lines = raw.split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV is empty or too small');

  const header = parseRow(lines[0]).map((h) => h.toLowerCase());

  // Find the "total TER" columns
  const regTotalIdx = header.findIndex((h) => h.includes('regular') && h.includes('total ter'));
  const dirTotalIdx = header.findIndex((h) => h.includes('direct') && h.includes('total ter'));
  const nameIdx = 0; // First column is always the scheme name

  if (regTotalIdx === -1 && dirTotalIdx === -1) {
    console.error('Header columns:', header);
    throw new Error('Cannot find "Total TER" columns in CSV');
  }

  console.log(`  Column mapping: name=${nameIdx}, regularTotalTER=${regTotalIdx}, directTotalTER=${dirTotalIdx}`);

  const map = {};
  let parsed = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    const name = row[nameIdx];
    if (!name) { skipped++; continue; }

    const regTer = regTotalIdx !== -1 ? parseFloat(row[regTotalIdx]) : NaN;
    const dirTer = dirTotalIdx !== -1 ? parseFloat(row[dirTotalIdx]) : NaN;

    if (isNaN(regTer) && isNaN(dirTer)) { skipped++; continue; }

    const key = normalizeKey(name);
    if (!key) { skipped++; continue; }

    const entry = {};
    if (!isNaN(regTer) && regTer >= 0 && regTer <= 5) entry.r = Math.round(regTer * 100) / 100;
    if (!isNaN(dirTer) && dirTer >= 0 && dirTer <= 5) entry.d = Math.round(dirTer * 100) / 100;

    if (Object.keys(entry).length > 0) {
      map[key] = entry;
      parsed++;
    } else {
      skipped++;
    }
  }

  console.log(`  Parsed ${parsed} fund families, skipped ${skipped} rows`);
  return map;
}

async function main() {
  console.log('[fetch-ter-data] Downloading TER data from AMFI tracker...');
  console.log(`  Source: ${CSV_URL}`);

  let raw;
  try {
    raw = await httpGet(CSV_URL);
  } catch (err) {
    console.error(`  ✗ Download failed: ${err.message}`);
    console.log('  → Keeping existing expenseRatios.json (if any).');
    process.exit(0); // Non-fatal: app still works with heuristic fallback
  }

  console.log(`  ✓ Downloaded ${(raw.length / 1024).toFixed(1)} KB`);

  let map;
  try {
    map = parseCsv(raw);
  } catch (err) {
    console.error(`  ✗ Parse failed: ${err.message}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // Add metadata
  const output = {
    _meta: {
      source: CSV_URL,
      fetchedAt: new Date().toISOString(),
      count: Object.keys(map).length,
    },
    funds: map,
  };

  const json = JSON.stringify(output);
  fs.writeFileSync(OUT_FILE, json, 'utf-8');

  const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(`  ✓ Written ${OUT_FILE} (${sizeKB} KB, ${Object.keys(map).length} fund families)`);
  console.log('[fetch-ter-data] Done.');
}

main();
