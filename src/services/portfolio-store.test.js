import { describe, expect, it } from "vitest";
import { clearPortfolioSnapshot, loadPortfolioSnapshot, PORTFOLIO_STORAGE_KEY, savePortfolioSnapshot } from "./portfolio-store.js";
import { parseInvestingPortfolio } from "../modules/investing-portfolio.js";

const csv = ['"Riepilogo Posizioni Aperte"', '"","Nome","Simbolo","Borsa","Tipo","Quantità","Prezzo Medio","Prezzo Corrente","Valore di mercato","Commissione"', '"","Esempio","TEST.MI","BIT","Compra","10.00000000","20,00","21,00","€210,00","€2,00"'].join("\n");
const source = () => parseInvestingPortfolio(csv, { fileName: "esempio.csv", importedAt: "2026-11-14T10:00:00Z" });
function memory() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}

describe("local portfolio snapshot storage", () => {
  it("round-trips every original column, cells and source bytes", () => {
    const store = memory(), snapshot = source();
    expect(loadPortfolioSnapshot(store)).toBeNull();
    savePortfolioSnapshot(snapshot, store);
    expect(loadPortfolioSnapshot(store)).toEqual(snapshot);
    expect(loadPortfolioSnapshot(store).sourceText).toBe(csv);
  });
  it("replaces a snapshot on reimport instead of appending positions", () => {
    const store = memory(), snapshot = source();
    savePortfolioSnapshot(snapshot, store);
    savePortfolioSnapshot(snapshot, store);
    expect(loadPortfolioSnapshot(store).summaryPositions).toHaveLength(1);
    expect(loadPortfolioSnapshot(store).openLots).toHaveLength(0);
  });
  it("preserves the previous portfolio when validation or an atomic write fails", () => {
    const store = memory();
    savePortfolioSnapshot(source(), store);
    const before = store.getItem(PORTFOLIO_STORAGE_KEY);
    expect(() => savePortfolioSnapshot({ ...source(), schemaVersion: 999 }, store)).toThrow(/non valido|non supportato/);
    expect(store.getItem(PORTFOLIO_STORAGE_KEY)).toBe(before);
    store.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => savePortfolioSnapshot(source(), store)).toThrow(/precedente è conservato/);
    expect(store.getItem(PORTFOLIO_STORAGE_KEY)).toBe(before);
  });
  it("reports corrupt/unsupported saved data rather than silently replacing it", () => {
    const store = memory();
    store.setItem(PORTFOLIO_STORAGE_KEY, "{bad");
    expect(() => loadPortfolioSnapshot(store)).toThrow(/non è leggibile/);
    store.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify({ ...source(), schemaVersion: 2 }));
    expect(() => loadPortfolioSnapshot(store)).toThrow(/non valido|non supportato/);
  });
  it("never changes watchlist or API settings when deleting the snapshot", () => {
    const store = memory();
    store.setItem("aa2_fair_value_watchlist_v1", "watchlist");
    store.setItem("aa_api_settings_v1", "keys");
    savePortfolioSnapshot(source(), store);
    clearPortfolioSnapshot(store);
    expect(loadPortfolioSnapshot(store)).toBeNull();
    expect(store.getItem("aa2_fair_value_watchlist_v1")).toBe("watchlist");
    expect(store.getItem("aa_api_settings_v1")).toBe("keys");
  });
  it("handles denied or missing local storage with explicit errors", () => {
    expect(() => loadPortfolioSnapshot(null)).toThrow(/Memoria locale/);
    expect(() => savePortfolioSnapshot(source(), null)).toThrow(/Memoria locale/);
    expect(() => loadPortfolioSnapshot({ getItem: () => { throw new Error("denied"); } })).toThrow(/leggere/);
  });
  it("retains unknown currencies instead of inventing one or rejecting the raw snapshot", () => {
    const store = memory();
    const unknown = parseInvestingPortfolio(csv.replace('"BIT"', '"UNKNOWN"').replace('"€210,00"', '"210,00"').replace('"€2,00"', '"2,00"'));
    expect(unknown.summaryPositions[0].currency).toBeNull();
    savePortfolioSnapshot(unknown, store);
    expect(loadPortfolioSnapshot(store).summaryPositions[0].marketValue).toEqual({ amount: 210, currency: null });
  });
  it("rejects malformed raw/display fields in a corrupted stored snapshot", () => {
    const store = memory();
    for (const change of [{ fields: "bad" }, { cells: [null] }, { name: {} }, { line: -1 }, { openDate: "2026-02-30" }]) {
      const invalid = source();Object.assign(invalid.summaryPositions[0], change);
      store.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(invalid));
      expect(() => loadPortfolioSnapshot(store)).toThrow(/non valida/);
    }
  });
});
