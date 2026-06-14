// utils/sipCalculations.test.js
import { describe, it, expect } from "vitest";
import {
  calculateSIP,
  calculateLumpsum,
  calculateGoalSIP,
  calculateGoalYears,
  adjustForInflation,
} from "./sipCalculations";

describe("calculateSIP", () => {
  it("calculates SIP returns correctly", () => {
    const result = calculateSIP(5000, 10, 12);
    expect(result.invested).toBeGreaterThan(0);
    expect(result.maturity).toBeGreaterThan(result.invested);
    expect(result.returns).toBe(result.maturity - result.invested);
  });

  it("returns zero growth with 0% return", () => {
    const result = calculateSIP(5000, 10, 0);
    expect(result.invested).toBe(5000 * 12 * 10);
    expect(result.maturity).toBe(result.invested);
    expect(result.returns).toBe(0);
  });

  it("handles minimum values", () => {
    const result = calculateSIP(100, 1, 1);
    expect(result.invested).toBeGreaterThan(0);
    expect(result.maturity).toBeGreaterThan(0);
  });

  it("generates yearly breakdown data", () => {
    const result = calculateSIP(1000, 3, 10);
    expect(result.yearlyData).toHaveLength(3);
    expect(result.yearlyData[0].year).toBe(1);
    expect(result.yearlyData[2].year).toBe(3);
  });

  it("applies step-up correctly", () => {
    const withoutStep = calculateSIP(5000, 5, 12);
    const withStep = calculateSIP(5000, 5, 12, 10);
    expect(withStep.maturity).toBeGreaterThan(withoutStep.maturity);
  });
});

describe("calculateLumpsum", () => {
  it("calculates lumpsum returns correctly", () => {
    const result = calculateLumpsum(100000, 10, 12);
    expect(result.invested).toBe(100000);
    expect(result.maturity).toBeGreaterThan(100000);
    expect(result.returns).toBe(result.maturity - result.invested);
  });

  it("returns zero growth with 0% return", () => {
    const result = calculateLumpsum(100000, 10, 0);
    expect(result.invested).toBe(100000);
    expect(result.maturity).toBe(100000);
    expect(result.returns).toBe(0);
  });

  it("generates yearly breakdown data", () => {
    const result = calculateLumpsum(50000, 5, 10);
    expect(result.yearlyData).toHaveLength(5);
  });
});

describe("calculateGoalSIP", () => {
  it("calculates required monthly SIP for a target", () => {
    const monthlySIP = calculateGoalSIP(10000000, 15, 12);
    expect(monthlySIP).toBeGreaterThan(0);
    // Verify by feeding it back: SIP this amount for 15 years at 12%
    const check = calculateSIP(monthlySIP, 15, 12);
    expect(check.maturity).toBeGreaterThanOrEqual(10000000);
  });
});

describe("calculateGoalYears", () => {
  it("calculates years to reach target", () => {
    const years = calculateGoalYears(200000, 100000, 12);
    expect(years).toBeGreaterThan(0);
    expect(years).toBeLessThan(10);
  });

  it("returns null for zero or negative return", () => {
    expect(calculateGoalYears(100000, 50000, 0)).toBeNull();
  });
});

describe("adjustForInflation", () => {
  it("adjusts value for inflation", () => {
    const realValue = adjustForInflation(100000, 6, 10);
    expect(realValue).toBeLessThan(100000);
    expect(realValue).toBeGreaterThan(50000);
  });
});
