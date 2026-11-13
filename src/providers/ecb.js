const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";

export async function loadEcbSeries({ flowRef, key, startPeriod, endPeriod, fetchImpl = fetch }) {
  if (!/^[A-Za-z0-9._-]+$/.test(flowRef ?? "")) throw new Error("Identificativo serie ECB non valido");
  const url = new URL(`${ECB_BASE}/${flowRef}`);
  url.search = new URLSearchParams({ ...(startPeriod ? { startPeriod } : {}), ...(endPeriod ? { endPeriod } : {}), detail: "dataonly" });
  const response = await fetchImpl(url, { headers: { Accept: "text/csv", ...(key ? { "Ocp-Apim-Subscription-Key": key } : {}) } });
  if (!response.ok) throw new Error(`ECB HTTP ${response.status}`);
  const csv = await response.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  const timeIndex = headers.indexOf("TIME_PERIOD"), valueIndex = headers.indexOf("OBS_VALUE");
  if (timeIndex < 0 || valueIndex < 0) throw new Error("Formato CSV ECB inatteso");
  return lines.slice(1).map((line) => line.split(",")).filter((cols) => cols.length > Math.max(timeIndex, valueIndex)).map((cols) => ({ date: cols[timeIndex], value: Number(cols[valueIndex]), source: "ECB" })).filter((x) => Number.isFinite(x.value));
}
