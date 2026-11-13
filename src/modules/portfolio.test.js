import {describe,it,expect} from "vitest";
import {buildPositions} from "./portfolio.js";

describe("portfolio commissions and taxes",()=>{
  it("includes buy-side taxes in cost basis and reports them separately",()=>{
    const p=buildPositions([
      {id:"1",symbol:"ABC",side:"BUY",quantity:100,price:50,currency:"EUR",date:"2026-01-01",fees:19,taxes:10},
      {id:"2",symbol:"ABC",side:"SELL",quantity:50,price:60,currency:"EUR",date:"2026-01-02",fees:19,taxes:0}
    ])[0];
    expect(p.taxesPaid).toBe(10);
    expect(p.feesPaid).toBe(38);
    expect(p.realizedPnl).toBeCloseTo(466.5,8);
    expect(p.quantity).toBe(50);
  });
});
