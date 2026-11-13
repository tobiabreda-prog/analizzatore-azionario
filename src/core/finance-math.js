const finite = (x) => typeof x === "number" && Number.isFinite(x);

export function cagr(start, end, years) {
  if (![start, end, years].every(finite) || start <= 0 || end < 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

export function enterpriseToEquityValue({ enterpriseValue, cash, debt, minorityInterest = 0, preferredEquity = 0 }) {
  if (![enterpriseValue, cash, debt, minorityInterest, preferredEquity].every(finite)) return null;
  return enterpriseValue + cash - debt - minorityInterest - preferredEquity;
}

export function weightedScore(factors) {
  const usable = factors.filter((f) => finite(f.score) && finite(f.weight) && f.weight > 0);
  const weight = usable.reduce((s, f) => s + f.weight, 0);
  if (!weight) return { score: null, coverage: 0 };
  return { score: usable.reduce((s, f) => s + f.score * f.weight, 0) / weight, coverage: weight / factors.reduce((s, f) => s + (finite(f.weight) && f.weight > 0 ? f.weight : 0), 0) };
}
