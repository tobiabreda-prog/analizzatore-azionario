import { test, expect } from "@playwright/test";

test("fair value calculates DCF scenarios without removed console tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analizzatore Azionario" })).toBeVisible();
  await page.getByRole("button", { name: "Apri workspace 2.0" }).click();
  await expect(page.getByRole("heading", { name: "Fair Value + Watchlist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fair Value · DCF a scenari" })).toBeVisible();
  for (const removed of ["Backtest", "Macro", "Mercati", "Portafoglio", "Earnings"]) {
    await expect(page.getByRole("button", { name: removed, exact: true })).toHaveCount(0);
  }
  await page.getByLabel("FCF ultimo esercizio (milioni)").fill("100");
  await page.getByLabel("Crescita FCF annua (%)").fill("5");
  await page.getByLabel("WACC (%)").fill("9");
  await page.getByLabel("Crescita terminale (%)").fill("2.5");
  await page.getByLabel("Debito netto (milioni)").fill("100");
  await page.getByLabel("Azioni diluite (milioni)").fill("50");
  await page.getByLabel("Prezzo attuale (opzionale)").fill("20");
  await page.getByRole("button", { name: "Calcola fair value" }).click();
  await expect(page.getByText("Fair value ponderato per azione")).toBeVisible();
});

test("watchlist adds, persists, deduplicates and removes ticker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Apri workspace 2.0" }).click();
  await page.getByRole("button", { name: /Watchlist \(/ }).click();
  await page.getByRole("textbox", { name: "Ticker" }).fill(" eni.mi ");
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ENI.MI aggiunto");
  await expect(page.getByText("ENI.MI", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Apri workspace 2.0" }).click();
  await page.getByRole("button", { name: /Watchlist \(/ }).click();
  await expect(page.getByText("ENI.MI", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Ticker" }).fill("ENI.MI");
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("già nella watchlist");
  await page.getByRole("button", { name: "Rimuovi ENI.MI" }).click();
  await expect(page.getByText("Nessun titolo salvato.")).toBeVisible();
});

test("watchlist restores only its own CSV and preserves data on invalid CSV", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Apri workspace 2.0" }).click();
  await page.getByRole("button", { name: /Watchlist \(/ }).click();
  await page.getByRole("textbox", { name: "Ticker" }).fill("AAPL");
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from('date,symbol,price\n2026-01-01,MSFT,100\n')
  });
  await expect(page.getByRole("alert")).toContainText("Formato non riconosciuto");
  await expect(page.getByText("AAPL", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name: "watchlist.csv", mimeType: "text/csv", buffer: Buffer.from('"symbol"\r\n"MSFT"\r\n"ENI.MI"\r\n')
  });
  await expect(page.getByRole("status")).toContainText("2 titoli");
  await expect(page.getByText("MSFT", { exact: true })).toBeVisible();
  await expect(page.getByText("AAPL", { exact: true })).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("watchlist-fair-value.csv");
});
