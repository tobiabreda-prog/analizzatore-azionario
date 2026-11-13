import {describe,it,expect} from "vitest";
import {getAlphaVantageUsage,loadAlphaVantageDaily} from "./alphavantage.js";
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
describe("Alpha Vantage daily adapter",()=>{
 it("normalizes malformed local counters",()=>{const s=storage();s.setItem("av_count_2026-11-13","NaN");expect(getAlphaVantageUsage(s,new Date("2026-11-13T12:00:00Z"))).toBe(0);});
 it("maps daily OHLC and counts one request",async()=>{const s=storage();const fetchImpl=async()=>({ok:true,json:async()=>({"Time Series (Daily)":{"2026-11-12":{"1. open":"10","2. high":"12","3. low":"9","4. close":"11","5. volume":"1000"}}})});const r=await loadAlphaVantageDaily({symbol:"ABC",apiKey:"secret",fetchImpl,storage:s});expect(r.rows[0].close).toBe(11);expect(getAlphaVantageUsage(s)).toBe(1);});
 it("reuses the same symbol daily cache without consuming another request",async()=>{
  const s=storage();let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>({"Time Series (Daily)":{"2026-11-12":{"1. open":"10","2. high":"12","3. low":"9","4. close":"11","5. volume":"1000"}}})};};
  const first=await loadAlphaVantageDaily({symbol:"ABC",apiKey:"secret",fetchImpl,storage:s});
  const second=await loadAlphaVantageDaily({symbol:"ABC",apiKey:"secret",fetchImpl,storage:s});
  expect(first.rows[0].close).toBe(11);expect(second.cached).toBe(true);expect(calls).toBe(1);expect(getAlphaVantageUsage(s)).toBe(1);
 });
 it("rejects quota exhaustion before network call",async()=>{const s=storage();s.setItem("av_count_"+new Date().toISOString().slice(0,10),"25");await expect(loadAlphaVantageDaily({symbol:"ABC",apiKey:"secret",storage:s,fetchImpl:()=>{throw new Error("must not fetch");}})).rejects.toThrow(/quota/i);});
});
