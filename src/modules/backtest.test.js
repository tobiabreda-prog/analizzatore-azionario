import {describe,it,expect} from "vitest";
import {runLongOnlyBacktest} from "./backtest.js";

describe("Fineco transaction costs",()=>{
  const bars=[
    {date:"2026-01-01",close:100},
    {date:"2026-01-02",close:101},
    {date:"2026-01-03",close:102}
  ];
  it("charges the fixed fee on each execution and optional FTT only on buys",()=>{
    const result=runLongOnlyBacktest({
      bars,
      signals:[{date:"2026-01-01",position:1},{date:"2026-01-02",position:0}],
      initialCapital:6000,fixedFee:12.95,feeBps:0,buyTaxBps:20,slippageBps:0
    });
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].commission).toBe(12.95);
    expect(result.trades[0].transactionTax).toBeGreaterThan(0);
    expect(result.trades[1].commission).toBe(12.95);
    expect(result.trades[1].transactionTax).toBe(0);
  });
  it("rejects a buy below the 5,000 minimum notional",()=>{
    expect(()=>runLongOnlyBacktest({
      bars,signals:[{date:"2026-01-01",position:1}],
      initialCapital:4000,fixedFee:12.95,slippageBps:0
    })).toThrow(/minimo di 5.000/);
  });
});
