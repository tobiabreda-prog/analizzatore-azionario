# Migrazione Android: firma permanente e dati API

## Perché serve una migrazione
Le APK precedenti sono state firmate con debug.keystore generate su runner GitHub temporanei. La cache precedente non ha conservato la chiave privata. Una nuova firma **non può aggiornare in-place** la vecchia app. La migrazione richiede una sola nuova installazione, dopo aver salvato le informazioni presenti nell'app attuale.

## 1. Prima di tutto, salva i dati dall'app attuale
- NON disinstallare l'app prima di aver salvato i dati.
- Apri la schermata Impostazioni API e conserva le chiavi Gemini, Alpha Vantage e FRED in un password manager. Se la UI maschera le chiavi e non ne consente la lettura, recuperale dai rispettivi portali provider o rigenerale, revocando le precedenti quando opportuno. Non incollarle in issue, commit o log.
- Nella **Watchlist**, usa **Esporta CSV** per salvarne i ticker; eventuali dati di portafoglio provenienti da versioni precedenti richiedono un backup esterno separato, perché la UI corrente non dispone più della scheda Portafoglio. Conserva i file in un luogo privato. Verifica che il file sia realmente accessibile dal telefono.
- Una nuova installazione può perdere dati locali: non affidarti a Android Backup come unica copia.

## 2. Genera UNA SOLA VOLTA la nuova chiave su Windows
Richiede Java JDK con `keytool` disponibile nel PATH. Apri PowerShell sul tuo PC ed esegui:

```powershell
$folder = Join-Path $HOME "AndroidSigningBackup"
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$key = Join-Path $folder "debug.keystore"
if (Test-Path $key) { throw "Il keystore esiste già. NON sovrascriverlo." }
keytool -genkeypair -v -keystore "$key" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Android Debug,O=Analizzatore Azionario,C=IT"
if ($LASTEXITCODE -ne 0) { throw "Creazione keystore fallita" }
[Convert]::ToBase64String([IO.File]::ReadAllBytes($key)) | Set-Content -NoNewline -Encoding ascii (Join-Path $folder "keystore-secret.txt")
keytool -list -v -keystore "$key" -storepass android -alias androiddebugkey | Select-String "SHA256:"
```

**Attenzione:** `debug.keystore` è la tua chiave privata permanente; `keystore-secret.txt` ne è una copia codificata, **non cifrata**. Non caricare questi file nel repository e non inviarli in chat. Fai un backup cifrato offline e limita l'accesso ai file.

## 3. Configura il secret GitHub
Nel repository vai su **Settings → Secrets and variables → Actions → New repository secret**.
- Name: `ANDROID_DEBUG_KEYSTORE_BASE64`
- Secret: incolla il contenuto completo del file locale `keystore-secret.txt`.

Conserva il file `debug.keystore` in un backup cifrato affidabile. Il secret GitHub non è recuperabile in chiaro dopo l'inserimento: senza backup della chiave non potrai ricostruirla.

## 3-bis. Prima di integrare la modifica dei workflow
**Il secret è obbligatorio per entrambi i workflow** (`Android debug APK` e `Build APK`). La compilazione viene intenzionalmente interrotta se il secret non esiste, è vuoto, non è un keystore decodificabile o non contiene l'alias `androiddebugkey` con password `android`. Questo evita di produrre APK apparentemente aggiornabili ma firmate con una chiave casuale e differente.

Il secret può essere creato soltanto dall'utente con accesso alle impostazioni del repository. Non inserire il base64 in commit, commenti, issue o chat. Conservare una copia cifrata offline del keystore. Se la versione attualmente installata è già firmata con un'altra chiave, la nuova APK **non** potrà sovrascriverla: prima fare backup della watchlist CSV e recuperare tutte le API key, poi procedere alla migrazione.

## 4. Genera l'APK e verifica
Da **Actions → Android debug APK → Run workflow** su `main`, scarica l’artifact solo se il workflow è verde. Anche il workflow manuale **Build APK** usa lo stesso secret. Entrambi decodificano il keystore in `~/.android/debug.keystore` prima di Gradle e non generano una nuova chiave ad ogni compilazione. Controlla la fingerprint SHA-256 prima di installare la nuova APK. Per gli aggiornamenti futuri non modificare né eliminare il secret.

## 5. Migrazione della vecchia installazione
Dopo aver verificato i backup, disinstalla la vecchia app (la nuova APK ha una firma differente e Android non consente l'aggiornamento diretto). Installa la nuova APK, reimposta le chiavi API una sola volta, reimporta i dati e verifica le quantità del portafoglio. Tutte le successive APK firmate con la chiave permanente potranno essere installate sopra la nuova app mantenendo il medesimo `appId`, salvo cancellazione dei dati o altre incompatibilità.

**Sicurezza:** Le chiavi API attualmente risiedono in localStorage dell'app: è comodo ma non equivale a un vault cifrato Android. Evita di esportarle in chiaro in file condivisi.
