import { test, expect } from "@playwright/test";

test("workspace opens and calculates a scenario DCF", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analisi Finanziaria" })).toBeVisible();
  await page.getByRole("button", { name: "Apri workspace 2.0" }).click();
  await expect(page.getByRole("heading", { name: "Console finanziaria" })).toBeVisible();
  await page.getByRole("button", { name: /Fair Value/ }).click();
  await expect(page.getByRole("heading", { name: "Fair Value · DCF a scenari" })).toBeVisible();

  await page.getByLabel("FCF ultimo esercizio (milioni)").fill("100");
  await page.getByLabel("Crescita FCF annua (%)").fill("5");
  await page.getByLabel("WACC (%)").fill("9");
  await page.getByLabel("Crescita terminale (%)").fill("2.5");
  await page.getByLabel("Debito netto (milioni)").fill("100");
  await page.getByLabel("Azioni diluite (milioni)").fill("50");
  await page.getByLabel("Prezzo attuale (opzionale)").fill("20");
  await page.getByRole("button", { name: "Calcola fair value" }).click();
  await expect(page.getByText("Fair value ponderato per azione")).toBeVisible();
  await page.getByRole("button", { name: /Backtest/ }).click();
  await expect(page.getByRole("button", { name: "Esegui backtest" })).toBeDisabled();
  await page.getByRole("button", { name: /Macro/ }).click();
  await expect(page.getByRole("heading", { name: "Indicatori macro globali" })).toBeVisible();
});
