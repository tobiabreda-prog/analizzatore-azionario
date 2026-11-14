import {beforeEach,afterEach,describe,expect,it} from "vitest";
import {ANALYSIS_TTL,readAnalysisSection,readAnalysisSnapshot,writeAnalysisSection,analysisFingerprint} from "./analysis-cache.js";

let original;
beforeEach(()=>{
 original=globalThis.localStorage;
 const state=new Map();
 globalThis.localStorage={
  getItem:key=>state.get(key)??null,
  setItem:(key,value)=>{state.set(key,String(value));},
  removeItem:key=>state.delete(key),
 };
});
afterEach(()=>{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;});

describe("sectional analysis cache",()=>{
 it("preserves market data independently from failed AI analysis",()=>{
  expect(writeAnalysisSection("aapl","quote",{ticker:"AAPL",price:200},{now:1_000_000})).toBe(true);
  expect(writeAnalysisSection("aapl","fin",{schemaVersion:2,annual:[{y:2025,periodEnd:"2025-12-31",fcf:1}]},{now:1_000_000})).toBe(true);
  expect(readAnalysisSection("AAPL","quote",{now:1_001_000}).value.price).toBe(200);
  expect(readAnalysisSnapshot("AAPL",{now:1_001_000}).fresh).toEqual(["quote","fin"]);
 });
 it("expires quotes independently of statements and safely exposes old data",()=>{
  const now=10_000_000;
  writeAnalysisSection("ENI.MI","quote",{price:20},{now});
  writeAnalysisSection("ENI.MI","fin",{schemaVersion:2,annual:[]},{now});
  const later=now+ANALYSIS_TTL.quote+1;
  expect(readAnalysisSection("ENI.MI","quote",{now:later})).toBeNull();
  expect(readAnalysisSection("ENI.MI","quote",{allowStale:true,now:later}).stale).toBe(true);
  expect(readAnalysisSnapshot("ENI.MI",{now:later}).fresh).toEqual(["fin"]);
  expect(readAnalysisSnapshot("ENI.MI",{now:later}).stale).toEqual(["quote"]);
 });
 it("never confuses tickers or uses expired AI comments as current",()=>{
  const now=1_000_000;
  writeAnalysisSection("AAPL","quote",{ticker:"AAPL"},{now});
  expect(readAnalysisSection("MSFT","quote",{allowStale:true,now})).toBeNull();
  writeAnalysisSection("AAPL","ai",{fingerprint:"old",final:{motivation:"old"}},{now});
  expect(readAnalysisSection("AAPL","ai",{now:now+ANALYSIS_TTL.ai+1})).toBeNull();
 });
 it("invalidates cached AI research when actual financial inputs change",()=>{
  const base={quote:{ticker:"AAPL",price:200},fin:{annual:[{fcf:10}]}};
  expect(analysisFingerprint(base)).not.toBe(analysisFingerprint({...base,fin:{annual:[{fcf:12}]}}));
 });
 it("fails closed when storage is unavailable",()=>{
  globalThis.localStorage={getItem:()=>{throw new Error("disabled");},setItem:()=>{throw new Error("disabled");}};
  expect(readAnalysisSection("AAPL","quote")).toBeNull();
  expect(writeAnalysisSection("AAPL","quote",{})).toBe(false);
 });
 it("refetches legacy financial joins while preserving quotes and watchlists",()=>{
  const now=1_000_000;
  localStorage.setItem("aa2_fair_value_watchlist_v1",JSON.stringify(["AAPL"]));
  writeAnalysisSection("AAPL","quote",{price:200},{now});
  writeAnalysisSection("AAPL","fin",{annual:[{y:2025,rev:100,ni:10}]},{now});
  expect(readAnalysisSection("AAPL","fin",{now})).toBeNull();
  expect(readAnalysisSection("AAPL","fin",{now,allowStale:true})).toBeNull();
  expect(readAnalysisSnapshot("AAPL",{now}).data).toEqual({quote:{price:200}});
  expect(JSON.parse(localStorage.getItem("aa2_fair_value_watchlist_v1"))).toEqual(["AAPL"]);
 });
});
