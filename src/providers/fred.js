const BASE = "https://api.stlouisfed.org/fred";

export async function loadFredObservations({ seriesId, apiKey, observationStart, observationEnd, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("Inserire la propria chiave API FRED");
  if (!/^[A-Za-z0-9_]+$/.test(seriesId ?? "")) throw new Error("ID serie FRED non valido");
  const url = new URL(`${BASE}/series/observations`);
  url.search = new URLSearchParams({ series_id: seriesId, api_key: apiKey, file_type: "json", ...(observationStart ? { observation_start: observationStart } : {}), ...(observationEnd ? { observation_end: observationEnd } : {}) });
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`FRED HTTP ${response.status}`);
  const json = await response.json();
  return (json.observations ?? []).filter((x) => x.value !== "." && Number.isFinite(Number(x.value))).map((x) => ({ date: x.date, value: Number(x.value), source: "FRED", seriesId }));
}
