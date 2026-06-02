# FundLens — Roadmap & Future Enhancements

## 🏗️ Architecture
- **API**: `https://api.mfapi.in/mf/` — free, no auth required
  - `/mf/all` — full fund list (name + code)
  - `/mf/{code}` — individual fund NAV history + meta
- **State**: React hooks + localStorage (no backend needed)
- **Deployment**: Netlify (auto-deploy from dist/)

## ✅ Completed Features
- [x] Dashboard with fund search → modal (no page navigation)
- [x] Fund Detail Modal (NAV, returns 1M/3M/1Y/3Y/5Y, fund age)
- [x] Screener with active/closed detection, beginner filters
- [x] Compare up to 4 funds (NAV chart, rolling returns, metrics)
- [x] SIP + Goal + ELSS + FIRE Calculator
- [x] Watchlist (saved to localStorage)
- [x] Dark / Light mode toggle
- [x] Mobile responsive layout

## 🚀 Future Enhancements (Planned)

### Phase 2 — Data Enrichment
- [ ] Show real NAV sparkline (30-day mini chart) on each fund card
- [ ] Cache fund metadata in IndexedDB (faster loads)
- [ ] Pre-compute returns for top 500 funds on page load
- [ ] Add SIP date calculator (when does my SIP execute?)

### Phase 3 — User Features  
- [ ] Multiple watchlists (e.g. "ELSS Shortlist", "Retirement")
- [ ] Portfolio tracker (enter units held → show current value)
- [ ] SIP reminder notifications (via browser notifications API)
- [ ] Export watchlist as PDF / CSV

### Phase 4 — Analytics
- [ ] Historical performance charts (area chart with date picker)
- [ ] Category benchmark comparison (fund vs Nifty 50)
- [ ] Rolling returns heatmap (calendar view)
- [ ] Best/worst month tracker

### Phase 5 — Social
- [ ] Shareable fund comparison URLs
- [ ] "Fund of the Week" curated picks
- [ ] User ratings / notes on funds

## 🔧 How to Add a New Page
1. Create `src/pages/NewPage.jsx`
2. Add route in `src/App.jsx`: `<Route path="/new" element={<NewPage/>}/>`
3. Add link in `src/components/NavBar.jsx`

## 🔧 How to Add a New Filter to Screener
1. Add constant in `src/utils/fundFilters.js`
2. Add state in `src/pages/Screener.jsx`
3. Add filter UI in the Filter Panel section
4. Add filter logic in `filtered` useMemo

## 📁 Key Files
| File | Purpose |
|------|---------|
| `src/pages/Dashboard.jsx` | Home page with search + modal |
| `src/pages/Screener.jsx` | Fund browser with filters |
| `src/pages/Compare.jsx` | Side-by-side fund comparison |
| `src/pages/SIPCalculator.jsx` | SIP, Goal, ELSS, FIRE calculators |
| `src/components/FundDetailModal.jsx` | Fund detail popup |
| `src/utils/fundFilters.js` | Filter logic, ER estimation, closed detection |
| `src/utils/goalFilters.js` | Category inference, goal matching |
| `src/utils/metrics.js` | Financial calculations |
| `src/hooks/useFunds.js` | Fetches all funds from API |

## 🚢 Deploy Command
```bash
npm run build
npx netlify-cli deploy --dir=dist --prod
```
