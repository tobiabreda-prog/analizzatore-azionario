# Analizzatore Azionario 2.0 — architettura e criteri

## Stato
Questa versione integra la console legacy con i moduli quantitativi, il workspace, i controlli di qualità e l'interfaccia responsive. L'integrazione resta incrementale: ogni provider deve rispettare contratti, quote e controlli di freschezza.

## Principi non negoziabili
- Nessun numero inventato e nessun dato mancante convertito in zero.
- Ogni dato finanziario deve conservare fonte, data di osservazione, valuta, unità e identificativo dello strumento.
- Prezzo, fondamentale e macro hanno soglie di freschezza differenti.
- Una fonte gratuita non equivale automaticamente a una fonte autorizzata per redistribuzione o a un feed realtime.
- L'assenza di consenso EPS/ricavi deve essere mostrata come "non disponibile", non stimata dall'AI.
- Gemini è un livello interpretativo opzionale: non è il sistema contabile né il motore matematico.
- I punteggi devono indicare copertura dei fattori e metodologia specifica per settore; mai equiparare dati mancanti a un voto negativo.
- Le analisi devono distinguere orizzonte breve, medio e lungo.

## Architettura target
1. Presentation: React, responsive mobile-first, web e Capacitor Android.
2. Application: casi d'uso per ricerca titolo, analisi, portafoglio, eventi e report.
3. Data adapters: Yahoo Finance non ufficiale per copertura multi-mercato; Alpha Vantage free-tier per storico daily/backtest; ECB SDMX e FRED per macro; SEC EDGAR adapter disponibile ma non attivato nella UI; dati manuali.
4. Quality layer: validazione schema, freschezza, coerenza, copertura e provenienza.
5. Quant engine: indicatori tecnici, fondamentali, DCF, comparables, rischio e backtest.
6. AI layer: Gemini interpreta esclusivamente output strutturati e verificati.
7. Storage: IndexedDB sul web e storage locale tramite adapter Capacitor su Android.

## Fonti e limiti
- Yahoo Finance: accesso senza chiave e senza costo API, ma endpoint non ufficiali, senza SLA e con termini/diritti d'uso da verificare. Usato come provider indicativo principale per la copertura globale; non dichiarare realtime.
- Alpha Vantage: piano gratuito con quota pubblicata di 25 richieste al giorno; l'app applica cache giornaliera e contatore condiviso localmente tra backtest e fallback analisti. Dati daily; realtime e 15 minuti USA sono premium e non sono chiamati.
- FRED: chiave API gratuita; dodici serie macro con frequenze e revisioni proprie. Nessuna funzione a pagamento viene chiamata.
- ECB Data Portal: statistiche ufficiali pubbliche via SDMX, senza chiave.
- SEC EDGAR: adapter XBRL gratuito presente ma non collegato alla schermata principale; richiede gestione CORS/User-Agent prima dell'attivazione.
- Gemini: solo gemini-3.5-flash-lite, nessun modello selezionabile e nessun Search grounding. Richiede progetto Google AI Studio senza fatturazione collegata e resta soggetto alle quote gratuite.
- Finnhub è stato rimosso dal flusso applicativo: il target price non è affidabilmente disponibile nel piano gratuito e non giustifica una chiave aggiuntiva.

## Motore quantitativo
- CAGR richiede valori positivi e durata valida.
- DCF richiede flussi, WACC, crescita terminale e azioni diluite coerenti; WACC deve superare la crescita terminale.
- Il bridge EV/equity esplicita cassa, debito, minoranze e preferred.
- Ogni metrica deve avere unità, periodo fiscale, valuta e fonte.
- Banche/assicurazioni richiedono metriche settoriali dedicate; EV/EBITDA e FCF industriale non vanno applicati indiscriminatamente.
- Scenari Bear/Base/Bull e probabilità sono ipotesi esplicite, non previsioni statisticamente calibrate finché non validate con backtest out-of-sample.

## Moduli successivi
1. Contratti comuni e normalizzazione degli strumenti globali.
2. Adapter prezzi con provider e licenze verificate; calendario mercati e valute.
3. XBRL mapper SEC e fonti ufficiali per UE/Italia/Asia.
4. Fundamental engine settoriale e corporate actions.
5. Earnings/Dividend Intelligence con data evento e fonte.
6. Macro engine con revisioni e vintage point-in-time.
7. Portfolio, rischio, costi configurabili e fiscalità italiana parametrica.
8. Backtest senza look-ahead/survivorship bias, benchmark, costi e slippage.
9. Gemini schema-validated, cache e controllo allucinazioni.
10. UI mobile, accessibilità, offline e release Android.

## Criteri di accettazione
- Build e test automatici verdi su CI.
- Ogni numero esposto ha fonte e data; dati stantii bloccano i segnali dipendenti.
- Calcoli replicabili con unit test e casi limite.
- Backtest con dati point-in-time e corporate actions.
- Nessuna chiave API condivisa nel bundle.
- Nessuna promessa di realtime o copertura universale senza licenza e verifica.
