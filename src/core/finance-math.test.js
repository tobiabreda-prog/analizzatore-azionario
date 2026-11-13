import { describe, expect, it } from "vitest";
import { cagr, dcfValue, enterpriseToEquityValue, weightedScore } from "./finance-math.js";

describe("finance math", () => {
  it("computes CAGR and rejects invalid periods", () => { expect(cagr(100, 121, 2)).toBeCloseTo(0.1); expect(cagr(0, 121, 2)).toBeNull(); });
  it("computes enterprise-to-equity bridge", () => { expect(enterpriseToEquityValue({ enterpriseValue: 100, cash: 10, debt: 30 })).toBe(80); });
  it("rejects invalid terminal growth assumptions", () => { expect(dcfValue({ freeCashFlows: [10, 12], wacc: 0.08, terminalGrowth: 0.08, dilutedShares: 10 }).ok).toBe(false); });
  it("computes a DCF only with coherent inputs", () => { const result = dcfValue({ freeCashFlows: [10, 12, 14], wacc: 0.1, terminalGrowth: 0.03, netDebt: 20, dilutedShares: 10 }); expect(result.ok).toBe(true); expect(result.valuePerShare).toBeGreaterThan(0); });
  it("calculates score coverage without treating missing factors as zero", () => { const result = weightedScore([{ score: 80, weight: 0.5 }, { score: null, weight: 0.5 }]); expect(result.score).toBe(80); expect(result.coverage).toBe(0.5); });
});
