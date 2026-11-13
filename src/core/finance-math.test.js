import { describe, expect, it } from "vitest";
import { cagr, enterpriseToEquityValue, weightedScore } from "./finance-math.js";

describe("finance math", () => {
  it("computes CAGR and rejects invalid periods", () => { expect(cagr(100, 121, 2)).toBeCloseTo(0.1); expect(cagr(0, 121, 2)).toBeNull(); });
  it("computes enterprise-to-equity bridge", () => { expect(enterpriseToEquityValue({ enterpriseValue: 100, cash: 10, debt: 30 })).toBe(80); });
  it("calculates score coverage without treating missing factors as zero", () => { const result = weightedScore([{ score: 80, weight: 0.5 }, { score: null, weight: 0.5 }]); expect(result.score).toBe(80); expect(result.coverage).toBe(0.5); });
});
