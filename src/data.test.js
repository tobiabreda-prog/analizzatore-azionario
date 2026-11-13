import { afterEach, describe, expect, it } from "vitest";
import { loadQuote, loadFundamentals, setHttp } from "./data.js";

afterEach(() => {
  setHttp(async () => { throw new Error("HTTP mock non configurato"); });
});

describe("Yahoo daily quote normalization",()=>{
  it("uses the last dated daily close instead of an undated intraday field",async()=>{
    const timestamps=[
      Math.floor(Date.UTC(2026,10,11,21,0,0)/1000),
      Math.floor(Date.UTC(2026,10,12,21,0,0)/1000)
    ];
    setHttp(async(url)=>{
      if(!url.includes("/v8/finance/chart/TEST"))throw new Error("URL inatteso: "+url);
      return {
        status:200,
        data:{chart:{result:[{
          meta:{currency:"USD",symbol:"TEST",regularMarketPrice:999,gmtoffset:0},
          timestamp:timestamps,
          indicators:{quote:[{close:[100,110],high:[101,111],low:[99,109],volume:[1000,1200]}]}
        }],error:null}}
      };
    });
    const quote=await loadQuote("TEST");
    expect(quote.price).toBe(110);
    expect(quote.priceType).toBe("daily_close");
    expect(quote.asOf).toBe("2026-11-12");
  });

  it("does not invent high, low or volume values when the provider omits them",async()=>{
    const timestamps=[
      Math.floor(Date.UTC(2026,10,11,21,0,0)/1000),
      Math.floor(Date.UTC(2026,10,12,21,0,0)/1000)
    ];
    setHttp(async()=>({
      status:200,
      data:{chart:{result:[{
        meta:{currency:"USD",symbol:"TEST",regularMarketPrice:999,gmtoffset:0},
        timestamp:timestamps,
        indicators:{quote:[{close:[100,110],high:[null,null],low:[null,null],volume:[null,null]}]}
      }],error:null}}
    }));
    const quote=await loadQuote("TEST");
    expect(quote.support).toEqual([null,null]);
    expect(quote.resistance).toEqual([null,null]);
    expect(quote.history.at(-1)[2]).toBeNull();
  });
});

describe("fast fundamentals and DCF share count",()=>{
  it("reads annual diluted-average shares in millions without requesting sector peers",async()=>{
    const piece=(type,raw)=>({meta:{type:[type]},[type]:[{asOfDate:"2025-12-31",reportedValue:{raw}}]});
    let calls=0;
    setHttp(async(url)=>{
      calls++;
      if(!url.includes("/fundamentals-timeseries/"))throw new Error("Peer request was not expected: "+url);
      return {status:200,data:{timeseries:{result:[
        piece("annualTotalRevenue",2_000_000_000),
        piece("annualFreeCashFlow",200_000_000),
        piece("annualNetDebt",500_000_000),
        piece("annualDilutedAverageShares",500_000_000),
        piece("annualEBIT",100_000_000),
      ]}}};
    });
    const {fin,val}=await loadFundamentals("TEST",{includePeers:false});
    expect(fin.balance.dilutedShares).toBe(500);
    expect(fin.balance.netDebt).toBe(500);
    expect(fin.annual[0].fcf).toBe(200);
    expect(fin.balance.roic).toBeNull(); // no fabricated tax rate
    expect(val.peers).toEqual([]);
    expect(calls).toBe(1);
  });
});

describe("sourced unlevered cashflow inputs",()=>{
 it("keeps CFO, CapEx, interest and tax aligned by financial year",async()=>{
  const component=(type,rows)=>({meta:{type:[type]},[type]:rows.map(([year,raw])=>({asOfDate:year+"-09-26",reportedValue:{raw}}))});
  setHttp(async url=>{
   if(!url.includes("/fundamentals-timeseries/"))throw new Error("Unexpected request: "+url);
   return {status:200,data:{timeseries:{result:[
    component("annualTotalRevenue",[[2024,1000000000],[2025,1100000000],[2026,1200000000]]),
    component("annualOperatingCashFlow",[[2024,118254000000],[2025,111482000000],[2026,145097000000]]),
    component("annualCapitalExpenditure",[[2024,-9447000000],[2025,-12715000000],[2026,-9041000000]]),
    component("annualInterestExpense",[[2024,1200000000],[2025,1300000000],[2026,1400000000]]),
    component("annualTaxRateForCalcs",[[2024,.241],[2025,.156],[2026,.17]])
   ]}}};
  });
  const r=await loadFundamentals("TEST",{includePeers:false});
  expect(r.fin.annual).toHaveLength(3);
  expect(r.fin.annual[2].operatingCashFlow).toBe(145097);
  expect(r.fin.annual[2].capitalExpenditure).toBe(-9041);
  expect(r.fin.annual[2].interestExpense).toBe(1400);
  expect(r.fin.annual[2].effectiveTaxRate).toBe(.17);
 });
});
