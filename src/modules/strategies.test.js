import {describe,it,expect} from "vitest";
import {buildSmaCrossSignals} from "./strategies.js";

function bars(count=60){
 return Array.from({length:count},(_,i)=>({
  date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),
  close:100+i
 }));
}

describe("SMA crossover signals",()=>{
 it("emits only long/flat signals after the slow average is available",()=>{
  const input=bars();
  const signals=buildSmaCrossSignals(input,5,20);
  expect(signals).toHaveLength(41);
  expect(signals[0].position).toBe(1);
  expect(signals.every(x=>[0,1].includes(x.position))).toBe(true);
 });
 it("rejects insufficient history and invalid periods",()=>{
  expect(()=>buildSmaCrossSignals([{date:"2026-01-01",close:10}],5,20)).toThrow(/Storico/);
  expect(()=>buildSmaCrossSignals([],20,10)).toThrow(/Periodi/);
 });
 it("rejects non-chronological and duplicate dates",()=>{
  const input=bars();
  [input[10],input[11]]=[input[11],input[10]];
  expect(()=>buildSmaCrossSignals(input,5,20)).toThrow(/non cronologiche/);
  const duplicate=bars();
  duplicate[10].date=duplicate[9].date;
  expect(()=>buildSmaCrossSignals(duplicate,5,20)).toThrow(/duplicate/);
 });
 it("rejects impossible dates and non-positive closing prices",()=>{
  const invalidDate=bars();
  invalidDate[10].date="2026-02-30";
  expect(()=>buildSmaCrossSignals(invalidDate,5,20)).toThrow(/Barre prezzi non valide/);
  const invalidClose=bars();
  invalidClose[10].close=0;
  expect(()=>buildSmaCrossSignals(invalidClose,5,20)).toThrow(/Barre prezzi non valide/);
 });
});
