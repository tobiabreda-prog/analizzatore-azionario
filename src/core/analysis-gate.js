const finite = (v) => typeof v === "number" && Number.isFinite(v);
const ageDays = (date, now) => {
  if (typeof date !== "string" || Number.isNaN(Date.parse(date))) return null;
  return (now.getTime() - Date.parse(date + (date.length === 10 ? "T23:59:59Z" : ""))) / 86400000;
};

/**
 * Conservative gate for the legacy score. A numeric score is not an investment
 * label unless price, financial statements, valuation references and factor
 * coverage pass explicit minimum checks.
 */
export function assessAnalysisReadiness({ quote, fin, val, scores = {}, now = new Date() } = {}) {
  const reasons = [];
  const priceAge = ageDays(quote?.asOf, now);
  if (!finite(quote?.price) || quote.price <= 0) reasons.push("Prezzo non valido");
  if (!quote?.currency) reasons.push("Valuta del prezzo assente");
  if (!quote?.source) reasons.push("Fonte del prezzo assente");
  if (priceAge == null || priceAge < -1 || priceAge > 5) reasons.push("Prezzo assente, futuro o non aggiornato (oltre 5 giorni)");
  if (!Array.isArray(quote?.history) || quote.history.length < 40) reasons.push("Storico prezzi insufficiente (servono almeno 40 osservazioni settimanali)");
  const annual = Array.isArray(fin?.annual) ? fin.annual : [];
  const usableYears = annual.filter((row) => finite(row?.rev) && row.rev > 0 && finite(row?.ni));
  if (usableYears.length < 3) reasons.push("Bilanci annuali insufficienti (servono almeno 3 esercizi con ricavi e utile netto disponibili)");
  const reportAge = ageDays(fin?.lastReportDate, now);
  if (!fin?.lastReportDate || reportAge == null || reportAge < -1 || reportAge > 560 || fin?.isLatest === false) reasons.push("Ultimo bilancio non verificato o troppo datato");
  const metrics = Array.isArray(val?.metrics) ? val.metrics : [];
  const comparable = metrics.filter((m) => finite(m?.v) && m.v > 0 && (finite(m?.sector) && m.sector > 0 || finite(m?.hist5y) && m.hist5y > 0));
  if (!comparable.length) reasons.push("Valutazione senza multipli confrontabili con settore o storico");
  const required = ["Trend tecnico", "Crescita", "Redditività", "Valutazione"];
  const missingRequired = required.filter((key) => !finite(scores[key]));
  if (missingRequired.length) reasons.push("Fattori essenziali non disponibili: " + missingRequired.join(", "));
  const available = Object.values(scores).filter(finite).length;
  if (available < 4) reasons.push("Copertura del punteggio inferiore a 4 fattori su 6");
  return {
    ready: reasons.length === 0,
    status: reasons.length === 0 ? "ready" : "insufficient_data",
    reasons,
    coverage: { availableFactors: available, totalFactors: 6, annualStatements: usableYears.length, comparableMultiples: comparable.length, priceAgeDays: priceAge, reportAgeDays: reportAge }
  };
}
