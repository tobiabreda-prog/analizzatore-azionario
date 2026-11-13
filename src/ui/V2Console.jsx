import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Wallet, CalendarDays, ShieldCheck, AlertTriangle, Trash2, Download, Upload, LineChart, RefreshCw } from "lucide-react";
import { loadAlphaVantageDaily, getAlphaVantageUsage } from "../providers/alphavantage.js";
import { loadFredObservations } from "../providers/fred.js";
import { loadEcbSeries } from "../providers/ecb.js";
import { classifyMacroRegime } from "../core/macro-regime.js";
import { buildPositions } from "../modules/portfolio.js";
import { buildCorporateCalendar, normalizeDividend, normalizeEarningsEvent } from "../modules/earnings-dividends.js";
import { parseTradeCsv, serializeTradesCsv } from "../modules/trade-csv.js";
import { sma, ema, rsi } from "../modules/technical-indicators.js";
import FairValuePanel from "./FairValuePanel.jsx";
import { runLongOnlyBacktest } from "../modules/backtest.js";
import { buildSmaCrossSignals } from "../modules/strategies.js";
import { analyzeRisk } from "../core/risk-engine.js";

const STORE="aa2_workspace_v1";
const today=()=>new Date().toISOString().slice(0,10);
const money=(v,c="EUR")=>Number.isFinite(v)?new Intl.NumberFormat("it-IT",{style:"currency",currency:c,maximumFractionDigits:2}).format(v):"n.d.";
const initial=()=>({trades:[],earnings:[],dividends:[]});

export default function V2Console({dark=false,onBack=()=>{},analysisData=null}){
 const [data,setData]=useState(initial);
 const [tab,setTab]=useState("portfolio");
 const [error,setError]=useState("");
 const [ticker,setTicker]=useState("");
 const [side,setSide]=useState("BUY");
 const [quantity,setQuantity]=useState("1");
 const [price,setPrice]=useState("");
 const [currency,setCurrency]=useState("EUR");
 const [fees,setFees]=useState("0");
 const [tradeDate,setTradeDate]=useState(today());
 const [eventType,setEventType]=useState("earnings");
 const [eventDate,setEventDate]=useState(today());
 const [eventSource,setEventSource]=useState("");
 const [epsEstimate,setEpsEstimate]=useState("");
 const [epsActual,setEpsActual]=useState("");
 const [dividendAmount,setDividendAmount]=useState("");
 const [dividendCurrency,setDividendCurrency]=useState("EUR");
 const [eventTicker,setEventTicker]=useState("");
 const [loaded,setLoaded]=useState(false);
 const [marketTicker,setMarketTicker]=useState("AAPL");
 const [marketApiKey,setMarketApiKey]=useState("");
 const [marketRows,setMarketRows]=useState([]);
 const [marketHistory,setMarketHistory]=useState([]);
 const [backtestResult,setBacktestResult]=useState(null);
 const [backtestError,setBacktestError]=useState("");
 const [initialCapital,setInitialCapital]=useState("10000");
 const [feeBps,setFeeBps]=useState("0");
 const [fixedFee,setFixedFee]=useState("9.95");
 const [slippageBps,setSlippageBps]=useState("5");
 const [marketIndicators,setMarketIndicators]=useState(null);
 const [marketError,setMarketError]=useState("");
 const [marketLoading,setMarketLoading]=useState(false);
 const [marketUsage,setMarketUsage]=useState(()=>getAlphaVantageUsage());
 const [fredApiKey,setFredApiKey]=useState("");
 const [macroRows,setMacroRows]=useState([]);
 const [macroError,setMacroError]=useState("");
 const [macroLoading,setMacroLoading]=useState(false);
 const darkClass=dark?"bg-slate-950 text-slate-100":"bg-slate-50 text-slate-900";
 const card=dark?"bg-slate-900 border-slate-700":"bg-white border-slate-200";
 const muted=dark?"text-slate-400":"text-slate-500";
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(STORE)||"null");if(saved&&typeof saved==="object")setData({...initial(),...saved});}catch{}setLoaded(true);},[]);
 useEffect(()=>{if(loaded){try{localStorage.setItem(STORE,JSON.stringify(data));}catch{setError("Memoria locale non disponibile: esporta i dati prima di chiudere la sessione.");}}},[data,loaded]);
 const positions=useMemo(()=>{try{return {rows:buildPositions(data.trades),error:""};}catch(e){return {rows:[],error:e.message};}},[data.trades]);
 const autoEarnings=useMemo(()=>{const e=analysisData?.events?.earnings;if(!e?.nextDate||!analysisData?.quote?.ticker)return [];try{return [{...normalizeEarningsEvent({symbol:analysisData.quote.ticker,date:e.nextDate,epsEstimate:e.epsEstimate,revenueEstimate:e.revenueEstimate,source:analysisData.events.source||"Yahoo Finance",status:"unconfirmed"}),origin:"auto"}];}catch{return []; }},[analysisData]);
 const events=useMemo(()=>buildCorporateCalendar({earnings:[...autoEarnings,...data.earnings],dividends:data.dividends}),[autoEarnings,data.earnings,data.dividends]);
 const macroRegime=useMemo(()=>classifyMacroRegime(macroRows),[macroRows]);
 const addTrade=(e)=>{e.preventDefault();setError("");try{const trade={id:crypto.randomUUID(),symbol:ticker,side,quantity:Number(quantity),price:Number(price),currency,date:tradeDate,fees:Number(fees)};const next=[...data.trades,trade];buildPositions(next);setData({...data,trades:next});setTicker("");setPrice("");}catch(err){setError(err.message);}};
 const addEvent=(e)=>{e.preventDefault();setError("");try{if(!eventSource.trim()||!eventTicker.trim())throw new Error("Titolo e fonte del dato sono obbligatori");if(eventType==="earnings"){const event=normalizeEarningsEvent({symbol:eventTicker,date:eventDate,epsEstimate:epsEstimate===""?null:Number(epsEstimate),epsActual:epsActual===""?null:Number(epsActual),source:eventSource.trim(),status:"unconfirmed"});setData({...data,earnings:[...data.earnings,event]});}else{const event=normalizeDividend({symbol:eventTicker,amount:Number(dividendAmount),currency:dividendCurrency,exDate:eventDate,source:eventSource.trim(),status:"unconfirmed"});setData({...data,dividends:[...data.dividends,event]});}setEventTicker("");setEventSource("");setEpsEstimate("");setEpsActual("");setDividendAmount("");}catch(err){setError(err.message);}};
 const removeTrade=(id)=>setData({...data,trades:data.trades.filter(t=>t.id!==id)});
 const loadMarketHistory=async(e)=>{e.preventDefault();setMarketError("");setMarketLoading(true);try{const result=await loadAlphaVantageDaily({symbol:marketTicker.trim().toUpperCase(),apiKey:marketApiKey});setMarketRows(result.rows.slice(-10).reverse());setMarketHistory(result.rows);setBacktestResult(null);setBacktestError("");const closes=result.rows.map(x=>x.close);setMarketIndicators({sma20:sma(closes,20),sma50:sma(closes,50),ema20:ema(closes,20),rsi14:rsi(closes,14),observations:closes.length,asOf:result.rows.at(-1)?.date??null});setMarketUsage(getAlphaVantageUsage());}catch(err){setMarketError(err.message);setMarketUsage(getAlphaVantageUsage());}finally{setMarketLoading(false);}};
 const runBacktest=()=>{setBacktestError("");setBacktestResult(null);try{const signals=buildSmaCrossSignals(marketHistory,20,50);const result=runLongOnlyBacktest({bars:marketHistory.map(({date,close})=>({date,close})),signals,initialCapital:Number(initialCapital),feeBps:Number(feeBps),fixedFee:Number(fixedFee),slippageBps:Number(slippageBps)});const equity=result.curve.map(x=>x.equity);const returns=equity.slice(1).map((v,i)=>v/equity[i]-1);setBacktestResult({...result,risk:analyzeRisk({returns,equityCurve:equity})});}catch(err){setBacktestError(err.message);}};
 const loadMacro=async(e)=>{e.preventDefault();setMacroError("");setMacroLoading(true);const series=[
  {id:"FEDFUNDS",label:"Fed Funds rate",unit:"%"},
  {id:"CPIAUCSL",label:"US CPI index",unit:"index"},
  {id:"PCEPI",label:"US PCE price index",unit:"index"},
  {id:"DGS10",label:"US Treasury 10Y",unit:"%"},
  {id:"DGS2",label:"US Treasury 2Y",unit:"%"},
  {id:"T10Y2Y",label:"US 10Y–2Y spread",unit:"%"},
  {id:"VIXCLS",label:"VIX volatility",unit:"index"},
  {id:"BAMLH0A0HYM2",label:"US high-yield spread",unit:"%"},
  {id:"DCOILWTICO",label:"WTI crude oil",unit:"USD/barrel"},
  {id:"GOLDAMGBD228NLBM",label:"Gold AM fixing",unit:"USD/oz"},
  {id:"IRLTLT01ITM156N",label:"Italy 10Y government yield (OECD)",unit:"%"},
  {id:"IRLTLT01DEM156N",label:"Germany 10Y government yield (OECD)",unit:"%"},
  {id:"EXR.D.USD.EUR.SP00.A",label:"ECB USD per EUR",unit:"USD/EUR",provider:"ECB",flowRef:"EXR",seriesKey:"D.USD.EUR.SP00.A"},
  {id:"FM.D.U2.EUR.4F.KR.DFR.LEV",label:"ECB deposit facility rate",unit:"%",provider:"ECB",flowRef:"FM",seriesKey:"D.U2.EUR.4F.KR.DFR.LEV"}
 ];const results=await Promise.allSettled(series.map(async s=>{const rows=s.provider==="ECB"?await loadEcbSeries({flowRef:s.flowRef,seriesKey:s.seriesKey}):await loadFredObservations({seriesId:s.id,apiKey:fredApiKey});return {...s,...(rows.at(-1)??{}),status:rows.length?"ok":"empty"};}));const rows=results.map((r,i)=>r.status==="fulfilled"?r.value:{...series[i],status:"error",error:r.reason?.message??"Errore provider"});const it=rows.find(x=>x.id==="IRLTLT01ITM156N"),de=rows.find(x=>x.id==="IRLTLT01DEM156N");if(it?.status==="ok"&&de?.status==="ok"&&it.date===de.date)rows.push({id:"BTP_BUND_PROXY",label:"Spread 10Y Italia-Germania (OECD monthly)",unit:"pp",value:it.value-de.value,date:it.date,source:"FRED/OECD",status:"ok"});setMacroRows(rows);setMacroLoading(false);};
 const importTradeCsv=(e)=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const incoming=parseTradeCsv(String(reader.result));const next=[...data.trades,...incoming];buildPositions(next);setData({...data,trades:next});setError("Importati "+incoming.length+" movimenti CSV. Controlla eventuali duplicati prima di procedere.");}catch(err){setError("Importazione CSV non riuscita: "+err.message);}finally{e.target.value="";}};reader.onerror=()=>setError("Impossibile leggere il CSV.");reader.readAsText(file);};
 const exportTradesCsv=()=>{const blob=new Blob([serializeTradesCsv(data.trades)],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="movimenti-portafoglio-"+today()+".csv";a.click();URL.revokeObjectURL(url);};
 const exportBackup=()=>{const blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="analizzatore-azionario-backup-"+today()+".json";a.click();URL.revokeObjectURL(url);};
 const importBackup=(e)=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));const incoming=parsed?.data??parsed;if(!incoming||!Array.isArray(incoming.trades)||!Array.isArray(incoming.earnings)||!Array.isArray(incoming.dividends))throw new Error("Formato backup non riconosciuto");buildPositions(incoming.trades);incoming.earnings.forEach(normalizeEarningsEvent);incoming.dividends.forEach(normalizeDividend);setData(incoming);setError("Backup importato. Verifica i dati e conserva anche una copia del file originale.");}catch(err){setError("Importazione non riuscita: "+err.message);}finally{e.target.value="";}};reader.onerror=()=>setError("Impossibile leggere il file selezionato.");reader.readAsText(file);};
 const removeEvent=(index)=>{const item=events[index];if(!item)return;const key=item.type==="earnings"?"earnings":"dividends";const list=data[key];const match=list.findIndex(x=>x===item.payload);if(match>=0)setData({...data,[key]:list.filter((_,i)=>i!==match)});};
 const tabButton=(id,label,Icon)=><button onClick={()=>setTab(id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${tab===id?"bg-emerald-600 text-white":card+" border"}`}><Icon size={16}/>{label}</button>;
 return <div className={`min-h-screen ${darkClass}`}><div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
  <div className="flex items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-wider text-emerald-500 font-bold">Versione 2.0 · workspace</div><h1 className="text-2xl font-bold">Console finanziaria</h1><p className={`text-sm ${muted}`}>Portafoglio, prezzi giornalieri e indicatori macro · dati locali</p></div><button onClick={onBack} className={`rounded-lg border px-3 py-2 flex gap-2 items-center text-sm ${card}`}><ArrowLeft size={16}/>Versione attuale</button></div>
  <div className="flex flex-wrap gap-2">{tabButton("portfolio","Portafoglio",Wallet)}{tabButton("market","Mercati",LineChart)}{tabButton("macro","Macro",LineChart)}{tabButton("calendar","Earnings & dividendi",CalendarDays)}{tabButton("quality","Qualità dati",ShieldCheck)}{tabButton("valuation","Fair Value",LineChart)}{tabButton("backtest","Backtest",LineChart)}</div>
  {error&&<div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex gap-2"><AlertTriangle size={17}/>{error}</div>}
  {tab==="valuation"&&<FairValuePanel dark={dark} analysisData={analysisData}/>}
  {tab==="backtest"&&<section className={`rounded-xl border p-4 space-y-4 ${card}`}>
   <div><h2 className="text-lg font-semibold">Backtest SMA 20/50</h2><p className={`text-xs ${muted}`}>Simulazione long-only sullo storico daily caricato nella scheda Mercati. Il segnale usa la chiusura del giorno t ed è eseguito alla chiusura del giorno successivo. Commissione fissa preimpostata a 9,95 per lato: modifica in base a mercato e intermediario.</p></div>
   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <label className="text-xs space-y-1">Capitale iniziale<input type="number" min="500" step="any" value={initialCapital} onChange={e=>setInitialCapital(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Commissione fissa per lato (valuta titolo)<input type="number" min="0" step="0.01" value={fixedFee} onChange={e=>setFixedFee(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Commissione variabile (bps)<input type="number" min="0" step="1" value={feeBps} onChange={e=>setFeeBps(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Slippage per lato (bps)<input type="number" min="0" step="1" value={slippageBps} onChange={e=>setSlippageBps(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
   </div>
   <p className={`text-xs ${muted}`}>Serie caricata: {marketTicker} · {marketHistory.length} barre daily · ultima osservazione {marketHistory.at(-1)?.date||"n.d."}. Prima carica lo storico nella scheda Mercati (Alpha Vantage).</p>
   <button type="button" disabled={marketHistory.length<50} onClick={runBacktest} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-40">Esegui backtest</button>
   {backtestError&&<p role="alert" className="text-sm text-red-500">{backtestError}</p>}
   {backtestResult&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {[[ "Valore finale",backtestResult.finalValue.toLocaleString("it-IT",{maximumFractionDigits:2}) ],[ "Rendimento totale",(backtestResult.totalReturn*100).toFixed(2)+"%" ],[ "CAGR",backtestResult.cagr===null?"n.d.":(backtestResult.cagr*100).toFixed(2)+"%" ],[ "Max drawdown",(backtestResult.maxDrawdown*100).toFixed(2)+"%" ],[ "Volatilità annualizzata",backtestResult.annualizedVolatility===null?"n.d.":(backtestResult.annualizedVolatility*100).toFixed(2)+"%" ],[ "Sharpe (rf=0)",backtestResult.risk?.sharpe===null||backtestResult.risk?.sharpe===undefined?"n.d.":backtestResult.risk.sharpe.toFixed(2) ],[ "Sortino (rf=0)",backtestResult.risk?.sortino===null||backtestResult.risk?.sortino===undefined?"n.d.":backtestResult.risk.sortino.toFixed(2) ],[ "Operazioni",String(backtestResult.tradeCount) ]].map(([label,value])=><div key={label} className="rounded-lg border border-slate-500/20 p-3"><div className={`text-xs ${muted}`}>{label}</div><div className="font-semibold text-lg">{value}</div></div>)}
   </div>}
   <p className={`text-xs ${muted}`}>Limiti essenziali: strategia SMA 20/50 semplificata; nessun benchmark, dividendo, split, FX, imposte, costi specifici dell’intermediario o titoli delistati. Dati non point-in-time: restano possibili survivorship bias e differenze di qualità del feed. Non usare il risultato come previsione o prova di rendimento futuro.</p>
  </section>}
  {tab==="market"&&<section className={`rounded-xl border p-4 space-y-4 ${card}`}><div><h2 className="text-lg font-semibold">Prezzi storici giornalieri</h2><p className={`text-xs ${muted}`}>Provider Alpha Vantage · dati daily, non realtime. Il piano gratuito ha limiti di chiamata e copertura; il risultato dipende dal mercato e dal ticker supportato.</p></div>
   <form onSubmit={loadMarketHistory} className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-xs space-y-1">Ticker<input required value={marketTicker} onChange={e=>setMarketTicker(e.target.value.toUpperCase())} className="w-full rounded-lg border p-2 bg-transparent text-sm" placeholder="AAPL"/></label><label className="text-xs space-y-1 sm:col-span-2">Chiave API Alpha Vantage<input required type="password" autoComplete="off" value={marketApiKey} onChange={e=>setMarketApiKey(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm" placeholder="Inserisci la tua chiave API"/></label><button disabled={marketLoading} className="rounded-lg bg-emerald-600 text-white p-2 flex items-center justify-center gap-2 text-sm disabled:opacity-50"><RefreshCw size={16}/>{marketLoading?"Caricamento…":"Aggiorna storico"}</button></form>
   <p className={`text-xs ${muted}`}>Richieste registrate oggi su questo browser: {marketUsage} / 25. La chiave resta nella memoria della schermata e non viene salvata nel workspace. Per sicurezza non usare questa modalità in una distribuzione pubblica multiutente.</p>
   {marketError&&<p className="text-sm text-red-500">{marketError}</p>}
   {marketIndicators&&<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[["SMA 20",marketIndicators.sma20],["SMA 50",marketIndicators.sma50],["EMA 20",marketIndicators.ema20],["RSI 14",marketIndicators.rsi14]].map(([label,value])=><div key={label} className="rounded-lg border border-slate-500/20 p-3"><div className={`text-xs ${muted}`}>{label}</div><div className="text-lg font-semibold">{value==null?"n.d.":value.toFixed(2)}</div></div>)}</div>}
   {marketIndicators&&<p className={`text-xs ${muted}`}>Indicatori calcolati localmente su {marketIndicators.observations} chiusure giornaliere, ultimo dato {marketIndicators.asOf}. Sono descrittivi, non segnali automatici.</p>}
   {marketRows.length>0&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead className={muted}><tr className="text-left border-b"><th className="py-2">Data</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead><tbody>{marketRows.map(r=><tr key={r.date} className="border-b border-slate-500/20"><td className="py-2">{r.date}</td><td>{r.open}</td><td>{r.high}</td><td>{r.low}</td><td className="font-semibold">{r.close}</td><td>{r.volume.toLocaleString("it-IT")}</td></tr>)}</tbody></table></div>}
   <p className={`text-xs ${muted}`}>I prezzi sono chiusure giornaliere. Prima di usarli per un'analisi verifica data, borsa, valuta e disponibilità del simbolo presso il provider. Nessun prezzo viene automaticamente attribuito al portafoglio.</p>
  </section>}
  {tab==="portfolio"&&<section className={`rounded-xl border p-4 space-y-4 ${card}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Registro movimenti</h2><p className={`text-xs ${muted}`}>Inserimento manuale o import CSV. Il sistema calcola costo medio e P&L realizzato; non valorizza le posizioni senza quotazioni verificate.</p></div><div className="flex flex-wrap gap-2"><label className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2 cursor-pointer"><Upload size={14}/>Importa CSV<input type="file" accept=".csv,text/csv" onChange={importTradeCsv} className="hidden"/></label><button type="button" onClick={exportTradesCsv} className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2"><Download size={14}/>Esporta CSV</button></div></div>
   <form onSubmit={addTrade} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <label className="text-xs space-y-1">Ticker<input required value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="es. ENI.MI" className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Operazione<select value={side} onChange={e=>setSide(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"><option value="BUY">Acquisto</option><option value="SELL">Vendita</option></select></label>
    <label className="text-xs space-y-1">Quantità<input required type="number" min="0.000001" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Prezzo unitario<input required type="number" min="0.000001" step="any" value={price} onChange={e=>setPrice(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Valuta<select value={currency} onChange={e=>setCurrency(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option><option>JPY</option></select></label>
    <label className="text-xs space-y-1">Commissioni<input type="number" min="0" step="any" value={fees} onChange={e=>setFees(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">Data<input type="date" required value={tradeDate} onChange={e=>setTradeDate(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <button className="self-end rounded-lg bg-emerald-600 text-white p-2 flex items-center justify-center gap-2 text-sm"><Plus size={16}/>Registra</button>
   </form>
   {positions.error&&<p className="text-sm text-red-500">{positions.error}</p>}
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead className={muted}><tr className="text-left border-b"><th className="py-2">Titolo</th><th>Quantità</th><th>Costo medio</th><th>P&L realizzato</th><th>Commissioni</th><th></th></tr></thead><tbody>{positions.rows.map(p=><tr key={p.symbol} className="border-b border-slate-500/20"><td className="py-2 font-semibold">{p.symbol}</td><td>{p.quantity}</td><td>{money(p.averageCost,p.currency)}</td><td className={p.realizedPnl>=0?"text-emerald-500":"text-red-500"}>{money(p.realizedPnl,p.currency)}</td><td>{money(p.feesPaid,p.currency)}</td><td><button title="Rimuovi ultimo movimento del titolo" onClick={()=>{const ix=data.trades.map((t,i)=>t.symbol.toUpperCase()===p.symbol?i:-1).filter(i=>i>=0).at(-1);if(ix!=null)setData({...data,trades:data.trades.filter((_,i)=>i!==ix)});}} className="text-red-500"><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
   {!positions.rows.length&&<p className={`text-sm ${muted}`}>Nessun movimento registrato.</p>}
  </section>}
  {tab==="macro"&&<section className={`rounded-xl border p-4 space-y-4 ${card}`}><div><h2 className="text-lg font-semibold">Indicatori macro globali</h2><p className={`text-xs ${muted}`}>Serie ufficiali FRED ed ECB Data Portal. Le frequenze e i ritardi di pubblicazione variano per indicatore; non sono quotazioni intraday.</p></div>
   <form onSubmit={loadMacro} className="grid sm:grid-cols-3 gap-3"><label className="text-xs space-y-1 sm:col-span-2">Chiave API FRED (facoltativa per cambio ECB)<input type="password" autoComplete="off" value={fredApiKey} onChange={e=>setFredApiKey(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm" placeholder="Inserisci la tua chiave FRED"/></label><button disabled={macroLoading} className="rounded-lg bg-emerald-600 text-white p-2 flex items-center justify-center gap-2 text-sm disabled:opacity-50"><RefreshCw size={16}/>{macroLoading?"Caricamento…":"Aggiorna indicatori"}</button></form>
   <p className={`text-xs ${muted}`}>Dodici richieste FRED per aggiornamento (serve la tua chiave gratuita); il cambio EUR/USD proviene da ECB Data Portal senza chiave. Le frequenze e i ritardi variano per serie. La chiave FRED non viene salvata nel workspace. Non usare questa modalità per una distribuzione pubblica multiutente.</p>
   {macroError&&<p className="text-sm text-red-500">{macroError}</p>}
   <div className="grid sm:grid-cols-2 gap-3">{macroRows.map(r=><div key={r.id} className="rounded-lg border border-slate-500/20 p-3"><div className="text-xs font-semibold">{r.label} <span className={muted}>({r.id})</span></div><div className="text-xl font-semibold mt-1">{r.status==="ok"?r.value.toLocaleString("it-IT",{maximumFractionDigits:3})+" "+r.unit:"n.d."}</div><div className={`text-xs ${muted}`}>{r.status==="ok"?"Osservazione: "+r.date:r.error||"Nessuna osservazione"}</div></div>)}</div>
   <div className="rounded-lg border border-slate-500/20 p-3 space-y-2"><div className="font-semibold text-sm">Regime di rischio USA (descrittivo)</div><div className="text-sm font-bold">{macroRegime.status==="insufficient_data"?"Dati insufficienti":macroRegime.regime==="risk_off"?"Risk-off":macroRegime.regime==="cautious"?"Cauto":macroRegime.regime==="risk_on"?"Risk-on":"Non classificato"}</div><div className={`text-xs ${muted}`}>{macroRegime.available}/{macroRegime.required} indicatori core aggiornati</div>{macroRegime.drivers.map((d,i)=><div key={i} className={`text-xs ${muted}`}>• {d}</div>)}</div>
   <p className={`text-xs ${muted}`}>Quadro macro descrittivo, non previsivo né calibrato: mancano inflazione armonizzata UE, spread BTP-Bund e validazione statistica. Il regime non genera segnali d'investimento né probabilità di scenario.</p>
  </section>}
  {tab==="calendar"&&<section className={`rounded-xl border p-4 space-y-4 ${card}`}><div><h2 className="text-lg font-semibold">Calendario societario</h2><p className={`text-xs ${muted}`}>Aggiungi date da fonti ufficiali o confermate. Gli eventi inseriti manualmente restano non confermati finché non li verifichi.</p></div>
   <div className="rounded-lg border border-slate-500/20 p-3 space-y-2"><div className="font-semibold text-sm">Earnings & Dividend Intelligence automatica</div>{analysisData?.events?<>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
     <div><div className={muted+" text-xs"}>Prossimi risultati</div><b>{analysisData.events.earnings?.nextDate||"n.d."}</b></div>
     <div><div className={muted+" text-xs"}>EPS stimato</div><b>{Number.isFinite(analysisData.events.earnings?.epsEstimate)?analysisData.events.earnings.epsEstimate:"n.d."}</b></div>
     <div><div className={muted+" text-xs"}>Ricavi stimati</div><b>{Number.isFinite(analysisData.events.earnings?.revenueEstimate)?money(analysisData.events.earnings.revenueEstimate,analysisData.quote?.currency||"EUR"):"n.d."}</b></div>
     <div><div className={muted+" text-xs"}>Dividend yield</div><b>{Number.isFinite(analysisData.events.dividends?.yield)?analysisData.events.dividends.yield.toFixed(2)+"%":"n.d."}</b></div>
     <div><div className={muted+" text-xs"}>Payout ratio</div><b>{Number.isFinite(analysisData.events.dividends?.payoutRatio)?analysisData.events.dividends.payoutRatio.toFixed(1)+"%":"n.d."}</b></div>
     <div><div className={muted+" text-xs"}>Ex-dividend date</div><b>{analysisData.events.dividends?.exDividendDate||"n.d."}</b></div>
    </div>
    <div className="text-xs "+muted>Fonte: {analysisData.events.source||"n.d."} · aggiornato {analysisData.events.asOf||"n.d."}. Feed non ufficiale: verifica sempre il calendario investor relations.</div>
    {(analysisData.events.earnings?.history||[]).length>0&&<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="py-1">Quarter</th><th>EPS actual</th><th>EPS estimate</th><th>Surprise</th></tr></thead><tbody>{analysisData.events.earnings.history.slice(-4).map((h,i)=><tr key={h.quarter||i} className="border-b border-slate-500/10"><td className="py-1">{h.quarter||"n.d."}</td><td>{h.epsActual??"n.d."}</td><td>{h.epsEstimate??"n.d."}</td><td>{Number.isFinite(h.surprisePct)?(h.surprisePct*100).toFixed(1)+"%":"n.d."}</td></tr>)}</tbody></table></div>}
   </>:<p className={muted+" text-sm"}>Nessun dato automatico disponibile: prima analizza un titolo nella schermata principale oppure verifica il ticker e la disponibilità del provider.</p>}</div>
   <form onSubmit={addEvent} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <label className="text-xs space-y-1">Tipo<select value={eventType} onChange={e=>setEventType(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"><option value="earnings">Risultati</option><option value="dividend">Dividendo</option></select></label>
    <label className="text-xs space-y-1">Ticker<input required value={eventTicker} onChange={e=>setEventTicker(e.target.value)} placeholder="es. AAPL" className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <label className="text-xs space-y-1">{eventType==="earnings"?"Data risultati":"Ex-dividend date"}<input required type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    {eventType==="earnings"?<><label className="text-xs space-y-1">EPS stimato (opzionale)<input type="number" step="any" value={epsEstimate} onChange={e=>setEpsEstimate(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label><label className="text-xs space-y-1">EPS effettivo (opzionale)<input type="number" step="any" value={epsActual} onChange={e=>setEpsActual(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label></>:<><label className="text-xs space-y-1">Dividendo per azione<input required type="number" min="0" step="any" value={dividendAmount} onChange={e=>setDividendAmount(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label><label className="text-xs space-y-1">Valuta<select value={dividendCurrency} onChange={e=>setDividendCurrency(e.target.value)} className="w-full rounded-lg border p-2 bg-transparent text-sm"><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option></select></label></>}
    <label className="text-xs space-y-1 col-span-2 sm:col-span-1">Fonte (URL o riferimento)<input required value={eventSource} onChange={e=>setEventSource(e.target.value)} placeholder="comunicato societario / URL" className="w-full rounded-lg border p-2 bg-transparent text-sm"/></label>
    <button className="rounded-lg bg-emerald-600 text-white p-2 flex items-center justify-center gap-2 text-sm"><Plus size={16}/>Aggiungi evento</button>
   </form>
   <div className="space-y-2">{events.map((ev,i)=><div key={ev.type+ev.symbol+ev.date+i} className="flex items-center justify-between gap-3 rounded-lg border border-slate-500/20 p-3 text-sm"><div><div className="font-semibold">{ev.symbol} · {ev.type==="earnings"?"Risultati":"Ex-dividendo"}</div><div className={muted}>{ev.date} · {ev.source} · <span className="text-amber-500">non confermato</span></div></div>{ev.payload?.origin!=="auto"&&<button onClick={()=>removeEvent(i)} className="text-red-500"><Trash2 size={15}/></button>}</div>)}{!events.length&&<p className={muted+" text-sm"}>Nessun evento registrato.</p>}</div>
  </section>}
  {tab==="quality"&&<section className={`rounded-xl border p-4 space-y-3 ${card}`}><h2 className="text-lg font-semibold">Stato e limiti dei dati</h2><div className="grid sm:grid-cols-2 gap-3"><div className="rounded-lg border border-emerald-500/30 p-3"><div className="font-semibold text-emerald-500">Motori quantitativi</div><p className={`text-sm ${muted}`}>Calcoli locali e riproducibili: costo medio, indicatori, metriche di rischio e backtest essenziale.</p></div><div className="rounded-lg border border-amber-500/30 p-3"><div className="font-semibold text-amber-500">Dati esterni</div><p className={`text-sm ${muted}`}>Sono collegati Alpha Vantage daily, dodici serie FRED e due serie ECB. La schermata principale usa inoltre eventi Yahoo automatici, non ufficiali e da verificare. SEC XBRL non è ancora collegato alla UI; non sono disponibili prezzi realtime.</p></div></div><p className={`text-xs ${muted}`}>I dati di questa console sono salvati localmente nel browser/dispositivo. Esegui backup prima di cancellare dati app o browser. Non inserire informazioni sensibili.</p></section>}
  <div className={`flex flex-wrap items-center gap-2 border-t pt-4 ${muted}`}><button onClick={exportBackup} className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2"><Download size={14}/>Esporta backup</button><label className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2 cursor-pointer"><Upload size={14}/>Importa backup<input type="file" accept="application/json,.json" onChange={importBackup} className="hidden"/></label><span className="text-xs">Workspace locale · conserva una copia del backup.</span></div>
  <p className={`text-xs ${muted}`}>Workspace 2.0 sperimentale · dati giornalieri, non realtime · non è consulenza finanziaria.</p>
 </div></div>;
}
