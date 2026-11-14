import { describe, expect, it } from "vitest";
import { parseInvestingPortfolio } from "./investing-portfolio.js";

// Synthetic data only. Uploaded account exports must never enter public fixtures.
const csvRow = values => values.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(",");
const summaryHeader = ["", "Nome", "Simbolo", "Borsa", "Tipo", "Quantità", "Prezzo Medio", "Prezzo Corrente", "Valore di mercato", "Commissione", "Peso", "P/L Giornaliero", "%P/L giornaliero", "% netta P/L", "Prof./Perd. netto", "Precedente", "Precedente", "Prossima Data Utili", "Prossima Data Utili", "Ora", "Market Cap", "Ricavi", "Vol.", "5 Minuti", "Giornaliero", "Giornaliero", "Colonna nuova"];
const summaryRow = ["", "Società Alfa", "ALFA.O", "NASDAQ", "Compra", "12.00000000", "10,50", "12,00", "$144,00", "$3,00", "12,50%", "-€2,75", "-1,01%", "5,12%", "€10,50", "11,50", "11,80", "02.02.2027", "02.02.2027", "13/11", "1,85T", "2.000.000", "1.000", "Compra Adesso", "Vendi", "-1,01%", 'Testo "tra virgolette"\nseconda riga'];
const openHeader = ["", "Nome", "Simbolo", "Borsa", "Data Ap.", "Tipo", "Quantità", "Prez Ap.", "Prezzo Corrente", "Valore di mercato", "Commissione", "P/L Giornaliero", "Prof./Perd. netto"];
const openRow = ["", "Strumento Beta", "BETA.MI", "BIT", "01/09/2026", "Compra", "2000.00000000", "49,500", "50,000", "€100.000,00", "€19,00", "-€120,00", "€981,00"];
const closedHeader = ["", "Nome", "Simbolo", "Borsa", "Data Ap.", "Tipo", "Quantità", "Prez Ap.", "Data Chiusura", "Prez Ch.", "Guadagno%", "Netto Profitti/Perdite"];
const closedRow = ["", "Società Alfa", "ALFA.O", "NASDAQ", "04/02/2026", "Compra", "2.00000000", "10,00", "06/04/2026", "12,00", "3,50%", "€1,20"];
const section = (title, headers, rows) => [csvRow([title]), csvRow(headers), ...rows.map(csvRow)].join("\r\n");
const fixture = () => "\uFEFF" + [
  section("Riepilogo Posizioni Aperte", summaryHeader, [summaryRow]),
  csvRow(["Valore di mercato", "€1.200,00"]),
  csvRow(["P/L Attuale", "€18,12 / 1,51%"]),
  section("Posizioni aperte", openHeader, [openRow]),
  section("Posizioni chiuse", closedHeader, [closedRow, closedRow]),
  csvRow(["Profitti/Perdite Posizioni Chiuse", "€2,40"])
].join("\r\n\r\n");

describe("Investing holdings snapshot", () => {
  it("preserves complete source, duplicate headers, unknown columns and multiline quoted text", () => {
    const source = fixture();
    const result = parseInvestingPortfolio(source, { fileName: "example.csv", importedAt: "2026-11-14T12:00:00Z" });
    expect(result).toMatchObject({ schemaVersion: 1, source: "investing.com", sourceText: source, fileName: "example.csv", importedAt: "2026-11-14T12:00:00Z" });
    expect(result.sections[0].headers).toEqual(summaryHeader);
    expect(result.sections[0].rows[0].cells).toEqual(summaryRow);
    const row = result.summaryPositions[0];
    expect(row.fields.filter(field => field.name === "Precedente").map(field => field.value)).toEqual([11.5, 11.8]);
    expect(row.fields.filter(field => field.name === "Prossima Data Utili")).toHaveLength(2);
    expect(row.fields.at(-1)).toMatchObject({ name: "Colonna nuova", index: 26, raw: summaryRow.at(-1), value: summaryRow.at(-1), kind: "text" });
  });

  it("keeps quote currency and reported profit currency distinct", () => {
    const { summaryPositions, closedLots } = parseInvestingPortfolio(fixture());
    expect(summaryPositions[0]).toMatchObject({ originalSymbol: "ALFA.O", symbol: "ALFA", exchange: "NASDAQ", currency: "USD", currencySource: "exchange", quantity: 12, averagePrice: 10.5, currentPrice: 12, marketValue: { amount: 144, currency: "USD" }, commission: { amount: 3, currency: "USD" }, dailyPnl: { amount: -2.75, currency: "EUR" }, netPnl: { amount: 10.5, currency: "EUR" } });
    expect(closedLots[0]).toMatchObject({ currency: "USD", currencySource: "exchange", netPnl: { amount: 1.2, currency: "EUR" }, commission: null, openDate: "2026-02-04", closeDate: "2026-04-06", openPrice: 10, closePrice: 12, netPnlPct: 3.5 });
  });

  it("interprets decimal-dot quantities separately from Italian grouped volumes and scaled numbers", () => {
    const result = parseInvestingPortfolio(fixture());
    expect(result.openLots[0]).toMatchObject({ quantity: 2000, openPrice: 49.5, currentPrice: 50, marketValue: { amount: 100000, currency: "EUR" } });
    const fields = result.summaryPositions[0].fields;
    expect(fields.find(field => field.name === "Market Cap").value).toBe(1.85e12);
    expect(fields.find(field => field.name === "Ricavi").value).toBe(2000000);
    expect(fields.find(field => field.name === "Vol.").value).toBe(1000);
    expect(fields.find(field => field.name === "5 Minuti")).toMatchObject({ kind: "text", value: "Compra Adesso" });
    expect(fields.filter(field => field.name === "Giornaliero").map(field => [field.kind, field.value])).toEqual([["text", "Vendi"], ["percent", -1.01]]);
    expect(fields.find(field => field.name === "Ora")).toMatchObject({ kind: "partialDate", value: "13/11" });
  });

  it("does not turn snapshots into transactions or drop identical closed lots", () => {
    const first = parseInvestingPortfolio(fixture()), second = parseInvestingPortfolio(fixture());
    expect(first.trades).toBeUndefined();
    expect(first.summaryPositions).toHaveLength(1);
    expect(first.openLots).toHaveLength(1);
    expect(first.closedLots).toHaveLength(2);
    expect(first.closedLots[0].id).not.toBe(first.closedLots[1].id);
    expect(first.closedLots.map(row => row.id)).toEqual(second.closedLots.map(row => row.id));
    expect(first.warnings.join(" ")).toMatch(/identica.*entrambe conservate/);
  });

  it("preserves missing values without inventing dates, currencies or zero commissions", () => {
    const row = [...openRow]; row[8] = "--"; row[9] = "--"; row[10] = "--";
    row[3] = "UNKNOWN";
    const result = parseInvestingPortfolio(section("Posizioni aperte", openHeader, [row]));
    expect(result.openLots[0]).toMatchObject({ currency: null, currencySource: "unknown", currentPrice: null, marketValue: null, commission: null });
    expect(result.warnings.join(" ")).toMatch(/valuta.*non determinabile/);
  });

  it("supports summary-only snapshots, footer totals and an export without blank leading columns", () => {
    const source = section("Riepilogo Posizioni Aperte", summaryHeader.slice(1), [summaryRow.slice(1)]);
    const result = parseInvestingPortfolio(source);
    expect(result.summaryPositions).toHaveLength(1);
    expect(result.openLots).toHaveLength(0);
    const totals = parseInvestingPortfolio(fixture()).totals;
    expect(totals.find(total => total.label === "P/L Attuale")).toMatchObject({ raw: "€18,12 / 1,51%", value: { amount: 18.12, currency: "EUR" }, percent: 1.51 });
    expect(totals.find(total => total.label === "Profitti/Perdite Posizioni Chiuse").value.amount).toBe(2.4);
  });

  it.each([
    ["quantity", 6, "2oops"], ["date", 4, "31/02/2026"], ["price", 7, "12,00abc"], ["money", 9, "€1.23,00"], ["fee", 10, "-€1,00"]
  ])("rejects malformed %s with the original line number", (_, column, value) => {
    const row = [...openRow]; row[column] = value;
    expect(() => parseInvestingPortfolio(section("Posizioni aperte", openHeader, [row]))).toThrow(/^Riga 3:/);
  });

  it("rejects incomplete columns and impossible close chronology instead of partially importing", () => {
    expect(() => parseInvestingPortfolio(section("Posizioni aperte", openHeader, [openRow.slice(0, -1)]))).toThrow(/Riga 3.*numero colonne/);
    expect(() => parseInvestingPortfolio(section("Posizioni aperte", openHeader.slice(0, 4), [openRow.slice(0, 4)]))).toThrow(/Riga 2.*colonne mancanti/);
    const row = [...closedRow]; row[8] = "03/02/2026";
    expect(() => parseInvestingPortfolio(section("Posizioni chiuse", closedHeader, [row]))).toThrow(/Riga 3.*precedente/);
    expect(() => parseInvestingPortfolio(fixture() + '\r\n"unterminated')).toThrow(/virgolette non chiuse/);
    expect(() => parseInvestingPortfolio('"Posizioni aperte"')).toThrow(/Nessuna posizione/);
  });

  it("does not turn a NYSE quote into EUR because account valuation and commissions are in EUR", () => {
    const row = [...summaryRow]; row[3] = "NYSE"; row[8] = "€130,00"; row[9] = "€3,00";
    const result = parseInvestingPortfolio(section("Riepilogo Posizioni Aperte", summaryHeader, [row]));
    expect(result.summaryPositions[0]).toMatchObject({ currency: "USD", currencySource: "exchange", marketValue: { amount: 130, currency: "EUR" }, commission: { amount: 3, currency: "EUR" } });
    expect(result.warnings.join(" ")).toMatch(/valute diverse/);
  });

  it("uses explicit quote currency, then matched positions or monetary hints for unknown exchanges", () => {
    const row = [...summaryRow]; row[3] = "UNKNOWN";
    let result = parseInvestingPortfolio(section("Riepilogo Posizioni Aperte", [...summaryHeader, "Valuta"], [[...row, "CHF"]]));
    expect(result.summaryPositions[0]).toMatchObject({ currency: "CHF", currencySource: "explicit" });
    const later = [...closedRow]; later[3] = "UNKNOWN";
    result = parseInvestingPortfolio(section("Riepilogo Posizioni Aperte", summaryHeader, [row]) + "\n\n" + section("Posizioni chiuse", closedHeader, [later]));
    expect(result.summaryPositions[0]).toMatchObject({ currency: "USD", currencySource: "market_value" });
    expect(result.closedLots[0]).toMatchObject({ currency: "USD", currencySource: "matching_position" });
    row[8] = "--";
    result = parseInvestingPortfolio(section("Riepilogo Posizioni Aperte", summaryHeader, [row]));
    expect(result.summaryPositions[0]).toMatchObject({ currency: "USD", currencySource: "commission" });
    expect(result.warnings.join(" ")).toMatch(/soltanto dalla commissione/);
    row[9] = "--"; row[11] = "-2,75";
    result = parseInvestingPortfolio(section("Riepilogo Posizioni Aperte", summaryHeader, [row]));
    expect(result.summaryPositions[0]).toMatchObject({ currency: null, currencySource: "unknown", dailyPnl: { amount: -2.75, currency: null } });
  });
});
