const DAY_MS = 86_400_000;

export function assessDataPoint(point, now = new Date()) {
  const issues = [];
  if (!point || typeof point !== "object") return { status: "invalid", score: 0, issues: ["Dato assente"] };
  if (typeof point.value !== "number" || !Number.isFinite(point.value)) issues.push("Valore numerico non valido");
  if (!point.currency && point.kind === "price") issues.push("Valuta mancante");
  if (!point.source) issues.push("Fonte mancante");
  if (!point.asOf || Number.isNaN(Date.parse(point.asOf))) issues.push("Data di riferimento mancante o non valida");
  const ageMs = point.asOf ? now.getTime() - Date.parse(point.asOf) : Infinity;
  if (ageMs < -DAY_MS) issues.push("Data futura incoerente");
  const maxAgeDays = point.maxAgeDays ?? (point.kind === "price" ? 4 : 550);
  if (ageMs > maxAgeDays * DAY_MS) issues.push("Dato obsoleto");
  const score = Math.max(0, 100 - issues.length * 25);
  return { status: issues.length ? "warning" : "valid", score, ageDays: Number.isFinite(ageMs) ? Math.floor(ageMs / DAY_MS) : null, issues };
}

export function requireUsable(point, options = {}) {
  const assessment = assessDataPoint(point, options.now);
  if (assessment.status === "invalid" || assessment.issues.some((x) => ["Valore numerico non valido", "Valuta mancante", "Fonte mancante", "Data di riferimento mancante o non valida", "Data futura incoerente"].includes(x))) {
    throw new Error(`Dato non utilizzabile: ${assessment.issues.join("; ")}`);
  }
  if (assessment.issues.includes("Dato obsoleto") && !options.allowStale) throw new Error("Dato obsoleto: analisi bloccata");
  return { ...point, quality: assessment };
}

export function summarizeQuality(points = []) {
  const checks = points.map((p) => assessDataPoint(p));
  return { total: checks.length, valid: checks.filter((x) => x.status === "valid").length, warnings: checks.filter((x) => x.status === "warning").length, averageScore: checks.length ? Math.round(checks.reduce((s, x) => s + x.score, 0) / checks.length) : null };
}
