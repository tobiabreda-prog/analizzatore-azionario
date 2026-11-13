const finite = (x) => typeof x === "number" && Number.isFinite(x);

export function cagr(start, end, years) {
  if (![start, end, years].every(finite) || start <= 0 || end < 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

export function enterpriseToEquityValue({ enterpriseValue, cash, debt, minorityInterest = 0, preferredEquity = 0 }) {
  if (![enterpriseValue, cash, debt, minorityInterest, preferredEquity].every(finite)) return null;
  return enterpriseValue + cash - debt - minorityInterest - preferredEquity;
}

export function dcfValue({ freeCashFlows, wacc, terminalGrowth, netDebt = 0, dilutedShares }) {
  if (!Array.isArray(freeCashFlows) || freeCashFlows.length < 1 || !freeCashFlows.every(finite)) return { ok: false, reason: "Flussi di cassa incompleti" };
  if (![wacc, terminalGrowth, netDebt, dilutedShares].every(finite) || dilutedShares <= 0) return { ok: false, reason: "Parametri DCF mancanti o non validi" };
  if (wacc <= terminalGrowth || wacc <= 0) return { ok: false, reason: "WACC deve essere positivo e superiore alla crescita terminale" };
  let pv = 0;
  freeCashFlows.forEach((fcf, i) => { pv += fcf / (1 + wacc) ** (i + 1); });
  const last = freeCashFlows.at(-1);
  const terminalValue = last * (1 + terminalGrowth) / (wacc - terminalGrowth);
  const enterpriseValue = pv + terminalValue / (1 + wacc) ** freeCashFlows.length;
  const equityValue = enterpriseValue - netDebt;
  return { ok: true, enterpriseValue, equityValue, valuePerShare: equityValue / dilutedShares, presentValueForecast: pv, presentValueTerminal: terminalValue / (1 + wacc) ** freeCashFlows.length };
}

export function weightedScore(factors) {
  const usable = factors.filter((f) => finite(f.score) && finite(f.weight) && f.weight > 0);
  const weight = usable.reduce((s, f) => s + f.weight, 0);
  if (!weight) return { score: null, coverage: 0 };
  return { score: usable.reduce((s, f) => s + f.score * f.weight, 0) / weight, coverage: weight / factors.reduce((s, f) => s + (finite(f.weight) && f.weight > 0 ? f.weight : 0), 0) };
}
