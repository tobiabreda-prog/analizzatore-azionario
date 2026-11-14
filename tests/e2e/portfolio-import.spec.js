import { test, expect } from "@playwright/test";

// Entirely fictional holdings. Never use the user's personal export as a fixture.
const KEY = "aa_investing_portfolio_v1";
const row = cells => cells.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(",");
const summaryHeaders = ["", "Nome", "Simbolo", "Borsa", "Tipo", "Quantità", "Prezzo Medio", "Prezzo Corrente", "Valore di mercato", "Commissione", "Peso", "Prof./Perd. netto", "Precedente", "Precedente", "Giornaliero", "Giornaliero", "Ora", "Osservazioni"];
const openHeaders = ["", "Nome", "Simbolo", "Borsa", "Data Ap.", "Tipo", "Quantità", "Prez Ap.", "Prezzo Corrente", "Valore di mercato", "Commissione", "Peso", "Prof./Perd. netto"];
const closedHeaders = ["", "Nome", "Simbolo", "Borsa", "Data Ap.", "Tipo", "Quantità", "Prez Ap.", "Data Chiusura", "Prez Ch.", "Guadagno%", "Netto Profitti/Perdite"];
const closedRow = ["", "Storico fittizio", "OLD.DE", "ETR", "01/02/2025", "Compra", "2.00000000", "30,00", "03/03/2025", "31,00", "1,67%", "€1,00"];
const fixture = "\uFEFF" + [
  row(["Riepilogo Posizioni Aperte"]), row(summaryHeaders),
  row(["", "Società Europa test", "EUTEST.MI", "BIT", "Compra", "10.00000000", "50,00", "55,00", "€550,00", "€2,00", "70,00%", "€48,00", "54,00", "53,00", "Compra", "1,00%", "13/11", 'Nota di test, con "virgolette"\ne due righe']),
  row(["", "Società America test", "USTEST.O", "NASDAQ", "Compra", "5.00000000", "40,00", "44,00", "$220,00", "$1,00", "30,00%", "€18,00", "43,00", "42,00", "Neutrale", "2,00%", "13/11", "--"]),
  "", row(["Valore di mercato", "€750,00"]), row(["P/L Attuale", "€66,00 / 9,00%"]), "",
  row(["Posizioni aperte"]), row(openHeaders),
  row(["", "Società Europa test", "EUTEST.MI", "BIT", "01/02/2026", "Compra", "4.00000000", "50,00", "55,00", "€220,00", "€1,00", "28,00%", "€19,00"]),
  row(["", "Società Europa test", "EUTEST.MI", "BIT", "02/02/2026", "Compra", "6.00000000", "50,00", "55,00", "€330,00", "€1,00", "42,00%", "€29,00"]),
  row(["", "Società America test", "USTEST.O", "NASDAQ", "03/02/2026", "Compra", "5.00000000", "40,00", "44,00", "$220,00", "$1,00", "30,00%", "€18,00"]), "",
  row(["Posizioni chiuse"]), row(closedHeaders), row(closedRow), row(closedRow), "",
  row(["Profitti/Perdite Posizioni Chiuse", "€2,00"]), ""
].join("\r\n");

async function prepare(page) {
  const errors = [], remoteRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://**/*", async route => { remoteRequests.push(route.request().url());await route.abort(); });
  await page.goto("/");
  await page.getByRole("button", { name: "Apri portafoglio" }).click();
  await expect(page.getByRole("heading", { name: "Portafoglio", exact: true })).toBeVisible();
  return { errors, remoteRequests };
}
async function select(page, content = fixture, name = "portafoglio-test.csv") {
  await page.getByLabel("Importa CSV Investing.com", { exact: true }).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
}
async function saved(page) { return page.evaluate(key => localStorage.getItem(key), KEY); }
async function importFixture(page) {
  await select(page);
  await page.getByRole("button", { name: "Conferma importazione", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvato");
}

test("previews complete holdings, confirms atomically and persists all sections on reload", async ({ page }) => {
  const monitor = await prepare(page);
  await select(page);
  await expect(page.getByRole("heading", { name: "Anteprima importazione", exact: true })).toBeVisible();
  expect(await saved(page)).toBeNull();
  await expect(page.getByText(/2 posizioni.*3 lotti aperti.*2 posizioni chiuse/)).toBeVisible();
  await page.getByRole("button", { name: "Conferma importazione", exact: true }).click();
  const snapshot = JSON.parse(await saved(page));
  expect(snapshot.summaryPositions).toHaveLength(2);
  expect(snapshot.openLots).toHaveLength(3);
  expect(snapshot.closedLots).toHaveLength(2);
  expect(snapshot.summaryPositions[1]).toMatchObject({ symbol: "USTEST", currency: "USD", netPnl: { amount: 18, currency: "EUR" } });
  expect(snapshot.sections[0].headers.filter(header => header === "Precedente")).toHaveLength(2);
  expect(snapshot.closedLots[0].commission).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Apri portafoglio" }).click();
  await expect(page.getByText("Società Europa test", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Lotti aperti", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Lotti aperti.*3/ })).toBeVisible();
  await page.getByRole("tab", { name: "Posizioni chiuse", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Posizioni chiuse.*2/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Storico fittizio" })).toHaveCount(2);
  await page.getByRole("tab", { name: "Dati originali", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Riepilogo Posizioni Aperte" }).click();
  await expect(page.getByRole("columnheader").filter({ hasText: "Precedente" })).toHaveCount(2);
  await expect(page.getByRole("cell").filter({ hasText: 'Nota di test, con "virgolette"' })).toBeVisible();
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test("export preserves the complete original CSV including repeated columns and duplicate rows", async ({ page }) => {
  const monitor = await prepare(page);
  await importFixture(page);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta CSV originale", exact: true }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("portafoglio-test.csv");
  const stream = await download.createReadStream();
  const parts = [];for await (const part of stream) parts.push(part);
  expect(Buffer.concat(parts)).toEqual(Buffer.from(fixture));
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test("reimport replaces rather than appends lots; cancelling a replacement preserves the saved snapshot", async ({ page }) => {
  const monitor = await prepare(page);
  await importFixture(page);
  const original = await saved(page);
  await select(page, fixture.replaceAll("Società Europa test", "Sostituzione cancellata"), "replacement.csv");
  await page.getByRole("button", { name: "Annulla importazione", exact: true }).click();
  expect(await saved(page)).toBe(original);
  await expect(page.getByText("Società Europa test", { exact: true }).first()).toBeVisible();
  await select(page);
  await page.getByRole("button", { name: "Conferma sostituzione", exact: true }).click();
  const next = JSON.parse(await saved(page));
  expect(next.openLots).toHaveLength(3);expect(next.closedLots).toHaveLength(2);
  expect(next.sections).toHaveLength(3);
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test("malformed CSV and failed storage writes preserve the previous imported portfolio", async ({ page }) => {
  const monitor = await prepare(page);
  await importFixture(page);
  const original = await saved(page);
  await select(page, fixture.replace('"10.00000000"', '"not-a-number"'), "invalid.csv");
  await expect(page.getByRole("alert")).toContainText("Importazione non riuscita");
  expect(await saved(page)).toBe(original);
  await expect(page.getByRole("button", { name: /Conferma (importazione|sostituzione)/ })).toHaveCount(0);
  await select(page, fixture.replaceAll("Società Europa test", "Salvataggio rifiutato"));
  await page.evaluate(key => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException("quota test", "QuotaExceededError");
      return originalSet.call(this, name, value);
    };
  }, KEY);
  await page.getByRole("button", { name: "Conferma sostituzione", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Salvataggio non riuscito");
  expect(await saved(page)).toBe(original);
  await page.getByRole("button", { name: "Annulla importazione", exact: true }).click();
  await expect(page.getByText("Società Europa test", { exact: true }).first()).toBeVisible();
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});
