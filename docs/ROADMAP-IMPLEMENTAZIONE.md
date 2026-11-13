# Roadmap — Analizzatore Azionario 2.0

## Funzioni già integrate nel branch
- Analisi titolo: prezzi/storico, indicatori tecnici, bilanci, multipli, peer, analisti, notizie, earnings/dividendi e punteggio con gate di qualità.
- AI interpretativa: Gemini `gemini-3.5-flash-lite` bloccato, output JSON e nessun Search grounding; l'AI non calcola metriche né decide i segnali quantitativi.
- Workspace responsive: portafoglio, mercati, macro, calendario, qualità dati, Fair Value e backtest.
- Fair Value DCF a tre scenari; le probabilità convenzionali non sono stime statistiche.
- Portafoglio con movimenti, costo medio, P&L realizzato, commissioni, CSV e backup JSON.
- Backtest SMA 20/50 con commissioni Fineco preimpostate (12,95 USD USA / 19,00 EUR Italia), minimo investimento 5.000 EUR/USD, slippage e Tobin Tax opzionale.
- Icona salvadanaio integrata in favicon, homepage e launcher Android legacy/adaptive.
- Test unitari, build web, smoke test Playwright e build APK Android su GitHub Actions.

## Regola vincolante sui costi
- Nessun endpoint premium e nessun provider a pagamento.
- Yahoo Finance: accesso senza chiave e senza costo API, ma endpoint non ufficiali e senza SLA; non è un feed realtime garantito.
- Alpha Vantage: solo piano gratuito (25 richieste/giorno); cache e contatore locale condiviso tra storico daily e fallback analisti. Nessun endpoint realtime/premium.
- FRED: chiave API gratuita; ECB Data Portal: pubblico, senza chiave.
- Gemini: solo `gemini-3.5-flash-lite` nel free tier, senza Search grounding. Per evitare addebiti, la chiave deve appartenere a un progetto Google AI Studio senza fatturazione collegata. Esaurita la quota, l'app non passa a un piano a pagamento.
- SEC EDGAR: adapter gratuito presente ma non attivato nella UI finché non sono risolti CORS e User-Agent.
- Finnhub rimosso dal flusso operativo.

## Attività ancora necessarie prima di una release definitiva
1. Validare i workflow CI sul commit finale, inclusi test E2E e build APK con icona adaptive.
2. Provare l'app su un dispositivo Android reale e su un browser mobile.
3. Verificare fonti, copertura, data effettiva, valuta e freschezza su un paniere USA/Italia/Europa/Asia.
4. Integrare SEC XBRL e fonti regolamentari UE/Asia con accesso autorizzato e robusto.
5. Integrare corporate actions, total-return e dati point-in-time prima di considerare il backtest uno strumento decisionale.
6. Completare FX, fiscalità italiana, lotti fiscali e sincronizzazione multi-dispositivo.
7. Proteggere le chiavi API: attualmente le chiavi Gemini/Alpha Vantage sono lato client e non devono essere inserite in una distribuzione pubblica multiutente.
8. Firmare APK release con keystore gestito dall'utente; non committare keystore o password nel repository.

## Criterio di rilascio
Non etichettare come release finché i workflow non sono verdi, le fonti non sono verificate e i flussi non sono testati su dispositivi reali. I pesi di scoring restano provvisori finché non sono calibrati e validati out-of-sample.
