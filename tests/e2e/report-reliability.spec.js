import { test, expect } from "@playwright/test";

const validCommentary = {
  horizon: "6-12 mesi",
  motivation: "Il P/E è 20.",
  strengths: ["Ricavi in crescita."],
  risks: ["Pesi non calibrati."]
};

async function prepareReport(page, { response = validCommentary, oldAiCache = false, deferResponse = false } = {}) {
  const errors = [], unexpectedRequests = [];
  let generationCalls = 0;
  let release;
  const responseReady = deferResponse ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  page.on("pageerror", error => errors.push(error.message));
  // Every remote response is controlled: financial data comes from the fixture,
  // and neither Gemini credentials nor provider requests leave the browser.
  await page.route("https://**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "generativelanguage.googleapis.com") {
      unexpectedRequests.push(url.hostname);
      await route.abort();
      return;
    }
    if (url.pathname.endsWith(":generateContent")) {
      generationCalls++;
      await responseReady;
      await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] } });
    } else {
      await route.fulfill({ json: { models: [{ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }] } });
    }
  });
  await page.addInitScript(({ oldAiCache }) => {
    // Preserve the app's own cache on reload, so reuse and revalidation follow
    // the same path as a returning user rather than reseeding test data.
    if (localStorage.getItem("aa_analysis_segments_v1")) return;
    const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
    const currentYear = new Date(now).getUTCFullYear();
    const entry = value => ({ ts: now, value });
    const annual = [3, 2, 1].map((yearsAgo, index) => ({
      y: currentYear - yearsAgo, periodEnd: `${currentYear - yearsAgo}-12-31`,
      rev: 1000 + 100 * index, ni: 100 + 10 * index, fcf: 100 + 20 * index,
      ebitda: 200 + 10 * index, eps: 1 + 0.1 * index, op: 150 + 10 * index
    }));
    const quote = {
      ticker: "TEST", name: "Società test affidabilità", currency: "USD", price: 200,
      marketCap: 100000000000, source: "Fixture", asOf: today,
      sma50: 180, sma200: 160, rsi14: 55,
      history: Array.from({ length: 60 }, (_, index) => [
        new Date(now - (59 - index) * 7 * 86400000).toISOString().slice(0, 10), 141 + index, 1000
      ])
    };
    const fin = {
      schemaVersion: 2,
      annual, quarters: [], balance: { netDebt: 100, currentRatio: 2, interestCover: 8, roe: 10 },
      lastReportDate: `${currentYear - 1}-12-31`, isLatest: true, asOf: today, source: "Fixture"
    };
    const val = { metrics: [{ k: "P/E", v: 20, sector: 20, date: today }], peers: [], asOf: today, source: "Fixture" };
    const events = { earnings: {}, dividends: {}, source: "Fixture", asOf: today };
    const an = { targetMean: null, ratings: { buy: 0, hold: 0, sell: 0 }, sector: "Technology", industry: "Software" };
    const mkt = { stock: { r26: 2, r52: 3 }, index: null };
    const newsRaw = [];
    const sections = {
      quote: entry(quote), fin: entry(fin), val: entry(val), events: entry(events), an: entry(an),
      mkt: entry(mkt), newsRaw: entry(newsRaw), peers: entry({ peers: [], sector: { "P/E": 20 } })
    };
    if (oldAiCache) sections.ai = entry({
      version: 1,
      fingerprint: JSON.stringify({ quote, fin, val, events, an, mkt, newsRaw }),
      final: { horizon: "6-12 mesi", motivation: "Commento precedente non validato", strengths: "bad", risks: [] },
      news: { items: [] }
    });
    localStorage.setItem("aa_api_settings_v1", JSON.stringify({ gemini: "test-only" }));
    localStorage.setItem("aa_analysis_segments_v1", JSON.stringify({ TEST: sections }));
  }, { oldAiCache });
  await page.goto("/");
  await openReport(page);
  return { errors, unexpectedRequests, generationCalls: () => generationCalls, release };
}

async function openReport(page) {
  await page.getByPlaceholder(/Sigla o nome/).fill("TEST");
  await page.getByRole("button", { name: "Analizza", exact: true }).click();
  await expect(page.getByText("Società test affidabilità", { exact: false })).toBeVisible();
}

const cachedAi = page => page.evaluate(() => JSON.parse(localStorage.getItem("aa_analysis_segments_v1"))?.TEST?.ai?.value ?? null);
const overallScore = page => page.getByText("Punteggio complessivo", { exact: true }).locator("..").locator("b");

test("a valid Gemini report renders and is cached after financial data passes the gate", async ({ page }) => {
  const run = await prepareReport(page);
  await expect(page.getByText(validCommentary.motivation, { exact: true })).toBeVisible();
  await expect(page.getByText(validCommentary.strengths[0], { exact: true })).toBeVisible();
  await expect(overallScore(page)).toHaveText(/^\d+\/100$/);
  await expect.poll(() => cachedAi(page)).toMatchObject({ version: 2, report: { motivation: validCommentary.motivation } });
  expect(run.generationCalls()).toBe(1);
  expect(run.errors).toEqual([]);
  expect(run.unexpectedRequests).toEqual([]);
});

for (const [reason, response] of [
  ["an invalid strengths type", { ...validCommentary, strengths: "bad" }],
  ["an invented valuation number", { ...validCommentary, motivation: "Il P/E è 999." }]
]) {
  test(`rejects ${reason} while keeping the numerical report available`, async ({ page }) => {
    const run = await prepareReport(page, { response, deferResponse: true });
    await expect(overallScore(page)).toHaveText(/^\d+\/100$/);
    const before = await overallScore(page).innerText();
    run.release();
    await expect(page.getByText(/Commento Gemini non disponibile:/)).toBeVisible();
    await expect(overallScore(page)).toHaveText(before);
    await expect(page.getByRole("button", { name: "Stampa report" })).toBeEnabled();
    await expect(page.getByText(response.motivation, { exact: true })).toHaveCount(0);
    expect(await cachedAi(page)).toBeNull();
    expect(run.generationCalls()).toBe(1);
    expect(run.errors).toEqual([]);
    expect(run.unexpectedRequests).toEqual([]);
  });
}

test("ignores an old unvalidated AI cache and replaces it with a valid report", async ({ page }) => {
  const run = await prepareReport(page, { oldAiCache: true });
  await expect(page.getByText(validCommentary.motivation, { exact: true })).toBeVisible();
  await expect(page.getByText("Commento precedente non validato", { exact: true })).toHaveCount(0);
  await expect.poll(() => cachedAi(page)).toMatchObject({ version: 2, report: { motivation: validCommentary.motivation } });
  expect(run.generationCalls()).toBe(1);
  expect(run.errors).toEqual([]);
  expect(run.unexpectedRequests).toEqual([]);
});

test("reuses a valid current AI cache and regenerates it if its report is corrupted", async ({ page }) => {
  const run = await prepareReport(page);
  await expect(page.getByText(validCommentary.motivation, { exact: true })).toBeVisible();
  const initialCache = await cachedAi(page);
  expect(initialCache).toMatchObject({ version: 2, report: { strengths: validCommentary.strengths } });
  expect(run.generationCalls()).toBe(1);

  await page.reload();
  await openReport(page);
  await expect(page.getByText(validCommentary.motivation, { exact: true })).toBeVisible();
  expect(run.generationCalls()).toBe(1);
  expect(await cachedAi(page)).toEqual(initialCache);

  // Preserve the exact app-produced fingerprint/version and corrupt only the
  // response schema: matching inputs must not bypass response revalidation.
  await page.evaluate(() => {
    const sections = JSON.parse(localStorage.getItem("aa_analysis_segments_v1"));
    sections.TEST.ai.value.report.strengths = "bad";
    localStorage.setItem("aa_analysis_segments_v1", JSON.stringify(sections));
  });
  await page.reload();
  await openReport(page);
  await expect(page.getByText(validCommentary.strengths[0], { exact: true })).toBeVisible();
  expect(run.generationCalls()).toBe(2);
  expect(await cachedAi(page)).toMatchObject({ version: 2, report: { strengths: validCommentary.strengths } });
  expect(run.errors).toEqual([]);
  expect(run.unexpectedRequests).toEqual([]);
});
