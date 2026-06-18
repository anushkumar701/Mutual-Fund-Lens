// hooks/usePortfolioNotifications.js
import { useEffect } from "react";
import { fetchFundDetail } from "./useFunds";

const formatCurrency = (val) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
};

export function usePortfolioNotifications() {
  useEffect(() => {
    // Only run on the client
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const runNotificationCheck = async () => {
      // 1. Check if permission is granted
      if (Notification.permission !== "granted") return;

      // 2. Load portfolio and configuration
      const holdingsRaw = localStorage.getItem("fundlens_portfolio");
      if (!holdingsRaw) return;
      
      let holdings = [];
      try {
        holdings = JSON.parse(holdingsRaw);
      } catch {
        return;
      }
      if (!holdings.length) return;

      const notifyRaw = localStorage.getItem("fundlens_portfolio_notify");
      let notifyConfig = { enabled: false, type: "total", time: "evening" };
      try {
        if (notifyRaw) notifyConfig = JSON.parse(notifyRaw);
      } catch {
        // use default
      }

      if (!notifyConfig.enabled) return;

      // 3. Rate limit: check if already notified today
      const todayStr = new Date().toISOString().split("T")[0];
      const lastNotify = localStorage.getItem("fundlens_portfolio_last_notify");
      if (lastNotify === todayStr) return;

      // 4. Time preferences check
      let targetHour = 19;
      let targetMinute = 0;

      if (notifyConfig.time === "morning") {
        targetHour = 9;
      } else if (notifyConfig.time === "evening") {
        targetHour = 20; // 8 PM (standard evening)
      } else if (notifyConfig.time && notifyConfig.time.includes(":")) {
        const [h, m] = notifyConfig.time.split(":").map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          targetHour = h;
          targetMinute = m;
        }
      }

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      if (currentHour < targetHour || (currentHour === targetHour && currentMinute < targetMinute)) {
        return;
      }

      // 5. Fetch NAV updates for all holdings
      try {
        let totalCurrent = 0;
        let totalInvested = 0;
        let totalDailyChange = 0;
        const detailsList = [];

        for (const h of holdings) {
          const details = await fetchFundDetail(h.schemeCode);
          if (details?.data) {
            const currentNav = parseFloat(details.data[0].nav);
            const prevNav = details.data[1] ? parseFloat(details.data[1].nav) : currentNav;
            
            const currentValue = h.units * currentNav;
            const dailyChange = h.units * (currentNav - prevNav);
            const dailyChangePct = prevNav > 0 ? ((currentNav - prevNav) / prevNav) * 100 : 0;

            totalCurrent += currentValue;
            totalInvested += h.amount;
            totalDailyChange += dailyChange;

            detailsList.push({
              name: h.schemeName,
              changePct: dailyChangePct,
              currentValue,
            });
          }
        }

        if (detailsList.length === 0) return;

        // Calculate aggregate daily percentage
        const prevTotalValue = totalCurrent - totalDailyChange;
        const totalDailyChangePct = prevTotalValue > 0 ? (totalDailyChange / prevTotalValue) * 100 : 0;

        // 6. Trigger corresponding Notification
        if (notifyConfig.type === "total") {
          const changeSign = totalDailyChange >= 0 ? "+" : "";
          const direction = totalDailyChange >= 0 ? "▲" : "▼";
          
          new Notification("Portfolio Daily Update", {
            body: `Value: ${formatCurrency(totalCurrent)} (${changeSign}${formatCurrency(totalDailyChange)} / ${direction}${totalDailyChangePct.toFixed(2)}% today)`,
            icon: "/favicon.svg",
            tag: "fundlens-portfolio-daily-total",
          });
        } else {
          // Detail mode: list individual fund changes
          const summaryText = detailsList
            .map((item) => {
              const nameAbbr = item.name.length > 20 ? item.name.slice(0, 20) + "..." : item.name;
              const sign = item.changePct >= 0 ? "+" : "";
              return `${nameAbbr}: ${sign}${item.changePct.toFixed(1)}%`;
            })
            .join("\n");

          new Notification("Portfolio Fund Updates", {
            body: summaryText,
            icon: "/favicon.svg",
            tag: "fundlens-portfolio-daily-details",
          });
        }

        // 7. Persist notification status for today
        localStorage.setItem("fundlens_portfolio_last_notify", todayStr);
      } catch (err) {
        console.warn("Background notification check failed:", err);
      }
    };

    // Defer the execution to let the app finish rendering and clear task queue
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(runNotificationCheck, { timeout: 10000 });
      } else {
        runNotificationCheck();
      }
    }, 4000); // 4 seconds delay

    return () => clearTimeout(timer);
  }, []);
}
