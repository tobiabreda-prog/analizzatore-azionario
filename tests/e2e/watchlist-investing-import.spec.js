import { test, expect } from "@playwright/test";

// Fictional fixtures only: account exports and real holdings stay outside the repository.
const WATCHLIST_KEY = "aa2_fair_value_watchlist_v1";
const PORTFOLIO_KEY = "aa_investing_portfolio_v1";
const row = fields => fields.map(field => '"' + String(field).replace(/"/g, '""') + '"').join(",");
const fixture = (name = "Posizione sintetica") => "\uFEFF" + [
  row(["Riepilogo Posizioni Aperte"]),
  row(["", "Nome", "Simbolo", "Borsa", "Tipo", "Quantità", "Prezzo Medio", "Prezzo Corrente", "Valore di mercato", "Commissione", "Peso", "Prof./Perd. netto", "Precedente", "Precedente", "Campo aggiuntivo"]),
  row(["", name, "DEMO.MI", "BIT", "Compra", "10.00000000", "20,00", "22,00", "€220,00", "€2,00", "100,00%", "€18,00", "21,00", "20,50", "Conservare questo testo"]),
  "", row(["Valore di mercato", "€220,00"]), row(["P/L Attuale", "€18,00 / 9,00%"]), "",
  row(["Posizioni aperte"]),
  row(["", "Nome", "Simbolo", "Borsa", "Data Ap.", "Tipo", "Quantità", "Prez Ap.", "Prezzo Corrente", "Valore di mercato", "Commissione", "Prof./Perd. netto"]),
  row(["", name, "DEMO.MI", "BIT", "02/01/2026", "Compra", "4.00000000", "20,00", "22,00", "€88,00", "€1,00", "€7,00"]),
  row(["", name, "DEMO.MI", "BIT", "03/01/2026", "Compra", "6.00000000", "20,00", "22,00", "€132,00", "€1,00", "€11,00"]), "",
  row(["Posizioni chiuse"]),
  row(["", "Nome", "Simbolo", "Borsa", "Data Ap.", "Tipo", "Quantità", "Prez Ap.", "Data Chiusura", "Prez Ch.", "Guadagno%", "Netto Profitti/Perdite"]),
  row(["", "Storico sintetico", "OLD.O", "NASDAQ", "04/01/2025", "Compra", "3.00000000", "10,00", "08/01/2025", "11,00", "8,00%", "€2,00"]),
  "", row(["Profitti/Perdite Posizioni Chiuse", "€2,00"]), ""
].join("\r\n");

async function prepare(page) {
  const errors = [], remoteRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://**/*", async route => { remoteRequests.push(route.request().url());await route.abort(); });
  await page.goto("/");
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify(["KEEP.MI"])), WATCHLIST_KEY);
  return { errors, remoteRequests };
}

async function openWatchlist(page) {
  await page.getByRole("button", { name: "Apri watchlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
}

async function restore(page, source = fixture(), name = "investing-test.csv", viaButton = false) {
  const file = { name, mimeType: "text/csv", buffer: Buffer.from(source) };
  if (viaButton) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Ripristina CSV", { exact: true }).click();
    await (await chooser).setFiles(file);
  } else await page.getByLabel("Ripristina CSV", { exact: true }).setInputFiles(file);
}

async function stored(page) {
  return page.evaluate(([watchlistKey, portfolioKey]) => ({ watchlist: localStorage.getItem(watchlistKey), portfolio: localStorage.getItem(portfolioKey) }), [WATCHLIST_KEY, PORTFOLIO_KEY]);
}

async function saveExistingPortfolio(page) {
  await page.getByRole("button", { name: "Apri portafoglio", exact: true }).click();
  await page.getByLabel("Importa CSV Investing.com", { exact: true }).setInputFiles({ name: "existing.csv", mimeType: "text/csv", buffer: Buffer.from(fixture("Portafoglio precedente")) });
  await page.getByRole("button", { name: "Conferma importazione", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvato");
  const previous = await stored(page);
  await page.getByRole("button", { name: "Analisi titolo", exact: true }).click();
  return previous;
}

test("mobile watchlist restore opens a complete Investing preview and preserves the watchlist", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const monitor = await prepare(page);
  await openWatchlist(page);
  await restore(page, fixture(), "investing-test.csv", true);
  await expect(page.getByRole("heading", { name: "Portafoglio", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anteprima importazione", exact: true })).toBeVisible();
  await expect(page.getByText(/1 posizioni.*2 lotti aperti.*1 posizioni chiuse/)).toBeVisible();
  expect(await stored(page)).toEqual({ watchlist: JSON.stringify(["KEEP.MI"]), portfolio: null });
  await page.getByRole("button", { name: "Conferma importazione", exact: true }).click();
  const saved = await stored(page), portfolio = JSON.parse(saved.portfolio);
  expect(saved.watchlist).toBe(JSON.stringify(["KEEP.MI"]));
  expect(portfolio.sourceText).toBe(fixture());
  expect(portfolio.summaryPositions).toHaveLength(1);
  expect(portfolio.openLots).toHaveLength(2);
  expect(portfolio.closedLots).toHaveLength(1);
  expect(portfolio.sections[0].headers.filter(header => header === "Precedente")).toHaveLength(2);
  expect(portfolio.summaryPositions[0].fields.at(-1).raw).toBe("Conservare questo testo");
  await page.getByRole("button", { name: "Watchlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analizza KEEP.MI", exact: true })).toBeVisible();
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test("watchlist Investing restore previews replacements and cancellation keeps both saved collections", async ({ page }) => {
  const monitor = await prepare(page);
  const previous = await saveExistingPortfolio(page);
  await openWatchlist(page);
  await restore(page, fixture("Nuovo portafoglio"));
  await expect(page.getByRole("button", { name: "Conferma sostituzione", exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(previous);
  await page.getByRole("button", { name: "Annulla importazione", exact: true }).click();
  expect(await stored(page)).toEqual(previous);
  await expect(page.getByText("Portafoglio precedente", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Watchlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
  await restore(page, fixture("Nuovo portafoglio"));
  await page.getByRole("button", { name: "Conferma sostituzione", exact: true }).click();
  const saved = await stored(page), portfolio = JSON.parse(saved.portfolio);
  expect(saved.watchlist).toBe(previous.watchlist);
  expect(portfolio.openLots).toHaveLength(2);
  expect(portfolio.summaryPositions[0].name).toBe("Nuovo portafoglio");
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test("malformed Investing CSV selected in the watchlist cannot overwrite the existing portfolio", async ({ page }) => {
  const monitor = await prepare(page);
  const previous = await saveExistingPortfolio(page);
  await openWatchlist(page);
  await restore(page, fixture().replace('"10.00000000"', '"invalid-quantity"'));
  await expect(page.getByRole("alert")).toContainText(/Riga \d+/);
  await expect(page.getByRole("button", { name: /Conferma (importazione|sostituzione)/ })).toHaveCount(0);
  expect(await stored(page)).toEqual(previous);
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});

test("watchlist restore still accepts its original ticker-only backup without touching the portfolio", async ({ page }) => {
  const monitor = await prepare(page);
  const previous = await saveExistingPortfolio(page);
  await openWatchlist(page);
  page.once("dialog", dialog => dialog.accept());
  await restore(page, '"symbol"\r\n"NEW.MI"\r\n"SECOND"\r\n', "watchlist.csv");
  await expect(page.getByRole("status")).toContainText("2 titoli");
  await expect(page.getByRole("heading", { name: "Watchlist", exact: true })).toBeVisible();
  expect(await stored(page)).toEqual({ watchlist: JSON.stringify(["NEW.MI", "SECOND"]), portfolio: previous.portfolio });
  await restore(page, "date,symbol,price\n2026-01-01,NOPE,10\n", "unrecognized.csv");
  await expect(page.getByRole("alert")).toContainText("Formato non riconosciuto");
  expect((await stored(page)).portfolio).toBe(previous.portfolio);
  expect(monitor.errors).toEqual([]);expect(monitor.remoteRequests).toEqual([]);
});
