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
    <linearGradient id="pig" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#ffbd83"/><stop offset="1" stop-color="#e77c55"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a6"/><stop offset=".55" stop-color="#f6c84d"/><stop offset="1" stop-color="#d99022"/></linearGradient>
  </defs>
  <g transform="translate(118 118) scale(.54)">
    <g transform="translate(340 94) rotate(17)">
      <circle r="48" fill="url(#gold)" stroke="#ffe89a" stroke-width="8"/>
      <circle r="36" fill="none" stroke="#bd811d" stroke-width="5" opacity=".8"/>
      <path d="M-8-22h16M-8 22h16M0-28v56" stroke="#a86c17" stroke-width="7" stroke-linecap="round"/>
    </g>
    <path d="M320 150l-18 42" stroke="#f6c84d" stroke-width="8" stroke-linecap="round" stroke-dasharray="5 13" opacity=".9"/>
    <path d="M123 251c-17-13-26-31-21-48 19 3 35 15 44 32 24-18 57-28 96-28 79 0 139 43 139 111 0 43-24 77-64 96l7 37h-47l-13-27c-16 4-34 6-52 6-17 0-34-2-49-6l-14 27h-47l8-43c-22-20-35-47-35-79 0-44 17-81 48-105z" fill="url(#pig)" stroke="#ffd0a5" stroke-width="8" stroke-linejoin="round"/>
    <path d="M145 225c-22-19-29-47-16-72 30 7 52 27 59 54" fill="#e77c55" stroke="#ffd0a5" stroke-width="8" stroke-linejoin="round"/>
    <path d="M294 217c10-24 34-39 63-38 4 28-7 52-29 67" fill="#e77c55" stroke="#ffd0a5" stroke-width="8" stroke-linejoin="round"/>
    <path d="M191 253c15-10 30-10 45 0" fill="none" stroke="#a84f3d" stroke-width="9" stroke-linecap="round"/>
    <circle cx="288" cy="270" r="8" fill="#442c32"/>
    <ellipse cx="342" cy="313" rx="43" ry="30" fill="#f5a17c" stroke="#ffd0a5" stroke-width="7"/>
    <ellipse cx="330" cy="312" rx="6" ry="9" fill="#a84f3d"/>
    <ellipse cx="354" cy="312" rx="6" ry="9" fill="#a84f3d"/>
    <path d="M202 224h67" stroke="#7c452e" stroke-width="12" stroke-linecap="round"/>
    <path d="M219 218l7-10 7 10 7-10 7 10 7-10 7 10" fill="none" stroke="#ffe7a0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M174 374c-4 20-2 34 5 45M303 374c4 20 2 34-5 45" stroke="#c9684c" stroke-width="11" stroke-linecap="round"/>
    <path d="M125 325c-20 7-31 0-35-16" fill="none" stroke="#ffd0a5" stroke-width="9" stroke-linecap="round"/>
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
    <color name="ic_launcher_background">#102B46</color>
</resources>`);

// Collega esplicitamente l'icona generata all'app Android.
let manifest = fs.readFileSync(manifestPath, "utf8");
if (!/<application\\b/.test(manifest)) throw new Error("Tag application non trovato in AndroidManifest.xml");
if (!/android:icon="[^"]+"/.test(manifest)) throw new Error("Attributo android:icon non trovato nel manifest");
manifest = manifest.replace(/android:icon="[^"]+"/, 'android:icon="@mipmap/ic_launcher"');
if (/android:roundIcon="[^"]+"/.test(manifest)) {
  manifest = manifest.replace(/android:roundIcon="[^"]+"/, 'android:roundIcon="@mipmap/ic_launcher_round"');
} else {
  manifest = manifest.replace(/android:icon="@mipmap\\/ic_launcher"/, 'android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"');
}
fs.writeFileSync(manifestPath, manifest);

console.log("Icone Android legacy e adaptive generate e collegate al launcher per tutte le densità.");
