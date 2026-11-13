const finite = (v) => typeof v === "number" && Number.isFinite(v);
const FACTORS = ["Trend tecnico", "Crescita", "Redditività", "Solidità finanziaria", "Valutazione", "Sentiment"];
const REQUIRED = ["Trend tecnico", "Crescita", "Redditività", "Valutazione"];

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function ageDays(date, now) {
  if (!validIsoDate(date) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  return (now.getTime() - Date.parse(date + "T23:59:59Z")) / 86400000;
}

/**
 * Conservative gate for the legacy score.
 * Missing values never count as zero. A score is allowed only when price,
 * statements, valuation references, factor coverage and history chronology pass.
 */
export function assessAnalysisReadiness({ quote, fin, val, scores = {}, now = new Date() } = {}) {
  const reasons = [];
  const priceAge = ageDays(quote?.asOf, now);
  if (!finite(quote?.price) || quote.price <= 0) reasons.push("Prezzo non valido");
  if (!quote?.currency) reasons.push("Valuta del prezzo assente");
  if (!quote?.source || quote.source === "n.d.") reasons.push("Fonte del prezzo assente");

  if (priceAge == null || priceAge < -1 || priceAge > 5) {
    reasons.push("Prezzo assente, futuro o non aggiornato (oltre 5 giorni)");
  }

  const history = Array.isArray(quote?.history) ? quote.history : [];
  const denseHistory = Array.from({ length: history.length }, (_, index) => index in history).every(Boolean);
  const validHistory = denseHistory && history.every((row) =>
    Array.isArray(row) && validIsoDate(row[0]) && finite(row[1]) && row[1] > 0
  );
  const chronologicalHistory = history.every((row, index) =>
    Array.isArray(row) && validIsoDate(row[0]) &&
    (index === 0 || Array.isArray(history[index - 1]) && row[0] > history[index - 1][0])
  );
  if (history.length < 40) reasons.push("Storico prezzi insufficiente (servono almeno 40 osservazioni settimanali)");
  if (!validHistory || !chronologicalHistory) reasons.push("Storico prezzi non valido o non cronologico");
  if (validIsoDate(quote?.asOf) && history.length && history.at(-1)?.[0] !== quote.asOf) {
    reasons.push("Data dell'ultima quotazione non coerente con lo storico");
  }

  const annual = Array.isArray(fin?.annual) ? fin.annual : [];
  const usableYears = annual.filter((row) =>
    Number.isInteger(row?.y) && finite(row?.rev) && row.rev > 0 && finite(row?.ni)
  );
  const distinctYears = new Set(usableYears.map((row) => row.y));
  if (distinctYears.size < 3) reasons.push("Bilanci annuali insufficienti (servono almeno 3 esercizi distinti con ricavi e utile netto disponibili)");

  const reportAge = ageDays(fin?.lastReportDate, now);
  if (!fin?.lastReportDate || reportAge == null || reportAge < -1 || reportAge > 560 || fin?.isLatest === false) {
    reasons.push("Ultimo bilancio non verificato o troppo datato");
  }
  if (!fin?.source || fin.source === "n.d.") reasons.push("Fonte dei bilanci assente");

  const valuationAge = ageDays(val?.asOf, now);
  if (!val?.source || val.source === "n.d." || valuationAge == null || valuationAge < -1 || valuationAge > 7) {
    reasons.push("Fonte o data dei multipli assente/non aggiornata");
  }
  const metrics = Array.isArray(val?.metrics) ? val.metrics : [];
  const comparable = metrics.filter((metric) => {
    const metricAge = ageDays(metric?.date, now);
    const hasReference = (finite(metric?.sector) && metric.sector > 0) ||
      (finite(metric?.hist5y) && metric.hist5y > 0);
    return finite(metric?.v) && metric.v > 0 && hasReference &&
      metricAge != null && metricAge >= -1 && metricAge <= 45;
  });
  if (!comparable.length) {
    reasons.push("Valutazione senza multipli confrontabili aggiornati (osservazione oltre 45 giorni o data assente)");
  }

  const invalidFactors = FACTORS.filter((key) =>
    scores[key] != null && (!finite(scores[key]) || scores[key] < 0 || scores[key] > 100)
  );
  if (invalidFactors.length) reasons.push("Punteggi fuori intervallo 0–100: " + invalidFactors.join(", "));
  const missingRequired = REQUIRED.filter((key) => !finite(scores[key]) || scores[key] < 0 || scores[key] > 100);
  if (missingRequired.length) reasons.push("Fattori essenziali non disponibili: " + missingRequired.join(", "));
  const available = FACTORS.filter((key) => finite(scores[key]) && scores[key] >= 0 && scores[key] <= 100).length;
  if (available < 4) reasons.push("Copertura del punteggio inferiore a 4 fattori su 6");

  return {
    ready: reasons.length === 0,
    status: reasons.length === 0 ? "ready" : "insufficient_data",
    reasons,
    coverage: {
      availableFactors: available,
      totalFactors: FACTORS.length,
      annualStatements: distinctYears.size,
      comparableMultiples: comparable.length,
      priceAgeDays: priceAge,
      reportAgeDays: reportAge
    }
  };
}

export { validIsoDate };
