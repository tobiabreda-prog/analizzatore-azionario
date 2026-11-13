# Analizzatore Azionario 2.0 — architettura e criteri

## Stato
Questa è la fondazione incrementale della versione 2.0. L'app legacy resta inalterata. I nuovi moduli sono isolati e non vengono ancora collegati alla UI principale: l'integrazione avverrà solo dopo test e validazione dei contratti dati.

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
3. Data adapters: SEC EDGAR, ECB SDMX, FRED, provider di prezzo selezionabili e dati manuali.
4. Quality layer: validazione schema, freschezza, coerenza, copertura e provenienza.
5. Quant engine: indicatori tecnici, fondamentali, DCF, comparables, rischio e backtest.
6. AI layer: Gemini interpreta esclusivamente output strutturati e verificati.
7. Storage: IndexedDB sul web e storage locale tramite adapter Capacitor su Android.

## Fonti e limiti
- SEC EDGAR: fonte primaria per filing e dati XBRL USA, non per quotazioni. Rispettare User-Agent identificabile e rate limit SEC; accesso automatizzato e CORS vanno verificati nell'ambiente reale.
- ECB Data Portal: statistiche ufficiali via SDMX; usare codici dataset/serie validati.
- FRED: API con chiave; verificare licenza e attribuzione della singola serie sottostante prima di esporre o ridistribuire dati.
- Alpha Vantage: fallback condizionato da quota gratuita, endpoint e termini correnti; non assumere realtime né copertura fondamentale gratuita.
- Yahoo Finance: endpoint non ufficiali rimossi dal ruolo di fonte primaria. Eventuale uso futuro solo dopo verifica dei termini e di un accesso autorizzato.

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
