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
    expect(result.totalCommission).toBe(25.9);
    expect(result.totalTransactionTax).toBeGreaterThan(0);
  });
  it("charges the Italian non-frequent trading fee on both executions and reports totals",()=>{
    const result=runLongOnlyBacktest({
      bars,
      signals:[{date:"2026-01-01",position:1},{date:"2026-01-02",position:0}],
      initialCapital:6000,fixedFee:19,feeBps:0,buyTaxBps:0,slippageBps:0
    });
    expect(result.trades[0].commission).toBe(19);
    expect(result.trades[1].commission).toBe(19);
    expect(result.totalCommission).toBe(38);
    expect(result.totalTransactionTax).toBe(0);
  });
  it("accepts a gross investment exactly at the shared 5,000 minimum plus costs",()=>{
    const result=runLongOnlyBacktest({
      bars,
      signals:[{date:"2026-01-01",position:1}],
      initialCapital:5029,fixedFee:19,buyTaxBps:20,slippageBps:0
    });
    expect(result.trades[0].grossNotional).toBeCloseTo(5000,8);
  });
  it("rejects a buy below the 5,000 minimum notional",()=>{
    expect(()=>runLongOnlyBacktest({
      bars,signals:[{date:"2026-01-01",position:1}],
      initialCapital:4000,fixedFee:12.95,slippageBps:0
    })).toThrow(/minimo di 5.000/);
  });
});

describe("backtest data integrity and execution timing",()=>{
  const daily=[
    {date:"2026-01-05",close:100},
    {date:"2026-01-06",close:101},
    {date:"2026-01-07",close:102},
    {date:"2026-01-08",close:103}
  ];
  it("executes a signal generated at one close on the following bar",()=>{
    const result=runLongOnlyBacktest({
      bars:daily,
      signals:[{date:"2026-01-05",position:1},{date:"2026-01-07",position:0}],
      initialCapital:10000,fixedFee:0,feeBps:0,slippageBps:0,minNotional:0
    });
    expect(result.trades.map(x=>[x.date,x.side])).toEqual([
      ["2026-01-06","BUY"],["2026-01-08","SELL"]
    ]);
    expect(result.finalValue).toBeGreaterThan(10000);
  });
  it("rejects duplicate dates and signals outside the test interval",()=>{
    const duplicate=[...daily,{date:"2026-01-08",close:104}];
    expect(()=>runLongOnlyBacktest({bars:duplicate,signals:[],initialCapital:10000,minNotional:0})).toThrow(/date duplicate/);
    expect(()=>runLongOnlyBacktest({bars:daily,signals:[{date:"2026-01-09",position:1}],initialCapital:10000,minNotional:0})).toThrow(/fuori dall'intervallo/);
  });
});
