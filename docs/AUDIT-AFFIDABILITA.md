# Audit affidabilità e qualità dei dati

Data intervento: 13 novembre 2026
Branch: `feature/reliability-audit`

## Obiettivo

Ridurre i falsi segnali e rendere espliciti i casi in cui i dati non sono sufficienti. L'intervento non aggiunge strategie o indicatori: rafforza i controlli già presenti.

## Correzioni applicate

- **Prezzo e data coerenti:** il prezzo principale dell'analisi usa l'ultima chiusura giornaliera restituita da Yahoo Finance, allineata alla data `asOf`. Non mescola più il prezzo intraday `regularMarketPrice` con una data riferita all'ultima barra storica.
- **Valori mancanti:** utile netto, EBIT, EPS, high/low e volume mancanti restano `null`. Non vengono convertiti implicitamente in margini, crescite, supporti/resistenze o volumi pari a zero. Anche le tabelle annuali usano la stessa regola.
- **Gate di affidabilità:** verifica date ISO reali, ordinamento e coerenza dello storico, almeno 40 osservazioni settimanali, tre esercizi distinti con ricavi positivi e utile netto disponibile, data/fonte dell'ultimo bilancio, data dei multipli e punteggi nell'intervallo 0–100.
- **Copertura dei fattori:** distingue i fattori essenziali mancanti dai fattori facoltativi e conta soltanto punteggi numerici validi.
- **Segnali SMA:** rifiuta barre con date impossibili, duplicate o non strettamente cronologiche. Evita di calcolare medie su una sequenza temporalmente disordinata.
- **Backtest:** i test verificano che un segnale calcolato alla chiusura venga eseguito sulla barra successiva, oltre ai controlli sulle date e sui segnali fuori intervallo.

## Regole del gate attuale

| Controllo | Requisito |
|---|---|
| Prezzo | Numero finito e positivo, valuta e fonte presenti |
| Freschezza prezzo | Data valida, non futura oltre un giorno e non più vecchia di 5 giorni |
| Storico | Almeno 40 osservazioni settimanali, prezzi positivi e date strettamente crescenti |
| Bilanci | Almeno 3 esercizi distinti con ricavi positivi e utile netto numerico |
| Ultimo bilancio | Fonte/data presenti, non futuro e non più vecchio di 560 giorni; flag `isLatest` non falso |
| Multipli | Fonte/data aggiornate; almeno un multiplo positivo confrontabile con settore o storico a 5 anni, osservato entro 45 giorni |
| Punteggi | Fattori essenziali disponibili; ogni punteggio numerico deve essere compreso tra 0 e 100; almeno 4 fattori validi su 6 |

Le soglie sono filtri prudenziali operativi, non standard universali né garanzia di correttezza della fonte. Titoli con reporting particolare, bilanci incompleti o metriche settoriali non comparabili possono restare correttamente sospesi.

## Limiti che restano espliciti

1. Yahoo Finance è un endpoint non ufficiale, senza SLA e senza garanzia di disponibilità o licenza API per redistribuzione. Il prezzo utilizzato è una chiusura daily, non una quotazione real-time garantita.
2. Le fonti gratuite possono cambiare schema, copertura, ritardi e condizioni. Il gate verifica coerenza e freschezza dichiarata, non certifica l'autenticità indipendente dei dati del provider.
3. Il backtest SMA resta una simulazione semplificata. Non è ancora point-in-time completo e non corregge survivorship bias; non integra total return, dividendi, split e tutte le corporate actions, FX, imposte o netting fiscale.
4. La Tobin Tax nel backtest resta una stima semplificata per singolo acquisto; non sostituisce il calcolo dell'intermediario sul saldo netto giornaliero e sulle esenzioni applicabili.
5. Il modello DCF dipende da ipotesi manuali su FCF, WACC, crescita terminale e azioni diluite. Le probabilità Bear/Base/Bull sono convenzionali e non calibrate statisticamente.
6. Le chiavi API inserite nel client restano nella memoria locale del browser/dispositivo: non sono un secret vault e non vanno condivise né incorporate in una distribuzione pubblica multiutente.
7. I test automatici non sostituiscono la verifica manuale dei dati su un paniere USA/Italia/Europa/Asia né il collaudo su un dispositivo Android fisico.

## Criterio di accettazione dell'intervento

- Test unitari completi verdi.
- Build web di produzione verde.
- Smoke test browser Playwright verde.
- APK Android debug generato correttamente.
- Revisione del diff e mantenimento dei limiti sopra elencati nella documentazione utente.

Un workflow verde dimostra che i controlli automatizzati sono passati sul commit verificato; non certifica la qualità di ogni dato finanziario né rende il software un servizio di consulenza finanziaria.
