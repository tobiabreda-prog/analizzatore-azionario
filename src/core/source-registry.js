export const SOURCE_REGISTRY = Object.freeze({
  yahoo: {
    name: "Yahoo Finance",
    region: "Multi-market",
    kind: ["prices", "history", "fundamentals", "multiples", "news", "events", "analysts"],
    cost: "free_no_key",
    status: "active_unofficial",
    cadence: "Dipende dal mercato; non realtime garantito",
    notes: "Endpoint non ufficiali senza SLA né licenza API verificata. Copertura ampia, inclusi ticker europei; può cambiare o bloccare richieste. Usare come feed indicativo, non come fonte ufficiale."
  },
  alphavantage: {
    name: "Alpha Vantage",
    region: "Multi-market",
    kind: ["daily_prices", "backtest", "analyst_fallback"],
    keyRequired: true,
    cost: "free_tier",
    freeLimit: "25 richieste al giorno condivise localmente tra analisi e backtest",
    cadence: "Daily; realtime e ritardo 15 minuti USA a pagamento",
    notes: "Usato come fallback e per storico daily/backtest. Cache locale giornaliera e contatore quota. Verificare copertura ticker e termini del piano gratuito."
  },
  fred: {
    name: "FRED",
    region: "USA / macro globale tramite serie OECD",
    kind: ["macro"],
    keyRequired: true,
    cost: "free_api",
    status: "active",
    cadence: "Secondo serie e calendario di pubblicazione",
    notes: "La chiave API è gratuita; frequenze, revisioni e licenze delle serie sottostanti devono essere rispettate. Nessun feed intraday."
  },
  ecb: {
    name: "Banca Centrale Europea",
    region: "Eurozona",
    kind: ["macro", "fx"],
    keyRequired: false,
    cost: "free_public",
    status: "active",
    cadence: "Secondo pubblicazione statistica",
    notes: "Statistiche ufficiali via SDMX / Data Portal, senza chiave API nel client."
  },
  sec: {
    name: "SEC EDGAR",
    region: "USA",
    kind: ["filings", "fundamentals"],
    keyRequired: false,
    cost: "free_public",
    status: "adapter_only",
    cadence: "Durante la giornata, secondo filing",
    notes: "Adapter XBRL presente ma non collegato al flusso principale. Richiede integrazione robusta con User-Agent identificabile e gestione CORS/proxy prima dell'attivazione."
  },
  gemini: {
    name: "Google Gemini API",
    region: "AI interpretation",
    kind: ["narrative_interpretation"],
    keyRequired: true,
    cost: "free_tier_only",
    status: "active_optional",
    model: "gemini-3.5-flash-lite",
    searchGrounding: false,
    notes: "Modello bloccato sul piano gratuito e nessun Search grounding. Richiede un progetto Google AI Studio senza fatturazione collegata; soggetto a quote e disponibilità del piano."
  }
});

export function sourceInfo(id) { return SOURCE_REGISTRY[id] ?? null; }
