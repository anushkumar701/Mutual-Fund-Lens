// hooks/usePortfolioNotifications.js
import { useEffect } from "react";
import { fetchFundDetail } from "./useFunds";

const formatCurrency = (val) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

export function usePortfolioNotifications() {
  useEffect(() => {
    // Only run on the client
    if (typeof window === "undefined" || (!window.Capacitor && !("Notification" in window))) return;

    const runNotificationCheck = async () => {
      // 1. Load portfolio holdings
      const holdingsRaw = localStorage.getItem("fundlens_portfolio");
      if (!holdingsRaw) return;

      let holdings = [];
      try {
        holdings = JSON.parse(holdingsRaw);
      } catch {
        return;
      }
      if (!holdings.length) return;

      // 2. Fetch NAV updates for all holdings and compute total current value
      let totalCurrent = 0;
      let totalInvested = 0;
      let totalDailyChange = 0;
      const detailsList = [];

      try {
        for (const h of holdings) {
          const isManual = typeof h.schemeCode === "string" && h.schemeCode.startsWith("manual-");
          if (isManual) {
            const currentNav = h.buyNav;
            const currentValue = h.units * currentNav;
            totalCurrent += currentValue;
            totalInvested += h.amount;
            detailsList.push({
              name: h.schemeName,
              code: h.schemeCode,
              changePct: 0,
              changeValue: 0,
              currentValue,
            });
            continue;
          }

          try {
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
                code: h.schemeCode,
                changePct: dailyChangePct,
                changeValue: dailyChange,
                currentValue,
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch NAV for ${h.schemeCode}:`, err);
            const currentValue = h.units * h.buyNav;
            totalCurrent += currentValue;
            totalInvested += h.amount;
            detailsList.push({
              name: h.schemeName,
              code: h.schemeCode,
              changePct: 0,
              changeValue: 0,
              currentValue,
            });
          }
        }

        // Save computed total current value so Navbar can display it immediately
        if (totalCurrent > 0) {
          localStorage.setItem("fundlens_portfolio_total_value", String(totalCurrent));
        }

        // 3. Notification Guards
        if (!window.Capacitor && Notification.permission !== "granted") return;

        const notifyRaw = localStorage.getItem("fundlens_portfolio_notify");
        let notifyConfig = { enabled: false, type: "total", time: "evening" };
        try {
          if (notifyRaw) notifyConfig = JSON.parse(notifyRaw);
        } catch {
          // use default
        }

        if (!notifyConfig.enabled) return;

        // Rate limit: check if already notified today
        const todayStr = new Date().toISOString().split("T")[0];
        const lastNotify = localStorage.getItem("fundlens_portfolio_last_notify");
        if (lastNotify === todayStr) return;

        // Time preferences check
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

        if (detailsList.length === 0) return;

        // Calculate aggregate daily percentage
        const prevTotalValue = totalCurrent - totalDailyChange;
        const totalDailyChangePct = prevTotalValue > 0 ? (totalDailyChange / prevTotalValue) * 100 : 0;

        // Group individual transactions by fund to prevent duplicate notifications
        const consolidatedMap = {};
        detailsList.forEach((item) => {
          if (!consolidatedMap[item.code]) {
            consolidatedMap[item.code] = {
              name: item.name,
              code: item.code,
              currentValue: 0,
            };
          }
          consolidatedMap[item.code].currentValue += item.currentValue;
        });
        const consolidatedList = Object.values(consolidatedMap);

        const showNotification = async (title, options) => {
          if (window.Capacitor) {
            try {
              const { LocalNotifications } = await import("@capacitor/local-notifications");
              await LocalNotifications.schedule({
                notifications: [
                  {
                    title: title,
                    body: options?.body || "Portfolio Valuation Update",
                    id: Math.floor(Math.random() * 100000),
                    extra: null,
                  },
                ],
              });
              return;
            } catch (e) {
              console.warn("Capacitor LocalNotifications failed: ", e);
            }
          }

          let shown = false;
          if ("serviceWorker" in navigator) {
            try {
              const swReady = navigator.serviceWorker.ready;
              const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 800));
              const reg = await Promise.race([swReady, timeout]);
              if (reg && "showNotification" in reg) {
                await reg.showNotification(title, options);
                shown = true;
              }
            } catch (e) {
              console.warn("SW showNotification failed:", e);
            }
          }
          if (!shown) {
            try {
              new Notification(title, options);
            } catch (e) {
              console.error("Notification constructor failed:", e);
            }
          }
        };

        // 4. Trigger corresponding Notification
        if (notifyConfig.type === "total") {
          await showNotification(`Portfolio: ${formatCurrency(totalCurrent)}`, {
            icon: "/favicon.svg",
            tag: "fundlens-portfolio-daily-total",
          });
        } else {
          // Detail mode: trigger a separate browser notification for each unique fund
          for (let index = 0; index < consolidatedList.length; index++) {
            const item = consolidatedList[index];
            await showNotification(item.name, {
              body: `Current Value: ${formatCurrency(item.currentValue)}`,
              icon: "/favicon.svg",
              tag: `fundlens-fund-detail-${index}-${Date.now()}`,
            });
          }
        }

        // 5. Persist notification status for today
        localStorage.setItem("fundlens_portfolio_last_notify", todayStr);
      } catch (err) {
        console.warn("Background notification check failed:", err);
      }
    };

    let intervalId = null;

    // Defer the execution to let the app finish rendering and clear task queue
    const timer = setTimeout(() => {
      runNotificationCheck();
      // Setup periodic checks every 30 seconds to catch when custom time rolls over
      intervalId = setInterval(runNotificationCheck, 30000);
    }, 4000); // 4 seconds delay

    return () => {
      clearTimeout(timer);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);
}
