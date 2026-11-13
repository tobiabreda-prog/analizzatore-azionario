import { describe, expect, it } from "vitest";
import { computeScores } from "./App.jsx";

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
