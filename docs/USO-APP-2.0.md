# Guida operativa — workspace 2.0

## Stato e avvertenze
Il workspace 2.0 è una versione sperimentale. La scheda Mercati interroga Alpha Vantage per prezzi giornalieri; la scheda Macro interroga cinque serie FRED. Non sono dati realtime e non coprono tutti gli strumenti o le borse. La scheda Earnings & Dividendi mostra anche la prossima data utili, stime EPS/ricavi, storico sorprese e metriche dividendo provenienti dal feed Yahoo Finance dell'analisi principale; sono dati non ufficiali da verificare. Gli eventi inseriti manualmente restano non confermati. I risultati non sono raccomandazioni d'investimento.

## Avvio web
1. Installare Node.js 22 LTS.
2. Clonare il repository e spostarsi nella cartella.
3. Eseguire `npm install`.
4. Eseguire `npm test` e poi `npm run build`.
5. Eseguire `npm run dev` per l'anteprima locale.

## Android
Il workflow GitHub Actions `Android debug APK` crea un progetto Capacitor Android temporaneo, compila un APK debug e lo pubblica come artifact se tutti gli step hanno esito positivo. L'APK debug è per installazione e test, non è una release firmata per Google Play. Per una release servono keystore, firma, versioning, test dispositivo e policy privacy.

## Prezzi giornalieri Alpha Vantage
1. Richiedere una chiave personale su https://www.alphavantage.co/support/#api-key.
2. Aprire il workspace 2.0 e la scheda Mercati.
3. Inserire ticker e chiave; premere Aggiorna storico.
4. Il pannello mostra fino alle ultime dieci osservazioni giornaliere restituite.
5. Il contatore locale limita le richieste gratuite a 25 al giorno per questo browser. Il contatore locale non è un limite condiviso fra dispositivi o browser.

La chiave resta nello stato temporaneo della schermata, ma la richiesta al provider la trasmette nell'URL HTTPS. Non è un segreto protetto contro ispezione del traffico locale. Non distribuire una chiave personale dentro un'app pubblica. Verificare piano, copertura, ritardo e diritti di utilizzo per il mercato scelto.

## Indicatori macro FRED
1. Richiedere una chiave personale su https://fred.stlouisfed.org/docs/api/api_key.html.
2. Aprire Macro, inserire la chiave e premere Aggiorna indicatori.
3. Con chiave FRED, il pannello interroga FEDFUNDS, CPIAUCSL, PCEPI, DGS10, DGS2, T10Y2Y, VIXCLS, BAMLH0A0HYM2, DCOILWTICO, GOLDAMGBD228NLBM, IRLTLT01ITM156N e IRLTLT01DEM156N. Il cambio e il tasso BCE vengono letti da ECB Data Portal senza chiave.
4. Le serie hanno periodicità e date di pubblicazione differenti. Non confrontare le osservazioni come se fossero simultanee.

La chiave non viene salvata nel workspace, ma viene trasmessa a FRED nell'URL HTTPS della richiesta. Se la chiave è vuota, il pannello può comunque aggiornare le due serie ECB. Verificare termini e diritti della singola serie, soprattutto per usi commerciali o redistribuzione.

## Fair Value DCF
1. Aprire la scheda Fair Value dopo aver analizzato un titolo.
2. Se disponibili, FCF dell'ultimo esercizio e debito netto vengono precompilati dall'analisi; verificarne periodo, valuta e unità (milioni).
3. Inserire le azioni diluite in milioni, WACC, crescita terminale e crescita FCF prevista.
4. Il modello genera scenari Bear/Base/Bull con probabilità convenzionali 25/50/25 e shock FCF/WACC/g espliciti. Non sono probabilità statistiche.
5. Il valore è valido solo se i dati di partenza e le ipotesi sono coerenti. Il DCF non è una raccomandazione e non garantisce il fair value.

## Backtest SMA 20/50
1. Nella scheda Mercati caricare lo storico daily del ticker con Alpha Vantage.
2. Aprire Backtest e lanciare la simulazione. Il segnale calcolato alla chiusura del giorno t viene eseguito alla chiusura del giorno successivo.
3. Capitale iniziale minimo 500; commissione fissa preimpostata 9,95 per lato (modificabile), commissione variabile e slippage modificabili. Il valore va adeguato al mercato e al proprio intermediario.
4. Sono mostrati rendimento totale, CAGR, drawdown massimo, volatilità, Sharpe e Sortino (risk-free rate posto a zero).
5. Non sono inclusi benchmark, dividendi, split, corporate actions, FX, fiscalità, titoli delistati o dati point-in-time. Non usare il backtest come previsione.

## Gate di qualità dell'analisi
Il giudizio viene sospeso se prezzo/storico, bilanci, multipli comparabili o fattori essenziali non superano le soglie minime. In quel caso Gemini non viene interrogato. Un punteggio non disponibile è mostrato come n.d., non come zero.

## Registro portafoglio
- Inserimento manuale: ticker, lato BUY/SELL, quantità, prezzo, valuta, commissioni e data.
- Import CSV: il file deve contenere le colonne `date;symbol;side;quantity;price;currency;fees`. Sono accettati anche gli equivalenti italiani `data;strumento;operazione;quantita;prezzo;valuta;commissioni`.
- Lati accettati: BUY/Acquisto/Compra e SELL/Vendita/Vendi.
- Formati data accettati: YYYY-MM-DD e DD/MM/YYYY.
- Numeri decimali con virgola sono supportati nel CSV con separatore punto e virgola.
- L'importazione aggiunge le righe ai movimenti esistenti: controllare duplicati prima di importare.
- Esportare periodicamente sia il CSV dei movimenti sia il backup JSON completo.

Il P&L realizzato usa il costo medio ponderato, non il metodo fiscale FIFO e non calcola imposte. Il valore di mercato non viene stimato senza un prezzo verificato con valuta coerente.

## Backup
- Esporta backup crea un JSON con movimenti ed eventi.
- Importa backup sostituisce il contenuto corrente del workspace dopo i controlli di formato.
- Conservare il backup in un luogo sicuro; i dati locali possono essere cancellati rimuovendo dati del browser o dell'app.

## Fonti e limiti architetturali
- SEC EDGAR: filing e dati XBRL, non quotazioni. Per chiamate server-side occorre identificare correttamente l'applicazione nel User-Agent e rispettare le regole SEC. Il browser non può impostare liberamente l'header User-Agent richiesto: usare un proxy server controllato per integrare questo adapter in produzione.
- ECB Data Portal: serie statistiche ufficiali tramite SDMX/CSV.
- FRED: serie macro USA e serie OECD di rendimenti governativi; API key e diritti della singola serie. La serie Italia-Germania è mensile e non equivale allo spread BTP-Bund di mercato.
- Alpha Vantage: servizio prezzi e fondamentali con limiti diversi per endpoint e piano.

## Cosa non è ancora incluso
Feed globale completo e licenziato; prezzi realtime; copertura verificata di tutti i mercati; earnings/dividendi ufficiali multi-mercato; SEC XBRL collegato alla UI; HICP europeo e spread BTP-Bund giornaliero; FX e corporate actions; backtest point-in-time completo; fiscalità italiana; autenticazione cloud e sincronizzazione multi-dispositivo; test su dispositivo reale; APK firmato per distribuzione.
