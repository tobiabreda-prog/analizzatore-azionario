const finite = (v) => typeof v === "number" && Number.isFinite(v);
const dateOnly = (v) => { if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false; const d=new Date(v+"T00:00:00Z"); return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v; };

export function normalizeEarningsEvent(raw) {
  if (!raw || !dateOnly(raw.date) || !raw.source) throw new Error("Evento utili: data ISO e fonte obbligatorie");
  return { symbol: String(raw.symbol ?? "").toUpperCase(), date: raw.date, time: raw.time ?? "unknown", fiscalPeriod: raw.fiscalPeriod ?? null, epsEstimate: finite(raw.epsEstimate) ? raw.epsEstimate : null, epsActual: finite(raw.epsActual) ? raw.epsActual : null, revenueEstimate: finite(raw.revenueEstimate) ? raw.revenueEstimate : null, revenueActual: finite(raw.revenueActual) ? raw.revenueActual : null, currency: raw.currency ?? null, source: raw.source, retrievedAt: raw.retrievedAt ?? new Date().toISOString(), status: raw.status ?? "unconfirmed" };
}

export function earningsSurprise(actual, estimate) {
  if (!finite(actual) || !finite(estimate) || estimate === 0) return null;
  return { absolute: actual - estimate, percent: (actual - estimate) / Math.abs(estimate) * 100 };
}

export function normalizeDividend(raw) {
  if (!raw || !dateOnly(raw.exDate) || !raw.source || !finite(raw.amount) || raw.amount < 0) throw new Error("Dividendo: importo, ex-date e fonte sono obbligatori");
  return { symbol: String(raw.symbol ?? "").toUpperCase(), amount: raw.amount, currency: raw.currency ?? null, frequency: raw.frequency ?? "unknown", declarationDate: dateOnly(raw.declarationDate) ? raw.declarationDate : null, exDate: raw.exDate, recordDate: dateOnly(raw.recordDate) ? raw.recordDate : null, paymentDate: dateOnly(raw.paymentDate) ? raw.paymentDate : null, kind: raw.kind ?? "ordinary", source: raw.source, status: raw.status ?? "unconfirmed" };
}

export function dividendMetrics({ annualDividend, price, earningsPerShare, freeCashFlowPerShare }) {
  const yieldPct = finite(annualDividend) && annualDividend >= 0 && finite(price) && price > 0 ? annualDividend / price * 100 : null;
  const earningsPayoutPct = finite(annualDividend) && finite(earningsPerShare) && earningsPerShare > 0 ? annualDividend / earningsPerShare * 100 : null;
  const fcfPayoutPct = finite(annualDividend) && finite(freeCashFlowPerShare) && freeCashFlowPerShare > 0 ? annualDividend / freeCashFlowPerShare * 100 : null;
  return { yieldPct, earningsPayoutPct, fcfPayoutPct, sustainability: fcfPayoutPct == null ? "not_assessable" : fcfPayoutPct <= 60 ? "lower_payout" : fcfPayoutPct <= 85 ? "moderate_payout" : "high_payout" };
}

export function buildCorporateCalendar({ earnings = [], dividends = [] } = {}) {
  return [...earnings.map((e) => ({ type: "earnings", date: e.date, symbol: e.symbol, source: e.source, status: e.status, payload: e })), ...dividends.map((d) => ({ type: "dividend", date: d.exDate, symbol: d.symbol, source: d.source, status: d.status, payload: d }))].sort((a,b) => a.date.localeCompare(b.date));
}


/** Translate Yahoo earningsTrend period codes, without guessing fiscal quarters. */
export function formatEstimatePeriod(period, endDate = null) {
  const labels = {
    "0q": "Trimestre corrente", "+1q": "Trimestre successivo",
    "0y": "Anno fiscale corrente", "+1y": "Anno fiscale successivo"
  };
  const label = labels[period];
  if (!label) return typeof period === "string" && /^(Trimestre|Anno fiscale)/.test(period) ? period : "n.d.";
  const date = typeof endDate === "string" ? endDate.slice(0,10) : null;
  return dateOnly(date) ? label + " · fine " + date : label;
}

/**
 * A Yahoo 5-year average dividend yield is already a percentage (e.g. 0.45
 * means 0.45%, unlike the decimal dividendYield field).
 * If missing, explain why, but never silently invent a historical average.
 */
export function fiveYearYieldInfo({ providedPercent = null, dividends = [], historyStart = null, asOf = null } = {}) {
  if (finite(providedPercent) && providedPercent >= 0 && providedPercent <= 100) {
    return { value: Math.round(providedPercent * 100) / 100, reason: "Yahoo Finance" };
  }
  const end = dateOnly(asOf) ? Date.parse(asOf) : Date.now();
  const start = dateOnly(historyStart) ? Date.parse(historyStart) : NaN;
  const validDividends = (Array.isArray(dividends) ? dividends : []).filter(d => dateOnly(d?.date) && finite(d?.amount) && d.amount > 0)
    .sort((a,b) => a.date.localeCompare(b.date));
  // Only classify a short dividend track record when the price chart spans
  // almost 5 years and shows a gap of >1 year before the first cash dividend.
  if (validDividends.length && Number.isFinite(start) && end - start >= 4.6*365.25*864e5 &&
      Date.parse(validDividends[0].date) - start > 365.25*864e5) {
    return { value: null, reason: "Storico dividendi inferiore a 5 anni" };
  }
  return { value: null, reason: "Dato non disponibile dalla fonte" };
}
