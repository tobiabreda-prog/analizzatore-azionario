# Guida operativa — workspace 2.0

## Stato e avvertenze
Il workspace 2.0 è una versione sperimentale. La scheda Mercati interroga Alpha Vantage per prezzi giornalieri; la scheda Macro interroga cinque serie FRED. Non sono dati realtime e non coprono tutti gli strumenti o le borse. Gli eventi societari inseriti manualmente restano non confermati. I risultati non sono raccomandazioni d'investimento.

## Avvio web
1. Installare Node.js 22 LTS.
2. Clonare il repository e spostarsi nella cartella.
3. Eseguire \`npm install\`.
4. Eseguire \`npm test\` e poi \`npm run build\`.
5. Eseguire \`npm run dev\` per l'anteprima locale.

## Android
Il workflow GitHub Actions \`Android debug APK\` crea un progetto Capacitor Android temporaneo, compila un APK debug e lo pubblica come artifact se tutti gli step hanno esito positivo. L'APK debug è per installazione e test, non è una release firmata per Google Play. Per una release servono keystore, firma, versioning, test dispositivo e policy privacy.

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
3. Il pannello interroga FEDFUNDS, CPIAUCSL, DGS10, VIXCLS e DEXUSEU.
4. Le serie hanno periodicità e date di pubblicazione differenti. Non confrontare le osservazioni come se fossero simultanee.

La chiave non viene salvata nel workspace, ma viene trasmessa a FRED nell'URL HTTPS della richiesta. Verificare termini e diritti della singola serie, soprattutto per usi commerciali o redistribuzione.

## Registro portafoglio
- Inserimento manuale: ticker, lato BUY/SELL, quantità, prezzo, valuta, commissioni e data.
- Import CSV: il file deve contenere le colonne \`date;symbol;side;quantity;price;currency;fees\`. Sono accettati anche gli equivalenti italiani \`data;strumento;operazione;quantita;prezzo;valuta;commissioni\`.
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
- FRED: serie macroeconomiche USA; API key e termini della singola serie.
- Alpha Vantage: servizio prezzi e fondamentali con limiti diversi per endpoint e piano.

## Cosa non è ancora incluso
Feed globale completo e licenziato; prezzi realtime; copertura verificata di tutti i mercati; import automatico di earnings e dividendi; integrazione automatica di SEC/FRED/ECB in un report fondamentale; FX e corporate actions; backtest point-in-time completo; fiscalità italiana; autenticazione cloud e sincronizzazione multi-dispositivo; APK firmato per distribuzione.
