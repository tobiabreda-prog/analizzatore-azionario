import {describe,it,expect} from "vitest";
import {buildCorporateCalendar,dividendMetrics,earningsSurprise,normalizeDividend,normalizeEarningsEvent} from "./earnings-dividends.js";
describe("earnings and dividends",()=>{
 it("normalizes sourced events and rejects undated events",()=>{expect(normalizeEarningsEvent({date:"2026-11-20",source:"issuer"}).status).toBe("unconfirmed");expect(()=>normalizeEarningsEvent({source:"x"})).toThrow();});
 it("calculates surprise only with actual and estimate",()=>{expect(earningsSurprise(1.1,1)).toEqual({absolute:0.10000000000000009,percent:10.000000000000009});expect(earningsSurprise(1,null)).toBeNull();});
 it("calculates dividend metrics without guessing",()=>{expect(dividendMetrics({annualDividend:2,price:50,earningsPerShare:4,freeCashFlowPerShare:5}).yieldPct).toBe(4);expect(dividendMetrics({}).yieldPct).toBeNull();});
 it("builds a dated event calendar",()=>{const e=normalizeEarningsEvent({date:"2026-11-20",source:"issuer"});const d=normalizeDividend({amount:1,exDate:"2026-11-18",source:"issuer"});expect(buildCorporateCalendar({earnings:[e],dividends:[d]}).map(x=>x.type)).toEqual(["dividend","earnings"]);});
});
