// utils/historicalRates.js

// Historical PPF Rates (India)
// Source: National Savings Institute / Ministry of Finance
export const PPF_RATES = [
  { start: "1999-01-15", end: "2000-01-14", rate: 12.0 },
  { start: "2000-01-15", end: "2001-02-28", rate: 11.0 },
  { start: "2001-03-01", end: "2002-02-28", rate: 9.5 },
  { start: "2002-03-01", end: "2003-02-28", rate: 9.0 },
  { start: "2003-03-01", end: "2011-11-30", rate: 8.0 },
  { start: "2011-12-01", end: "2012-03-31", rate: 8.6 },
  { start: "2012-04-01", end: "2013-03-31", rate: 8.8 },
  { start: "2013-04-01", end: "2016-03-31", rate: 8.7 },
  { start: "2016-04-01", end: "2016-09-30", rate: 8.1 },
  { start: "2016-10-01", end: "2017-03-31", rate: 8.0 },
  { start: "2017-04-01", end: "2017-06-30", rate: 7.9 },
  { start: "2017-07-01", end: "2017-12-31", rate: 7.8 },
  { start: "2018-01-01", end: "2018-09-30", rate: 7.6 },
  { start: "2018-10-01", end: "2019-06-30", rate: 8.0 },
  { start: "2019-07-01", end: "2020-03-31", rate: 7.9 },
  { start: "2020-04-01", end: "2099-12-31", rate: 7.1 }, // Current rate, easily extended
];

// Historical FD Rates (Proxy: SBI 1-3 Year Term Deposit Averages / RBI Repo Rate proxy)
export const FD_RATES = [
  { start: "2000-01-01", end: "2005-12-31", rate: 7.5 },
  { start: "2006-01-01", end: "2008-12-31", rate: 8.5 },
  { start: "2009-01-01", end: "2010-12-31", rate: 7.0 },
  { start: "2011-01-01", end: "2014-12-31", rate: 9.0 },
  { start: "2015-01-01", end: "2018-12-31", rate: 7.2 },
  { start: "2019-01-01", end: "2020-03-31", rate: 6.5 },
  { start: "2020-04-01", end: "2022-04-30", rate: 5.3 }, // COVID lows
  { start: "2022-05-01", end: "2023-03-31", rate: 6.1 }, // Rate hikes
  { start: "2023-04-01", end: "2099-12-31", rate: 6.8 }, // Current avg rate
];

export function getHistoricalRate(type, dateStr) {
  const ts = new Date(dateStr).getTime();
  const lookup = type === "ppf" ? PPF_RATES : FD_RATES;
  
  for (let i = 0; i < lookup.length; i++) {
    const startTs = new Date(lookup[i].start).getTime();
    const endTs = new Date(lookup[i].end).getTime();
    if (ts >= startTs && ts <= endTs) {
      return lookup[i].rate;
    }
  }
  
  // Fallback to the latest available rate
  return lookup[lookup.length - 1].rate;
}
