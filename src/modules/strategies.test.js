import {describe,it,expect} from "vitest";
import {buildSmaCrossSignals} from "./strategies.js";
describe("SMA crossover signals",()=>{
 it("emits only long/flat signals after the slow average is available",()=>{
  const bars=Array.from({length:60},(_,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),close:100+i}));
  const s=buildSmaCrossSignals(bars,5,20);
  expect(s).toHaveLength(41);
  expect(s[0].position).toBe(1);
  expect(s.every(x=>[0,1].includes(x.position))).toBe(true);
 });
 it("rejects insufficient history and invalid periods",()=>{
  expect(()=>buildSmaCrossSignals([{date:"2026-01-01",close:10}],5,20)).toThrow(/Storico/);
  expect(()=>buildSmaCrossSignals([],20,10)).toThrow(/Periodi/);
 });
});
