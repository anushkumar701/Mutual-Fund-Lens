

async function check() {
  // Nippon: 118668
  const res1 = await fetch("https://api.mfapi.in/mf/118668");
  const data1 = await res1.json();
  const currentNav1 = parseFloat(data1.data[0].nav);
  console.log("Nippon Latest NAV:", currentNav1);

  // Invesco: 120403
  const res2 = await fetch("https://api.mfapi.in/mf/120403");
  const data2 = await res2.json();
  const currentNav2 = parseFloat(data2.data[0].nav);
  console.log("Invesco Latest NAV:", currentNav2);

  const calcStampDuty = (amt) => amt * 0.00005;

  const nipponTrades = [
    { amt: 200, date: "2026-06-02" },
    { amt: 200, date: "2026-06-12" },
    { amt: 201, date: "2026-06-18" }
  ];

  let nipponUnits = 0;
  for (const t of nipponTrades) {
    const net = t.amt - calcStampDuty(t.amt);
    // Find NAV for date
    const navObj = data1.data.find(d => {
      const [dd, mm, yyyy] = d.date.split("-");
      const objDate = `${yyyy}-${mm}-${dd}`;
      return objDate <= t.date; // Approximation for simplicity
    });
    const buyNav = parseFloat(navObj.nav);
    // Mimic the exact math: Units using 6 decimals
    const units = parseFloat((net / buyNav).toFixed(6));
    console.log(`Nippon ${t.date} | Net: ${net.toFixed(2)} | BuyNAV: ${buyNav} | Units: ${units.toFixed(6)}`);
    nipponUnits += units;
  }
  
  console.log("Nippon Total Units:", nipponUnits.toFixed(6));
  console.log("Nippon Current Value:", (nipponUnits * currentNav1).toFixed(2));
  console.log("Expected: 623.62\n");

  const invescoTrades = [
    { amt: 402, date: "2026-06-18" }
  ];
  let invescoUnits = 0;
  for (const t of invescoTrades) {
    const net = t.amt - calcStampDuty(t.amt);
    const navObj = data2.data.find(d => {
      const [dd, mm, yyyy] = d.date.split("-");
      const objDate = `${yyyy}-${mm}-${dd}`;
      return objDate <= t.date; 
    });
    const buyNav = parseFloat(navObj.nav);
    const units = parseFloat((net / buyNav).toFixed(6));
    console.log(`Invesco ${t.date} | Net: ${net.toFixed(2)} | BuyNAV: ${buyNav} | Units: ${units.toFixed(6)}`);
    invescoUnits += units;
  }
  
  console.log("Invesco Total Units:", invescoUnits.toFixed(6));
  console.log("Invesco Current Value:", (invescoUnits * currentNav2).toFixed(2));
  console.log("Expected: 404.45");

}

check();
