const CURRENCIES = new Set(["USD","EUR","GBP","JPY","CHF","CAD","AUD","CNY","HKD","INR","KRW","SEK","NOK","DKK","SGD","ZAR","BRL","MXN"]);

export function normalizeInstrument(input) {
  const ticker = String(input?.ticker ?? "").trim().toUpperCase();
  const name = String(input?.name ?? "").trim();
  const currency = String(input?.currency ?? "").trim().toUpperCase();
  if (!ticker || !name) throw new Error("Strumento: ticker e nome sono obbligatori");
  if (!CURRENCIES.has(currency)) throw new Error("Valuta non riconosciuta o non specificata");
  return { id: String(input.id ?? ticker), ticker, name, currency, exchange: input.exchange ?? null, isin: input.isin ?? null, country: input.country ?? null, assetType: input.assetType ?? "equity" };
}

export function normalizeObservation(input) {
  if (!input || typeof input !== "object") throw new Error("Osservazione non valida");
  if (input.value === null || input.value === undefined || (typeof input.value === "string" && input.value.trim() === "")) throw new Error("Valore osservazione assente");
  const value = typeof input.value === "number" ? input.value : Number(input.value);
  if (!Number.isFinite(value)) throw new Error("Valore osservazione non numerico");
  const asOf = input.asOf ?? input.date;
  if (!asOf || Number.isNaN(Date.parse(asOf))) throw new Error("Data osservazione non valida");
  if (!input.source) throw new Error("Fonte osservazione obbligatoria");
  return { value, asOf: new Date(asOf).toISOString(), source: String(input.source), currency: input.currency ? String(input.currency).toUpperCase() : null, unit: input.unit ?? null, period: input.period ?? null, instrumentId: input.instrumentId ?? null, kind: input.kind ?? "fundamental" };
}
