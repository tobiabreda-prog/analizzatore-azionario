# Portafoglio da Investing.com

## Importazione

1. Esporta il portafoglio da Investing.com in CSV UTF-8.
2. Nell'app apri **Portafoglio**, quindi **Seleziona CSV Investing.com**.
3. Controlla l'anteprima e gli avvisi di riconciliazione.
4. Premi **Conferma importazione**. Se un portafoglio è già salvato, il pulsante diventa **Conferma sostituzione**; **Annulla importazione** conserva la fotografia precedente.

Il file è elaborato e conservato sul dispositivo, senza richieste a Investing.com o invio del portafoglio a Gemini. Il limite del file è 5 MB; lo spazio di salvataggio disponibile dipende dal browser o dal dispositivo. Un errore di lettura o salvataggio conserva il portafoglio precedentemente importato.

## Dati disponibili

- **Riepilogo:** posizioni aggregate, quantità, prezzo medio, prezzo del CSV, valore di mercato, peso, P/L riportato e controlli con i lotti aperti.
- **Lotti aperti:** date di apertura, quantità, prezzi, commissioni e P/L di ciascun lotto.
- **Posizioni chiuse:** righe storiche con date di apertura e chiusura, prezzi e P/L riportati. Le commissioni assenti restano `n.d.`.
- **Dati originali:** tutte le colonne di ogni sezione, comprese intestazioni ripetute, indicatori, dati societari e colonne non riconosciute. Il numero della colonna distingue intestazioni uguali.
- **Esporta CSV originale:** restituisce il testo originale completo, inclusi BOM UTF-8, righe duplicate e terminatori di riga.

Ogni riga dispone inoltre del dettaglio **Tutte le colonne**. Il parser conserva sia i testi originali sia le interpretazioni dei campi conosciuti: quantità a punto decimale, numeri italiani, importi, percentuali, date e grandezze K/M/B/T. Un orario/data parziale come `13/11` resta parziale: non viene inventato l'anno.

## Calcoli e riconciliazione

Il riepilogo e i lotti rappresentano le stesse posizioni: non vengono sommati due volte. Il modello confronta quantità, valori, prezzi medi e commissioni disponibili, segnalando differenze o dati incompleti. Una riga chiusa identica a un'altra viene conservata e segnalata, perché potrebbe essere un lotto distinto.

La reimportazione sostituisce la fotografia precedente, senza accodare nuovamente i lotti. Il CSV non viene trasformato in un registro completo di compravendite: una fotografia di posizioni non documenta necessariamente tutti i movimenti storici, dividendi, cedole, imposte o cambi applicati.

I valori nella valuta del titolo restano separati per valuta. Il costo è ricalcolato dai lotti e dalle commissioni esplicite nella stessa valuta; il P/L sui prezzi e commissioni non è un risultato fiscale. Se quantità e prezzo non riconciliano le unità dello strumento o i dati sono insufficienti, i calcoli interessati rimangono non disponibili.

Il P/L riportato nel CSV conserva la propria valuta, che può differire dalla valuta dei prezzi. Non si ricostruisce un cambio storico dividendo importi arrotondati e non si sommano EUR e USD. La valuta dei prezzi viene presa dalla colonna esplicita, dalla borsa riconosciuta o da un indizio dichiarato; commissioni o P/L in valuta del conto non cambiano implicitamente la valuta del titolo.

Prezzi, pesi e P/L mostrati sono quelli dell'esportazione; la data di importazione indica quando il file è stato caricato. Per gli strumenti collegabili, **Apri analisi** avvia la normale ricerca del ticker nell'app. I codici originali rimangono conservati e la classificazione dello strumento non viene inventata.

## Verifica

I test automatici usano esclusivamente dati sintetici e verificano parsing, valute, dati mancanti, riconciliazione, persistenza, sostituzione, annullamento e download senza perdita di dati. L'allegato fornito dall'utente viene usato soltanto per una verifica privata; non è incluso nel codice, nelle fixture o nella documentazione pubblicata.
