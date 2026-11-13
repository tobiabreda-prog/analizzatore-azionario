import { normalizeTrade } from "./portfolio.js";
import { splitLine, parseNumber, isoDate } from "./trade-csv.js";

// Import dell'export "Portafoglio" di Investing.com (CSV multi-sezione, separatore virgola, numeri all'italiana).
// Usa solo le sezioni "Posizioni aperte" (lotti ancora in portafoglio) e "Posizioni chiuse" (acquisto + vendita);
// il "Riepilogo Posizioni Aperte" è un'aggregazione degli stessi lotti e viene ignorato per non duplicare i dati.
const norm = (v) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const EXCHANGE_CCY = { BIT: "EUR", ETR: "EUR", F: "EUR", EPA: "EUR", AMS: "EUR", MCE: "EUR", NASDAQ: "USD", NYSE: "USD", NYSEARCA: "USD", AMEX: "USD" };
const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "NYSEARCA", "AMEX"]);

const currencyFromText = (s) => (/\$/.test(s) ? "USD" : /€/.test(s) ? "EUR" : /£/.test(s) ? "GBP" : null);
function money(v, label) {
  const raw = String(v ?? "").replace(/[^\d,.\-]/g, "");
  if (!/\d/.test(raw)) return null;
  return parseNumber(raw, label);
}
// Investing usa simboli Reuters (GOOGL.O, IONQ.K): sui titoli USA si toglie il suffisso per allinearli al ticker usato nell'app.
function cleanSymbol(symbol, exchange) {
  const s = String(symbol ?? "").trim().toUpperCase();
  return US_EXCHANGES.has(String(exchange ?? "").trim().toUpperCase()) ? s.replace(/\.(O|K|N|A|P|OQ|PK)$/, "") : s;
}

export function isInvestingCsv(text) {
  return typeof text === "string" && /^\s*"?(Riepilogo Posizioni Aperte|Posizioni aperte|Posizioni chiuse)"?\s*$/im.test(text);
}

export function parseInvestingCsv(text) {
  if (!isInvestingCsv(text)) throw new Error("Il file non sembra un export portafoglio di Investing.com");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let section = null, headers = null;
  const rawOpen = [], rawClosed = [];
  lines.forEach((line, i) => {
    if (!line.trim()) { section = null; headers = null; return; }
    const f = splitLine(line, ",");
    if (norm(f[0]) !== "") {
      const t = norm(f[0]);
      section = f.length === 1 && t === "posizioni aperte" ? "open" : f.length === 1 && t === "posizioni chiuse" ? "closed" : null;
      headers = null;
      return;
    }
    if (!section) return;
    if (!headers) { headers = f.map(norm); return; }
    const col = (...names) => headers.findIndex((h) => names.includes(h));
    const ix = section === "open"
      ? { exch: col("borsa"), sym: col("simbolo"), date: col("data ap."), type: col("tipo"), qty: col("quantita"), price: col("prez ap."), fee: col("commissione"), value: col("valore di mercato") }
      : { exch: col("borsa"), sym: col("simbolo"), date: col("data ap."), type: col("tipo"), qty: col("quantita"), price: col("prez ap."), closeDate: col("data chiusura"), closePrice: col("prez ch.") };
    const missing = Object.entries(ix).filter(([k, v]) => v < 0 && k !== "fee" && k !== "value").map(([k]) => k);
    if (missing.length) throw new Error("Colonne mancanti in \"" + (section === "open" ? "Posizioni aperte" : "Posizioni chiuse") + "\": " + missing.join(", "));
    (section === "open" ? rawOpen : rawClosed).push({ row: f, ix, line: i + 1 });
  });

  const seen = new Map();
  const uniqueId = (base) => { const n = (seen.get(base) ?? 0) + 1; seen.set(base, n); return base + "#" + n; };
  const symbolCurrency = new Map();
  const trades = [];
  const wrap = (line, fn) => { try { return fn(); } catch (e) { throw new Error("Riga " + line + ": " + e.message); } };
  const assertLong = (type, symbol) => { if (norm(type) !== "compra") throw new Error("posizione non 'Compra' (" + symbol + "): le posizioni corte non sono supportate"); };

  for (const { row, ix, line } of rawOpen) wrap(line, () => {
    const symbol = cleanSymbol(row[ix.sym], row[ix.exch]);
    assertLong(row[ix.type], symbol);
    const feeText = ix.fee >= 0 ? row[ix.fee] : "", valueText = ix.value >= 0 ? row[ix.value] : "";
    const currency = currencyFromText(valueText) || currencyFromText(feeText) || EXCHANGE_CCY[String(row[ix.exch]).trim().toUpperCase()];
    if (!currency) throw new Error("valuta non determinabile per " + symbol);
    symbolCurrency.set(symbol, currency);
    const date = isoDate(row[ix.date]), quantity = parseNumber(row[ix.qty], "Quantità"), price = parseNumber(row[ix.price], "Prezzo apertura");
    trades.push(normalizeTrade({ id: uniqueId(["inv", "O", date, symbol, quantity, price].join("|")), date, symbol, side: "BUY", quantity, price, currency, fees: money(feeText, "Commissione") ?? 0, taxes: 0, source: "investing.com" }));
  });

  for (const { row, ix, line } of rawClosed) wrap(line, () => {
    const symbol = cleanSymbol(row[ix.sym], row[ix.exch]);
    assertLong(row[ix.type], symbol);
    const currency = symbolCurrency.get(symbol) || EXCHANGE_CCY[String(row[ix.exch]).trim().toUpperCase()];
    if (!currency) throw new Error("valuta non determinabile per " + symbol + " (" + String(row[ix.exch]).trim() + ")");
    const date = isoDate(row[ix.date]), closeDate = isoDate(row[ix.closeDate]);
    const quantity = parseNumber(row[ix.qty], "Quantità"), price = parseNumber(row[ix.price], "Prezzo apertura"), closePrice = parseNumber(row[ix.closePrice], "Prezzo chiusura");
    const base = uniqueId(["inv", "C", date, closeDate, symbol, quantity, price, closePrice].join("|"));
    trades.push(normalizeTrade({ id: base + ":B", date, symbol, side: "BUY", quantity, price, currency, fees: 0, taxes: 0, source: "investing.com" }));
    trades.push(normalizeTrade({ id: base + ":S", date: closeDate, symbol, side: "SELL", quantity, price: closePrice, currency, fees: 0, taxes: 0, source: "investing.com" }));
  });

  if (!trades.length) throw new Error("Nessuna posizione trovata nelle sezioni \"Posizioni aperte\" e \"Posizioni chiuse\"");
  trades.sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === "BUY" ? -1 : 1));
  return { trades, openLots: rawOpen.length, closedLots: rawClosed.length };
}
