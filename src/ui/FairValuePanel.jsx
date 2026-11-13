import { useState } from "react";
import { valueScenarios } from "../modules/fair-value.js";

const num=(v)=>v.trim()===""?null:Number(v);
const pct=(v)=>Number(v)/100;
const money=(v,currency)=>{if(!Number.isFinite(v))return "n.d.";try{return currency?new Intl.NumberFormat("it-IT",{style:"currency",currency,maximumFractionDigits:2}).format(v):v.toLocaleString("it-IT",{maximumFractionDigits:2});}catch{return v.toLocaleString("it-IT",{maximumFractionDigits:2});}};

export default function FairValuePanel({dark=false,analysisData=null}){
 const currency=analysisData?.quote?.currency||"";
 const latestAnnual=analysisData?.fin?.annual?.at(-1);
 const latestFcf=Number.isFinite(latestAnnual?.fcf)&&latestAnnual.fcf>0?latestAnnual.fcf:null;
 const latestFcfYear=Number.isFinite(latestAnnual?.fcf)?latestAnnual.y:null;
 const [fcfBase,setFcfBase]=useState(()=>Number.isFinite(latestFcf)?String(latestFcf):"");
 const [fcfGrowth,setFcfGrowth]=useState("5");
 const [wacc,setWacc]=useState("9");
 const [growth,setGrowth]=useState("2.5");
 const [netDebt,setNetDebt]=useState(()=>Number.isFinite(analysisData?.fin?.balance?.netDebt)?String(analysisData.fin.balance.netDebt):"");
 const [shares,setShares]=useState("");
 const [price,setPrice]=useState(()=>Number.isFinite(analysisData?.quote?.price)?String(analysisData.quote.price):"");
 const [result,setResult]=useState(null);
 const [error,setError]=useState("");
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
  <div><h2 className="text-lg font-semibold">Fair Value · DCF a scenari</h2><p className={`text-xs ${muted}`}>Modello trasparente con ipotesi modificabili. FCF base {latestFcfYear?`precompilato dall’esercizio ${latestFcfYear}`:"da inserire manualmente se l’ultimo FCF non è positivo/disponibile"}; debito netto e prezzo provengono dall’analisi del titolo quando presenti. Verifica periodo, valuta e unità. Le proiezioni a 5 anni derivano dalla crescita FCF da te scelta. Le azioni diluite vanno inserite manualmente in milioni.</p></div>
  <form onSubmit={calculate} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
   <label className="text-xs space-y-1">FCF ultimo esercizio (milioni)<input required type="number" min="0.000001" step="any" value={fcfBase} onChange={e=>setFcfBase(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">Crescita FCF annua (%)<input required type="number" step="0.1" value={fcfGrowth} onChange={e=>setFcfGrowth(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
   <label className="text-xs space-y-1">WACC (%)<input required type="number" step="0.1" value={wacc} onChange={e=>setWacc(e.target.value)} className={`w-full rounded-lg border p-2 bg-transparent text-sm ${field}`}/></label>
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
