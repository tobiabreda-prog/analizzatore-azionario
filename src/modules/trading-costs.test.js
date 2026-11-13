import {describe,it,expect} from "vitest";
import {MIN_INVESTMENT_NOTIONAL,FINECO_DEFAULT_FEES,defaultFinecoFee,ITALIAN_FTT_BPS_2026} from "./trading-costs.js";

describe("Fineco trading cost defaults",()=>{
  it("uses 5,000 as minimum notional for EUR and USD investments",()=>{
    expect(MIN_INVESTMENT_NOTIONAL).toBe(5000);
  });
  it("uses non-frequent trading commissions supplied by the user",()=>{
    expect(FINECO_DEFAULT_FEES).toEqual({EUR:19,USD:12.95});
    expect(defaultFinecoFee("EUR")).toBe(19);
    expect(defaultFinecoFee("USD")).toBe(12.95);
    expect(defaultFinecoFee("GBP")).toBe(0);
  });
  it("uses 2026 Italian FTT rates only as optional selectable estimates",()=>{
    expect(ITALIAN_FTT_BPS_2026).toEqual({REGULATED:20,OTC:40});
  });
});
