import { weightedScore } from "./finance-math.js";

// Pesi provvisori di riferimento. Non sono calibrati empiricamente e vanno
// validati per mercato/settore prima di produrre raccomandazioni operative.
export const SECTOR_PROFILES = Object.freeze({
  general: { profitability: 0.2, growth: 0.2, balanceSheet: 0.2, valuation: 0.2, cashFlow: 0.2 },
  bank: { profitability: 0.25, growth: 0.1, capitalAdequacy: 0.25, assetQuality: 0.2, valuation: 0.1, dividends: 0.1 },
  insurance: { profitability: 0.2, growth: 0.1, solvency: 0.25, underwriting: 0.2, valuation: 0.15, dividends: 0.1 },
  reit: { occupancy: 0.15, fundsFromOperations: 0.25, leverage: 0.2, balanceSheet: 0.15, valuation: 0.15, dividends: 0.1 },
  utility: { profitability: 0.15, growth: 0.1, leverage: 0.2, cashFlow: 0.2, regulation: 0.15, valuation: 0.2 }
});

export function scoreSector(sector, metrics = {}) {
  const profile = SECTOR_PROFILES[sector] ?? SECTOR_PROFILES.general;
  const factors = Object.entries(profile).map(([key, weight]) => ({ score: metrics[key], weight }));
  const result = weightedScore(factors);
  return { ...result, sector, factorsAvailable: factors.filter((f) => Number.isFinite(f.score)).length, factorsExpected: factors.length, methodologyStatus: "provisional_not_backtested" };
}
