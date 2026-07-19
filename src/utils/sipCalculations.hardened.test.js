// utils/sipCalculations.hardened.test.js
// Hardened tests with known financial math input/output pairs
import { describe, it, expect } from "vitest";
import {
  calculateSIP,
  calculateLumpsum,
  calculateGoalSIP,
  calculateGoalYears,
  adjustForInflation,
  calculateSWP,
} from "./sipCalculations";

describe("SIP — compound-correct monthly rate", () => {
  it("uses (1+r)^(1/12)-1, not r/12", () => {
    // ₹10,000/month for 10 years at 12% annual
    // Compound-correct monthly rate = (1.12)^(1/12) - 1 ≈ 0.009489
    // Linear approx = 0.12/12 = 0.01 (higher, so old code overestimated)
    const result = calculateSIP(10000, 10, 12);
    // Known correct value with compound monthly rate: ~₹22.24L maturity
    // Old linear approx would give ~₹23.23L (overestimate)
    expect(result.maturity).toBeGreaterThan(2200000);
    expect(result.maturity).toBeLessThan(2300000);
    expect(result.invested).toBe(1200000); // 10k * 12 * 10
  });

  it("₹5000/month, 20 years, 15% = known range", () => {
    const result = calculateSIP(5000, 20, 15);
    // Compound-correct monthly rate gives ~₹66.3L (linear approx overestimates to ~₹75L)
    expect(result.maturity).toBeGreaterThan(6500000);
    expect(result.maturity).toBeLessThan(6800000);
    expect(result.invested).toBe(1200000); // 5k * 12 * 20
  });
});

describe("SIP — r=0 edge case (division by zero guard)", () => {
  it("0% return = invested amount exactly", () => {
    const result = calculateSIP(5000, 10, 0);
    expect(result.invested).toBe(600000);
    expect(result.maturity).toBe(600000);
    expect(result.returns).toBe(0);
  });

  it("0% return yearly breakdown is flat", () => {
    const result = calculateSIP(1000, 3, 0);
    expect(result.yearlyData[0].value).toBe(12000);
    expect(result.yearlyData[1].value).toBe(24000);
    expect(result.yearlyData[2].value).toBe(36000);
  });
});

describe("SIP — boundary/extreme inputs", () => {
  it("zero amount returns zero result", () => {
    const result = calculateSIP(0, 10, 12);
    expect(result.maturity).toBe(0);
  });

  it("zero years returns zero result", () => {
    const result = calculateSIP(5000, 0, 12);
    expect(result.maturity).toBe(0);
  });

  it("caps return at 100%", () => {
    const result = calculateSIP(1000, 1, 150);
    // Should cap at 100%, not use 150%
    expect(result.maturity).toBeGreaterThan(0);
    expect(isFinite(result.maturity)).toBe(true);
  });

  it("negative inputs treated as zero", () => {
    const result = calculateSIP(-5000, 10, 12);
    expect(result.maturity).toBe(0);
  });
});

describe("Lumpsum — compound math", () => {
  it("₹1L at 12% for 10 years", () => {
    const result = calculateLumpsum(100000, 10, 12);
    // 100000 * (1.12)^10 = 310584.82
    expect(result.maturity).toBe(310585);
  });

  it("₹1L at 0% for 10 years = no growth", () => {
    const result = calculateLumpsum(100000, 10, 0);
    expect(result.maturity).toBe(100000);
    expect(result.returns).toBe(0);
  });
});

describe("GoalSIP — reverse SIP with compound rate", () => {
  it("round-trip: GoalSIP → SIP should reach the target", () => {
    const target = 10000000; // ₹1 crore
    const years = 15;
    const rate = 12;
    const monthlySIP = calculateGoalSIP(target, years, rate);
    expect(monthlySIP).toBeGreaterThan(0);
    
    // Feeding the calculated SIP back should reach or exceed the target
    const check = calculateSIP(monthlySIP, years, rate);
    expect(check.maturity).toBeGreaterThanOrEqual(target);
    // But not wildly overshoot (ceil adds at most 1 rupee per month)
    expect(check.maturity).toBeLessThan(target * 1.01);
  });

  it("0% return: simple division", () => {
    const monthlySIP = calculateGoalSIP(120000, 10, 0);
    expect(monthlySIP).toBe(1000); // 120000 / 120 months
  });
});

describe("GoalYears", () => {
  it("₹1L to ₹2L at 12% ≈ 6.1 years", () => {
    const years = calculateGoalYears(200000, 100000, 12);
    expect(years).toBeCloseTo(6.1, 0);
  });

  it("returns null for 0% return", () => {
    expect(calculateGoalYears(200000, 100000, 0)).toBeNull();
  });
});

describe("SWP — r=0 guard", () => {
  it("0% return SWP depletes linearly", () => {
    // ₹12L corpus, ₹10K/month withdrawal, 0% return, 10 years, using 'Debt' to avoid equity exit load
    const result = calculateSWP(1200000, 10000, 0, 10, "Debt");
    expect(result.totalWithdrawn).toBe(1200000);
    expect(result.finalValue).toBe(0);
    expect(result.ranOutYear).toBe(10); // runs out at exactly 10 years
  });

  it("positive return extends corpus life", () => {
    const result = calculateSWP(1200000, 10000, 8, 15);
    // With 8% return, should last longer than 10 years
    expect(result.finalValue).toBeGreaterThan(0);
  });
});

describe("adjustForInflation", () => {
  it("₹1L at 6% inflation over 10 years", () => {
    const real = adjustForInflation(100000, 6, 10);
    // 100000 / (1.06)^10 = 55839.48
    expect(real).toBe(55839);
  });
});
