const finite = (v) => typeof v === "number" && Number.isFinite(v);
const dateOnly = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

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
