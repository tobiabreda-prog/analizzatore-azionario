import { describe, expect, it } from "vitest";
import { assessAnalysisReadiness } from "./analysis-gate.js";

const now = new Date("2026-11-13T12:00:00Z");
const valid = {
  quote: { price: 100, currency: "USD", source: "test-feed", asOf: "2026-11-12", history: Array.from({length: 60}, (_,i)=>["2026-01-"+String((i%28)+1).padStart(2,"0"),100]) },
  fin: { annual: [2023,2024,2025].map(y=>({y,rev:100,ni:10})), lastReportDate: "2026-03-01", isLatest: true, source:"test-financial-feed" },
  val: { metrics: [{k:"P/E",v:20,sector:18,hist5y:22,date:"2026-11-12"}], asOf:"2026-11-12", source:"test-valuation-feed" },
  scores: { "Trend tecnico":70, Crescita:60, Redditività:65, "Solidità finanziaria":55, Valutazione:50, Sentiment:null },
  now
};

describe("investment readiness gate", () => {
  it("allows a score only when price, statements, valuation and factor coverage are adequate", () => {
    expect(assessAnalysisReadiness(valid).ready).toBe(true);
  });
  it("blocks positive labels when financial statements are incomplete", () => {
    const result=assessAnalysisReadiness({...valid,fin:{annual:[],lastReportDate:null,isLatest:false}});
    expect(result.status).toBe("insufficient_data");
    expect(result.reasons.join(" ")).toMatch(/Bilanci annuali insufficienti/);
  });
  it("blocks stale prices and missing comparison multiples", () => {
    const result=assessAnalysisReadiness({...valid,quote:{...valid.quote,asOf:"2026-10-01"},val:{metrics:[{k:"P/E",v:20}]}});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/non aggiornato/);
    expect(result.reasons.join(" ")).toMatch(/multipli confrontabili/);
  });
  it("blocks a score with insufficient essential factor coverage", () => {
    const result=assessAnalysisReadiness({...valid,scores:{"Trend tecnico":70,Crescita:null,Redditività:null,Valutazione:50}});
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/Fattori essenziali/);
  });
});
