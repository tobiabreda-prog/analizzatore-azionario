// Investing's holdings export is a snapshot, not a complete transaction ledger.
// Preserve every column (including duplicate headings) before normalizing values.
const norm = value => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const missing = value => ["", "-", "--", "n.d.", "n/d", "n/a", "na", "null"].includes(norm(value));
const sectionIds = { "riepilogo posizioni aperte": "summary", "posizioni aperte": "open", "posizioni chiuse": "closed" };
const exchangeCurrency = { BIT: "EUR", ETR: "EUR", F: "EUR", EPA: "EUR", AMS: "EUR", MCE: "EUR", NASDAQ: "USD", NYSE: "USD", NYSEARCA: "USD", AMEX: "USD", LSE: "GBP" };
const usExchanges = new Set(["NASDAQ", "NYSE", "NYSEARCA", "AMEX"]);
const moneyHeaders = new Set(["valore di mercato", "commissione", "commissioni", "p/l giornaliero", "prof./perd. netto", "netto profitti/perdite"]);
const dateHeaders = new Set(["data ap.", "data apertura", "data chiusura", "prossima data utili"]);
const numericHeaders = new Set(["prezzo medio", "prez ap.", "prezzo apertura", "prezzo corrente", "prez ch.", "prezzo chiusura", "orario esteso", "precedente", "ultimo", "denaro", "lettera", "apertura", "massimo", "minimo", "var.", "eps", "ratio prezzo/utile", "beta", "dividendo", "vol.", "market cap", "ricavi", "volume medio (3m)"]);
const percentageHeaders = new Set(["orario esteso (%)", "peso", "%p/l giornaliero", "% p/l giornaliero", "% netta p/l", "var. %", "rendimento", "guadagno%", "guadagno %", "settimana", "1 mese", "ytd", "1 anno", "3 anni"]);

function csvRecords(text) {
  const records = [];
  let cells = [], field = "", state = "plain", line = 1, startLine = 1;
  const endField = () => { cells.push(field); field = ""; state = "plain"; };
  const endRecord = () => { endField(); records.push({ line: startLine, cells }); cells = []; startLine = line + 1; };
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (state === "quoted") {
      if (character === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else state = "closed";
      } else {
        field += character;
        if (character === "\n" || character === "\r" && source[i + 1] !== "\n") line++;
      }
      continue;
    }
    if (character === ",") { endField(); continue; }
    if (character === "\n" || character === "\r") {
      endRecord();
      if (character === "\r" && source[i + 1] === "\n") i++;
      line++; startLine = line;
      continue;
    }
    if (state === "closed") {
      if (!/[ \t]/.test(character)) throw new Error(`Riga ${line}: carattere dopo la chiusura delle virgolette`);
      continue;
    }
    if (character === '"') {
      if (field !== "") throw new Error(`Riga ${line}: virgolette in un campo non delimitato`);
      state = "quoted";
    } else field += character;
  }
  if (state === "quoted") throw new Error(`Riga ${startLine}: virgolette non chiuse`);
  if (field !== "" || cells.length || state === "closed") { endField(); records.push({ line: startLine, cells }); }
  return records;
}

function numeric(raw, label, quantity = false) {
  if (missing(raw)) return null;
  let value = String(raw).trim().replace(/\u2212/g, "-");
  let multiplier = 1;
  const scale = value.match(/\s*([KMBT])$/i);
  if (scale) { multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[scale[1].toUpperCase()]; value = value.slice(0, scale.index).trim(); }
  if (/^[+-]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[,.]\d+)?$/.test(value)) value = value.replace(/[ \u00a0\u202f]/g, "");
  if (value.includes(",")) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(value)) throw new Error(`${label}: numero non valido`);
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (!quantity && /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  else if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) throw new Error(`${label}: numero non valido`);
  const result = Number(value) * multiplier;
  if (!Number.isFinite(result)) throw new Error(`${label}: numero fuori intervallo`);
  return result;
}

function currencyIn(raw) {
  const value = String(raw ?? "");
  if (/C\$|\bCAD\b/i.test(value)) return "CAD";
  if (/A\$|\bAUD\b/i.test(value)) return "AUD";
  if (/HK\$|\bHKD\b/i.test(value)) return "HKD";
  const code = value.match(/\b(EUR|USD|GBP|CHF|JPY|CNY|SEK|NOK|DKK|INR|KRW|SGD|ZAR|BRL|MXN)\b/i);
  return code ? code[1].toUpperCase() : value.includes("€") ? "EUR" : value.includes("$") ? "USD" : value.includes("£") ? "GBP" : null;
}
function monetary(raw, label, fallback = null) {
  if (missing(raw)) return null;
  let value = String(raw).trim();
  const negative = /^\(.*\)$/.test(value);
  if (negative) value = value.slice(1, -1);
  const currency = currencyIn(value) || fallback;
  value = value.replace(/(?:HK\$|C\$|A\$|[€$£]|\b(?:EUR|USD|GBP|CHF|JPY|CAD|AUD|CNY|HKD|SEK|NOK|DKK|INR|KRW|SGD|ZAR|BRL|MXN)\b)/gi, "").trim();
  const amount = numeric(value, label);
  return { amount: negative ? -Math.abs(amount) : amount, currency };
}
function percent(raw, label) {
  if (missing(raw)) return null;
  return numeric(String(raw).trim().replace(/%$/, "").trim(), label);
}
function fullDate(raw, label) {
  if (missing(raw)) return null;
  const value = String(raw).trim();
  const european = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  const iso = european ? `${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`${label}: data non valida`);
  const time = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== iso) throw new Error(`${label}: data non valida`);
  return iso;
}
function fieldValue(name, raw) {
  const heading = norm(name);
  if (heading === "quantita") return { kind: "number", value: numeric(raw, name, true) };
  // Profit/loss may be reported in the account's base currency, independently
  // of the quote currency. A bare amount must not inherit the exchange currency.
  if (moneyHeaders.has(heading)) return { kind: "money", value: monetary(raw, name) };
  if (dateHeaders.has(heading)) return { kind: "date", value: fullDate(raw, name) };
  if (percentageHeaders.has(heading) || heading === "giornaliero" && /%\s*$/.test(raw)) return { kind: "percent", value: percent(raw, name) };
  if (numericHeaders.has(heading)) return { kind: "number", value: numeric(raw, name) };
  if (heading === "ora" && /^\d{1,2}\/\d{1,2}$/.test(String(raw).trim())) {
    fullDate(String(raw).trim() + "/2000", name);
    return { kind: "partialDate", value: String(raw).trim() };
  }
  return { kind: "text", value: missing(raw) ? null : raw };
}

function normalizeRow(section, record, index, knownCurrencies, warnings) {
  const headers = section.headers;
  const names = headers.map(norm);
  const find = (...aliases) => names.findIndex(name => aliases.includes(name));
  const raw = (...aliases) => { const at = find(...aliases); return at < 0 ? null : record.cells[at]; };
  const originalSymbol = String(raw("simbolo") ?? "").trim();
  const exchange = String(raw("borsa") ?? "").trim().toUpperCase();
  const symbol = usExchanges.has(exchange) ? originalSymbol.toUpperCase().replace(/\.(O|K|N|A|P|OQ|PK)$/, "") : originalSymbol.toUpperCase();
  const name = String(raw("nome") ?? "").trim();
  if (!symbol || !exchange || !name) throw new Error("Nome, simbolo o borsa mancanti");
  const currencyKey = `${exchange}|${symbol}`;
  const explicitCurrency = currencyIn(raw("valuta"));
  const marketCurrency = currencyIn(raw("valore di mercato"));
  const feeCurrency = currencyIn(raw("commissione", "commissioni"));
  const currency = explicitCurrency || exchangeCurrency[exchange] || knownCurrencies.get(currencyKey) || marketCurrency || feeCurrency || null;
  const currencySource = explicitCurrency ? "explicit" : exchangeCurrency[exchange] ? "exchange" : knownCurrencies.has(currencyKey) ? "matching_position" : marketCurrency ? "market_value" : feeCurrency ? "commission" : "unknown";
  if (currency && currencySource !== "commission") knownCurrencies.set(currencyKey, currency);
  if (currencySource === "commission") warnings.push(`Riga ${record.line}: valuta del prezzo dedotta soltanto dalla commissione; da verificare.`);
  if (marketCurrency && currency && marketCurrency !== currency) warnings.push(`Riga ${record.line}: valore di mercato e prezzo hanno valute diverse; nessun cambio ricostruito.`);
  if (feeCurrency && currency && feeCurrency !== currency) warnings.push(`Riga ${record.line}: commissione e prezzo hanno valute diverse; nessun cambio ricostruito.`);
  const fields = headers.map((heading, column) => ({ name: heading, index: column, raw: record.cells[column], ...fieldValue(heading, record.cells[column]) }));
  const get = (...aliases) => { const at = find(...aliases); return at < 0 ? null : fields[at].value; };
  const quantity = get("quantita");
  if (quantity == null || quantity < 0 || section.id !== "summary" && quantity === 0) throw new Error("Quantità mancante o non positiva");
  const sideText = norm(raw("tipo"));
  const side = ["compra", "buy", "acquisto"].includes(sideText) ? "BUY" : ["vendi", "sell", "vendita"].includes(sideText) ? "SELL" : null;
  if (!side && sideText) warnings.push(`Riga ${record.line}: tipo di posizione non riconosciuto; conservato senza interpretazione.`);
  if (!currency) warnings.push(`Riga ${record.line}: valuta del prezzo non determinabile.`);
  const result = {
    id: `${section.id}:${index + 1}`, line: record.line, cells: [...record.cells], fields,
    originalSymbol, symbol, name, exchange, side, currency, currencySource, quantity,
    averagePrice: get("prezzo medio"), openPrice: get("prez ap.", "prezzo apertura"),
    currentPrice: get("prezzo corrente"), closePrice: get("prez ch.", "prezzo chiusura"),
    openDate: get("data ap.", "data apertura"), closeDate: get("data chiusura"),
    marketValue: get("valore di mercato"), commission: get("commissione", "commissioni"),
    dailyPnl: get("p/l giornaliero"), netPnl: get("prof./perd. netto", "netto profitti/perdite"),
    weightPct: get("peso"), netPnlPct: get("% netta p/l", "guadagno%", "guadagno %"), dailyPnlPct: get("%p/l giornaliero", "% p/l giornaliero")
  };
  if (result.openDate && result.closeDate && result.closeDate < result.openDate) throw new Error("Data di chiusura precedente all'apertura");
  for (const key of ["averagePrice", "openPrice", "currentPrice", "closePrice"]) if (result[key] != null && result[key] < 0) throw new Error("Prezzo negativo");
  if (result.commission?.amount < 0) throw new Error("Commissione negativa");
  return result;
}

function validateHeaders(section, line) {
  const names = section.headers.map(norm);
  const required = ["nome", "simbolo", "borsa", "quantita"];
  if (section.id === "open" || section.id === "closed") required.push("data ap.", "prez ap.");
  if (section.id === "closed") required.push("data chiusura", "prez ch.");
  const absent = required.filter(name => !names.includes(name));
  if (absent.length) throw new Error(`Riga ${line}: colonne mancanti in ${section.title}: ${absent.join(", ")}`);
}

function totalFromRecord(record) {
  const label = record.cells[0];
  const raw = record.cells.slice(1).join(",");
  const pieces = raw.split(/\s*\/\s*/);
  const first = pieces[0].trim();
  const value = missing(first) || !/[\d€$£]/.test(first) ? null : monetary(first, label);
  const percentage = pieces.find(piece => /%\s*$/.test(piece));
  return { label, raw, value, percent: percentage ? percent(percentage, label) : null, line: record.line, cells: [...record.cells] };
}

export function parseInvestingPortfolio(text, { fileName = "", importedAt = new Date().toISOString() } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("File CSV vuoto");
  const records = csvRecords(text);
  const sections = [], totals = [], warnings = [];
  let current = null;
  for (const record of records) {
    if (record.cells.every(cell => cell.trim() === "")) continue;
    const id = record.cells.length === 1 ? sectionIds[norm(record.cells[0])] : null;
    if (id) {
      current = { id, title: record.cells[0], headers: [], rows: [] };
      sections.push(current);
      continue;
    }
    if (record.cells.length === 1) {
      current = { id: "other", title: record.cells[0], headers: [], rows: [] };
      sections.push(current);
      continue;
    }
    if (current && !current.headers.length) {
      current.headers = [...record.cells];
      if (current.id !== "other") validateHeaders(current, record.line);
      continue;
    }
    if (current && (record.cells[0].trim() === "" || current.id === "other" || record.cells.length === current.headers.length)) {
      if (current.headers.length !== record.cells.length) throw new Error(`Riga ${record.line}: numero colonne diverso dall'intestazione`);
      current.rows.push({ line: record.line, cells: [...record.cells] });
      continue;
    }
    if (record.cells[0].trim()) {
      try { totals.push(totalFromRecord(record)); }
      catch (error) { throw new Error(`Riga ${record.line}: ${error.message}`); }
      current = null;
    } else throw new Error(`Riga ${record.line}: riga senza sezione riconosciuta`);
  }
  if (!sections.some(section => section.id !== "other")) throw new Error("Il file non sembra un export portafoglio di Investing.com");
  const result = {
    schemaVersion: 1, source: "investing.com", fileName: String(fileName), importedAt,
    sourceText: text, sections, summaryPositions: [], openLots: [], closedLots: [], totals, warnings
  };
  const destinations = { summary: result.summaryPositions, open: result.openLots, closed: result.closedLots };
  const knownCurrencies = new Map();
  for (const id of ["summary", "open", "closed"]) {
    const duplicates = new Map();
    for (const section of sections.filter(part => part.id === id)) {
      for (const record of section.rows) {
        try {
          const row = normalizeRow(section, record, destinations[id].length, knownCurrencies, warnings);
          destinations[id].push(row);
          const signature = JSON.stringify(record.cells);
          if (duplicates.has(signature)) warnings.push(`Riga ${record.line}: riga ${id === "closed" ? "chiusa " : ""}identica alla riga ${duplicates.get(signature)}; entrambe conservate.`);
          else duplicates.set(signature, record.line);
        } catch (error) { throw new Error(`Riga ${record.line}: ${error.message}`); }
      }
    }
  }
  if (!result.summaryPositions.length && !result.openLots.length && !result.closedLots.length) throw new Error("Nessuna posizione trovata nel CSV Investing.com");
  return result;
}
