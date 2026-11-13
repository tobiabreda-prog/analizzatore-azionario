import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const source = path.resolve("public/icon.svg");
const resourceRoot = path.resolve("android/app/src/main/res");
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const adaptiveDensities = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

if (!fs.existsSync(source)) throw new Error("public/icon.svg non trovato");
const svg = fs.readFileSync(source);

for (const [density, size] of Object.entries(densities)) {
  const dir = path.join(resourceRoot, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await fs.promises.writeFile(path.join(dir, "ic_launcher.png"), png);
  await fs.promises.writeFile(path.join(dir, "ic_launcher_round.png"), png);
}

// Android 8+ usa le icone adaptive: aggiorna anche foreground/background,
// altrimenti il launcher potrebbe continuare a mostrare l'icona predefinita.
for (const [density, size] of Object.entries(adaptiveDensities)) {
  const dir = path.join(resourceRoot, `mipmap-${density}`);
  const foreground = await sharp(svg).resize(size, size).png().toBuffer();
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

console.log("Icone Android legacy e adaptive generate per tutte le densità.");
