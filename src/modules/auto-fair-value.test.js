import {describe,it,expect} from "vitest";
import {assessAutoDcf,calculateAutomaticDcf} from "./auto-fair-value.js";
const NOW=new Date("2026-11-13T12:00:00.000Z");
const source="https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/aapl-20260926.htm";
const evidence=Object.fromEntries(["riskFree","beta","equityRiskPremium","costOfDebt","taxRate","equityWeight"].map(k=>[k,{
 value:{riskFree:5.10,beta:1.09,equityRiskPremium:4.41,costOfDebt:4.50,taxRate:17,equityWeight:0.98}[k],
 url:({riskFree:"https://fred.stlouisfed.org/series/DGS10",beta:"https://www.investing.com/equities/apple-computer-inc",equityRiskPremium:"https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctryprem.xlsx",costOfDebt:source,taxRate:source,equityWeight:source})[k],date:"2026-11-12"
}]));
const research={currency:"USD",wacc:9.783,inputs:evidence};
const quote={ticker:"AAPL",price:250,currency:"USD",asOf:"2026-11-12"};
const annual=[
 {y:2024,operatingCashFlow:118254,capitalExpenditure:-9447,interestExpense:1500,effectiveTaxRate:.241},
 {y:2025,operatingCashFlow:111482,capitalExpenditure:-12715,interestExpense:1600,effectiveTaxRate:.156},
 {y:2026,operatingCashFlow:145097,capitalExpenditure:-9041,interestExpense:1700,effectiveTaxRate:.170}
];
// Actual CFO, CapEx and tax rates from Apple's FY2026 10-K.
// The interest figures above are SYNTHETIC test fixtures, not Apple filings data.
// Therefore a successful test below demonstrates only the mathematical engine.
const base={quote,fin:{annual,balance:{netDebt:-56824,dilutedShares:14720.306},lastReportDate:"2026-09-26",source:"Simulated fixture"}};
describe("one-click DCF feasibility (fail closed)",()=>{
 it("rejects actual available Apple cash flow inputs when interest data is missing",()=>{
  const audited={...base,fin:{...base.fin,annual:annual.map(({interestExpense,...rest})=>rest)}};
  const r=assessAutoDcf(audited,{now:NOW});
  expect(r.ok).toBe(false);
  expect(r.problems.join(" ")).toMatch(/CFO, CapEx, interessi/);
  expect(calculateAutomaticDcf(audited,research,{now:NOW}).ok).toBe(false);
 });
 it("rejects Apple if sourced WACC is absent; never assumes a discount rate",()=>{
  const r=calculateAutomaticDcf(base,null,{now:NOW});
  expect(r.ok).toBe(false);
  expect(r.problems.join(" ")).toContain("WACC non verificato");
 });
 it("computes deterministic scenarios only with all synthetic inputs explicitly provided",()=>{
  const r=calculateAutomaticDcf(base,research,{now:NOW});
  expect(r.ok).toBe(true);
  expect(r.status).toBe("ILLUSTRATIVE");
  expect(r.valuation.scenarios).toHaveLength(3);
  expect(r.valuation.weightedFairValue).toBeGreaterThan(0);
  expect(r.assumptions.yearlyFcff[2]).toBeGreaterThan(136056);
  expect(r.assumptions.wacc).toBe(9.783);
 });
 it("rejects stale share count and a missing net-debt bridge",()=>{
  const r=calculateAutomaticDcf({...base,fin:{...base.fin,balance:{dilutedShares:14720.306}}},research,{now:NOW});
  expect(r.ok).toBe(false);
  expect(r.problems.join(" ")).toMatch(/Debito netto/);
 });
 it("does not publish stale or unsupported non-US valuation",()=>{
  const r=calculateAutomaticDcf({...base,quote:{...quote,ticker:"ENI.MI",currency:"EUR"}},research,{now:NOW});
  expect(r.ok).toBe(false);
  expect(r.problems.join(" ")).toMatch(/IFRS/);
 });
 it("rejects unrealistic growth assumptions and WACC near terminal value",()=>{
  expect(calculateAutomaticDcf(base,{...research,wacc:2.6},{now:NOW}).ok).toBe(false);
  expect(calculateAutomaticDcf(base,research,{now:NOW,terminalGrowthPercent:7}).ok).toBe(false);
 });
 it("fails when the most recent price is older than 7 calendar days",()=>{
  const r=assessAutoDcf({...base,quote:{...quote,asOf:"2026-10-30"}},{now:NOW});
  expect(r.ok).toBe(false);
  expect(r.problems.join(" ")).toMatch(/Prezzo giornaliero/);
 });
});
