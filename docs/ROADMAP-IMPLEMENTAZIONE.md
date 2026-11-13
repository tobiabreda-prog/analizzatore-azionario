# Roadmap di implementazione — Analizzatore Azionario 2.0

## Fondazione già inserita
- Contratti dati, controlli qualità, formule finanziarie, primi adapter SEC/FRED/ECB, profili settoriali provvisori, test e CI.
- PR in bozza: feature/analizzatore-2-foundation.

## Motori aggiunti in questo incremento
- Earnings e dividendi: normalizzazione eventi, sorpresa EPS, yield e payout; ogni record richiede fonte e data. Nessun endpoint viene spacciato per consensus disponibile.
- Indicatori tecnici e rischio: SMA, EMA, RSI, volatilità, drawdown, Sharpe e Sortino.
- Portafoglio: registro movimenti, costo medio, commissioni, P&L realizzato e valorizzazione solo se valuta coerente.
- Backtest: long-only essenziale, segnale applicato alla barra successiva, costi e slippage configurabili; esplicite le limitazioni.
- Gemini: interpretazione JSON dei fatti forniti, schema controllato e blocco di affermazioni numeriche non supportate.

## Integrazioni ancora necessarie prima di uso reale
1. UI: schermate dedicate e flussi utente, non ancora collegate al frontend legacy.
2. Prezzi: provider legalmente autorizzati e compatibili con uso personale e redistribuzione; copertura separata per USA, Italia, Europa e Asia.
3. Fondamentali internazionali: mapping XBRL per issuer/regolatori; SEC copre società USA registranti, non il mercato globale.
4. Earnings/dividendi: adapter per filing societari e calendari ufficiali; consenso EPS/ricavi soltanto se licenza e fonte confermate.
5. Corporate actions: split, spin-off, dividendi, ADR, valute e total-return.
6. Backtest: point-in-time data, delisting/survivorship, benchmark, dividendi reinvestiti, costi, FX e walk-forward.
7. Portafoglio: import CSV, lotti fiscali, cambio storico, imposte e commissioni configurabili; non è consulenza fiscale.
8. Gemini: chiave personale conservata in storage sicuro su device; un'app distribuita a terzi necessita backend/proxy e gestione segreti. La chiave non va incorporata nel bundle.
9. Android: integrazione Capacitor, storage, rete, offline, test su dispositivi reali e firma APK.
10. Validazione: test unitari, integrazione, E2E, build e verifica dei dati su almeno 20 titoli di mercati e settori differenti.

## Regola di rilascio
Non unire alla main e non etichettare come release finché CI non è verde, le fonti non sono contrattualmente/tecnicamente verificate e le schermate non sono testate. I pesi di scoring sono provvisori finché non sono calibrati e validati out-of-sample.
