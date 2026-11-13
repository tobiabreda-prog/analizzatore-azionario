import { test, expect } from "@playwright/test";

test("fair value calculates DCF scenarios without removed console tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analizzatore Azionario" })).toBeVisible();
  await page.getByRole("button", { name: "Apri workspace 2.0" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist + Verifica DCF" })).toBeVisible();
  await page.getByRole("button", { name: "Verifica DCF", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verifica DCF automatico · sperimentale" })).toBeVisible();
  for (const removed of ["Backtest", "Macro", "Mercati", "Portafoglio", "Earnings"]) {
    await expect(page.getByRole("button", { name: removed, exact: true })).toHaveCount(0);
  }
  await page.getByText("Simulatore DCF manuale (solo analisi di sensibilità)").click();
  await page.getByLabel("FCF base (mediana, milioni)").fill("100");
  await page.getByLabel("Crescita FCF annua (%)").fill("5");
  await page.getByLabel("WACC (%)").fill("9");
  await page.getByLabel("Crescita terminale (%)").fill("2.5");
  await page.getByLabel("Debito netto (milioni)").fill("100");
  await page.getByLabel("Azioni diluite (medie annue, milioni)").fill("50");
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

test("one tap from watchlist opens the linked report and fills Fair Value from cached statements",async({page})=>{
  await page.addInitScript(()=>{
    const now=Date.now();
    const entry=value=>({ts:now,value});
    const annual=[
      {y:2023,rev:1000,ni:100,fcf:100,ebitda:200,eps:1,op:150},
      {y:2024,rev:1100,ni:120,fcf:120,ebitda:210,eps:1.2,op:160},
      {y:2025,rev:1200,ni:130,fcf:140,ebitda:220,eps:1.3,op:180}
    ];
    const today=new Date().toISOString().slice(0,10);
    const quote={ticker:"AAPL",name:"Apple test fixture",currency:"USD",price:200,marketCap:100000000000,source:"Fixture",asOf:today,
      history:Array.from({length:60},(_,i)=>[new Date(now-(59-i)*7*86400000).toISOString().slice(0,10),150+i,100000])};
    const fin={annual,quarters:[],balance:{netDebt:500,dilutedShares:500,currentRatio:2,interestCover:8,roe:10},lastReportDate:"2025-12-31",isLatest:true,asOf:today,source:"Fixture"};
    const val={metrics:[],peers:[],source:"Fixture",asOf:today};
    localStorage.setItem("aa2_fair_value_watchlist_v1",JSON.stringify(["AAPL"]));
    localStorage.setItem("aa_analysis_segments_v1",JSON.stringify({
      AAPL:{quote:entry(quote),fin:entry(fin),val:entry(val),
       events:entry({earnings:{},dividends:{},source:"Fixture",asOf:today}),
       an:entry({targetMean:null,ratings:{buy:0,hold:0,sell:0}}),
       mkt:entry({stock:{r26:2,r52:3},index:null}),
       newsRaw:entry([]),peers:entry({peers:[],sector:{}})}
    }));
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Apri workspace 2.0"}).click();
  await page.getByRole("button",{name:"Analizza AAPL"}).click();
  await expect(page.getByText("Apple test fixture")).toBeVisible();
  await page.getByRole("button",{name:"Verifica DCF · AAPL"}).click();
  await expect(page.getByText(/Titolo selezionato:/)).toContainText("AAPL");
  await expect(page.getByLabel("FCF base (mediana, milioni)")).toHaveValue("120");
  await expect(page.getByLabel("Debito netto (milioni)")).toHaveValue("500");
  await expect(page.getByLabel("Azioni diluite (medie annue, milioni)")).toHaveValue("500");
  await expect(page.getByLabel("WACC (%)")).toHaveValue("");
});

test("AAPL one-click automatic test fails closed without full FCFF inputs and does not invent WACC",async({page})=>{
 await page.addInitScript(()=>{
  const now=Date.now(),entry=value=>({ts:now,value});
  const quote={ticker:"AAPL",name:"Apple Inc.",currency:"USD",price:250,asOf:new Date().toISOString().slice(0,10),source:"SEC / Yahoo fixture"};
  const fin={source:"SEC FY2026 - fixture",lastReportDate:"2026-09-26",balance:{netDebt:-56824,dilutedShares:14720.306},annual:[
   {y:2024,fcf:108807,operatingCashFlow:118254,capitalExpenditure:-9447,effectiveTaxRate:.241},
   {y:2025,fcf:98767,operatingCashFlow:111482,capitalExpenditure:-12715,effectiveTaxRate:.156},
   {y:2026,fcf:136056,operatingCashFlow:145097,capitalExpenditure:-9041,effectiveTaxRate:.170}
  ]};
  const val={metrics:[],peers:[],source:"Fixture",asOf:new Date().toISOString().slice(0,10)};
  localStorage.setItem("aa2_fair_value_watchlist_v1",JSON.stringify(["AAPL"]));
  localStorage.setItem("aa_analysis_segments_v1",JSON.stringify({AAPL:{quote:entry(quote),fin:entry(fin),val:entry(val)}}));
 });
 await page.goto("/");
 await page.getByRole("button",{name:"Apri workspace 2.0"}).click();
 await page.getByRole("button",{name:"Test DCF automatico AAPL"}).click();
 await expect(page.getByRole("heading",{name:"Verifica DCF automatico · sperimentale"})).toBeVisible();
 await expect(page.getByText("Test automatico non superato per AAPL")).toBeVisible();
 await expect(page.getByText(/servono CFO, CapEx, interessi e aliquota/i)).toBeVisible();
 await expect(page.getByText("DCF illustrativo automatico · AAPL")).toHaveCount(0);
});
