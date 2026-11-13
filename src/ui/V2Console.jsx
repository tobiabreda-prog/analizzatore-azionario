import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Download, Upload, AlertTriangle } from "lucide-react";
import FairValuePanel from "./FairValuePanel.jsx";

const KEY = "aa2_fair_value_watchlist_v1";
const cleanSymbol = (value) => String(value ?? "").trim().toUpperCase();
const validSymbol = (symbol) => /^[A-Z0-9][A-Z0-9.^:_-]{0,29}$/.test(symbol);
const csvEscape = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
const decodeCsv = (text) => {
 const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
 if (lines[0]?.trim() !== '"symbol"') throw new Error("Formato non riconosciuto: usa un CSV esportato dalla watchlist.");
 const symbols = lines.slice(1).map((line) => {
  if (!/^"(?:[^"]|"")*"$/.test(line)) throw new Error("Riga CSV non valida.");
  return cleanSymbol(line.slice(1,-1).replace(/""/g,'"'));
 });
 if (!symbols.every(validSymbol) || new Set(symbols).size !== symbols.length || symbols.length > 200)
  throw new Error("Ticker non validi, duplicati o oltre il limite di 200 titoli.");
 return symbols;
};
const download = (name, text) => {
 const url = URL.createObjectURL(new Blob([text], {type:"text/csv;charset=utf-8"}));
 const link = document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export default function V2Console({dark=false,onBack=()=>{},onSettings=()=>{},analysisData=null,onSelectSymbol=()=>{},initialTab="watchlist"}){
 const [symbols,setSymbols] = useState([]);
 const [input,setInput] = useState("");
 const [tab,setTab] = useState(initialTab);
 const [loaded,setLoaded] = useState(false);
 const [error,setError] = useState("");
 const [notice,setNotice] = useState("");
 const current = cleanSymbol(analysisData?.quote?.ticker || analysisData?.quote?.symbol);
 const muted = dark?"text-slate-400":"text-slate-500";
 const card = dark?"bg-slate-900 border-slate-700":"bg-white border-slate-200";
 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(KEY)||"[]");
   if(Array.isArray(saved))setSymbols(saved.filter(validSymbol).slice(0,200));
  }catch{setError("Impossibile leggere la watchlist salvata.");}
  setLoaded(true);
 },[]);
 const persist=(next)=>{
  localStorage.setItem(KEY,JSON.stringify(next));
  setSymbols(next);
 };
 const add=(e)=>{
  e.preventDefault();setError("");setNotice("");
  const symbol=cleanSymbol(input);
  if(!validSymbol(symbol)){setError("Inserisci un ticker valido, per esempio ENI.MI oppure AAPL.");return;}
  if(symbols.includes(symbol)){setError("Questo titolo è già nella watchlist.");return;}
  if(symbols.length>=200){setError("Limite massimo di 200 titoli.");return;}
  try{persist([...symbols,symbol]);setInput("");setNotice(symbol+" aggiunto alla watchlist.");}
  catch{setError("Salvataggio locale non disponibile.");}
 };
 const remove=(symbol)=>{
  setError("");setNotice("");
  try{persist(symbols.filter(x=>x!==symbol));setNotice(symbol+" rimosso.");}
  catch{setError("Impossibile salvare la modifica.");}
 };
 const saveCurrent=()=>{
  if(!current)return;
  setError("");setNotice("");
  try{
   if(!symbols.includes(current))persist([...symbols,current].slice(0,200));
   setNotice(current+" presente nella watchlist.");
   setTab("watchlist");
  }catch{setError("Salvataggio locale non disponibile.");}
 };
 const exportCsv=()=>download("watchlist-fair-value.csv",["symbol",...symbols.map(csvEscape)].map((line,i)=>i===0?'"symbol"':line).join("\r\n")+"\r\n");
 const importCsv=async(e)=>{
  const file=e.target.files?.[0];if(!file)return;
  setError("");setNotice("");
  try{
   const incoming=decodeCsv(await file.text());
   if(symbols.length&&!window.confirm("Sostituire la watchlist attuale con "+incoming.length+" titoli del CSV?"))return;
   persist(incoming);setNotice("Watchlist ripristinata: "+incoming.length+" titoli.");
  }catch(err){setError("Ripristino CSV non riuscito: "+err.message);}
  finally{e.target.value="";}
 };
 return <div className={`workspace-shell min-h-screen ${dark?"bg-slate-950 text-slate-100 theme-dark":"bg-slate-50 text-slate-900 theme-light"}`}>
  <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
   <header className="flex flex-wrap justify-between items-center gap-3">
    <div className="flex items-center gap-3"><img src="/icon.svg" alt="" className="workspace-brand-icon"/><div><div className="text-xs uppercase tracking-wider text-emerald-500 font-bold">Analisi azionaria</div><h1 className="text-2xl font-bold">Watchlist + Verifica DCF</h1><p className={`text-xs ${muted}`}>Test automatico con fonti: nessun prezzo obiettivo inventato</p></div></div>
    <div className="flex gap-2"><button type="button" onClick={onSettings} className={`rounded-lg border px-3 py-2 text-sm ${card}`}>Impostazioni API</button><button type="button" onClick={onBack} className={`rounded-lg border px-3 py-2 flex gap-2 items-center text-sm ${card}`}><ArrowLeft size={16}/>Analisi titolo</button></div>
   </header>
   <nav className="flex gap-2" aria-label="Sezioni"><button type="button" onClick={()=>setTab("valuation")} className={`rounded-lg px-4 py-2 text-sm ${tab==="valuation"?"bg-emerald-600 text-white":card+" border"}`}>Verifica DCF</button><button type="button" onClick={()=>setTab("watchlist")} className={`rounded-lg px-4 py-2 text-sm ${tab==="watchlist"?"bg-emerald-600 text-white":card+" border"}`}>Watchlist ({symbols.length})</button></nav>
   {error&&<div role="alert" className="rounded-lg border border-amber-500/50 p-3 text-sm flex gap-2"><AlertTriangle size={17}/>{error}</div>}
   {notice&&<div role="status" className="rounded-lg border border-emerald-500/50 p-3 text-sm">{notice}</div>}
   {tab==="valuation"&&<div className="space-y-3">
    <p className={`text-sm ${muted}`}>Titolo selezionato: <strong>{current||"nessuno"}</strong>. La verifica DCF automatica analizza i dati senza inserimenti manuali. Quando i dati sono insufficienti non pubblica un Fair Value. Verifica sempre data e fonte: non è una quotazione in tempo reale.</p>
    {current&&<button type="button" onClick={saveCurrent} className="rounded-lg border px-3 py-2 text-sm flex gap-2 items-center"><Plus size={15}/>Aggiungi {current} alla watchlist</button>}
    <FairValuePanel key={current||"no-symbol"} dark={dark} analysisData={analysisData}/>
   </div>}
   {tab==="watchlist"&&<section className={`rounded-xl border p-4 space-y-4 ${card}`}>
    <div><h2 className="text-lg font-semibold">Watchlist essenziale</h2><p className={`text-xs ${muted}`}>Tocca un ticker per aprire il report, oppure avvia direttamente il test DCF automatico. In caso di dati mancanti, non viene inventato alcun valore.</p></div>
    <form onSubmit={add} className="flex flex-wrap gap-2"><input aria-label="Ticker" value={input} onChange={e=>setInput(e.target.value)} placeholder="es. AAPL o ENI.MI" className="min-w-0 flex-1 rounded-lg border bg-transparent p-2 text-sm" required/><button type="submit" className="rounded-lg bg-emerald-600 text-white px-4 py-2 flex items-center gap-2 text-sm"><Plus size={16}/>Aggiungi</button></form>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={exportCsv} className="rounded-lg border px-3 py-2 text-sm flex gap-2 items-center"><Download size={15}/>Esporta CSV</button><label className="rounded-lg border px-3 py-2 text-sm flex gap-2 items-center cursor-pointer"><Upload size={15}/>Ripristina CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv}/></label></div>
    {!loaded?<p className={muted}>Caricamento watchlist…</p>:symbols.length===0?<p className={muted}>Nessun titolo salvato.</p>:<ul className="divide-y divide-slate-500/20">{symbols.map(symbol=><li key={symbol} className="flex items-center justify-between py-3 gap-2"><button type="button" onClick={()=>onSelectSymbol(symbol)} aria-label={"Analizza "+symbol} className="font-semibold text-left flex-1 min-w-0 rounded-lg px-2 py-2 hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"><span className="underline decoration-emerald-500/50">{symbol}</span><span className={`block text-xs font-normal ${muted}`}>Apri report</span></button><button type="button" onClick={()=>onSelectSymbol(symbol,"valuation")} aria-label={"Test DCF automatico "+symbol} className="rounded-lg border border-emerald-600/40 px-2 py-2 text-xs text-emerald-600">Test DCF auto</button><button type="button" onClick={()=>remove(symbol)} aria-label={"Rimuovi "+symbol} className="text-red-500 flex gap-1 items-center text-sm"><Trash2 size={16}/>Rimuovi</button></li>)}</ul>}
    <p className={`text-xs ${muted}`}>Il backup CSV contiene soltanto i ticker della watchlist. I precedenti movimenti di portafoglio restano nei dati locali della vecchia console, ma non sono mostrati qui.</p>
   </section>}
  </div>
 </div>;
}
