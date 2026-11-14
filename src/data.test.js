import { afterEach, describe, expect, it } from "vitest";
import { loadQuote, loadFundamentals, mergeQuoteMarketCap, loadMarketCapFallback, setHttp } from "./data.js";

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

describe("fast fundamentals",()=>{
  it("loads standard financial metrics without requesting optional peer data",async()=>{
    const piece=(type,raw)=>({meta:{type:[type]},[type]:[{asOfDate:"2025-12-31",reportedValue:{raw}}]});
    let calls=0;
    setHttp(async(url)=>{
      calls++;
      if(!url.includes("/fundamentals-timeseries/"))throw new Error("Unexpected peer request: "+url);
      return {status:200,data:{timeseries:{result:[
        piece("annualTotalRevenue",2_000_000_000),
        piece("annualFreeCashFlow",200_000_000),
        piece("annualNetDebt",500_000_000),
        piece("annualEBIT",100_000_000),
      ]}}};
    });
    const {fin,val}=await loadFundamentals("TEST",{includePeers:false});
    expect(fin.balance.netDebt).toBe(500);
    expect(fin.annual[0].fcf).toBe(200);
    expect(fin.balance.roic).toBeNull();
    expect(val.peers).toEqual([]);
    expect(calls).toBe(1);
  });
});


describe("Market capitalization provenance and fallbacks",()=>{
  const asOf = "2026-11-12";
  it("takes an available market cap directly from chart metadata",async()=>{
    setHttp(async(url)=>{
      if(!url.includes("/v8/finance/chart/TEST"))throw new Error("Unexpected: "+url);
      return {status:200,data:{chart:{result:[{
        meta:{symbol:"TEST",currency:"USD",instrumentType:"EQUITY",marketCap:2500000000,regularMarketTime:Math.floor(Date.UTC(2026,10,12,21)/1000)},
        timestamp:[Math.floor(Date.UTC(2026,10,11,21)/1000),Math.floor(Date.UTC(2026,10,12,21)/1000)],
        indicators:{quote:[{close:[100,110]}]}
      }]}}};
    });
    const q=await loadQuote("TEST");
    expect(q.price).toBe(110);
    expect(q.marketCap).toBe(2500000000);
    expect(q.marketCapAsOf).toBe(asOf);
    expect(q.marketCapSource).toContain("Yahoo Finance");
  });
  it("joins a recent capitalisation from the already-loaded fundamentals timeseries",()=>{
    const quote={ticker:"TEST",currency:"USD",asOf,marketCap:null};
    const val={marketCap:2200000000,marketCapAsOf:"2026-11-11"};
    expect(mergeQuoteMarketCap(quote,val)).toMatchObject({
      marketCap:2200000000,marketCapAsOf:"2026-11-11",marketCapCurrency:"USD"
    });
  });
  it("rejects outdated, invalid, or unsupported market caps",()=>{
    const quote={ticker:"TEST",currency:"USD",asOf,marketCap:null};
    expect(mergeQuoteMarketCap(quote,{marketCap:2200000000,marketCapAsOf:"2025-12-31"})).toBe(quote);
    expect(mergeQuoteMarketCap(quote,{marketCap:-20,marketCapAsOf:asOf})).toBe(quote);
    expect(mergeQuoteMarketCap({...quote,instrumentType:"ETF"},{marketCap:2200000000,marketCapAsOf:asOf}).marketCap).toBeNull();
    expect(mergeQuoteMarketCap({...quote,marketCap:4000000000},{marketCap:2200000000,marketCapAsOf:asOf}).marketCap).toBe(4000000000);
  });
  it("reads the Yahoo quote fallback with a validated ticker, date, and currency",async()=>{
    setHttp(async(url)=>{
      if(!url.includes("/v7/finance/quote"))throw new Error("Unexpected: "+url);
      return {status:200,data:{quoteResponse:{result:[{
        symbol:"TEST",quoteType:"EQUITY",marketCap:2400000000,currency:"USD",
        regularMarketTime:Math.floor(Date.UTC(2026,10,12,21)/1000)
      }]}}};
    });
    await expect(loadMarketCapFallback("TEST","USD",asOf)).resolves.toMatchObject({
      marketCap:2400000000,marketCapAsOf:asOf,marketCapSource:"Yahoo Finance · quote"
    });
    await expect(loadMarketCapFallback("TEST","EUR",asOf)).resolves.toBeNull();
  });
  it("returns no fallback if Yahoo provides no date or the wrong symbol",async()=>{
    setHttp(async()=>({status:200,data:{quoteResponse:{result:[{symbol:"OTHER",marketCap:1e9,currency:"USD"}]}}}));
    await expect(loadMarketCapFallback("TEST","USD",asOf)).resolves.toBeNull();
    setHttp(async()=>({status:200,data:{quoteResponse:{result:[{symbol:"TEST",marketCap:1e9,currency:"USD"}]}}}));
    await expect(loadMarketCapFallback("TEST","USD",asOf)).resolves.toBeNull();
  });
});
