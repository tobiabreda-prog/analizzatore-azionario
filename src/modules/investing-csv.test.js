import { describe, it, expect } from "vitest";
import { isInvestingCsv, parseInvestingCsv } from "./investing-csv.js";
import { parseTradeCsv } from "./trade-csv.js";
import { buildPositions } from "./portfolio.js";

const OPEN_H = '"","Nome","Simbolo","Borsa","Data Ap.","Tipo","Quantità","Prez Ap.","Prezzo Corrente","Orario esteso","Orario esteso (%)","Precedente","Valore di mercato","Commissione","% netta P/L","Peso","P/L Giornaliero","%P/L giornaliero","Prof./Perd. netto","Prossima Data Utili"';
const CLOSED_H = '"","Nome","Simbolo","Borsa","Data Ap.","Tipo","Quantità","Prez Ap.","Data Chiusura","Prez Ch.","Guadagno%","Netto Profitti/Perdite"';
const SAMPLE = [
  '"Riepilogo Posizioni Aperte"',
  '"","Nome","Simbolo","Borsa","Tipo","Quantità","Prezzo Medio"',
  '"","Prysmian","PRY.MI","BIT","Compra","48.00000000","103,8500"',
  '',
  '"Valore di mercato","€330.041,33"',
  '"Profitti/Perdite Totali","€9.881,25"',
  '',
  '"Posizioni aperte"',
  OPEN_H,
  '"","Prysmian","PRY.MI","BIT","22/10/2026","Compra","48.00000000","103,8500","106,1500","--","--","102,9000","€5.095,20","€19,00","1,83%","1,54%","€156,00","3,16%","€91,4000","29.10.2026"',
  '"","Alphabet A","GOOGL.O","NASDAQ","25/03/2026","Compra","23.00000000","290,00","322,00","--","--","316,80","$7.406,00","$9,95","10,89%","2,01%","€107,34","1,64%","€651,63","28.10.2026"',
  '"","Btp Tf 1,7% St51 Eur","IT000542523=MI","BIT","24/02/2025","Compra","100.00000000","63,648","54,790","--","--","54,890","€5.479,00","€19,00","-14,22%","1,66%","-€10,00","-0,18%","-€904,764","--"',
  '"","Btp Tf 1,7% St51 Eur","IT000542523=MI","BIT","24/02/2025","Compra","100.00000000","63,468","54,790","--","--","54,890","€5.479,00","€0,00","-13,67%","1,66%","-€10,00","-0,18%","-€867,764","--"',
  '"","Taiwan Semiconductor","TSM","NYSE","28/07/2026","Compra","5.00000000","386,00","437,37","--","--","424,37","$2.186,85","$12,95","12,64%","0,59%","€58,34","3,06%","€218,90","21.01.2027"',
  '',
  '',
  '"Posizioni chiuse"',
  CLOSED_H,
  '"","Xtrackers IE Physical Gold ETC","XGDU.DE","ETR","23/03/2026","Compra","120.00000000","61,58","25/06/2026","54,00","-12,44%","-€919,00"',
  '"","BCA MPS","BMPS.MI","BIT","05/03/2026","Compra","1347.00000000","7,420","05/03/2026","7,520","1,16%","€115,70"',
  '"","BCA MPS","BMPS.MI","BIT","05/03/2026","Compra","1347.00000000","7,420","05/03/2026","7,520","1,16%","€115,70"',
  '"","IONQ","IONQ.K","NYSE","23/02/2026","Compra","182.00000000","30,50","03/03/2026","36,60","19,78%","€947,59"',
  '',
  '"Profitti/Perdite Posizioni Chiuse","€7,11"',
].join("\r\n");

describe("import CSV Investing.com", () => {
  it("riconosce il formato e non scambia il CSV standard", () => {
    expect(isInvestingCsv(SAMPLE)).toBe(true);
    expect(isInvestingCsv("date;symbol;side;quantity;price;currency\n2026-01-01;ABC;BUY;1;1;EUR")).toBe(false);
  });
  it("importa lotti aperti con commissioni, valuta e data corretti, ignorando il riepilogo", () => {
    const { trades, openLots, closedLots } = parseInvestingCsv(SAMPLE);
    expect(openLots).toBe(5); expect(closedLots).toBe(4);
    const pry = trades.find((t) => t.symbol === "PRY.MI");
    expect(pry).toMatchObject({ date: "2026-10-22", side: "BUY", quantity: 48, price: 103.85, currency: "EUR", fees: 19 });
    const goog = trades.find((t) => t.symbol === "GOOGL");
    expect(goog).toMatchObject({ currency: "USD", fees: 9.95, price: 290 });
    expect(trades.filter((t) => t.symbol === "IT000542523=MI").map((t) => t.price).sort()).toEqual([63.468, 63.648]);
  });
  it("trasforma ogni posizione chiusa in acquisto + vendita e toglie il suffisso Reuters sui titoli USA", () => {
    const { trades } = parseInvestingCsv(SAMPLE);
    const gold = trades.filter((t) => t.symbol === "XGDU.DE");
    expect(gold.map((t) => [t.side, t.date, t.price, t.currency])).toEqual([["BUY", "2026-03-23", 61.58, "EUR"], ["SELL", "2026-06-25", 54, "EUR"]]);
    expect(trades.some((t) => t.symbol === "IONQ" && t.currency === "USD" && t.side === "SELL" && t.price === 36.6)).toBe(true);
  });
  it("genera ID stabili (reimport senza duplicati) e distingue lotti identici", () => {
    const a = parseInvestingCsv(SAMPLE).trades.map((t) => t.id), b = parseInvestingCsv(SAMPLE).trades.map((t) => t.id);
    expect(a.sort()).toEqual(b.sort());
    expect(new Set(a).size).toBe(a.length);
  });
  it("produce movimenti coerenti con il motore di portafoglio", () => {
    const { trades } = parseInvestingCsv(SAMPLE);
    const pos = buildPositions(trades);
    const bmps = pos.find((p) => p.symbol === "BMPS.MI");
    expect(bmps.quantity).toBe(0);
    expect(bmps.realizedPnl).toBeCloseTo(2 * 1347 * 0.1, 6);
    expect(pos.find((p) => p.symbol === "PRY.MI").quantity).toBe(48);
  });
  it("rifiuta posizioni corte e file privi di posizioni", () => {
    expect(() => parseInvestingCsv(SAMPLE.replace('"22/10/2026","Compra"', '"22/10/2026","Vendi"'))).toThrow(/corte/);
    expect(() => parseInvestingCsv('"Posizioni aperte"\r\n' + OPEN_H)).toThrow(/Nessuna posizione/);
  });
  it("non rompe l'import CSV standard", () => {
    expect(parseTradeCsv("date;symbol;side;quantity;price;currency\n2026-01-01;ABC;BUY;2;10;EUR")[0].symbol).toBe("ABC");
  });
});
