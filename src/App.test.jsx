import { describe, expect, it } from "vitest";
import { buildAnnualMetrics, computeScores } from "./App.jsx";

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
