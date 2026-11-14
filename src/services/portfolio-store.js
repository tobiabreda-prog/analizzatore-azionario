export const PORTFOLIO_STORAGE_KEY = "aa_investing_portfolio_v1";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.every(item => typeof item === "string");
const finite = value => typeof value === "number" && Number.isFinite(value);
const optionalNumber = value => value == null || finite(value);
const optionalMoney = value => value == null || object(value) && finite(value.amount) && (value.currency == null || typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency));
const isoDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
function validField(field) {
  if (!object(field) || typeof field.name !== "string" || typeof field.raw !== "string" || !Number.isInteger(field.index) || field.index < 0) return false;
  if (["number", "percent"].includes(field.kind)) return optionalNumber(field.value);
  if (field.kind === "money") return optionalMoney(field.value);
  if (field.kind === "date") return field.value == null || isoDate(field.value);
  return ["text", "partialDate"].includes(field.kind) && (field.value == null || typeof field.value === "string");
}

function validateSnapshot(snapshot) {
  if (!object(snapshot) || snapshot.schemaVersion !== 1 || snapshot.source !== "investing.com" || typeof snapshot.sourceText !== "string" || !snapshot.sourceText.trim()
    || typeof snapshot.fileName !== "string" || typeof snapshot.importedAt !== "string" || !Number.isFinite(Date.parse(snapshot.importedAt))) throw new Error("Formato del portafoglio salvato non valido o non supportato.");
  if (!Array.isArray(snapshot.sections) || !Array.isArray(snapshot.totals) || !strings(snapshot.warnings)) throw new Error("Struttura del portafoglio salvato non valida.");
  for (const section of snapshot.sections) {
    if (!object(section) || typeof section.id !== "string" || typeof section.title !== "string" || !strings(section.headers) || !Array.isArray(section.rows)
      || !section.rows.every(row => object(row) && Number.isInteger(row.line) && row.line > 0 && strings(row.cells) && row.cells.length === section.headers.length)) throw new Error("Sezione del portafoglio salvato non valida.");
  }
  const lists = [snapshot.summaryPositions, snapshot.openLots, snapshot.closedLots];
  if (lists.some(rows => !Array.isArray(rows)) || !lists.some(rows => rows.length)) throw new Error("Il portafoglio salvato non contiene posizioni.");
  for (const rows of lists) for (const row of rows) {
    if (!object(row) || typeof row.symbol !== "string" || !row.symbol || !finite(row.quantity) || row.quantity < 0
      || !["id", "name", "exchange", "originalSymbol"].every(key => typeof row[key] === "string")
      || !row.id || !Number.isInteger(row.line) || row.line < 1 || !strings(row.cells) || !Array.isArray(row.fields) || row.fields.length !== row.cells.length || !row.fields.every(validField)
      || !(row.currency == null || typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency))
      || ![null, "BUY", "SELL"].includes(row.side ?? null)
      || !["averagePrice", "openPrice", "currentPrice", "closePrice", "weightPct", "netPnlPct", "dailyPnlPct"].every(key => optionalNumber(row[key]))
      || !["openDate", "closeDate"].every(key => row[key] == null || isoDate(row[key]))
      || !["marketValue", "commission", "dailyPnl", "netPnl"].every(key => optionalMoney(row[key]))) throw new Error("Posizione del portafoglio salvato non valida.");
  }
  for (const total of snapshot.totals) if (!object(total) || typeof total.label !== "string" || typeof total.raw !== "string" || !optionalMoney(total.value) || !optionalNumber(total.percent)) throw new Error("Totale del portafoglio salvato non valido.");
  return snapshot;
}

function resolveStorage(storage) {
  try { return storage === undefined ? globalThis.localStorage : storage; }
  catch { throw new Error("Memoria locale non disponibile: il portafoglio non è stato modificato."); }
}

export function loadPortfolioSnapshot(storage) {
  const store = resolveStorage(storage);
  if (!store) throw new Error("Memoria locale non disponibile.");
  let raw;
  try { raw = store.getItem(PORTFOLIO_STORAGE_KEY); }
  catch { throw new Error("Impossibile leggere il portafoglio dalla memoria locale."); }
  if (raw === null) return null;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Il portafoglio salvato non è leggibile. Importa nuovamente il CSV."); }
  return validateSnapshot(parsed);
}

export function savePortfolioSnapshot(snapshot, storage) {
  validateSnapshot(snapshot);
  let serialized;
  try { serialized = JSON.stringify(snapshot); validateSnapshot(JSON.parse(serialized)); }
  catch { throw new Error("Impossibile preparare il salvataggio del portafoglio: dati non validi."); }
  const store = resolveStorage(storage);
  if (!store) throw new Error("Memoria locale non disponibile: il portafoglio non è stato modificato.");
  // localStorage.setItem is atomic: failed writes leave the previous snapshot intact.
  try { store.setItem(PORTFOLIO_STORAGE_KEY, serialized); }
  catch { throw new Error("Spazio locale insufficiente o salvataggio non disponibile: il portafoglio precedente è conservato."); }
  return snapshot;
}

export function clearPortfolioSnapshot(storage) {
  const store = resolveStorage(storage);
  if (!store) throw new Error("Memoria locale non disponibile.");
  try { store.removeItem(PORTFOLIO_STORAGE_KEY); }
  catch { throw new Error("Impossibile rimuovere il portafoglio dalla memoria locale."); }
}
