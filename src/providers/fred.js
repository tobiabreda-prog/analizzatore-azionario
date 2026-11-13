import { Capacitor, CapacitorHttp } from "@capacitor/core";

const BASE = "https://api.stlouisfed.org/fred";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fredError(status, body) {
  const message = typeof body === "object" && body !== null
    ? (body.error_message || body.message || "") : "";
  if (status === 400 || status === 401 || status === 403) return new Error(`FRED HTTP ${status}: chiave API non valida o richiesta errata${message ? " — " + message : ""}`);
  if (status === 404) return new Error("FRED HTTP 404: serie non trovata o dismessa");
  if (status === 429) return new Error("FRED HTTP 429: troppe richieste, riprova più tardi");
  return new Error(`FRED HTTP ${status}${message ? ": " + message : ""}`);
}

export async function loadFredObservations({ seriesId, apiKey, observationStart, observationEnd, fetchImpl }) {
  if (!apiKey?.trim()) throw new Error("Inserire la propria chiave API FRED");
  if (!/^[A-Za-z0-9_]+$/.test(seriesId ?? "")) throw new Error("ID serie FRED non valido");
  const url = new URL(`${BASE}/series/observations`);
  url.search = new URLSearchParams({
    series_id: seriesId, api_key: apiKey.trim(), file_type: "json",
    sort_order: "desc", limit: "90",
    ...(observationStart ? { observation_start: observationStart } : {}),
    ...(observationEnd ? { observation_end: observationEnd } : {})
  });
  const native = !fetchImpl && Capacitor.isNativePlatform();
  let json;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (native) {
        // HTTP nativo Android evita le limitazioni CORS della WebView.
        const response = await CapacitorHttp.get({ url: url.toString(), connectTimeout: 12000, readTimeout: 20000 });
        json = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
        if (response.status < 200 || response.status >= 300) throw fredError(response.status, json);
      } else {
        const response = await (fetchImpl ?? fetch)(url);
        json = await response.json();
        if (!response.ok) throw fredError(response.status, json);
      }
      break;
    } catch (error) {
      if (attempt === 0 && /429|timeout|network|failed to fetch/i.test(error.message)) {
        await sleep(750);
        continue;
      }
      if (!native && /failed to fetch|networkerror/i.test(error.message))
        throw new Error("FRED non raggiungibile dal browser (possibile blocco CORS). Utilizzare l'app Android.");
      throw error;
    }
  }
  if (!Array.isArray(json?.observations)) throw new Error("Risposta FRED senza osservazioni valide");
  return json.observations
    .filter((x) => x.value !== "." && Number.isFinite(Number(x.value)))
    .map((x) => ({ date: x.date, value: Number(x.value), source: "FRED", seriesId }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
