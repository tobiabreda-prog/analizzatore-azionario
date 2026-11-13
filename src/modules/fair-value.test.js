import { describe, expect, it } from "vitest";
import { valueScenarios } from "./fair-value.js";

const scenarios=[
 {name:"bear",probability:.25,freeCashFlows:[80,82,84,86,88],wacc:.11,terminalGrowth:.015},
 {name:"base",probability:.5,freeCashFlows:[100,108,116,124,132],wacc:.09,terminalGrowth:.025},
 {name:"bull",probability:.25,freeCashFlows:[110,125,140,155,170],wacc:.085,terminalGrowth:.03}
];
describe("scenario DCF",()=>{
 it("returns probability-weighted fair value and margin of safety",()=>{
  const r=valueScenarios({scenarios,netDebt:100,dilutedShares:50,currentPrice:20});
  expect(r.weightedFairValue).toBeGreaterThan(0);
  expect(r.marginOfSafety).toBeCloseTo(r.weightedFairValue/20-1);
  expect(r.scenarios).toHaveLength(3);
 });
 it("rejects probabilities that do not sum to 100%",()=>{
  expect(()=>valueScenarios({scenarios:scenarios.map((s)=>({...s,probability:.2})),netDebt:0,dilutedShares:10})).toThrow(/somma/);
 });
 it("rejects terminal growth equal to or above WACC",()=>{
  const bad=scenarios.map(s=>s.name==="base"?{...s,wacc:.02,terminalGrowth:.03}:s);
  expect(()=>valueScenarios({scenarios:bad,netDebt:0,dilutedShares:10})).toThrow(/WACC/);
 });
});
