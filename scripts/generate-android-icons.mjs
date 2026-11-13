import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const source = path.resolve("public/icon.svg");
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
if (!fs.existsSync(source)) throw new Error("public/icon.svg non trovato");
const svg = fs.readFileSync(source);
for (const [density, size] of Object.entries(densities)) {
  const dir = path.resolve("android/app/src/main/res", `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await fs.promises.writeFile(path.join(dir, "ic_launcher.png"), png);
  await fs.promises.writeFile(path.join(dir, "ic_launcher_round.png"), png);
}
console.log("Icone Android generate per tutte le densità.");
