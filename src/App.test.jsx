import { describe, expect, it } from "vitest";
import { buildAnnualMetrics, computeScores, buildReportRequest } from "./App.jsx";

function history(count=60){
  return Array.from({length:count},(_,i)=>{
    const date=new Date(Date.UTC(2026,10,12)-(count-1-i)*7*86400000).toISOString().slice(0,10);
    return [date,100+i,1000];
  });
}
function dataset(latestNetIncome){
  const prices=history();
  return {
    quote:{ticker:"TEST",price:143,currency:"USD",source:"test-feed",asOf:prices.at(-1)[0],history:prices,sma50:130,sma200:110,rsi14:55},
    fin:{
      annual:[
        {y:2023,rev:100,ni:10,eps:5,ebitda:20,op:15},
        {y:2024,rev:110,ni:11,eps:6,ebitda:22,op:16},
        {y:2025,rev:120,ni:latestNetIncome,eps:null,ebitda:24,op:18}
      ],
      balance:{netDebt:10,currentRatio:1.5,interestCover:5,roe:10},
      lastReportDate:"2026-03-01",isLatest:true,source:"test-financial-feed"
    },
    val:{metrics:[{k:"P/E",v:20,sector:18,hist5y:22,date:"2026-11-12"}],asOf:"2026-11-12",source:"test-valuation-feed"},
    an:{targetMean:160,ratings:{buy:5,hold:3,sell:2}},
    mkt:{stock:{r26:10,r52:20},index:{r26:5,r52:10}}
  };
}
const tech=[{hist:1,s50:130,s200:110,rsi:55}];

describe("financial scoring missing-value handling",()=>{
  it("keeps profitability margin unavailable when net income is missing",()=>{
    const result=computeScores(dataset(null),tech);
    expect(result.derived.nm).toBeNull();
    expect(result.readiness.ready).toBe(false);
    expect(result.overall).toBeNull();
  });
  it("distinguishes an actual zero net income from a missing value",()=>{
    const result=computeScores(dataset(0),tech);
    expect(result.derived.nm).toBe(0);
  });
  it("does not calculate EPS growth when the latest EPS is missing",()=>{
    const result=computeScores(dataset(10),tech);
    expect(result.derived.epsG).toBeNull();
  });
});

describe("annual statement display metrics",()=>{
  it("keeps missing gross profit, operating profit and net income margins unavailable",()=>{
    const rows=buildAnnualMetrics([{y:2025,rev:100,gp:null,op:null,ni:null}]);
    expect(rows[0].gm).toBeNull();
    expect(rows[0].om).toBeNull();
    expect(rows[0].nm).toBeNull();
  });
  it("preserves genuine zero values and calculates growth only with both revenues",()=>{
    const rows=buildAnnualMetrics([
      {y:2024,rev:100,gp:0,op:0,ni:0},
      {y:2025,rev:110,gp:22,op:11,ni:5},
      {y:2026,rev:null,gp:1,op:1,ni:1}
    ]);
    expect(rows[0].gm).toBe(0);
    expect(rows[0].nm).toBe(0);
    expect(rows[1].nm).toBeCloseTo(100*5/110);
    expect(rows[1].g).toBeCloseTo(10);
    expect(rows[2].g).toBeNull();
  });
});


describe("financial audit: fiscal-year gaps and scoring",()=>{
 it("does not report an annual EPS/revenue growth across a short fiscal transition",()=>{
  const d=dataset(10);
  d.fin.annual=[
   {y:2024,periodEnd:"2024-12-31",rev:100,ni:10,eps:1},
   {y:2025,periodEnd:"2025-06-30",rev:110,ni:12,eps:1.2}
  ];
  const result=computeScores(d,tech);
  expect(result.derived.epsG).toBeNull();
  expect(buildAnnualMetrics(d.fin.annual)[1].g).toBeNull();
  const years=(Date.parse("2025-06-30")-Date.parse("2024-12-31"))/(365.25*86400000);
  expect(result.derived.cagr).toBeCloseTo((1.1**(1/years)-1)*100,7);
 });
 it("keeps separate fiscal ends in chronological order within the same year",()=>{
  const rows=buildAnnualMetrics([{y:2025,periodEnd:"2025-12-31",rev:120},{y:2025,periodEnd:"2025-06-30",rev:100}]);
  expect(rows.map(r=>r.periodLabel)).toEqual(["2025-06-30","2025-12-31"]);
  expect(rows[1].g).toBeNull();
 });
 it("does not infer a -100% CAGR from an absent latest revenue",()=>{
  const d=dataset(10);d.fin.annual.at(-1).rev=null;
  expect(computeScores(d,tech).derived.cagr).toBeNull();
 });
 it("uses calendar-year distance, not count of available rows, for CAGR",()=>{
  const d=dataset(10);
  d.fin.annual=[
   {y:2022,rev:100,ni:10,eps:1,ebitda:20,op:10},
   {y:2024,rev:144,ni:15,eps:2,ebitda:26,op:15}
  ];
  const scores=computeScores(d,tech);
  expect(scores.derived.cagr).toBeCloseTo(20,7);
  expect(scores.derived.epsG).toBeNull();
 });
 it("does not present a two-year gap as annual revenue growth",()=>{
  const rows=buildAnnualMetrics([{y:2022,rev:100},{y:2024,rev:144}]);
  expect(rows[1].g).toBeNull();
 });
 it("computes one-year growth when both adjacent fiscal years are available",()=>{
  const d=dataset(10);
  const result=computeScores(d,tech);
  expect(result.derived.cagr).toBeCloseTo((1.2**(1/2)-1)*100,7);
  // last EPS is unavailable: no implied zero EPS growth.
  expect(result.derived.epsG).toBeNull();
 });
});

describe("verified commentary inputs",()=>{
 it("sends only eligible multiples and validates against the exact rounded facts sent",()=>{
  const d=dataset(10),today=new Date().toISOString().slice(0,10);
  d.quote.price=143.12345;
  d.val.metrics=[{k:"P/E",v:20,sector:18,date:today},{k:"P/S",v:999,sector:10,date:"2020-01-01"}];
  const request=buildReportRequest(d,computeScores(d,tech),"MANTENERE");
  expect(request.verifiedFacts.multipli).toEqual([{nome:"P/E",valore:20,settore:18,data:today}]);
  expect(request.verifiedFacts.prezzo.p).toBe(143.12);
  expect(request.userPrompt).toContain(JSON.stringify(request.verifiedFacts));
  expect(request.userPrompt).not.toContain("999");
 });
});

describe("valuation score freshness", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const current = { k: "P/E", v: 20, sector: 20, date: "2026-11-12" };

  it("does not inflate the score with a stale cheap multiple while the gate remains ready", () => {
    const input = dataset(10);
    input.val.metrics = [current];
    const baseline = computeScores(input, tech, { now });
    input.val.metrics.push({ k: "P/S", v: 1, sector: 10, date: "2020-01-01" });
    const result = computeScores(input, tech, { now });
    expect(result.readiness.ready).toBe(true);
    expect(result.readiness.coverage.comparableMultiples).toBe(1);
    expect(result.scores.Valutazione).toBe(50);
    expect(result.overall).toBe(baseline.overall);
  });

  it("does not score malformed, future, unsupported or nonpositive observations", () => {
    const input = dataset(10);
    input.val.metrics = [
      current,
      null,
      { ...current, k: "P/S", v: 1, sector: 10, date: "2026-11-20" },
      { ...current, k: "P/S", v: 1, sector: 10, date: "2026-02-30" },
      { ...current, k: "unknown", v: 1, sector: 10 },
      { ...current, v: Infinity },
      { ...current, v: 0 },
      { ...current, v: -1 }
    ];
    const result = computeScores(input, tech, { now });
    expect(result.scores.Valutazione).toBe(50);
    expect(result.readiness.coverage.comparableMultiples).toBe(1);
  });

  it("keeps both the valuation factor and overall unavailable for stale-only metrics", () => {
    const input = dataset(10);
    input.val.metrics = [{ ...current, date: "2020-01-01" }];
    const result = computeScores(input, tech, { now });
    expect(result.scores.Valutazione).toBeNull();
    expect(result.overall).toBeNull();
    expect(result.readiness.ready).toBe(false);
  });
});
