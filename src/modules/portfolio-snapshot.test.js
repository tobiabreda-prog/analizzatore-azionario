import { describe, expect, it } from "vitest";
import { buildPortfolioSnapshot } from "./portfolio-snapshot.js";
import { parseInvestingPortfolio } from "./investing-portfolio.js";

const amount = (amount, currency = "EUR") => ({ amount, currency });
const position = changes => ({ id: "summary:1", name: "Esempio", symbol: "TEST.MI", originalSymbol: "TEST.MI", exchange: "BIT", side: "BUY", currency: "EUR", quantity: 10, averagePrice: 100, currentPrice: 110, marketValue: amount(1100), commission: amount(10), netPnl: amount(90), dailyPnl: amount(-10), weightPct: 100, ...changes });
const lot = changes => ({ ...position({ id: "open:1", averagePrice: null, openPrice: 100 }), ...changes });
const snapshot = changes => ({ schemaVersion: 1, source: "investing.com", summaryPositions: [position()], openLots: [lot()], closedLots: [], sections: [{ id: "summary" }, { id: "open" }], totals: [], warnings: [], ...changes });

describe("portfolio snapshot accounting", () => {
  it("uses summary once, attaches lots and reconciles native cost/fees", () => {
    const result = buildPortfolioSnapshot(snapshot());
    expect(result.counts).toEqual({ positions: 1, openLots: 1, closedLots: 0 });
    expect(result.positions[0]).toMatchObject({ calculatedCostBasis: 1010, grossCostBasis: 1000, calculatedMarketValue: 1100, calculatedPnl: 90, reconciliation: { status: "matched", messages: [] } });
    expect(result.byCurrency[0]).toMatchObject({ currency: "EUR", marketValue: 1100, costBasis: 1010, pnl: 90, positions: 1, partial: false });
    expect(result.concentration).toEqual({ largestPosition: { name: "Esempio", symbol: "TEST.MI", weightPct: 100 }, weightSumPct: 100 });
  });
  it("never adds USD values to EUR nor treats an EUR reported P/L as a USD price", () => {
    const usd = position({ symbol: "ACME", originalSymbol: "ACME.O", exchange: "NASDAQ", currency: "USD", marketValue: amount(1100, "USD"), commission: amount(10, "USD"), netPnl: amount(70), dailyPnl: amount(-8), weightPct: 50 });
    const result = buildPortfolioSnapshot(snapshot({ summaryPositions: [position({ weightPct: 50 }), usd], openLots: [lot(), { ...usd, openPrice: 100, id: "open:2" }] }));
    expect(result.byCurrency).toHaveLength(2);
    expect(result.byCurrency.map(row => [row.currency, row.marketValue, row.pnl])).toEqual([["EUR", 1100, 90], ["USD", 1100, 90]]);
    expect(result.reportedPnlByCurrency).toEqual([{ currency: "EUR", amount: 160, observations: 2, missing: 0, complete: true }]);
    expect(result.warnings.join(" ")).toMatch(/P\/L riportato in EUR/);
  });
  it("leaves unknown commission costs and P/L unavailable while retaining the known gross cost", () => {
    const result = buildPortfolioSnapshot(snapshot({ openLots: [lot({ commission: null })] }));
    expect(result.positions[0]).toMatchObject({ grossCostBasis: 1000, calculatedCostBasis: null, calculatedPnl: null });
    expect(result.byCurrency[0]).toMatchObject({ marketValue: 1100, costBasis: null, pnl: null, costBasisKnown: 0, partial: true });
    expect(result.warnings.join(" ")).toMatch(/Commissioni assenti/);
  });
  it("reconciles both directions instead of dropping lots absent from a partial summary", () => {
    const orphan = lot({ symbol: "OTHER.MI", originalSymbol: "OTHER.MI", name: "Altro", quantity: 5, marketValue: amount(550), commission: amount(5), netPnl: amount(45), weightPct: null });
    const unmatched = position({ symbol: "MISSING.MI", originalSymbol: "MISSING.MI", weightPct: null });
    const result = buildPortfolioSnapshot(snapshot({ summaryPositions: [position(), unmatched], openLots: [lot({ quantity: 9, marketValue: amount(990) }), orphan] }));
    expect(result.positions).toHaveLength(3);
    expect(result.warnings.join(" ")).toMatch(/Quantità del riepilogo diversa/);
    expect(result.warnings.join(" ")).toMatch(/senza lotti aperti/);
    expect(result.warnings.join(" ")).toMatch(/assente dal riepilogo/);
    expect(result.positions[0].calculatedCostBasis).toBeNull();
    expect(result.concentration.weightSumPct).toBeNull();
  });
  it("supports summary-only and lots-only snapshots without inventing a ledger", () => {
    const summaryOnly = buildPortfolioSnapshot(snapshot({ openLots: [], sections: [{ id: "summary" }] }));
    expect(summaryOnly.positions[0].calculatedCostBasis).toBe(1010);
    expect(summaryOnly.positions[0].reconciliation.status).toBe("not_available");
    const lotsOnly = buildPortfolioSnapshot(snapshot({ summaryPositions: [], openLots: [lot({ quantity: 4, marketValue: amount(440), commission: amount(4) }), lot({ quantity: 6, marketValue: amount(660), commission: amount(6) })], sections: [{ id: "open" }] }));
    expect(lotsOnly.positions[0]).toMatchObject({ quantity: 10, calculatedCostBasis: 1010, calculatedPnl: 90, derivedFromLots: true });
  });
  it("preserves identical closed rows, reported P/L and footer mismatches", () => {
    const closed = { ...lot(), netPnl: amount(12), commission: null, closePrice: 102 };
    const result = buildPortfolioSnapshot(snapshot({ summaryPositions: [], openLots: [], closedLots: [closed, { ...closed }], totals: [{ label: "Profitti/Perdite Posizioni Chiuse", value: amount(25) }] }));
    expect(result.counts.closedLots).toBe(2);
    expect(result.closedReportedPnlByCurrency[0]).toMatchObject({ amount: 24, observations: 2, complete: true });
    expect(result.warnings.join(" ")).toMatch(/P\/L delle posizioni chiuse non riconciliato/);
  });
  it("does not invent a price-unit multiplier when quoted quantity × price disagrees with market value", () => {
    const result = buildPortfolioSnapshot(snapshot({ summaryPositions: [position({ quantity: 1000 })], openLots: [] }));
    expect(result.positions[0].calculatedMarketValue).toBeNull();
    expect(result.positions[0].calculatedCostBasis).toBeNull();
    expect(result.positions[0].marketValue.amount).toBe(1100);
    expect(result.warnings.join(" ")).toMatch(/unità dello strumento/);
  });
  it("warns on inconsistent average cost and weights without silently replacing source fields", () => {
    const result = buildPortfolioSnapshot(snapshot({ summaryPositions: [position({ averagePrice: 90, weightPct: 120 })] }));
    expect(result.positions[0].averagePrice).toBe(90);
    expect(result.positions[0].calculatedCostBasis).toBe(1010);
    expect(result.warnings.join(" ")).toMatch(/Prezzo medio del riepilogo diverso/);
    expect(result.warnings.join(" ")).toMatch(/Peso riportato fuori/);
  });
  it("imports a synthetic Investing snapshot with decimal-dot quantity and European prices", () => {
    const csv = ['"Riepilogo Posizioni Aperte"', '"","Nome","Simbolo","Borsa","Tipo","Quantità","Prezzo Medio","Prezzo Corrente","Valore di mercato","Commissione","Peso","Prof./Perd. netto"', '"","Esempio","TEST.MI","BIT","Compra","2000.00000000","55,000","56,000","€112.000,00","€20,00","100,00%","€1.980,00"'].join("\r\n");
    const result = buildPortfolioSnapshot(parseInvestingPortfolio(csv));
    expect(result.positions[0]).toMatchObject({ quantity: 2000, calculatedCostBasis: 110020, calculatedPnl: 1980 });
  });
});
