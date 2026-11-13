import { useMemo, useState } from "react";
import { valueScenarios } from "../modules/fair-value.js";
import { researchWacc } from "../services/wacc-research.js";

const num=(v)=>v.trim()===""?null:Number(v);
const pct=(v)=>Number(v)/100;
const money=(v,currency)=>{if(!Number.isFinite(v))return "n.d.";try{return currency?new Intl.NumberFormat("it-IT",{style:"currency",currency,maximumFractionDigits:2}).format(v):v.toLocaleString("it-IT",{maximumFractionDigits:2});}catch{return v.toLocaleString("it-IT",{maximumFractionDigits:2});}};

export default function FairValuePanel({dark=false,analysisData=null}){
 const currency=analysisData?.quote?.currency||"";
 const annual=useMemo(()=>[...(analysisData?.fin?.annual||[])].filter(x=>Number.isFinite(x?.y)).sort((a,b)=>a.y-b.y),[analysisData]);
 const latestAnnual=annual.at(-1);
 const latestFcfYear=latestAnnual?.y;
 const recentFcfs=annual.slice(-3).map(x=>x.fcf).filter(x=>Number.isFinite(x)&&x>0);
 const fcf=recentFcfs.length?[...recentFcfs].sort((a,b)=>a-b)[Math.floor(recentFcfs.length/2)]:null;
 const history=annual.slice(-5).filter(x=>Number.isFinite(x.fcf)&&x.fcf>0);
 const cagr=history.length>=3?Math.pow(history.at(-1).fcf/history[0].fcf,1/(history.length-1))-1:null;
 const suggestedGrowth=cagr===null?5:Math.max(-5,Math.min(12,cagr*100));
 const debt=analysisData?.fin?.balance?.netDebt;
 const marketCap=analysisData?.quote?.marketCap??analysisData?.val?.marketCap;
 const quotePrice=analysisData?.quote?.price;
 const impliedShares=Number.isFinite(marketCap)&&marketCap>0&&Number.isFinite(quotePrice)&&quotePrice>0?marketCap/quotePrice/1e6:null;
 const defaults={fcfBase:Number.isFinite(fcf)?String(fcf):"",fcfGrowth:String(Number(suggestedGrowth.toFixed(2))),wacc:"",growth:"2.5",netDebt:Number.isFinite(debt)?String(debt):"",shares:Number.isFinite(impliedShares)?String(Number(impliedShares.toFixed(4))):"",price:Number.isFinite(quotePrice)&&quotePrice>0?String(quotePrice):""};
 const [overrides,setOverrides]=useState({});
 const fcfBase=overrides.fcfBase??defaults.fcfBase;
 const fcfGrowth=overrides.fcfGrowth??defaults.fcfGrowth;
 const wacc=overrides.wacc??defaults.wacc;
 const growth=overrides.growth??defaults.growth;
 const netDebt=overrides.netDebt??defaults.netDebt;
 const shares=overrides.shares??defaults.shares;
 const price=overrides.price??defaults.price;
 const setFcfBase=v=>setOverrides(x=>({...x,fcfBase:v}));
 const setFcfGrowth=v=>setOverrides(x=>({...x,fcfGrowth:v}));
 const setWacc=v=>setOverrides(x=>({...x,wacc:v}));
 const setGrowth=v=>setOverrides(x=>({...x,growth:v}));
 const setNetDebt=v=>setOverrides(x=>({...x,netDebt:v}));
 const setShares=v=>setOverrides(x=>({...x,shares:v}));
 const setPrice=v=>setOverrides(x=>({...x,price:v}));
 const [offlineInputs,setOfflineInputs]=useState({riskFree:"",beta:"",erp:"",costDebt:"",tax:"",equityWeight:""});
 const [offlineError,setOfflineError]=useState("");
 const [offlineResult,setOfflineResult]=useState(null);
 const setOffline=(key,value)=>{setOfflineInputs(x=>({...x,[key]:value}));setOfflineResult(null);setOfflineError("");};
 const computeOffline=()=>{
  setOfflineError("");
  const {riskFree,beta,erp,costDebt,tax,equityWeight}=offlineInputs;
  const vals=[riskFree,beta,erp,costDebt,tax,equityWeight].map(v=>v.trim()===""?NaN:Number(v));
  const [rf,b,e,kd,t,ew]=vals;
  if(vals.some(v=>!Number.isFinite(v))||rf<0||rf>20||b<0||b>4||e<1||e>15||kd<0||kd>30||t<0||t>60||ew<0||ew>100){
   setOfflineError("Inserisci tutti e sei i parametri verificati: risk-free 0–20%, beta 0–4, ERP 1–15%, costo debito 0–30%, imposte 0–60%, peso equity 0–100%.");return;
  }
  const ke=rf+b*e;
  const value=ew/100*ke+(1-ew/100)*kd*(1-t/100);
  if(value<2||value>35){setOfflineError("WACC fuori dall'intervallo di plausibilità 2–35%. Controlla unità e fonti.");return;}
  const rounded=Number(value.toFixed(3));
  setWacc(String(rounded));setOfflineResult({wacc:rounded,ke});setWaccResearch(null);setResult(null);
 };
 const [waccResearch,setWaccResearch]=useState(null);
 const [researchBusy,setResearchBusy]=useState(false);
 const [researchError,setResearchError]=useState("");
 const [result,setResult]=useState(null);
 const [error,setError]=useState("");
 const reset=()=>{setOverrides({});setWaccResearch(null);setResearchError("");setOfflineInputs({riskFree:"",beta:"",erp:"",costDebt:"",tax:"",equityWeight:""});setOfflineResult(null);setOfflineError("");setResult(null);setError("");};
 const runResearch=async()=>{
  setResearchBusy(true);setResearchError("");setWaccResearch(null);
  try{
   const symbol=String(analysisData?.quote?.ticker||analysisData?.quote?.symbol||"").toUpperCase();
   const found=await researchWacc({symbol,currency});
   setWaccResearch(found);setOfflineResult(null);setWacc(String(found.wacc));setResult(null);
  }catch(e){setResearchError(e.message||"Ricerca WACC non riuscita.");}
  finally{setResearchBusy(false);}
 };
 const muted=dark?"text-slate-400":"text-slate-500";
 const field=dark?"bg-slate-950 border-slate-700":"bg-white border-slate-300";
 const calculate=(e)=>{
  e.preventDefault();setError("");setResult(null);
  try{
   const baseFcf=num(fcfBase),growthRate=pct(fcfGrowth);
   if(!Number.isFinite(baseFcf)||baseFcf<=0||!Number.isFinite(growthRate)||growthRate<=-1)throw new Error("Inserisci un FCF base positivo e una crescita FCF superiore a -100%.");
   const flows=Array.from({length:5},(_,i)=>baseFcf*(1+growthRate)**(i+1));
   const w=pct(wacc),g=pct(growth),debt=num(netDebt),diluted=num(shares),current=num(price);
   if(!Number.isFinite(w)||!Number.isFinite(g)||w<=0||g<0||w<=g)throw new Error("WACC deve essere positivo e superiore alla crescita terminale.");
   if(debt===null||!Number.isFinite(debt)||diluted===null||!Number.isFinite(diluted)||diluted<=0)throw new Error("Debito netto e azioni diluite sono obbligatori e devono essere coerenti nelle unità.");
   const scenarios=[
    {name:"bear",probability:.25,freeCashFlows:flows.map(x=>x*.85),wacc:w+.02,terminalGrowth:Math.max(0,g-.01)},
    {name:"base",probability:.5,freeCashFlows:flows,wacc:w,terminalGrowth:g},
    {name:"bull",probability:.25,freeCashFlows:flows.map(x=>x*1.15),wacc:Math.max(w-.01,g+.005),terminalGrowth:Math.min(g+.005,Math.max(w-.01,g+.005)-.005)}
   ];
   setResult(valueScenarios({scenarios,netDebt:debt,dilutedShares:diluted,currentPrice:current}));
  }catch(err){setError(err.message);}
 };
 return <section className="rounded-xl border p-4 space-y-4">
  <div className="space-y-2"><h2 className="text-lg font-semibold">Fair Value · DCF a scenari</h2>
   <p className={`text-xs ${muted}`}>Compilazione automatica dai bilanci caricati. FCF: mediana dei FCF positivi degli ultimi 3 esercizi; crescita: CAGR storico con almeno 3 osservazioni, limitato tra −5% e +12%, altrimenti 5%. WACC non precompilato: deve essere stimato con parametri verificati (anche senza Gemini). Crescita terminale 2,5% è un’ipotesi standard modificabile, non un dato di mercato.</p>
   <p className={`text-xs ${muted}`}>Ultimo esercizio: {latestFcfYear??"n.d."} · Fonte: {analysisData?.fin?.source||"non specificata"} · Debito netto: {Number.isFinite(debt)?"disponibile":"mancante"}.</p>
   <p className="text-xs text-amber-600">Azioni: {Number.isFinite(impliedShares)?"stima da capitalizzazione ÷ prezzo (NON azioni diluite certificate); verificare con il bilancio":"dato non disponibile: inserire il numero verificato"}. I dati mancanti non vengono inventati. Importi finanziari in milioni, capitalizzazione in unità intere, stessa valuta.</p>
   <details className="rounded-lg border p-3 space-y-3" open>
    <summary className="cursor-pointer font-semibold text-sm">Calcola WACC senza Gemini (gratuito, offline)</summary>
    <p className={`text-xs ${muted} mt-2`}>Inserisci i sei parametri ricavati da fonti attendibili (Investing.com, bilanci ufficiali, BCE/Fed, Damodaran). Il calcolo è locale, senza API né quota Gemini. Non vengono inventati dati. Percentuali in punti percentuali.</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
     {[
      ["riskFree","Risk-free (%)","es. rendimento governativo"],
      ["beta","Beta (numero)","beta levered verificato"],
      ["erp","Equity risk premium (%)","ERP coerente con il mercato"],
      ["costDebt","Costo del debito (%)","rendimento del debito"],
      ["tax","Aliquota fiscale (%)","aliquota marginale"],
      ["equityWeight","Peso equity (%)","E/(D+E) × 100"]
     ].map(([key,label,hint])=><label key={key} className="text-xs space-y-1">{label}<input type="number" step="any" inputMode="decimal" value={offlineInputs[key]} onChange={e=>setOffline(key,e.target.value)} placeholder={hint} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>)}
    </div>
    <button type="button" onClick={computeOffline} className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs mt-3">Calcola WACC locale e applica</button>
    {offlineError&&<p role="alert" className="text-xs text-red-500 mt-2">{offlineError}</p>}
    {offlineResult&&<p role="status" className="text-xs mt-2">WACC {offlineResult.wacc.toFixed(2)}% · Costo equity {offlineResult.ke.toFixed(2)}%. Valori derivati dai parametri inseriti dall’utente, non verificati automaticamente.</p>}
    <p className={`text-xs ${muted} mt-2`}>Formula: Ke = Rf + beta × ERP; WACC = peso equity × Ke + peso debito × Kd × (1 − aliquota). Non adatto automaticamente a banche e assicurazioni.</p>
   </details>
   <div className="flex flex-wrap gap-2"><button type="button" disabled={researchBusy} onClick={runResearch} className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs disabled:opacity-50">{researchBusy?"Ricerca Gemini in corso…":"Stima WACC con Gemini e fonti web"}</button></div>
   {researchError&&<p role="alert" className="text-xs text-amber-600">{researchError} Il WACC non è stato modificato.</p>}
   {waccResearch&&<div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-semibold">WACC calcolato: {waccResearch.wacc.toFixed(2)}% · Costo equity: {waccResearch.costOfEquity.toFixed(2)}%</p><p className="text-xs">Ricerca assistita da Gemini. Verificare sempre fonti, periodo e coerenza del modello prima di investire.</p><ul className="text-xs space-y-1">{Object.entries(waccResearch.inputs).map(([name,item])=><li key={name}>{name}: {item.value} · {item.date} · <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">Fonte</a></li>)}</ul></div>}
   <button type="button" onClick={reset} className="rounded-lg border px-3 py-2 text-xs">Ripristina valori suggeriti</button>
  </div>
  <form onSubmit={calculate} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
   <label className="text-xs space-y-1">FCF ultimo esercizio (milioni)<input required type="number" min="0.000001" step="any" value={fcfBase} onChange={e=>setFcfBase(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">Crescita FCF annua (%)<input required type="number" step="0.1" value={fcfGrowth} onChange={e=>setFcfGrowth(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">WACC (%) — da stima o inserimento verificato<input required type="number" step="0.1" value={wacc} onChange={e=>setWacc(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">Crescita terminale (%)<input required type="number" step="0.1" value={growth} onChange={e=>setGrowth(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">Debito netto (milioni)<input required type="number" step="any" value={netDebt} onChange={e=>setNetDebt(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">Azioni diluite (milioni)<input required type="number" min="0.000001" step="any" value={shares} onChange={e=>setShares(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">Prezzo attuale (opzionale)<input type="number" min="0" step="any" value={price} onChange={e=>setPrice(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <button className="col-span-2 sm:col-span-3 rounded-lg bg-emerald-600 text-white p-2 text-sm font-semibold">Calcola fair value</button>
  </form>
  {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
  {result&&<div className="space-y-3">
   <div className="grid grid-cols-2 gap-2">
    <div className="rounded-lg border border-emerald-500/30 p-3"><div className={`text-xs ${muted}`}>Fair value ponderato per azione {currency?`(${currency})`:""}</div><div className="text-2xl font-bold">{money(result.weightedFairValue,currency)}</div></div>
    <div className="rounded-lg border p-3"><div className={`text-xs ${muted}`}>Margine di sicurezza / upside</div><div className="text-2xl font-bold">{result.marginOfSafety===null?"n.d.":(result.marginOfSafety*100).toFixed(1)+"%"}</div></div>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Scenario</th><th>Probabilità</th><th>WACC</th><th>g terminale</th><th>Fair value</th></tr></thead><tbody>{result.scenarios.map(s=><tr key={s.name} className="border-b border-slate-500/20"><td className="py-2 capitalize">{s.name}</td><td>{(s.probability*100).toFixed(0)}%</td><td>{(s.wacc*100).toFixed(1)}%</td><td>{(s.terminalGrowth*100).toFixed(1)}%</td><td className="font-semibold">{money(s.valuePerShare,currency)}</td></tr>)}</tbody></table></div>
   <p className={`text-xs ${muted}`}>Scenari convenzionali: Bear = FCF −15%, WACC +2 punti, g −1 punto; Base = ipotesi inserite; Bull = FCF +15%, WACC −1 punto e g +0,5 punti (vincolato a WACC &gt; g). Probabilità 25/50/25. Il risultato è estremamente sensibile alle ipotesi e non è una previsione né un segnale automatico.</p>
  </div>}
 </section>;
}
