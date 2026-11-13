import { test, expect } from "@playwright/test";

test("watchlist is the only workspace section; DCF and Fair Value are absent", async ({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Analizzatore Azionario"})).toBeVisible();
  await page.getByRole("button",{name:"Apri watchlist"}).click();
  await expect(page.getByRole("heading",{name:"Watchlist",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Watchlist essenziale"})).toBeVisible();
  await expect(page.getByRole("heading",{name:/Fair Value|DCF/i})).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Fair Value|DCF|Verifica DCF|Test DCF/i})).toHaveCount(0);
  for(const removed of ["Backtest","Macro","Mercati","Portafoglio","Earnings"]){
    await expect(page.getByRole("button",{name:removed,exact:true})).toHaveCount(0);
  }
});

test("watchlist adds, persists, deduplicates and removes a ticker",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Apri watchlist"}).click();
  await page.getByRole("textbox",{name:"Ticker"}).fill(" eni.mi ");
  await page.getByRole("button",{name:"Aggiungi",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("ENI.MI aggiunto");
  await expect(page.getByText("ENI.MI",{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"Apri watchlist"}).click();
  await expect(page.getByText("ENI.MI",{exact:true})).toBeVisible();
  await page.getByRole("textbox",{name:"Ticker"}).fill("ENI.MI");
  await page.getByRole("button",{name:"Aggiungi",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("già nella watchlist");
  await page.getByRole("button",{name:"Rimuovi ENI.MI"}).click();
  await expect(page.getByText("Nessun titolo salvato.")).toBeVisible();
});

test("watchlist CSV restores legacy data, rejects invalid data and exports new filename",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"Apri watchlist"}).click();
  await page.getByRole("textbox",{name:"Ticker"}).fill("AAPL");
  await page.getByRole("button",{name:"Aggiungi",exact:true}).click();
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name:"invalid.csv",mimeType:"text/csv",buffer:Buffer.from("date,symbol,price\n2026-01-01,MSFT,100\n")
  });
  await expect(page.getByRole("alert")).toContainText("Formato non riconosciuto");
  await expect(page.getByText("AAPL",{exact:true})).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name:"watchlist-fair-value.csv",mimeType:"text/csv",buffer:Buffer.from('"symbol"\r\n"MSFT"\r\n"ENI.MI"\r\n')
  });
  await expect(page.getByRole("status")).toContainText("2 titoli");
  await expect(page.getByText("MSFT",{exact:true})).toBeVisible();
  await expect(page.getByText("AAPL",{exact:true})).toHaveCount(0);
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Esporta CSV"}).click();
  expect((await downloadPromise).suggestedFilename()).toBe("watchlist.csv");
});

test("existing watchlist symbols survive the upgrade and link to the primary report",async({page})=>{
  await page.addInitScript(()=>{
    const now=Date.now(),entry=value=>({ts:now,value});
    const annual=[{y:2023,rev:1000,ni:100,fcf:100,ebitda:200,eps:1,op:150},
      {y:2024,rev:1100,ni:120,fcf:120,ebitda:210,eps:1.2,op:160},
      {y:2025,rev:1200,ni:130,fcf:140,ebitda:220,eps:1.3,op:180}];
    const today=new Date().toISOString().slice(0,10);
    const quote={ticker:"AAPL",name:"Apple test fixture",currency:"USD",price:200,marketCap:100000000000,source:"Fixture",asOf:today,
      history:Array.from({length:60},(_,i)=>[new Date(now-(59-i)*7*86400000).toISOString().slice(0,10),150+i,100000])};
    const fin={annual,quarters:[],balance:{netDebt:500,currentRatio:2,interestCover:8,roe:10},lastReportDate:"2025-12-31",isLatest:true,asOf:today,source:"Fixture"};
    const val={metrics:[],peers:[],source:"Fixture",asOf:today};
    // Legacy storage key intentionally preserved to avoid losing installed watchlists.
    localStorage.setItem("aa2_fair_value_watchlist_v1",JSON.stringify(["AAPL"]));
    localStorage.setItem("aa_analysis_segments_v1",JSON.stringify({
      AAPL:{quote:entry(quote),fin:entry(fin),val:entry(val),events:entry({earnings:{},dividends:{},source:"Fixture",asOf:today}),
        an:entry({targetMean:null,ratings:{buy:0,hold:0,sell:0}}),mkt:entry({stock:{r26:2,r52:3},index:null}),
        newsRaw:entry([]),peers:entry({peers:[],sector:{}})}
    }));
  });
  await page.goto("/");
  await page.getByRole("button",{name:"Apri watchlist"}).click();
  await expect(page.getByRole("button",{name:"Analizza AAPL"})).toBeVisible();
  await page.getByRole("button",{name:"Analizza AAPL"}).click();
  await expect(page.getByText("Apple test fixture")).toBeVisible();
  await page.getByRole("button",{name:"Watchlist",exact:true}).last().click();
  await expect(page.getByRole("button",{name:"Analizza AAPL"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Test DCF automatico AAPL"})).toHaveCount(0);
});
