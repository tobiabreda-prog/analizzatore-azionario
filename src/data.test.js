import { afterEach, describe, expect, it, vi } from "vitest";
import { loadQuote, loadFundamentals, mergeQuoteMarketCap, loadMarketCapFallback, loadCorporateEvents, resetYahooSession, histMedian, pairedWeeklyReturns, buildFin, loadAnalysts, setHttp } from "./data.js";

afterEach(() => {
  setHttp(async () => { throw new Error("HTTP mock non configurato"); });
  resetYahooSession();
  vi.useRealTimers();
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

describe("GOOGL earnings and dividend intelligence",()=>{
 const ts=date=>Date.parse(date+"T16:00:00Z")/1000;
 const response=(opts={})=>async(url)=>{
  if(url==="https://fc.yahoo.com")return {status:200,headers:{"set-cookie":"A1=test_cookie; Path=/;"},data:""};
  if(url.includes("/v1/test/getcrumb"))return {status:200,data:"testingcrumb123",headers:{}};
  if(url.includes("/v10/finance/quoteSummary/GOOGL"))return {status:200,data:{quoteSummary:{result:[{
   calendarEvents:{earnings:{earningsDate:[{raw:ts("2026-10-28")}] }},
   earningsTrend:{trend:[{period:"0q",endDate:"2026-12-31",
    earningsEstimate:{avg:{raw:3.20}},revenueEstimate:{avg:{raw:142400000000}}}]},
   earningsHistory:{history:[{quarter:{raw:ts("2026-09-30")},epsActual:{raw:2.12},
    epsEstimate:{raw:3.01},surprisePercent:{raw:-0.2957}}]},
   summaryDetail:{dividendRate:{raw:0.88},dividendYield:{raw:0.003},
    payoutRatio:{raw:0.045},fiveYearAvgDividendYield:opts.providerFiveYearYield===undefined?null:{raw:opts.providerFiveYearYield}},
   defaultKeyStatistics:{trailingEps:{raw:19}}
  }]}}};
  if(url.includes("/v7/finance/quote"))return {status:200,data:{quoteResponse:{result:opts.noFutureDate ? [] : [{
   symbol:"GOOGL",earningsTimestampStart:ts("2027-02-03")
  }]}}};
  if(url.includes("/v8/finance/chart/GOOGL"))return {status:200,data:{chart:{result:[{
   timestamp:[ts("2021-11-14"),ts("2026-11-13")],
   events:{dividends:{first:{date:ts("2024-06-10"),amount:0.20},
    last:{date:ts("2026-09-04"),amount:0.22}}}
  }]}}};
  throw new Error("URL inatteso: "+url);
 };
 it("does not treat an old quarterly report as the future, and clearly flags fallback estimate",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  setHttp(response());
  const ev=await loadCorporateEvents("GOOGL");
  expect(ev.earnings.nextDate).toBe("2027-02-03");
  expect(ev.earnings.nextDateStatus).toBe("stima_yahoo");
  expect(ev.earnings.estimatePeriod).toBe("0q");
  expect(ev.earnings.estimatePeriodEnd).toBe("2026-12-31");
  expect(ev.earnings.epsEstimate).toBe(3.20);
  expect(ev.earnings.revenueEstimate).toBe(142400000000);
  expect(ev.earnings.history[0].surprisePct).toBeCloseTo(-29.5681,3);
  expect(ev.dividends.yield).toBe(0.30);
  expect(ev.dividends.fiveYearAvgYield).toBeNull();
  expect(ev.dividends.fiveYearAvgYieldReason).toContain("inferiore a 5 anni");
 });
 it("explains a missing upcoming date instead of reusing the past report",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  setHttp(response({noFutureDate:true,providerFiveYearYield:0.42}));
  const ev=await loadCorporateEvents("GOOGL");
  expect(ev.earnings.nextDate).toBeNull();
  expect(ev.earnings.nextDateStatus).toBe("non_disponibile");
  expect(ev.dividends.fiveYearAvgYield).toBe(0.42);
 });
});


describe("fundamental data consistency and historical comparisons",()=>{
 const point=(d,v)=>({d,v});
 const series=(...pts)=>pts.map(([d,v])=>point(d,v));
 it("rejects four recent valuation observations masquerading as five years",()=>{
  const v=series(["2026-01-01",20],["2026-04-01",22],["2026-07-01",25],["2026-10-01",24]);
  expect(histMedian(v,Date.parse("2026-11-14T12:00:00Z"))).toBeNull();
 });
 it("admits a genuine well-covered five-year valuation series",()=>{
  const years=["2022-01-01","2022-07-01","2023-01-01","2023-07-01",
   "2024-01-01","2024-07-01","2025-01-01","2025-07-01","2026-01-01","2026-10-31"];
  const result=histMedian(years.map((d,i)=>point(d,10+i)),Date.parse("2026-11-14T12:00:00Z"));
  expect(result?.v).toBe(14.5);
  expect(result?.span).toBeGreaterThan(4.4);
  expect(result?.observations).toBe(10);
 });
 it("rejects old snapshots even when the historical span exceeds 4 years",()=>{
  const years=["2019-09-01","2020-04-01","2020-10-01","2021-04-01",
   "2021-10-01","2022-04-01","2022-10-01","2023-04-01","2024-01-01"];
  expect(histMedian(years.map((d,i)=>point(d,10+i)),Date.parse("2026-11-14T12:00:00Z"))).toBeNull();
 });
 it("never divides income by equity or EBIT by interest from different fiscal years",()=>{
  const s={
   annualTotalRevenue:series(["2025-12-31",1000000000]),
   annualNetIncome:series(["2024-12-31",100000000],["2025-12-31",120000000]),
   annualStockholdersEquity:series(["2024-12-31",800000000]),
   annualEBIT:series(["2025-12-31",200000000]),
   annualInterestExpense:series(["2024-12-31",30000000]),
   annualCurrentAssets:series(["2025-12-31",500000000]),
   annualCurrentLiabilities:series(["2024-12-31",250000000]),
   annualTaxRateForCalcs:series(["2025-12-31",0.25]),
   annualInvestedCapital:series(["2025-12-31",900000000])
  };
  const result=buildFin(s);
  expect(result.balance.roe).toBeNull();
  expect(result.balance.interestCover).toBeNull();
  expect(result.balance.currentRatio).toBeNull();
  expect(result.balance.roic).toBeCloseTo(16.7,1);
  s.annualStockholdersEquity.push(point("2025-12-31",900000000));
  s.annualInterestExpense.push(point("2025-12-31",40000000));
  s.annualCurrentLiabilities.push(point("2025-12-31",250000000));
  const aligned=buildFin(s);
  expect(aligned.balance.roe).toBeCloseTo(13.3,1);
  expect(aligned.balance.interestCover).toBeCloseTo(5,4);
  expect(aligned.balance.currentRatio).toBeCloseTo(2,4);
 });
 it("aligns equity and benchmark on identical trading weeks, despite different day stamps",()=>{
  const ts=Date.parse("2026-11-13T00:00:00Z");
  const fmt=t=>new Date(t).toISOString().slice(0,10);
  const stock=Array.from({length:54},(_,i)=>{
   const t=ts-(53-i)*7*864e5;
   return [fmt(t),100+i];
  });
  const index=stock.map((r,i)=>[fmt(Date.parse(r[0]+"T00:00:00Z")-4*864e5),200+2*i]);
  const paired=pairedWeeklyReturns(stock,index);
  expect(paired.stock.r13).toBeCloseTo((153/140-1)*100,1);
  expect(paired.index.r13).toBeCloseTo((306/280-1)*100,1);
  expect(paired.stock.r52).not.toBeNull();
  const previousOnly=index.slice(0,-1);
  expect(pairedWeeklyReturns(stock,previousOnly)).toBeNull();
  const noPrior=index.filter((_,i)=>i!==40);
  expect(pairedWeeklyReturns(stock,noPrior)?.index.r13).toBeNull();
 });
});


describe("sector metadata from quoteSummary",()=>{
 const yahooMock=(unsupportedProfile=false)=>async url=>{
  if(url==="https://fc.yahoo.com")return {status:200,headers:{"set-cookie":"A1=test-cookie; Path=/"},data:""};
  if(url.includes("/v1/test/getcrumb"))return {status:200,data:"testcrumb123",headers:{}};
  if(url.includes("/v10/finance/quoteSummary/TEST")){
   if(unsupportedProfile&&url.includes("assetProfile"))return {status:400,data:{error:"unsupported module"}};
   return {status:200,data:{quoteSummary:{result:[{
    financialData:{targetMeanPrice:{raw:110}},
    recommendationTrend:{trend:[{buy:{raw:3},sell:{raw:1},hold:{raw:2}}]},
    ...(unsupportedProfile?{}:{assetProfile:{sector:"Financial Services",industry:"Banks - Diversified"}})
   }]}}};
  }
  throw new Error("Unexpected URL: "+url);
 };
 it("reads provider sector without inventing classification",async()=>{
  setHttp(yahooMock());
  const result=await loadAnalysts("TEST");
  expect(result.sector).toBe("Financial Services");
  expect(result.industry).toBe("Banks - Diversified");
  expect(result.sectorSource).toContain("Yahoo Finance");
  expect(result.targetMean).toBe(110);
 });
 it("keeps analyst data when profile module is unavailable",async()=>{
  setHttp(yahooMock(true));
  const result=await loadAnalysts("TEST");
  expect(result.targetMean).toBe(110);
  expect(result.sector).toBeNull();
 });
});
