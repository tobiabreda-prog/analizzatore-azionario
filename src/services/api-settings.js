// Gestione centralizzata delle credenziali API lato client.
// Compatibile con le chiavi legacy già salvate nelle versioni precedenti.
const STORAGE_KEY = "aa_api_settings_v1";
const LEGACY_KEYS = { gemini: "gemini_api_key", alphavantage: "av_key", fred: "fred_api_key" };

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function getApiKey(provider) {
  const key = String(provider || "").toLowerCase();
  if (!Object.hasOwn(LEGACY_KEYS, key)) return "";
  try {
    const saved = readSettings()[key];
    if (typeof saved === "string" && saved.trim()) return saved;
    return localStorage.getItem(LEGACY_KEYS[key]) || "";
  } catch {
    return "";
  }
}

export function saveApiKey(provider, value) {
  const key = String(provider || "").toLowerCase();
  if (!Object.hasOwn(LEGACY_KEYS, key)) throw new Error("Provider API non supportato: " + key);
  const normalized = String(value ?? "").trim();
  const settings = readSettings();
  if (normalized) settings[key] = normalized;
  else delete settings[key];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // L'accesso in lettura resta compatibile con le chiavi legacy, ma i nuovi
    // salvataggi non duplicano le credenziali in più voci di localStorage.
    localStorage.removeItem(LEGACY_KEYS[key]);
  } catch {
    throw new Error("Impossibile salvare la chiave API nella memoria locale del dispositivo.");
  }
}

export function getApiSettingsStatus() {
  return Object.fromEntries(Object.keys(LEGACY_KEYS).map((key) => [key, Boolean(getApiKey(key))]));
}
