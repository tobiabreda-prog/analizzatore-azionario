import {describe,it,expect} from "vitest";
import {buildPositions,markPortfolio} from "./portfolio.js";
import {runLongOnlyBacktest} from "./backtest.js";
import {analyzeRisk} from "../core/risk-engine.js";
describe("portfolio and risk",()=>{
 it("tracks average cost and realized P&L",()=>{const p=buildPositions([{id:"1",symbol:"ABC",side:"BUY",quantity:10,price:10,currency:"EUR",date:"2026-01-01"},{id:"2",symbol:"ABC",side:"SELL",quantity:2,price:12,currency:"EUR",date:"2026-02-01"}])[0];expect(p.quantity).toBe(8);expect(p.realizedPnl).toBe(4);});
 it("does not value quotes with wrong currency",()=>{const p=buildPositions([{id:"1",symbol:"ABC",side:"BUY",quantity:1,price:10,currency:"EUR",date:"2026-01-01"}]);expect(markPortfolio(p,{ABC:{price:11,currency:"USD"}})[0].marketValue).toBeNull();});
 it("runs a next-bar signal backtest",()=>{const r=runLongOnlyBacktest({bars:[{date:"2026-01-01",close:10},{date:"2026-01-02",close:11},{date:"2026-01-03",close:12}],signals:[{date:"2026-01-01",position:1}],feeBps:0,slippageBps:0});expect(r.finalValue).toBeGreaterThan(10000);});
 it("rejects invalid signals and dates",()=>{const bars=[{date:"2026-01-01",close:10},{date:"2026-01-02",close:11},{date:"2026-01-03",close:12}];expect(()=>runLongOnlyBacktest({bars,signals:[{date:"2026-01-01",position:2}]})).toThrow(/Segnali/);expect(()=>runLongOnlyBacktest({bars:[{date:"2026-02-30",close:10},{date:"2026-03-01",close:11},{date:"2026-03-02",close:12}],signals:[]})).toThrow(/Serie prezzi/);});
 it("applies a fixed commission on both sides",()=>{const bars=[{date:"2026-01-01",close:10},{date:"2026-01-02",close:11},{date:"2026-01-03",close:12},{date:"2026-01-04",close:13}];const signals=[{date:"2026-01-01",position:1},{date:"2026-01-03",position:0}];const free=runLongOnlyBacktest({bars,signals,feeBps:0,slippageBps:0});const paid=runLongOnlyBacktest({bars,signals,feeBps:0,fixedFee:9.95,slippageBps:0});expect(paid.finalValue).toBeLessThan(free.finalValue);expect(paid.trades.every(t=>t.commission===9.95)).toBe(true);});
 it("calculates risk metrics",()=>{expect(analyzeRisk({returns:[.01,-.02,.01,.02],equityCurve:[100,110,90,120]}).status).toBe("ok");});
});
