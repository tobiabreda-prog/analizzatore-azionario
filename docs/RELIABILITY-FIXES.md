# Correzioni di affidabilità — 14 novembre 2026

## Comportamento corretto

- **Multipli:** gate, punteggio di valutazione e dati inviati a Gemini condividono il filtro. Un multiplo deve essere supportato, positivo e finito, con data ISO reale entro 45 giorni e almeno un riferimento positivo e finito. Un P/S del 2020 non aumenta più il punteggio di un P/E aggiornato da 50 a 75. Con soli multipli vecchi il giudizio rimane sospeso.
- **Bilanci:** annuali e trimestri conservano `periodEnd`; ricavi, utile e altre voci vengono uniti per la data esatta. Due chiusure nello stesso anno restano distinte. Debito e patrimonio sono allineati al periodo dei ricavi più recenti. Le crescite annuali richiedono periodi consecutivi di 350–380 giorni, per includere esercizi di 52/53 settimane; il CAGR usa il tempo effettivamente trascorso. Grafici e report stampabile espongono la fine esercizio.
- **Commento Gemini:** la richiesta specifica uno schema e il client ricontrolla tipi, elenchi, riferimenti alle notizie e valori numerici prima di mostrare o salvare la risposta. Le proprietà non previste vengono eliminate. Un elenco malformato o un valore numerico assente dai dati produce un avviso; dati, punteggio e stampa rimangono disponibili.
- **Cache:** i commenti hanno versione 2 e vengono rivalidati anche in lettura, rispetto agli stessi fatti arrotondati inviati al modello. La chiave di confronto include punteggio, dati effettivamente utilizzabili e data. I bilanci salvati dal vecchio aggregatore vengono riscaricati: non sono più disponibili come ripiego offline. Watchlist, quotazioni e chiavi API restano conservate.
- **Installazioni:** `package-lock.json` e `npm ci` fissano le dipendenze. Entrambi i workflow APK eseguono i test unitari prima della build.

## Verifica

- `npm test`: 164 test unitari passati.
- `npm run build`: build di produzione riuscita; resta l'avviso Vite sul bundle principale oltre 500 kB.
- `npm run test:e2e`: suite watchlist e report, con Gemini simulato e senza credenziali reali. Include rifiuto di schema errato/numero inventato, migrazione della cache e rivalidazione di una cache corrotta.
- Installazione isolata con `npm ci --ignore-scripts --no-audit --no-fund` riuscita; nessun aggiornamento delle versioni già installate.

## Limiti

Il controllo dei numeri verifica la presenza dei valori nei fatti forniti, non la correttezza semantica dell'affermazione, dell'unità o del dato del provider. I nomi SMA50/SMA200, RSI(14) e l'orizzonte convenzionale 6–12 mesi non sono interpretati come affermazioni numeriche sui dati. La validazione non elimina tutte le possibili allucinazioni.

I pesi e le soglie del giudizio rimangono euristici e non calibrati. Questi controlli non validano l'accuratezza dei feed reali né il comportamento su un dispositivo Android fisico; servono collaudi separati.
