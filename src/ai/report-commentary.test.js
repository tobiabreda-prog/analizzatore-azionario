import { describe, expect, it } from "vitest";
import { validateReportCommentary } from "./report-commentary.js";

const report = (changes = {}) => ({ horizon: "6-12 mesi", motivation: "Il P/E è 20.", strengths: ["Ricavi in crescita."], risks: ["Pesi non calibrati."], ...changes });
const facts = { prezzo: 1234.56, pe: 20, variazione: -3.2, anno: 2025, notizie: ["0|2026-11-14|Revenue grew 8%"] };

describe("report commentary validation", () => {
  it("accepts verified numbers and returns only display fields", () => {
    const input = report({ motivation: "Prezzo 1.234,56 €, variazione -3,2% e P/E 20.", entry: 999, stop: 42, target: 123, failed: false });
    expect(validateReportCommentary(input, facts)).toEqual(report({ motivation: input.motivation }));
  });
  it.each([null, [], "text", report({ motivation: {} }), report({ strengths: "bad" }), report({ risks: [null] }), report({ horizon: "" })])("rejects malformed display data %#", input => {
    expect(() => validateReportCommentary(input, facts)).toThrow(/schema/);
  });
  it.each(["P/E 999.", "P/E 120.", "Rendimento 19,9%.", "Prezzo $999.", "Crescita +3,2%."])("rejects unsupported numbers: %s", motivation => {
    expect(() => validateReportCommentary(report({ motivation }), facts)).toThrow(/numero/);
  });
  it("checks numeric claims in every displayed list and the horizon", () => {
    for (const change of [{ strengths: ["Margine 999%"] }, { risks: ["Prezzo 999"] }, { horizon: "999 mesi" }]) {
      expect(() => validateReportCommentary(report(change), facts)).toThrow(/numero/);
    }
  });
  it("does not authorize numeric claims from field names or split scientific notation", () => {
    const inputs = { prezzo: { p: 20, sma50: 19, sma200: 18 }, multipli: [{ storico5a: 20 }], one: 1, three: 3 };
    for (const motivation of ["Il prezzo è 200 USD.", "Il prezzo è 50 USD.", "Il prezzo è 5 USD.", "Il prezzo è 1e3 USD."]) {
      expect(() => validateReportCommentary(report({ motivation }), inputs)).toThrow(/numero/);
    }
    expect(validateReportCommentary(report({ motivation: "SMA200 e SMA50: verifica su 6-12 mesi." }), inputs).motivation).toContain("SMA200");
  });
  it("checks space-grouped amounts as a single value", () => {
    for (const separator of [" ", "\u00a0", "\u202f"]) {
      const input = report({ motivation: "Prezzo 1" + separator + "200 USD." });
      expect(() => validateReportCommentary(input, { eps: 1, cap: 200 })).toThrow(/numero/);
      expect(validateReportCommentary(input, { price: 1200 }).motivation).toContain("200");
    }
  });
  it("retains dated facts and verifies translated news against the referenced article", () => {
    const news = { tone: "Ricavi in crescita.", risks: [], items: [{ i: 0, t: "Ricavi in crescita dell'8% al 2026-11-14", s: "pos" }] };
    expect(validateReportCommentary(report({ news }), facts).news).toEqual(news);
    news.items[0].t = "Ricavi in crescita del 20%";
    expect(() => validateReportCommentary(report({ news }), facts)).toThrow(/numero/);
  });
  it("rejects invented news indexes, duplicates, sentiment and nonstring titles", () => {
    for (const items of [[{ i: 1, t: "Titolo", s: "pos" }], [{ i: 0, t: "Titolo", s: "buy" }], [{ i: 0, t: {}, s: "pos" }], [{ i: 0, t: "Titolo", s: "pos" }, { i: 0, t: "Titolo", s: "neu" }]]) {
      expect(() => validateReportCommentary(report({ news: { tone: "Tono", risks: [], items } }), facts)).toThrow(/schema/);
    }
  });
});
