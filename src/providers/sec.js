const SEC_BASE = "https://data.sec.gov";
const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";

async function getJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`SEC HTTP ${response.status}`);
  return response.json();
}

export async function findSecCompany(ticker, fetchImpl = fetch) {
  const normalized = String(ticker ?? "").trim().toUpperCase();
  if (!normalized) throw new Error("Ticker obbligatorio");
  const rows = Object.values(await getJson(SEC_TICKERS, fetchImpl));
  const match = rows.find((row) => String(row.ticker).toUpperCase() === normalized);
  return match ? { cik: String(match.cik_str).padStart(10, "0"), ticker: match.ticker, title: match.title } : null;
}

export async function loadSecCompanyFacts(cik, fetchImpl = fetch) {
  const normalized = String(cik ?? "").replace(/\D/g, "").padStart(10, "0");
  if (!/^\d{10}$/.test(normalized)) throw new Error("CIK non valido");
  const json = await getJson(`${SEC_BASE}/api/xbrl/companyfacts/CIK${normalized}.json`, fetchImpl);
  return { cik: normalized, entityName: json.entityName ?? null, facts: json.facts ?? {}, source: "SEC EDGAR", retrievedAt: new Date().toISOString() };
}
