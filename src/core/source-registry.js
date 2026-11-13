export const SOURCE_REGISTRY = Object.freeze({
  sec: { name: "SEC EDGAR", region: "USA", kind: ["filings", "fundamentals"], keyRequired: false, cadence: "Durante la giornata", notes: "Dati societari XBRL e filing; non è un feed prezzi." },
  ecb: { name: "Banca Centrale Europea", region: "Eurozona", kind: ["macro"], keyRequired: false, cadence: "Secondo pubblicazione statistica", notes: "Statistiche ufficiali via SDMX." },
  fred: { name: "FRED", region: "USA", kind: ["macro"], keyRequired: true, cadence: "Secondo serie", notes: "Chiave API gratuita; verificare i diritti della singola serie." },
  alphavantage: { name: "Alpha Vantage", region: "Multi-market", kind: ["prices", "fundamentals"], keyRequired: true, cadence: "Dipende da endpoint e piano", notes: "Piano gratuito molto limitato; diversi endpoint e dati real-time sono premium." }
});

export function sourceInfo(id) { return SOURCE_REGISTRY[id] ?? null; }
