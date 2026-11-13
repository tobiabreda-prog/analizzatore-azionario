import { describe, expect, it } from "vitest";
import { assessAnalysisReadiness, validIsoDate } from "./analysis-gate.js";

const now = new Date("2026-11-13T12:00:00Z");
function history(count=60) {
  return Array.from({length:count},(_,i)=>{
    const date=new Date(Date.UTC(2026,10,12)-(count-1-i)*7*86400000).toISOString().slice(0,10);
    return [date,100+i,1000];
  });
}
function fixture() {
  const prices=history();
  return {
    quote:{price:100,currency:"USD",source:"test-feed",asOf:prices.at(-1)[0],history:prices},
    fin:{annual:[2023,2024,2025].map(y=>({y,rev:100,ni:10})),lastReportDate:"2026-03-01",isLatest:true,source:"test-financial-feed"},
    val:{metrics:[{k:"P/E",v:20,sector:18,hist5y:22,date:"2026-11-12"}],asOf:"2026-11-12",source:"test-valuation-feed"},
    scores:{"Trend tecnico":70,Crescita:60,Redditività:65,"Solidità finanziaria":55,Valutazione:50,Sentiment:null}
  };
}

describe("investment readiness gate",()=>{
  it("allows a score only when price, statements, valuation and factor coverage are adequate",()=>{
    expect(assessAnalysisReadiness({...fixture(),now}).ready).toBe(true);
  });
  it("blocks financial statements with fewer than three distinct usable years",()=>{
    const input=fixture();
    input.fin.annual[1].ni=null;
    const result=assessAnalysisReadiness({...input,now});
    expect(result.status).toBe("insufficient_data");
    expect(result.reasons.join(" ")).toMatch(/3 esercizi distinti/);
  });
  it("blocks stale prices and missing comparison multiples",()=>{
    const input=fixture();
    const result=assessAnalysisReadiness({...input,quote:{...input.quote,asOf:"2026-10-01"},val:{metrics:[{k:"P/E",v:20}]},now});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/non aggiornato/);
    expect(result.reasons.join(" ")).toMatch(/multipli confrontabili/);
  });
  it("blocks non-chronological history and a quote date inconsistent with its last bar",()=>{
    const input=fixture();
    input.quote.history[10][0]=input.quote.history[9][0];
    const result=assessAnalysisReadiness({...input,now});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/non valido o non cronologico/);
  });
  it("blocks a score with insufficient essential factor coverage",()=>{
    const input=fixture();
    const result=assessAnalysisReadiness({...input,scores:{"Trend tecnico":70,Crescita:null,Redditività:null,Valutazione:50},now});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/Fattori essenziali/);
  });
  it("rejects scores outside the normalized 0-100 range",()=>{
    const input=fixture();
    input.scores.Valutazione=140;
    const result=assessAnalysisReadiness({...input,now});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/0–100/);
  });
  it("validates calendar dates rather than date-shaped strings only",()=>{
    expect(validIsoDate("2024-02-29")).toBe(true);
    expect(validIsoDate("2025-02-29")).toBe(false);
    expect(validIsoDate("2026-13-01")).toBe(false);
  });
  it("blocks malformed history rows without throwing",()=>{
    const input=fixture();
    input.quote.history[12]=null;
    const result=assessAnalysisReadiness({...input,now});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/non valido o non cronologico/);
  });

});
