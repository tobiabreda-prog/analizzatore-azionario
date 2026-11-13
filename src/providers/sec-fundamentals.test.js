import {describe,it,expect} from "vitest";
import {extractLatestSecMetrics} from "./sec-fundamentals.js";
describe("SEC CompanyFacts mapper",()=>{
 it("selects the latest filed revenue observation with source metadata",()=>{
 const input={entityName:"Example Inc",facts:{ "us-gaap":{RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[{val:100,end:"2024-12-31",filed:"2025-02-01",form:"10-K",fy:2024,fp:"FY",acc:"a"},{val:120,end:"2025-12-31",filed:"2026-02-01",form:"10-K",fy:2025,fp:"FY",acc:"b"}]}}}}};
 const r=extractLatestSecMetrics(input);expect(r.metrics.revenue.value).toBe(120);expect(r.metrics.revenue.filingDate).toBe("2026-02-01");expect(r.source).toBe("SEC EDGAR CompanyFacts");
 });
 it("returns null for unavailable metrics rather than zero",()=>{expect(extractLatestSecMetrics({facts:{}}).metrics.netIncome).toBeNull();});
});
