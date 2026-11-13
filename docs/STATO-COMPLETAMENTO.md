# Analizzatore Azionario 2.0 — stato di completamento

Aggiornato: 13 novembre 2026. Branch di lavoro: `feature/analizzatore-2-completion`.

## Funzioni integrate nel branch
- Analisi legacy di prezzo, indicatori tecnici, bilanci, multipli, analisti e calendario societario.
- Gate di affidabilità: sospende il giudizio quando prezzo/storico, bilanci, multipli comparabili o copertura dei fattori sono insufficienti; Gemini non viene chiamato in questo caso.
- Pannello Fair Value DCF a tre scenari: precompila FCF e debito netto dall'analisi corrente quando disponibili; richiede conferma/inserimento delle azioni diluite e delle ipotesi. Probabilità convenzionali 25/50/25, non calibrate.
- Quadro macro: 10 serie FRED e cambio EUR/USD giornaliero da ECB Data Portal; classificazione descrittiva risk-off/cauto/risk-on/mixed con controlli di freschezza e sufficienza.
- Portafoglio: registro acquisti/vendite, costo medio ponderato, P&L realizzato, commissioni, import/export CSV e backup/restore JSON.
- Calendario earnings/dividendi: eventi manuali non confermati nel workspace; calendario automatico disponibile nella schermata di analisi legacy tramite Yahoo.
- Backtest di ricerca SMA 20/50 su prezzi daily Alpha Vantage, esecuzione alla barra successiva, commissioni e slippage configurabili.
- Test unitari per gate, DCF, regime macro, portafoglio, indicatori, adapter e segnali; smoke test browser Playwright aggiunto alla CI.
- Workflow GitHub Actions per test/build web e APK Android debug.

## Fonti, costi e limiti
- SEC EDGAR/XBRL: adapter tecnico presente, ma non collegato alla schermata principale; l'accesso browser diretto richiede verifica CORS/User-Agent e un'integrazione robusta.
- ECB Data Portal: usato per la serie giornaliera USD per EUR.
- FRED: API gratuita con chiave personale; dieci serie macro. Frequenza e ritardi sono quelli ufficiali delle serie.
- Alpha Vantage: API key personale gratuita e quota giornaliera; prezzi daily, non realtime. Verificare la copertura del ticker e le condizioni del piano.
- Yahoo Finance: usato dall'analisi legacy per prezzi, fondamentali, multipli, news ed eventi. Endpoint non ufficiale, soggetto a modifiche/blocchi; non è un feed realtime né una fonte con licenza verificata per uso/distribuzione.
- Nessun provider a pagamento richiesto dal codice; alcune fonti richiedono registrazione e chiavi gratuite. La disponibilità gratuita può cambiare.
- Il portafoglio usa costo medio ponderato e non implementa lotti fiscali, FIFO/LIFO o fiscalità italiana.
- Il backtest non è point-in-time completo e non corregge survivorship bias; non include dividendi reinvestiti, split/corporate actions, FX, imposte, benchmark, costi di broker personalizzati o walk-forward.
- Il motore macro è una classificazione a regole, non un modello predittivo; non assegna probabilità di scenario e non include ancora spread BTP-Bund o HICP europeo.
- I pesi di scoring restano provvisori: non sono calibrati statisticamente e non dimostrano un rendimento atteso del 10% annuo.
- Nessun test su dispositivo Android fisico è eseguito da GitHub Actions. La build Android prodotta è un APK debug installabile per test, non una release firmata per Google Play.
- Le API key personali vengono inserite lato client: non incorporarle in bundle distribuiti a terzi e non condividere chiavi.

## Criteri prima della release finale
1. Tutti i workflow verdi sull'ultimo commit della PR.
2. Verifica manuale dei flussi su browser e su almeno un dispositivo Android reale.
3. Verifica delle fonti, copertura, freschezza, valute e unità su un paniere rappresentativo USA/Europa/Italia/Asia.
4. Integrazione ufficiale SEC e fonti regolamentari europee/asiatiche prima di definire la copertura fondamentale globale.
5. Backtest point-in-time e total-return prima di usare risultati per decisioni operative.
6. Firma APK release con keystore gestito dall'utente; non committare keystore o password nel repository.

Questa build è un incremento di sviluppo verificabile, non una certificazione di accuratezza dei dati o di idoneità a fornire consulenza finanziaria.
