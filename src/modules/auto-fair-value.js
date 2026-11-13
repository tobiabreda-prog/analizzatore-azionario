import { valueScenarios } from "./fair-value.js";

/**
 * Deterministic, conservative feasibility gate for a one-click enterprise DCF.
 * No constants represent company financial data. Scenario probabilities/growth
 * are explicit model assumptions, not observed facts.
 *
 * FCFF proxy (US GAAP interest in operating cashflow):
 *   CFO - CapEx + interestExpense * (1 - effectiveTaxRate).
 * If those raw components are absent, never use Yahoo's generic FCF for a WACC DCF.
 */
const finite=v=>typeof v==="number"&&Number.isFinite(v);
const validDate=s=>typeof s==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s));
const daysBetween=(a,b)=>(Date.parse(b)-Date.parse(a))/86400000;
const percent=(n,min,max)=>finite(n)&&n>=min&&n<=max;
const evidenceKeys=["riskFree","beta","equityRiskPremium","costOfDebt","taxRate","equityWeight"];
const evidenceValid=research=>evidenceKeys.every(k=>{
 const item=research?.inputs?.[k];
 return item&&finite(item.value)&&typeof item.url==="string"&&/^https:\/\/[^/]+/.test(item.url)&&validDate(item.date);
});
const annualFCFF=row=>{
 if(!row || !finite(row.operatingCashFlow) || !finite(row.capitalExpenditure) ||
    !finite(row.interestExpense) || !percent(row.effectiveTaxRate,0,0.6))return null;
 // All values in millions. Operating cash flow can include after-tax interest
 // under US GAAP; never silently apply this adjustment to IFRS issuers.
 const value=row.operatingCashFlow-Math.abs(row.capitalExpenditure)+Math.abs(row.interestExpense)*(1-row.effectiveTaxRate);
 return finite(value)&&value>0?value:null;
};
export function assessAutoDcf(data,{now=new Date()}={}){
 const problems=[];
 const quote=data?.quote,fin=data?.fin;
 const symbol=String(quote?.ticker||"").toUpperCase();
 const asOf=now.toISOString().slice(0,10);
 if(!symbol)problems.push("Ticker non disponibile.");
 if(!/^[A-Z]{3}$/.test(quote?.currency||""))problems.push("Valuta di quotazione non verificata.");
 if(!finite(quote?.price)||quote.price<=0||!validDate(quote?.asOf)||daysBetween(quote.asOf,asOf)<0||daysBetween(quote.asOf,asOf)>7)
  problems.push("Prezzo giornaliero datato o mancante (massimo 7 giorni, festivi inclusi).");
 if(!validDate(fin?.lastReportDate)||daysBetween(fin.lastReportDate,asOf)<0||daysBetween(fin.lastReportDate,asOf)>550)
  problems.push("Bilancio annuale troppo vecchio o senza data verificabile.");
 if(!finite(fin?.balance?.netDebt))problems.push("Debito netto non disponibile in milioni della stessa valuta.");
 if(!finite(fin?.balance?.dilutedShares)||fin.balance.dilutedShares<=0)problems.push("Azioni medie diluite non disponibili (milioni).");
 const rows=[...(fin?.annual||[])].sort((a,b)=>a.y-b.y).slice(-3);
 if(rows.length!==3||rows.some((r,i)=>!Number.isInteger(r.y)||(i>0&&r.y!==rows[i-1].y+1)))
  problems.push("Servono tre esercizi annuali consecutivi, con dati completi.");
 if(rows.length===3&&validDate(fin?.lastReportDate)&&rows[2].y!==Number(fin.lastReportDate.slice(0,4)))
  problems.push("L'ultimo esercizio non coincide con il bilancio di riferimento.");
 if(quote?.currency!=="USD"||!/^([A-Z]+)$/.test(symbol))
  problems.push("Il ponte CFO→FCFF attuale è limitato ai titoli USA in USD; non applicarlo automaticamente a IFRS.");
 const fcffs=rows.map(annualFCFF);
 if(fcffs.length!==3||fcffs.some(x=>x===null))
  problems.push("FCFF ricostruibile non disponibile: servono CFO, CapEx, interessi e aliquota per ciascuno dei tre esercizi. Il FCF generico non basta.");
 return {ok:problems.length===0,problems,fcffs,rows,symbol,currency:quote?.currency||"",lastReportDate:fin?.lastReportDate||""};
}
export function calculateAutomaticDcf(data,research,{now=new Date(),terminalGrowthPercent=2.5}={}){
 const preflight=assessAutoDcf(data,{now});
 const problems=[...preflight.problems];
 if(!research||!finite(research.wacc)||!evidenceValid(research) || research.currency!==preflight.currency)
  problems.push("WACC non verificato: servono sei parametri con fonte HTTPS, data e valuta coerente.");
 else if(!percent(research.wacc,2,35))
  problems.push("WACC fuori dall'intervallo di plausibilità.");
 const newest=now.toISOString().slice(0,10);
 if(evidenceValid(research)&&evidenceKeys.some(k=>daysBetween(research.inputs[k].date,newest)<0||daysBetween(research.inputs[k].date,newest)>(k==="riskFree"||k==="beta"?180:550)))
  problems.push("Uno o più parametri WACC sono troppo vecchi o con data futura.");
 if(!percent(terminalGrowthPercent,0,4))
  problems.push("Assunzione di crescita terminale fuori dal limite 0–4%.");
 if(problems.length)return {ok:false,status:"INSUFFICIENT_DATA",problems,preflight};
 const values=preflight.fcffs;
 const median=[...values].sort((a,b)=>a-b)[1];
 const historicGrowth=Math.pow(values[2]/values[0],1/2)-1;
 // Cap a historic growth that otherwise extrapolates exceptional financial years.
 const growthRate=Math.max(-0.05,Math.min(.12,historicGrowth));
 const w=research.wacc/100,g=terminalGrowthPercent/100;
 if(w<=g+0.005)return {ok:false,status:"INSUFFICIENT_DATA",problems:["WACC troppo vicino alla crescita terminale: il risultato sarebbe instabile."],preflight};
 const flows=Array.from({length:5},(_,i)=>median*(1+growthRate)**(i+1));
 const scenarios=[
  {name:"bear",probability:.25,freeCashFlows:flows.map(x=>x*.85),wacc:w+.02,terminalGrowth:Math.max(0,g-.01)},
  {name:"base",probability:.5,freeCashFlows:flows,wacc:w,terminalGrowth:g},
  {name:"bull",probability:.25,freeCashFlows:flows.map(x=>x*1.15),wacc:Math.max(w-.01,g+.005),terminalGrowth:Math.min(g+.005,Math.max(w-.01,g+.005)-.005)}
 ];
 try{
  const valuation=valueScenarios({scenarios,netDebt:data.fin.balance.netDebt,dilutedShares:data.fin.balance.dilutedShares,currentPrice:data.quote.price});
  return {ok:true,status:"ILLUSTRATIVE",valuation,preflight,assumptions:{
    baseFcff:median,yearlyFcff:values,rawHistoricGrowth:historicGrowth*100,modelGrowth:growthRate*100,
    wacc:research.wacc,terminalGrowth:terminalGrowthPercent,forecastYears:5,
    shareCount:data.fin.balance.dilutedShares,netDebt:data.fin.balance.netDebt,
    source:finSource(data.fin),riskFreeSource:research.inputs.riskFree.url
  },warning:"DCF illustrativo, non fair value certificato: il FCFF è ricostruito da dati del provider; tax rate, capitale circolante, SBC, valore terminale e futuro debito richiedono analisi."};
 }catch(e){
  return {ok:false,status:"INSUFFICIENT_DATA",problems:["DCF non calcolabile: "+String(e.message||e)],preflight};
 }
}
function finSource(fin){return String(fin?.source||"non specificata");}
