# Validazione e limiti dei test

## CI
Il workflow `.github/workflows/quality.yml` installa le dipendenze, esegue Vitest e crea la build Vite di produzione. Verificare sempre l'esecuzione associata all'ultimo commit del branch prima del merge: un run verde su un commit precedente non certifica le modifiche successive.

## Copertura test attuale
- CAGR, bridge EV/equity e DCF con controlli dei parametri.
- Gestione dati mancanti, freschezza e provenienza.
- Normalizzazione degli eventi utili/dividendi e metriche di payout.
- Portafoglio: costo medio, P&L realizzato e mismatch valuta.
- Backtest essenziale e metriche di rischio.
- Mapping SEC CompanyFacts di base.

## Non coperto
- Test end-to-end browser e Android real device.
- Chiamate reali ai provider, CORS, rate limits, outage e licenze.
- Bilanci completi, riconciliazione XBRL multi-tag, periodi trimestrali vs annuali.
- Dati point-in-time e bias nei backtest.
- Calcolo fiscale italiano e conversioni FX storiche.
- Validazione statistica dei pesi di scoring e dei segnali.

## Regola
Un test verde indica che i casi automatizzati passano; non prova accuratezza economica dei dati, licenza dei feed, robustezza statistica o idoneità per decisioni di investimento.
