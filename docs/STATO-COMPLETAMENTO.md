# Analizzatore Azionario 2.0 — stato di completamento

Aggiornato: 13 novembre 2026. Branch di lavoro: `feature/zero-cost-premium-dashboard`.

## Funzioni integrate nel branch
- Analisi legacy di prezzo, indicatori tecnici, bilanci, multipli, analisti e calendario societario.
- Gate di affidabilità: sospende il giudizio quando prezzo/storico, bilanci, multipli comparabili o copertura dei fattori sono insufficienti; Gemini non viene chiamato in questo caso.
- Pannello Fair Value DCF a tre scenari: precompila FCF e debito netto dall'analisi corrente quando disponibili; richiede conferma/inserimento delle azioni diluite e delle ipotesi. Probabilità convenzionali 25/50/25, non calibrate.
- Quadro macro: 12 serie FRED e due serie ECB (cambio USD/EUR giornaliero e tasso depositi BCE); spread 10Y Italia-Germania mensile come proxy OECD/FRED quando le date coincidono; classificazione descrittiva del rischio USA con controlli di freschezza e sufficienza.
- Portafoglio: registro acquisti/vendite, costo medio ponderato, P&L realizzato, commissioni, import/export CSV e backup/restore JSON.
- Earnings & Dividend Intelligence: prossimo earnings date, stime EPS/ricavi, storico sorprese, dividend yield, payout ed ex-date sono mostrati nel workspace quando disponibili dall'analisi principale Yahoo; feed non ufficiale e da verificare. Eventi manuali restano non confermati.
- Backtest di ricerca SMA 20/50 su prezzi daily Alpha Vantage, esecuzione alla barra successiva, commissione fissa Fineco preimpostata a 12,95 USD per eseguito USA o 19,00 EUR per eseguito Italia (modificabile), commissioni variabili e slippage configurabili; Tobin Tax separata e opzionale solo per il mercato italiano; output con CAGR, drawdown, volatilità, Sharpe e Sortino.
- Test unitari per gate, DCF, regime macro, portafoglio, indicatori, adapter e segnali; smoke test browser Playwright aggiunto alla CI.
- Workflow GitHub Actions per test/build web e APK Android debug.

## Fonti, costi e limiti
- SEC EDGAR/XBRL: adapter tecnico presente, ma non collegato alla schermata principale; l'accesso browser diretto richiede verifica CORS/User-Agent e un'integrazione robusta.
- ECB Data Portal: usato per la serie giornaliera USD per EUR e per il tasso sui depositi BCE; chiavi SDMX verificate sulla documentazione ufficiale.
- FRED: API gratuita con chiave personale; dodici serie macro, incluse le serie OECD sui rendimenti governativi decennali di Italia e Germania. Frequenza e ritardi sono quelli ufficiali delle serie.
- Alpha Vantage: API key personale gratuita e quota giornaliera; prezzi daily, non realtime. Il backtest usa il profilo commissionale Fineco per operatività non frequente indicato dall'utente: 12,95 USD per eseguito USA o 19,00 EUR per eseguito Italia, con personalizzazione. Il capitale iniziale e il controvalore minimo per nuovo acquisto sono 5.000 EUR/USD; il capitale deve coprire anche le commissioni. Verificare la copertura del ticker e le condizioni del piano.
- Yahoo Finance: usato per prezzi, fondamentali, multipli, news ed eventi. Endpoint non ufficiale, soggetto a modifiche/blocchi; non è un feed realtime né una fonte con licenza API verificata per uso/distribuzione.
- Politica no-cost: nessun endpoint premium, nessun piano API a pagamento, nessun modello AI selezionabile e nessun Search grounding. Gemini è bloccato su `gemini-3.5-flash-lite` (free tier); l'utente deve usare un progetto AI Studio senza fatturazione collegata per impedire addebiti anche dopo il superamento delle quote gratuite.
- Finnhub rimosso: non era necessario per il flusso e alcuni endpoint target-price non sono affidabili nel piano gratuito.
- Alpha Vantage: 25 richieste/giorno pubblicate; contatore locale condiviso tra storico daily/backtest e fallback OVERVIEW, cache per simbolo/giorno per evitare chiamate duplicate. La quota effettiva resta condivisa a livello chiave tra dispositivi e altri utilizzi esterni.
- Nessun provider a pagamento richiesto dal codice; alcune fonti richiedono registrazione e chiavi gratuite. La disponibilità gratuita e i limiti possono cambiare.
- Il portafoglio usa costo medio ponderato, registra commissioni e imposte separatamente e richiede almeno 5.000 EUR/USD per i nuovi acquisti inseriti manualmente. Non implementa lotti fiscali, FIFO/LIFO o fiscalità italiana.
- Tobin Tax: selezione manuale opzionale nel backtest (20 bps mercato regolamentato/MTF; 40 bps fuori mercato dal 1° gennaio 2026). In via generale riguarda gli acquisti di azioni emesse da società residenti in Italia; per le società quotate è rilevante la capitalizzazione media di novembre dell'anno precedente (soglia 500 milioni EUR), oltre alle ulteriori regole per società non quotate, strumenti ed esenzioni. ETF/ETC e obbligazioni non sono soggetti alla Tobin Tax azionaria. L'imposta si calcola sul saldo netto giornaliero per singolo strumento: il backtest la applica al singolo acquisto come stima semplificata, senza netting né verifica automatica dell'emittente. Nel registro portafoglio va inserito l'importo effettivamente addebitato da Fineco. Fonti: legge 30 dicembre 2025 n. 199, art. 1 commi 29-31 (Gazzetta Ufficiale); pagina informativa Fineco Tobin Tax.
- Il backtest non è point-in-time completo e non corregge survivorship bias; non include dividendi reinvestiti, split/corporate actions, FX, imposte, benchmark, costi di broker personalizzati o walk-forward.
- Il motore macro è una classificazione a regole, non un modello predittivo; non assegna probabilità di scenario. Lo spread Italia-Germania è una proxy mensile OECD, non lo spread BTP-Bund intraday; l'inflazione HICP europea non è ancora inclusa.
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

L'interfaccia principale è stata ridisegnata con layout responsive, ricerca rapida, branding salvadanaio e workspace coordinato. Questa build resta un incremento di sviluppo verificabile, non una certificazione di accuratezza dei dati o di idoneità a fornire consulenza finanziaria.
