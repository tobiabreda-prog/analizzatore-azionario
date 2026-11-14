import {describe,it,expect} from "vitest";
import {buildCorporateCalendar,dividendMetrics,earningsSurprise,normalizeDividend,normalizeEarningsEvent,formatEstimatePeriod,fiveYearYieldInfo} from "./earnings-dividends.js";
describe("earnings and dividends",()=>{
 it("normalizes sourced events and rejects undated events",()=>{expect(normalizeEarningsEvent({date:"2026-11-20",source:"issuer"}).status).toBe("unconfirmed");expect(()=>normalizeEarningsEvent({source:"x"})).toThrow();});
 it("calculates surprise only with actual and estimate",()=>{expect(earningsSurprise(1.1,1)).toEqual({absolute:0.10000000000000009,percent:10.000000000000009});expect(earningsSurprise(1,null)).toBeNull();});
 it("calculates dividend metrics without guessing",()=>{expect(dividendMetrics({annualDividend:2,price:50,earningsPerShare:4,freeCashFlowPerShare:5}).yieldPct).toBe(4);expect(dividendMetrics({}).yieldPct).toBeNull();});
 it("builds a dated event calendar",()=>{const e=normalizeEarningsEvent({date:"2026-11-20",source:"issuer"});const d=normalizeDividend({amount:1,exDate:"2026-11-18",source:"issuer"});expect(buildCorporateCalendar({earnings:[e],dividends:[d]}).map(x=>x.type)).toEqual(["dividend","earnings"]);});
});

describe("Yahoo earnings/dividend units and labels",()=>{
 it("never displays unexpanded provider codes 0q and +1q",()=>{
  expect(formatEstimatePeriod("0q","2026-12-31")).toBe("Trimestre corrente · fine 2026-12-31");
  expect(formatEstimatePeriod("+1q")).toBe("Trimestre successivo");
  expect(formatEstimatePeriod("0y")).toBe("Anno fiscale corrente");
  expect(formatEstimatePeriod("unknown")).toBe("n.d.");
 });
 it("recomputes a GOOGL-like EPS surprise from displayed values",()=>{
  expect(earningsSurprise(2.12,3.01).percent).toBeCloseTo(-29.5681,3);
  expect(earningsSurprise(9.11,2.90).percent).toBeCloseTo(214.1379,3);
 });
 it("leaves Yahoo fiveYearAvgDividendYield unchanged in percent units",()=>{
  expect(fiveYearYieldInfo({providedPercent:0.47})).toEqual({value:0.47,reason:"Yahoo Finance"});
 });
 it("explains a five-year history gap without inventing a five-year average",()=>{
  const info=fiveYearYieldInfo({
   dividends:[{date:"2024-06-10",amount:0.20},{date:"2026-09-04",amount:0.22}],
   historyStart:"2021-11-14",asOf:"2026-11-14"
  });
  expect(info.value).toBeNull();
  expect(info.reason).toContain("inferiore a 5 anni");
 });
 it("does not claim a short history when the Yahoo chart lacks five years of coverage",()=>{
  const info=fiveYearYieldInfo({
   dividends:[{date:"2024-06-10",amount:0.20}],historyStart:"2024-01-01",asOf:"2026-11-14"
  });
  expect(info.reason).toBe("Dato non disponibile dalla fonte");
 });
});
