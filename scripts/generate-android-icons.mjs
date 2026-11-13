import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const source = path.resolve("public/icon.svg");
const resourceRoot = path.resolve("android/app/src/main/res");
const manifestPath = path.resolve("android/app/src/main/AndroidManifest.xml");
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptiveDensities = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

if (!fs.existsSync(source)) throw new Error("public/icon.svg non trovato");
if (!fs.existsSync(manifestPath)) throw new Error("AndroidManifest.xml non trovato");
const svg = fs.readFileSync(source);

// Icona legacy: mantiene il disegno completo con fondo blu.
for (const [density, size] of Object.entries(densities)) {
  const dir = path.join(resourceRoot, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await fs.promises.writeFile(path.join(dir, "ic_launcher.png"), png);
  await fs.promises.writeFile(path.join(dir, "ic_launcher_round.png"), png);
}

// Adaptive icon: il foreground deve essere trasparente. Lo sfondo è gestito
// separatamente da Android, così la maschera del launcher non ritaglia un
// secondo sfondo arrotondato e non altera l'aspetto del salvadanaio.
const adaptiveForeground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="pig" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#ffb3c8"/><stop offset="1" stop-color="#f27aa3"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a6"/><stop offset=".55" stop-color="#f7c948"/><stop offset="1" stop-color="#dc9420"/></linearGradient>
  </defs>
  <g transform="translate(85 100) scale(.66)">
    <!-- zampe -->
    <rect x="160" y="352" width="50" height="78" rx="22" fill="#ee6f9b" stroke="#8a3a4a" stroke-width="9"/>
    <rect x="300" y="352" width="50" height="78" rx="22" fill="#ee6f9b" stroke="#8a3a4a" stroke-width="9"/>
    <!-- codino -->
    <path d="M108 262c-30-4-44-28-30-44 12-13 30-3 22 10" fill="none" stroke="#8a3a4a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- corpo -->
    <ellipse cx="255" cy="285" rx="158" ry="118" fill="url(#pig)" stroke="#8a3a4a" stroke-width="9"/>
    <!-- orecchio -->
    <path d="M292 184l22-52c22 6 44 24 50 56z" fill="#ee6f9b" stroke="#8a3a4a" stroke-width="9" stroke-linejoin="round"/>
    <!-- luce -->
    <path d="M130 250c10-38 42-62 82-68" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".55"/>
    <!-- fessura -->
    <rect x="198" y="176" width="86" height="15" rx="7.5" fill="#6b2d3c"/>
    <!-- fiorellino -->
    <g transform="translate(205 318)">
      <g fill="#fff6e3" stroke="#d9a0b0" stroke-width="3">
        <circle cx="0" cy="-17" r="11"/><circle cx="16" cy="-5" r="11"/><circle cx="10" cy="14" r="11"/><circle cx="-10" cy="14" r="11"/><circle cx="-16" cy="-5" r="11"/>
      </g>
      <circle r="9" fill="#f7c948" stroke="#c98a1a" stroke-width="3"/>
    </g>
    <!-- occhio + guancia -->
    <ellipse cx="330" cy="318" rx="24" ry="15" fill="#ff8fb3" opacity=".7"/>
    <circle cx="335" cy="262" r="12" fill="#4a2230"/><circle cx="339" cy="258" r="4" fill="#fff"/>
    <!-- grugno dorato -->
    <ellipse cx="408" cy="296" rx="40" ry="46" fill="url(#gold)" stroke="#a8681a" stroke-width="9"/>
    <ellipse cx="398" cy="296" rx="6" ry="12" fill="#8a4b12"/><ellipse cx="420" cy="296" rx="6" ry="12" fill="#8a4b12"/>
    <!-- moneta che entra -->
    <g transform="translate(240 92) rotate(-10)">
      <circle r="50" fill="url(#gold)" stroke="#a8681a" stroke-width="9"/>
      <circle r="36" fill="none" stroke="#c98a1a" stroke-width="5"/>
      <path d="M-20 14l13-13 10 9 21-24" fill="none" stroke="#8a4b12" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6-14h17v17" fill="none" stroke="#8a4b12" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>`;

for (const [density, size] of Object.entries(adaptiveDensities)) {
  const dir = path.join(resourceRoot, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  const foreground = await sharp(Buffer.from(adaptiveForeground)).resize(size, size).png().toBuffer();
  await fs.promises.writeFile(path.join(dir, "ic_launcher_foreground.png"), foreground);
}

const adaptiveDir = path.join(resourceRoot, "mipmap-anydpi-v26");
const valuesDir = path.join(resourceRoot, "values");
fs.mkdirSync(adaptiveDir, { recursive: true });
fs.mkdirSync(valuesDir, { recursive: true });
await fs.promises.writeFile(path.join(adaptiveDir, "ic_launcher.xml"), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`);
await fs.promises.writeFile(path.join(adaptiveDir, "ic_launcher_round.xml"), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`);
await fs.promises.writeFile(path.join(valuesDir, "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#8FD8D6</color>
</resources>`);

// Collega esplicitamente l'icona generata all'app Android.
let manifest = fs.readFileSync(manifestPath, "utf8");
if (!/<application(?:\s|>)/.test(manifest)) throw new Error("Tag application non trovato in AndroidManifest.xml");
if (!/android:icon="[^"]+"/.test(manifest)) throw new Error("Attributo android:icon non trovato nel manifest");
manifest = manifest.replace(/android:icon="[^"]+"/, 'android:icon="@mipmap/ic_launcher"');
if (/android:roundIcon="[^"]+"/.test(manifest)) {
  manifest = manifest.replace(/android:roundIcon="[^"]+"/, 'android:roundIcon="@mipmap/ic_launcher_round"');
} else {
  manifest = manifest.replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"');
}
fs.writeFileSync(manifestPath, manifest);

console.log("Icone Android legacy e adaptive generate e collegate al launcher per tutte le densità.");
