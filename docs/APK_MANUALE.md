# APK Android: solo quando decidi che le modifiche sono concluse

## Comportamento GitHub Actions

- **Quality checks** continua automaticamente sui pull request e sui push previsti dal workflow: test unitari, build web e test browser. Non produce APK.
- **Safe auto-merge** può integrare in `main` le sole PR ammissibili dopo test riusciti. Non avvia più Android.
- **Android debug APK** viene eseguito esclusivamente con il pulsante manuale **Run workflow**, sul branch `main`. Non parte al push e non parte al merge.
- **Build APK** (workflow precedente, `.github/workflows/main.yml`) resta anch'esso manuale: per evitare confusione, usa normalmente **Android debug APK** e non avviare entrambi.

## Quando hai terminato tutte le modifiche

1. Assicurati che tutte le Pull Request desiderate siano integrate in `main` e che gli ultimi **Quality checks** siano verdi.
2. Apri **GitHub → repository analizzatore-azionario → Actions → Android debug APK**.
3. Premi **Run workflow**, seleziona il branch **main**, poi conferma **Run workflow**.
4. A compilazione conclusa, apri l'esecuzione e scarica l'artifact **analizzatore-azionario-debug-apk**. Estrai lo ZIP per trovare `app-debug.apk`.
5. Prima di installare, verifica la firma Android. Le versioni debug realizzate dai workflow attuali possono usare chiavi differenti fra build: per aggiornare senza disinstallare è necessario il keystore stabile previsto dalla PR #34 e dalla guida `docs/ANDROID_SIGNING_MIGRATION.md`.
6. Conserva backup delle impostazioni, watchlist e dati prima di eventuali disinstallazioni.

Le Pull Request che modificano i workflow `.github` richiedono revisione e **merge manuale**: la regola di safe auto-merge le esclude intenzionalmente.

Questa modifica riduce le compilazioni Android inutili; **non dimostra né risolve automaticamente** la causa di eventuali errori del lavoro remoto ChatGPT Cloud.
