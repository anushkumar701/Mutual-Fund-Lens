# 🔍 FundLens
**India's Premium Mutual Fund Analysis & Screening Platform**

FundLens is a professional-grade, highly optimized React application built to help retail investors make data-driven decisions. It provides a robust, zero-latency environment for screening mutual funds, comparing historical performance, and simulating real-world SIP investments with accurate tax and expense ratio deductions.

---

## 🌟 Core Features

### 1. Smart Fund Screener (`/screener`)
* **Instant Search & Filter:** Blazing fast search capabilities across thousands of Indian mutual funds.
* **Goal-Based Tagging:** Auto-categorizes funds into intelligent buckets (e.g., *Wealth Creation*, *Tax Saving*, *Emergency Fund*).
* **Watchlist & Compare Cart:** Users can bookmark funds to their persistent local storage or add up to 4 funds directly to the Comparison Engine.
* **Estimated Investment Data:** Smart detection of Minimum SIP and Minimum Lumpsum amounts for retail convenience.

### 2. Advanced Comparison Engine (`/compare`)
* **Interactive Data Visualization:** Uses `recharts` for highly optimized, responsive line charts. Users can drag to zoom and select specific historical timeframes (1M, 6M, 1Y, 3Y, 5Y, Max).
* **Calendar Year Annual Returns:** A color-coded matrix showing January-December performance (Gains in Green, Losses in Red) alongside a "Difference" column tracking the spread between the best and worst funds in the comparison pool.
* **Relative Performance Tracking:** Evaluates the month-over-month relative percentage gain across all selected funds.
* **Automated Risk Metrics:** Calculates rolling returns, Monthly Win Rate (consistency metric), 52-Week High/Low positioning, and Fund Age.

### 3. Real Historical SIP Calculator (The Crown Jewel)
* **NAV-Backed Calculations:** Unlike generic mathematical calculators, FundLens runs point-to-point SIP simulations based on actual historical NAV data fetched from the API.
* **Expense Ratio Reverse Engineering:** Mutual fund APIs report NAV *net of expenses*. FundLens intelligently guesses the fund's Expense Ratio based on its plan type (Direct/Regular) and calculates exactly how much money the investor lost to fund house fees (Gross vs. Net breakdown).
* **LTCG Tax Simulator:** Automatically calculates the estimated Post-Tax Take-Home Profit by applying the 12.5% Indian Long Term Capital Gains tax to profits exceeding the ₹1.25 Lakh exemption limit.
* **Dynamic Period Capping:** Ensures mathematical validity by preventing users from simulating SIP periods longer than the youngest fund in the comparison pool.

---

## 🛠️ Technology Stack

* **Core Framework:** React 18, Vite
* **Routing:** React Router v6 (`BrowserRouter` with SPA fallback)
* **Styling:** Tailwind CSS (Custom color schemes, dark mode support, glassmorphism UI)
* **Data Visualization:** Recharts (Optimized for performance with large datasets)
* **API Integration:** Axios (Fetching historical NAV from `mfapi.in`)
* **Icons:** Heroicons
* **State Management:** React Hooks (`useState`, `useMemo`, `useCallback`) + Custom `useLocalStorage` hook for persistence.

---

## 📂 Project Structure

```text
MF LEns/
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── FundCard.jsx    # Screener card with Min SIP/Goal tags
│   │   ├── SIPSlider.jsx   # Custom range sliders
│   │   └── ...
│   ├── hooks/
│   │   ├── useFunds.js         # Axios integration for API fetching
│   │   └── useLocalStorage.js  # Persistent browser state
│   ├── pages/
│   │   ├── Compare.jsx       # The massive Comparison Engine & SIP Calculator
│   │   ├── Screener.jsx      # Fund Discovery UI
│   │   └── SIPCalculator.jsx # Generic Mathematical SIP Tool
│   ├── utils/
│   │   ├── metrics.js        # Core Financial Math (CAGR, XIRR, Win Rate)
│   │   └── goalFilters.js    # Categorization logic
│   ├── App.jsx             # React Router Setup
│   └── index.css           # Global Tailwind Directives & Custom CSS
├── dist/                   # Production build output
├── vite.config.js          # Vite Bundler Config
└── tailwind.config.js      # Custom theme, colors, and animations
```

---

## 🧮 Core Financial Engineering (`utils/metrics.js`)
FundLens doesn't just display data; it engineers it. 
* **CAGR / Annualised Return:** Standardized compound annual growth rate formulas.
* **XIRR Approximation:** Advanced internal rate of return calculations tailored for irregular cash flows (monthly SIP dates mapped to nearest available trading day NAVs).
* **TER Auto-Detection:** Heuristic string-matching algorithm that guesses Expense Ratios based on passive/active/liquid/direct/regular taxonomy.

---

## 🚀 How to Run Locally

**1. Install Dependencies**
Ensure you have Node.js installed, then run:
```bash
npm install
```

**2. Start the Development Server**
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser.

**3. Build for Production**
```bash
npm run build
```
This will compile heavily optimized static assets into the `/dist` directory.

---

## 🌍 Deployment Options

Because FundLens is a static Single Page Application (SPA), it can be hosted anywhere for free.

### Option A: Surge.sh (Current Live Preview)
1. Run `npm run build`
2. Run `cp dist/index.html dist/200.html` (Required to fix React Router paths on Surge)
3. Run `npx surge ./dist your-custom-domain.surge.sh`

### Option B: Vercel / Netlify
1. Push the code to a GitHub repository.
2. Link the repository to your Vercel or Netlify account.
3. The build command is `npm run build` and the publish directory is `dist`.
4. *(Note: A `netlify.toml` file is already included in the root directory to handle SPA redirects automatically if deploying to Netlify).*
