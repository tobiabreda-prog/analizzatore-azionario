# Validazione e limiti dei test

## CI
Il workflow `.github/workflows/quality.yml` installa le dipendenze, esegue Vitest, crea la build Vite di produzione, installa Chromium ed esegue uno smoke test Playwright del workspace (navigazione, calcolo DCF, blocco backtest senza storico e accesso al pannello macro). Verificare sempre l'esecuzione associata all'ultimo commit del branch prima del merge: un run verde su un commit precedente non certifica le modifiche successive.

## Copertura test attuale
- CAGR, bridge EV/equity e DCF con controlli dei parametri.
- Gestione dati mancanti, freschezza e provenienza.
- Normalizzazione degli eventi utili/dividendi e metriche di payout.
- Portafoglio: costo medio, P&L realizzato e mismatch valuta.
- Backtest essenziale e metriche di rischio.
- Mapping SEC CompanyFacts di base.

## Non coperto
- Copertura end-to-end browser completa: al momento è presente solo uno smoke test del flusso principale.
- Test su dispositivo Android reale e verifica della firma release.
- Chiamate reali ai provider, CORS, rate limits, outage e licenze.
- Bilanci completi, riconciliazione XBRL multi-tag, periodi trimestrali vs annuali.
- Dati point-in-time e bias nei backtest.
- Calcolo fiscale italiano e conversioni FX storiche.
- Validazione statistica dei pesi di scoring e dei segnali.

## Regola
Un test verde indica che i casi automatizzati passano; non prova accuratezza economica dei dati, licenza dei feed, robustezza statistica o idoneità per decisioni di investimento.
