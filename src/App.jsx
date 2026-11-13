import { useState, useMemo, useEffect, useRef } from "react";
import { ComposedChart, LineChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell } from "recharts";
import { loadQuote, loadFundamentals, loadAnalysts, loadMarket, loadNewsRaw, loadCorporateEvents, loadPeerValuation, diagnostics } from "./data.js";
import { printReport } from "./report.js";
import { assessAnalysisReadiness } from "./core/analysis-gate.js";
import V2Console from "./ui/V2Console.jsx";
import { getApiKey, saveApiKey } from "./services/api-settings.js";
import { readAnalysisSection, readAnalysisSnapshot, writeAnalysisSection, analysisFingerprint } from "./services/analysis-cache.js";
import { listGeminiModels } from "./services/gemini-models.js";
import { Search, RefreshCw, Sun, Moon, AlertTriangle, TrendingUp, TrendingDown, Clock, Loader2, Info, CheckCircle2, Key, Printer } from "lucide-react";

const POPULAR_TICKERS = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "MSFT", name: "Microsoft Corporation" },
  { ticker: "NVDA", name: "NVIDIA Corporation" },
  { ticker: "GOOGL", name: "Alphabet Inc." },
  { ticker: "AMZN", name: "Amazon.com, Inc." },
  { ticker: "TSLA", name: "Tesla, Inc." },
  { ticker: "META", name: "Meta Platforms, Inc." },
  { ticker: "ENI.MI", name: "Eni S.p.A." },
  { ticker: "ISP.MI", name: "Intesa Sanpaolo S.p.A." },
  { ticker: "UCG.MI", name: "UniCredit S.p.A." },
  { ticker: "STLAM.MI", name: "Stellantis N.V." },
  { ticker: "RACE.MI", name: "Ferrari N.V." },
  { ticker: "ENEL.MI", name: "Enel S.p.A." }
];

function parseJSON(txt) {
  try {
    const c = txt.replace(/```json|```/g, "").trim();
    const a = c.indexOf("{"), b = c.lastIndexOf("}");
    return JSON.parse(c.slice(a, b + 1));
  } catch (e) { return null; }
}

async function callGeminiAPI(systemInstruction,userPrompt) {
  const apiKey=getApiKey("gemini");
  if(!apiKey)throw new Error("Chiave Gemini mancante: inseriscila nelle impostazioni.");
  const models=(await listGeminiModels(apiKey)).filter(m=>/flash/i.test(m.name)).slice(0,4);
  if(!models.length)throw new Error("Nessun modello Gemini Flash disponibile per questa chiave.");
  const payload={
    contents:[{role:"user",parts:[{text:userPrompt}]}],
    systemInstruction:{parts:[{text:systemInstruction}]},
    generationConfig:{responseMimeType:"application/json",temperature:0.3,maxOutputTokens:3072}
  };
  let lastError="Nessun modello compatibile.";
  for(const model of models){
    const url="https://generativelanguage.googleapis.com/v1beta/"+model.name+":generateContent";
    let response;
    try {
      response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify(payload)});
    }catch(e){throw new Error("Rete Gemini non raggiungibile: "+String(e.message||e));}
    if(response.status===429)throw new Error("Quota Gemini esaurita (429): il report numerico rimane disponibile; riprova più tardi.");
    if(!response.ok){
      const detail=await response.json().catch(()=>({}));
      lastError=model.name+": HTTP "+response.status+" "+String(detail.error?.message||"").slice(0,160);
      if(response.status===400||response.status===404)continue;
      throw new Error(lastError);
    }
    const answer=await response.json();
    const text=(answer.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
    const parsed=parseJSON(text);
    if(!parsed)throw new Error("JSON Gemini non interpretabile: report numerico non modificato.");
    return parsed;
  }
  throw new Error("Nessun modello Gemini utilizzabile: "+lastError);
}

const nf = (n, d = 2) => (n == null || isNaN(n) ? "n.d." : Number(n).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));
const cf = (n) => (n == null || isNaN(n) ? "n.d." : Number(n).toLocaleString("it-IT", { notation: "compact", maximumFractionDigits: 2 }));
const pf = (n) => (n == null || isNaN(n) ? "n.d." : (n > 0 ? "+" : "") + nf(n) + "%");
const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
const clamp = (x) => Math.max(0, Math.min(100, x));
const sc = (x, lo, hi) => (num(x) == null ? null : clamp(((x - lo) / (hi - lo)) * 100));
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const daysOld = (d) => { const t = Date.parse(d); return isNaN(t) ? null : (Date.now() - t) / 864e5; };
export function buildAnnualMetrics(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((row, index, sorted) => {
      const revenue = num(row?.rev);
      const previousRevenue = index > 0 ? num(sorted[index - 1]?.rev) : null;
      return {
        ...row,
        gm: revenue > 0 && num(row?.gp) != null ? (row.gp / revenue) * 100 : null,
        om: revenue > 0 && num(row?.op) != null ? (row.op / revenue) * 100 : null,
        nm: revenue > 0 && num(row?.ni) != null ? (row.ni / revenue) * 100 : null,
        g: revenue > 0 && previousRevenue > 0 ? (revenue / previousRevenue - 1) * 100 : null
      };
    });
}


const sma = (a, n) => a.map((_, i) => (i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n));
const ema = (a, n) => { const k = 2 / (n + 1); let p = null; return a.map((x) => (p = p == null ? x : x * k + p * (1 - k))); };
function rsi(a, n = 14) {
  const out = a.map(() => null); if (a.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d >= 0 ? (g += d) : (l -= d); }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}

const STEPS = ["Quotazioni e storico…", "Bilanci e multipli…"];
const WEIGHTS = { "Trend tecnico": 0.2, Crescita: 0.2, Redditività: 0.15, "Solidità finanziaria": 0.15, Valutazione: 0.15, Sentiment: 0.15 };

export function buildTech(q) {
  const h = (q?.history || []).filter((r) => Array.isArray(r) && num(r[1]) != null);
  const closes = h.map((r) => r[1]);
  const s10 = sma(closes, 10), s40 = sma(closes, 40), r = rsi(closes), e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macd = e12.map((x, i) => x - e26[i]), sig = ema(macd, 9);
  const rows = h.map((x, i) => ({ d: x[0], c: x[1], v: num(x[2]), s50: s10[i], s200: s40[i], rsi: r[i], macd: macd[i], sig: sig[i], hist: macd[i] - sig[i] }));
  return rows.slice(-52);
}

export function computeScores(D, tech) {
  const q = D.quote, f = D.fin, v = D.val, a = D.an;
  const last = tech[tech.length - 1];
  const s50 = num(q?.sma50) ?? last?.s50, s200 = num(q?.sma200) ?? last?.s200, p = num(q?.price);
  const rs = num(q?.rsi14) ?? last?.rsi;
  const tS = q ? avg([p != null && s200 != null ? (p > s200 ? 100 : 0) : null, p != null && s50 != null ? (p > s50 ? 100 : 0) : null, rs != null ? clamp(100 - Math.abs(rs - 55) * 3) : null, last && num(last.hist) != null ? (last.hist > 0 ? 100 : 25) : null]) : null;
  const an = (f?.annual || []).slice().sort((x, y) => x.y - y.y), la = an[an.length - 1], fa = an[0], pa = an[an.length - 2];
  const cagr = la && fa && an.length > 1 && fa.rev > 0 && la.rev > 0 ? (Math.pow(la.rev / fa.rev, 1 / (an.length - 1)) - 1) * 100 : null;
  const epsG = la && pa && num(la.eps) != null && num(pa.eps) > 0 ? (la.eps / pa.eps - 1) * 100 : null;
  const gS = avg([sc(cagr, -5, 15), sc(epsG, -10, 20)]);
  const b = f?.balance || {};
  // Non trasformare NI/EBIT mancanti in margini pari a zero: zero è un dato, null è assenza.
  const nm = la && num(la.rev) > 0 && num(la.ni) != null ? (la.ni / la.rev) * 100 : null;
  const om = la && num(la.rev) > 0 && num(la.op) != null ? (la.op / la.rev) * 100 : null;
  const rS = avg([sc(nm, 0, 25), sc(om, 0, 30), sc(b.roe, 0, 25)]);
  const nde = la && la.ebitda > 0 && num(b.netDebt) != null ? b.netDebt / la.ebitda : null;
  const sS = avg([nde != null ? sc(4 - nde, 0, 4) : null, sc(b.currentRatio, 0.8, 2), sc(b.interestCover, 1, 10)]);
  // Valutazione: per ogni multiplo si confronta con settore e storico 5a (media dei due se ci sono entrambi).
  // Scala logaritmica: rapporto 1 = 50 punti, 0,4x = 100, 2,5x o piu' = 0 (prima 1,5x gia' dava 0 e i titoli "premium" restavano sempre a zero).
  const ratioScore = (r) => (r > 0 ? clamp(50 - (50 * Math.log(r)) / Math.log(2.5)) : null);
  const vS = avg((v?.metrics || []).filter((m) => ["P/E", "P/E forward", "PEG", "P/B", "P/S", "EV/EBITDA", "P/FCF"].includes(m.k) && num(m.v) > 0).map((m) => avg([num(m.sector) > 0 ? ratioScore(m.v / m.sector) : null, num(m.hist5y) > 0 ? ratioScore(m.v / m.hist5y) : null])));
  const up = a && p && num(a.targetMean) ? (a.targetMean / p - 1) * 100 : null;
  const tot = a?.ratings ? a.ratings.buy + a.ratings.hold + a.ratings.sell : 0;
  const m = D.mkt;
  let rsS = null, rsEx = null;
  if (m?.stock) {
    if (m.index && num(m.stock.r26) != null && num(m.index.r26) != null && num(m.stock.r52) != null && num(m.index.r52) != null) {
      rsEx = m.stock.r52 - m.index.r52;
      rsS = avg([sc(m.stock.r26 - m.index.r26, -15, 15), sc(rsEx, -20, 20)]);
    } else rsS = avg([sc(m.stock.r26, -15, 35), sc(m.stock.r52, -20, 50)]);   // senza indice: momentum assoluto
  }
  const seS = avg([sc(up, -10, 25), tot ? sc(a.ratings.buy / tot, 0.2, 0.8) : null, rsS]);
  const scores = { "Trend tecnico": tS, Crescita: gS, Redditività: rS, "Solidità finanziaria": sS, Valutazione: vS, Sentiment: seS };
  let wsum = 0, tot2 = 0;
  Object.entries(scores).forEach(([k, s]) => { if (s != null) { wsum += WEIGHTS[k]; tot2 += s * WEIGHTS[k]; } });
  const readiness = assessAnalysisReadiness({ quote: q, fin: f, val: v, scores });
  const overall = readiness.ready && wsum ? tot2 / wsum : null;
  let rel = readiness.ready ? (Object.values(scores).filter((x) => x != null).length / 6) * 100 : 0;
  const stale = daysOld(q?.asOf) > 2 || f?.isLatest === false;
  if (stale) rel -= 15;
  return { scores, overall, rel: Math.max(0, Math.round(rel)), readiness, derived: { cagr, epsG, nm, om, nde, up, rsEx } };
}
const labelOf = (s) => (s == null ? "n.d." : s >= 75 ? "COMPRARE" : s >= 62 ? "ACCUMULARE" : s >= 45 ? "MANTENERE" : s >= 32 ? "EVITARE" : "VENDERE");
const LABEL_COLOR = { COMPRARE: "bg-emerald-700", ACCUMULARE: "bg-lime-700", MANTENERE: "bg-amber-400 !text-slate-900", EVITARE: "bg-orange-700", VENDERE: "bg-red-700", "n.d.": "bg-slate-600" };

function SafeChart({ height = 190, children }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>Grafico non disponibile</div>;
  return (
    <div style={{ height }} onError={() => setHasError(true)}>
      {children}
    </div>
  );
}

// ---------- Una sola chiamata a Gemini: giudizio + traduzione/sentiment delle notizie ----------
const TODAY = () => new Date().toISOString().slice(0, 10);
const EMPTY_FIN = () => ({ annual: [], quarters: [], balance: {}, lastReportDate: "", isLatest: false, asOf: TODAY(), source: "n.d." });
const EMPTY_VAL = () => ({ metrics: [], peers: [], asOf: TODAY(), source: "n.d." });
const EMPTY_AN = () => ({ targetMean: null, targetMin: null, targetMax: null, ratings: { buy: 0, hold: 0, sell: 0 }, nAnalysts: 0, asOf: TODAY(), source: "n.d." });

const SYSTEM_PROMPT = "Sei un analista finanziario prudente. Usa SOLO i dati forniti: i campi assenti non sono disponibili, non inventarli e segnala la mancanza. L'etichetta indicata è già decisa: motivala senza contraddirla. Scrivi in italiano. Rispondi solo con JSON valido.";
const OUTPUT_SCHEMA = '{"horizon":"es. 6-12 mesi","motivation":"4-6 frasi con numeri dai dati","strengths":["max 12 parole","",""],"risks":["max 12 parole",""],"entry":"","stop":"","target":"","news":{"tone":"1 frase sul tono delle notizie","risks":["max 2 rischi emersi dalle notizie"],"items":[{"i":0,"t":"titolo tradotto in italiano","s":"pos|neu|neg"}]}}';

function buildUserPrompt(acc, S, label) {
  const q = acc.quote, f = acc.fin || {}, v = acc.val || {}, a = acc.an || {};
  const d = {
    titolo: `${q.name} (${q.ticker}) ${q.currency || ""}`.trim(),
    oggi: TODAY(),
    etichetta: label,
    punteggio: S.overall,
    punteggi: S.scores,
    prezzo: { p: q.price, var: q.changePct, sma50: q.sma50, sma200: q.sma200, rsi: q.rsi14, sup: (q.support || []).filter((x) => x != null), res: (q.resistance || []).filter((x) => x != null), cap: q.marketCap },
    annuali: (f.annual || []).slice(-4).map((r) => ({ y: r.y, rev: r.rev, ni: r.ni, ebitda: r.ebitda, fcf: r.fcf, eps: r.eps })),
    trimestri: (f.quarters || []).slice(-4),
    bilancio: f.balance,
    multipli: (v.metrics || []).map((m) => `${m.k} ${m.v}${m.sector != null ? ` (settore ${m.sector})` : ""}${m.hist5y != null ? ` (storico 5a ${m.hist5y})` : ""}`),
    analisti: a.nAnalysts || a.targetMean ? { tgt: a.targetMean, min: a.targetMin, max: a.targetMax, ...a.ratings } : undefined,
    mercato: acc.mkt ? { indice: acc.mkt.bench?.name, titolo: acc.mkt.stock, rispettoIndice: acc.mkt.index, posizione52sett: acc.mkt.pos52 } : undefined,
    indicatori: S.derived,
    notizie: (acc.newsRaw || []).map((r, i) => `${i}|${r.date}|${r.title}`),
  };
  const json = JSON.stringify(d, (k, x) => (x === null || x === undefined || (Array.isArray(x) && !x.length) ? undefined : typeof x === "number" ? Math.round(x * 100) / 100 : x));
  return `Dati (campi mancanti = non disponibili):\n${json}\n\nIn "news.items" inserisci una voce per ogni notizia (stesso indice i; titolo tradotto in italiano; s = sentiment per un azionista). Se non ci sono notizie ometti "news". Schema:\n${OUTPUT_SCHEMA}`;
}

function mergeNews(acc, nw) {
  const raw = acc.newsRaw || [];
  const byI = {};
  (Array.isArray(nw?.items) ? nw.items : []).forEach((x) => { if (x && Number.isInteger(x.i)) byI[x.i] = x; });
  return {
    items: raw.map((r, i) => ({ date: r.date, title: byI[i]?.t || r.title, sentiment: ["pos", "neu", "neg"].includes(byI[i]?.s) ? byI[i].s : "neu", source: r.source })),
    officialSentiment: nw?.tone || (nw ? "n.d." : raw.length ? "Non classificato (servizio Gemini non disponibile)" : "n.d."),
    risks: Array.isArray(nw?.risks) ? nw.risks.filter(Boolean).slice(0, 3) : [],
    asOf: TODAY(),
    source: "Yahoo Finance",
  };
}

// Independent report cache lives in services/analysis-cache.js.
export default function AnalizzatoreAzionario() {
  const [dark, setDark] = useState(() => {
    try { const t = localStorage.getItem("theme"); if (t === "dark" || t === "light") return t === "dark"; } catch (e) {}
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; }
  });
  const [themeFixed, setThemeFixed] = useState(() => { try { return !!localStorage.getItem("theme"); } catch (e) { return false; } });
  useEffect(() => {
    if (themeFixed) return;
    let mq; try { mq = window.matchMedia("(prefers-color-scheme: dark)"); } catch (e) { return; }
    const h = (e) => setDark(e.matches);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h); };
  }, [themeFixed]);
  // Sfondo/color-scheme anche fuori dal contenitore React (aree sicure, overscroll, scrollbar, campi nativi)
  useEffect(() => {
    const bg = dark ? "#020617" : "#f8fafc";
    document.documentElement.style.backgroundColor = bg;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document.body.style.backgroundColor = bg;
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = bg;
  }, [dark]);
  const [showV2, setShowV2] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const requestId = useRef(0);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cur, setCur] = useState("");
  const [data, setData] = useState({});
  const [step, setStep] = useState(-1);
  const [err, setErr] = useState(null);
  const [hist, setHist] = useState([]);
  const [showKey, setShowKey] = useState(false);
  const [warns, setWarns] = useState([]);
  const [cachedAt, setCachedAt] = useState(null);
  const [avVal, setAvVal] = useState(() => getApiKey("alphavantage"));
  const [fredVal, setFredVal] = useState(() => getApiKey("fred"));
  const [diag, setDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const runDiag = async () => { setDiagBusy(true); setDiag(null); try { setDiag(await diagnostics("", avVal.trim())); } catch (e) { setDiag([{ name: "Diagnostica", ok: false, detail: e.message }]); } finally { setDiagBusy(false); } };
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const testKey = async () => {
    setTesting(true);setTestMsg("Verifica dei modelli disponibili…");
    try {
      const k=keyVal.trim();
      if(!k)throw new Error("Inserisci prima la chiave Gemini.");
      const models=await listGeminiModels(k);
      setTestMsg("Chiave riconosciuta: "+models.length+" modelli generateContent disponibili. L'accesso alla ricerca web e le quote si verificano durante la richiesta reale.");
    }catch(e){setTestMsg("Test non riuscito: "+String(e.message||e));}
    finally{setTesting(false);}
  };
  const [keyVal, setKeyVal] = useState(() => getApiKey("gemini"));
  const busy = step >= 0 && step < STEPS.length;
  const th = dark ? { bg: "bg-slate-950 text-slate-100", card: "bg-slate-900 border-slate-800", mute: "text-slate-400", inp: "bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-400", grid: "#3f4d63", txt: "#cbd5e1", dropdown: "bg-slate-900 border-slate-700 hover:bg-slate-800" } : { bg: "bg-slate-50 text-slate-900", card: "bg-white border-slate-200", mute: "text-slate-600", inp: "bg-white border-slate-300 text-slate-900 placeholder:text-slate-500", grid: "#d5dde8", txt: "#475569", dropdown: "bg-white border-slate-200 hover:bg-slate-100" };
  const C = dark
    ? { blue: "#60a5fa", amber: "#fbbf24", red: "#f87171", green: "#34d399", purple: "#a78bfa", teal: "#2dd4bf", gray: "#94a3b8" }
    : { blue: "#2563eb", amber: "#b45309", red: "#dc2626", green: "#047857", purple: "#6d28d9", teal: "#0f766e", gray: "#64748b" };
  const ax = { tick: { fill: th.txt, fontSize: 10 }, axisLine: { stroke: th.grid }, tickLine: false };
  const legendFmt = (v) => <span style={{ color: dark ? "#e2e8f0" : "#1e293b" }}>{v}</span>;

  const filteredSuggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.toLowerCase();
    return POPULAR_TICKERS.filter(item => item.ticker.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)).slice(0, 5);
  }, [input]);


  async function run(t, resume=false, force=false) {
    const target=(t??input).trim().toUpperCase();
    if(!target)return;
    // Stale requests may finish but must never overwrite another ticker.
    const id=++requestId.current,active=()=>id===requestId.current;
    setShowSuggestions(false);setInput(target);setCur(target);setErr(null);setAiBusy(false);
    setHist(h=>[target,...h.filter(x=>x.toUpperCase()!==target)].slice(0,8));
    const snapshot=readAnalysisSnapshot(target);
    const acc={...snapshot.data};
    const notices=new Map(snapshot.stale.map(k=>[k,"Dati "+k+" da cache non aggiornata: verificare la data originale."]));
    const updateNotices=()=>{if(active())setWarns([...notices.values()]);};
    const clearNotice=k=>{notices.delete(k);updateNotices();};
    const warn=(k,msg)=>{notices.set(k,msg);updateNotices();};
    const publish=()=>{if(active())setData({...acc});};
    const put=(key,value,cacheSymbol=target)=>{
      if(!active()||value===undefined||value===null)return;
      acc[key]=value;
      writeAnalysisSection(cacheSymbol,key,value);
      clearNotice(key);publish();
    };
    setData({...acc});updateNotices();
    setCachedAt(!force&&snapshot.fresh.includes("quote")&&snapshot.fresh.includes("fin")?(snapshot.timestamps.quote||null):null);
    setStep(acc.quote&&acc.fin&&acc.val?STEPS.length:0);
    const section=async(key,fetcher,cacheSymbol=target)=>{
      const cached=!force?readAnalysisSection(cacheSymbol,key):null;
      if(cached){acc[key]=cached.value;clearNotice(key);publish();return cached.value;}
      try {
        const value=await fetcher();
        if(!active())return null;
        if(value!==null&&value!==undefined)put(key,value,cacheSymbol);
        return value;
      } catch(e) {
        if(!active())return null;
        const old=readAnalysisSection(cacheSymbol,key,{allowStale:true});
        if(old)acc[key]=old.value;else delete acc[key];
        warn(key,key+": "+(old?"uso ultima copia salvata, ":"dati non disponibili, ")+String(e.message||e).slice(0,100));
        publish();
        return old?.value??null;
      }
    };
    try {
      const quote=await section("quote",()=>loadQuote(target));
      if(!active())return;
      if(!quote||!quote.ticker)throw new Error("Quotazione non disponibile per "+target+". Controlla rete e ticker.");
      const sym=quote.ticker;
      if(sym!==target){
        const canonical=readAnalysisSnapshot(sym);
        for(const key of Object.keys(canonical.data))if(key!=="quote"&&!acc[key])acc[key]=canonical.data[key];
        publish();
      }
      setStep(acc.fin&&acc.val?STEPS.length:1);
      const fundamental=async()=>{
        const cachedFin=!force?readAnalysisSection(sym,"fin"):null;
        const cachedVal=!force?readAnalysisSection(sym,"val"):null;
        if(cachedFin&&cachedVal){
          acc.fin=cachedFin.value;acc.val=cachedVal.value;
          clearNotice("fin");clearNotice("val");publish();return;
        }
        try {
          const {fin,val}=await loadFundamentals(sym,{includePeers:false});
          if(!active())return;
          put("fin",fin,sym);put("val",val,sym);
        } catch(e) {
          if(!active())return;
          warn("fin",(acc.fin&&acc.val?"Bilanci da cache precedente: ":"Bilanci non disponibili: ")+String(e.message||e).slice(0,100));
        }
      };
      const core=fundamental();
      // Optional requests start concurrently and update their own sections on completion.
      const extras=[
        section("events",()=>loadCorporateEvents(sym),sym),
        section("an",()=>loadAnalysts(sym,"",getApiKey("alphavantage").trim()),sym),
        section("mkt",()=>loadMarket(sym,quote.history),sym),
        section("newsRaw",()=>loadNewsRaw(sym),sym),
      ];
      const peers=(async()=>{
        const cached=!force?readAnalysisSection(sym,"peers"):null;
        let peerData=cached?.value;
        if(!peerData){
          try {
            peerData=await loadPeerValuation(sym);
            if(active()&&peerData)writeAnalysisSection(sym,"peers",peerData);
          }catch(e){
            if(active())warn("peers","Confronto settoriale non disponibile: "+String(e.message||e).slice(0,80));
            return;
          }
        }
        await core;
        if(!active()||!peerData||!acc.val)return;
        const metrics=(acc.val.metrics||[]).map(m=>({...m,sector:peerData.sector?.[m.k]??null}));
        const source=String(acc.val.source||"Yahoo Finance").replace(/ \+ peer \(Yahoo\)/g,"");
        const next={...acc.val,metrics,peers:peerData.peers||[],source:source+(peerData.peers?.length?" + peer (Yahoo)":"")};
        put("val",next,sym);
      })();
      await core;
      if(!active())return;
      setStep(STEPS.length); // Report ready; optional data and Gemini continue separately.
      await Promise.allSettled([...extras,peers]);
      if(!active()||!acc.fin||!acc.val)return;
      const S=computeScores(acc,buildTech(acc.quote));
      if(!S.readiness.ready){
        acc.final={failed:true,reason:S.readiness.reasons.join("; ")};
        acc.news=mergeNews(acc,null);
        warn("readiness","Giudizio AI sospeso: copertura o qualità dei dati insufficiente.");
        publish();return;
      }
      const fingerprint=analysisFingerprint(acc);
      const saved=!force?readAnalysisSection(sym,"ai"):null;
      if(saved?.value?.fingerprint===fingerprint){
        acc.final=saved.value.final;acc.news=saved.value.news;publish();return;
      }
      setAiBusy(true);
      try {
        const out=await callGeminiAPI(SYSTEM_PROMPT,buildUserPrompt(acc,S,labelOf(S.overall)));
        if(!active())return;
        const {news:nw,...fin}=out;
        acc.final=fin;acc.news=mergeNews(acc,nw);
        writeAnalysisSection(sym,"ai",{fingerprint,final:acc.final,news:acc.news});
        clearNotice("ai");publish();
      }catch(e){
        if(!active())return;
        acc.final={failed:true};acc.news=mergeNews(acc,null);
        warn("ai","Commento Gemini non disponibile: "+String(e.message||e).slice(0,130));
        publish();
      }finally{if(active())setAiBusy(false);}
    }catch(e){
      if(!active())return;
      setErr(e.message==="NOT_FOUND"?"Titolo non trovato: verifica il ticker.":"Errore nel recupero dei dati: "+String(e.message||e));
      setStep(-1);setAiBusy(false);
    }
  }

  async function doPrint() {
    if (!S || !q) return;
    try {
      const reportData = S.readiness?.ready ? data : { ...data, final: { failed: true } };
      await printReport({ data: reportData, tech, S, label: labelOf(S.overall), warns });
    } catch (e) {
      const m = String(e.message || e);
      setWarns((x) => [...x, /not implemented|UNIMPLEMENTED/i.test(m) ? "Stampa non disponibile in questa versione dell'app: installa l'ultimo APK." : "Stampa non riuscita: " + m.slice(0, 120)]);
    }
  }

  const tech = useMemo(() => buildTech(data.quote), [data.quote]);
  const S = useMemo(() => (data.quote ? computeScores(data, tech) : null), [data, tech]);
  const q = data.quote, f = data.fin, v = data.val, a = data.an, n = data.news, fi = data.final, mkt = data.mkt;
  const up = (x) => x != null && x >= 0;

  // Keep report card component types stable across progressive updates.
  // Otherwise every partial API response remounts ALL charts and inputs.
  const Card = useMemo(() => ({ title, children, meta }) => (
    <section className={`app-card rounded-xl border p-4 ${th.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-base">{title}</h2>
        {meta}
      </div>
      {children}
    </section>
  ),[th.card]);
  const Meta = useMemo(() => ({ d, src, extra }) => {
    const old = daysOld(d); const stale = extra ?? (old != null && old > 2);
    return (
      <div className={`flex flex-wrap items-center gap-1.5 text-xs ${th.mute}`}>
        <Clock size={12} /> {d || "n.d."} · {src || "fonte n.d."}
        {String(src || "").includes("Yahoo Finance") && <span className="app-source-badge px-1.5 py-0.5 rounded font-medium">Feed non ufficiale</span>}
        {stale && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 font-medium flex items-center gap-1"><AlertTriangle size={11} />Dato non aggiornato</span>}
      </div>
    );
  },[th.mute]);
  const Stat = useMemo(() => ({ k, v, c }) => (
    <div className={`rounded-lg border p-2 ${th.card}`}><div className={`text-xs ${th.mute}`}>{k}</div><div className={`font-semibold ${c || ""}`}>{v}</div></div>
  ),[th.card,th.mute]);
  const chartH = 190;
  const tip = {
    contentStyle: { background: dark ? "#0f172a" : "#ffffff", border: "1px solid " + (dark ? "#475569" : "#cbd5e1"), borderRadius: 8, fontSize: 12, color: dark ? "#f1f5f9" : "#0f172a" },
    labelStyle: { color: dark ? "#f1f5f9" : "#0f172a", fontWeight: 600 },
    itemStyle: { color: dark ? "#e2e8f0" : "#1e293b" },
    cursor: { fill: dark ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.12)", stroke: dark ? C.gray : C.gray },
  };

  const annual = buildAnnualMetrics(f?.annual || []);
  const bal = f?.balance || {};
  const lvl = (x, lo, hi, inv) => (x == null ? "" : (inv ? x <= lo : x >= hi) ? "text-emerald-500" : (inv ? x >= hi : x <= lo) ? "text-red-500" : "text-amber-500");
  const lastT = tech[tech.length - 1];
  const p = num(q?.price);
  const s50 = num(q?.sma50) ?? lastT?.s50, s200 = num(q?.sma200) ?? lastT?.s200;
  const signals = [];
  if (lastT) {
    if (lastT.rsi > 70) signals.push(["Ipercomprato (RSI " + nf(lastT.rsi, 0) + ")", "text-red-500"]);
    else if (lastT.rsi < 30) signals.push(["Ipervenduto (RSI " + nf(lastT.rsi, 0) + ")", "text-emerald-500"]);
    else signals.push(["RSI neutro (" + nf(lastT.rsi, 0) + ")", "text-amber-500"]);
    signals.push([lastT.hist > 0 ? "MACD rialzista" : "MACD ribassista", lastT.hist > 0 ? "text-emerald-500" : "text-red-500"]);
    const x = tech.slice(-12).filter((r) => r.s50 != null && r.s200 != null);
    for (let i = 1; i < x.length; i++) {
      if (x[i - 1].s50 < x[i - 1].s200 && x[i].s50 >= x[i].s200) signals.push(["Golden cross recente", "text-emerald-500"]);
      if (x[i - 1].s50 > x[i - 1].s200 && x[i].s50 <= x[i].s200) signals.push(["Death cross recente", "text-red-500"]);
    }
  }
  const trend = p != null && s50 != null && s200 != null ? (p > s50 && s50 > s200 ? ["Rialzista", "text-emerald-500"] : p < s50 && s50 < s200 ? ["Ribassista", "text-red-500"] : ["Laterale / incerto", "text-amber-500"]) : ["n.d.", ""];
  const radar = S ? Object.keys(WEIGHTS).filter((k) => S.scores[k] != null).map((k) => ({ k, v: S.scores[k] })) : [];
  const label = S ? labelOf(S.overall) : null;
  const pctRatings = a?.ratings || null;
  const valMetrics = (v?.metrics || []).filter((m) => num(m.v) != null || num(m.sector) != null);

  const cfColor = (n) => (n == null || isNaN(n) ? "" : n > 0 ? "text-emerald-500" : n < 0 ? "text-red-500" : "");

  if (showV2) return <V2Console onSelectSymbol={(symbol) => { setShowV2(false); setInput(symbol); run(symbol, false, false); }} dark={dark} onBack={() => setShowV2(false)} onSettings={() => { setKeyVal(getApiKey("gemini")); setAvVal(getApiKey("alphavantage")); setFredVal(getApiKey("fred")); setShowKey(true); setShowV2(false); }} analysisData={data} />;

  return (
    <div className={`app-shell min-h-screen ${th.bg} ${dark ? "theme-dark" : "theme-light"}`}>
      <div className="app-main-container max-w-6xl mx-auto p-3 sm:p-6 space-y-5">
        <header className="app-topbar">
          <div className="app-brand">
            <img src="/icon.svg" alt="Analizzatore Azionario" className="app-brand-icon" />
            <div className="min-w-0">
              <div className="app-kicker">PERSONAL INVESTMENT INTELLIGENCE</div>
              <h1 className="app-brand-title">Analizzatore <span>Azionario</span></h1>
              <p className="app-brand-subtitle">Analisi quantitativa, rischio e qualità dei dati in un’unica console.</p>
            </div>
          </div>
          <div className="app-actions">
            <button onClick={() => setShowV2(true)} className="app-action-button app-workspace-button" aria-label="Apri watchlist"><TrendingUp size={16} /><span>Watchlist</span></button>
            <button onClick={() => { if (!showKey) { setKeyVal(getApiKey("gemini")); setAvVal(getApiKey("alphavantage")); setFredVal(getApiKey("fred")); } setShowKey(!showKey); }} className="app-action-button" aria-label="Impostazioni fonti dati"><Key size={16} /></button>
            <button onClick={() => { const nd = !dark; setDark(nd); setThemeFixed(true); try { localStorage.setItem("theme", nd ? "dark" : "light"); } catch (e) {} }} className="app-action-button" aria-label="Tema">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </header>
        {!q && (
          <section className="app-hero">
            <div className="app-hero-copy">
              <div className="app-hero-eyebrow"><span className="app-live-dot" /> IL TUO CENTRO DI ANALISI DEGLI INVESTIMENTI</div>
              <h2>Investi con metodo.<br /><span>Decidi con dati.</span></h2>
              <p>Valutazioni fondamentali e tecniche, contesto macroeconomico e controllo del rischio. Nessun segnale viene mostrato quando i dati non superano i controlli di qualità.</p>
              <div className="app-hero-tags"><span>Fonti gratuite</span><span>Fondamentali</span><span>Analisi tecnica</span><span>Watchlist</span><span>Risk management</span></div>
            </div>
            <div className="app-hero-art" aria-hidden="true">
              <div className="app-hero-orbit orbit-one" /><div className="app-hero-orbit orbit-two" />
              <img src="/icon.svg" alt="" />
              <div className="app-hero-caption"><b>DISCIPLINA</b><span>Prima i dati, poi le decisioni</span></div>
            </div>
          </section>
        )}
        {showKey && (
          <div className={`rounded-xl border p-3 text-sm space-y-2 ${th.card}`}>
            <div className="font-medium">Chiave API Gemini</div>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 underline underline-offset-2">Ottieni la chiave Gemini — Google AI Studio ↗</a>
            <div className={`text-xs ${th.mute}`}>Salvata solo su questo dispositivo. Usa un progetto Google AI Studio senza fatturazione collegata: l’app usa solo gemini-3.5-flash-lite e non attiva Search grounding.</div>
            <input type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="Please, insert relative API key" className={`w-full px-3 py-2 rounded-lg border text-sm ${th.inp}`} />
            <div className="font-medium pt-1">Chiave Alpha Vantage (facoltativa)</div>
            <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 underline underline-offset-2">Ottieni la chiave Alpha Vantage ↗</a>
            <div className={`text-xs ${th.mute}`}>Aggiunge target price e rating per i titoli USA (25 richieste al giorno). Gratis su alphavantage.co/support/#api-key</div>
            <input type="password" value={avVal} onChange={(e) => setAvVal(e.target.value)} placeholder="Please, insert relative API key" className={`w-full px-3 py-2 rounded-lg border text-sm ${th.inp}`} />
            <div className={`text-xs ${th.mute}`}>Piano gratuito: 25 richieste al giorno. L’app usa Alpha Vantage solo come integrazione facoltativa; le serie sono giornaliere, non realtime.</div>
            <div className="font-medium pt-1">Chiave FRED (facoltativa)</div>
            <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 underline underline-offset-2">Ottieni la chiave FRED — Federal Reserve ↗</a>
            <div className={`text-xs ${th.mute}`}>Configurala qui una sola volta per gli indicatori macro del Workspace.</div>
            <input type="password" value={fredVal} onChange={(e) => setFredVal(e.target.value)} placeholder="Please, insert relative API key" className={`w-full px-3 py-2 rounded-lg border text-sm ${th.inp}`} />
            <div className="flex gap-2">
              <button disabled={testing} onClick={testKey} className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${th.card}`}>Testa chiave</button>
              <button onClick={() => { saveApiKey("gemini", keyVal.trim()); saveApiKey("alphavantage", avVal.trim()); saveApiKey("fred", fredVal.trim()); try { localStorage.removeItem("gemini_model"); localStorage.removeItem("finnhub_key"); } catch (e) {} setShowKey(false); setErr(null); }} className="flex-1 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium">Salva</button>
            </div>
            <button disabled={diagBusy} onClick={runDiag} className={`w-full px-3 py-2 rounded-lg border text-sm font-medium ${th.card}`}>{diagBusy ? "Test dati in corso…" : "Testa fonti dati"}</button>
            {diag && (
              <div className="text-xs space-y-1">
                {diag.map((r, i) => <div key={i} className="break-words"><span className={r.ok ? "text-emerald-500" : r.warn ? "text-amber-500" : "text-red-500"}>{r.ok ? "✓" : r.warn ? "!" : "✗"}</span> {r.name}: {r.detail}</div>)}
              </div>
            )}
            {testMsg && <div className={`text-xs break-words ${th.mute}`}>{testMsg}</div>}
          </div>
        )}

        <div className="app-search-panel relative">
          <div className="app-search-row flex gap-2">
            <input 
              value={input} 
              onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }} 
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowSuggestions(false);
                  run();
                }
              }} 
              placeholder="Sigla o nome (es. AAPL, ENI.MI, Ferrari…)" 
              className={`app-search-input flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm ${th.inp}`} 
            />
            <button onClick={() => { setShowSuggestions(false); run(); }} disabled={busy || !input.trim()} className="app-search-button px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"><Search size={16} />Analizza</button>
          </div>
          
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className={`absolute left-0 right-16 z-20 mt-1 rounded-lg border shadow-lg overflow-hidden ${th.card}`}>
              {filteredSuggestions.map((item) => (
                <div 
                  key={item.ticker}
                  onClick={() => {
                    setInput(item.ticker);
                    setShowSuggestions(false);
                    run(item.ticker);
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer flex justify-between items-center transition-colors ${th.dropdown}`}
                >
                  <span className="font-semibold">{item.ticker}</span>
                  <span className={th.mute}>{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!q && (
          <div className="app-quick-picks flex flex-wrap items-center gap-2">
            <span className="app-quick-label">Titoli rapidi</span>
            {POPULAR_TICKERS.slice(0, 8).map((item) => <button type="button" key={item.ticker} onClick={() => { setInput(item.ticker); run(item.ticker); }} className="app-ticker-chip"><b>{item.ticker}</b><span>{item.name}</span></button>)}
          </div>
        )}
        <nav aria-label="Navigazione rapida" className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowV2(true)} className={`px-3 py-2 rounded-lg border text-sm ${th.card}`}>Watchlist</button>
          
          <span className={`self-center text-xs ${th.mute}`}>Report: {cur||"seleziona un ticker"}</span>
        </nav>

        {hist.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center text-xs">
            <span className={th.mute}>Recenti:</span>
            {hist.map((h) => (<button key={h} onClick={() => { setInput(h); run(h); }} className={`px-2 py-1 rounded-full border ${th.card}`}>{h}</button>))}
          </div>
        )}

        {busy && (
          <div className={`rounded-xl border p-3 ${th.card}`}>
            <div className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />{STEPS[step]}<span className={`ml-auto text-xs ${th.mute}`}>{step + 1}/{STEPS.length}</span></div>
            <div className={`h-2 rounded mt-2 overflow-hidden ${dark ? "bg-slate-800" : "bg-slate-200"}`}><div className="h-full bg-emerald-500 transition-all" style={{ width: `${((step + 0.5) / STEPS.length) * 100}%` }} /></div>
          </div>
        )}
        {aiBusy && q && <p role="status" className={`rounded-lg border px-3 py-2 text-xs ${th.card}`}>Il report è consultabile. Il commento Gemini viene elaborato separatamente…</p>}
        {err && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 flex flex-wrap items-center gap-3 text-sm">
            <AlertTriangle className="text-red-500" size={18} /><span className="flex-1 min-w-0 break-words">{err}</span>
            <button onClick={() => run(cur, true)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white">Riprova</button>
          </div>
        )}

        {cachedAt && step === STEPS.length && (
          <div className={`rounded-xl border p-2 text-xs flex items-center gap-2 ${th.card}`}><Clock size={13} />Quotazione e bilanci disponibili nella cache locale (salvati alle {new Date(cachedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}). Gli altri dati vengono verificati separatamente.</div>
        )}

        {warns.length > 0 && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs space-y-1">
            <div className="font-medium text-sm flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" />Alcuni dati non sono disponibili</div>
            {warns.map((x, i) => <div key={i} className="break-words">{x}</div>)}
          </div>
        )}

        {q && (
          <Card title="Intestazione" meta={<Meta d={q.asOf} src={q.source} />}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-lg font-bold">{q.name || "n.d."} <span className={`text-sm font-normal ${th.mute}`}>{q.ticker} · {q.exchange || "n.d."} · {q.currency || "n.d."}</span></div>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-3xl font-bold">{nf(q.price)}</span>
                  <span className={`font-medium flex items-center gap-1 ${up(q.changePct) ? "text-emerald-500" : "text-red-500"}`}>{up(q.changePct) ? <TrendingUp size={16} /> : <TrendingDown size={16} />}{pf(q.changePct)}</span>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <Stat k="Capitalizzazione" v={cf(q.marketCap)} />
                <button onClick={() => run(cur, false, true)} disabled={busy} className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 disabled:opacity-50 ${th.card}`}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />Aggiorna dati</button>
                <button onClick={doPrint} disabled={busy || step !== STEPS.length} aria-label="Stampa report" className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 disabled:opacity-50 ${th.card}`}><Printer size={14} />Stampa report</button>
              </div>
            </div>
          </Card>
        )}

        {q && tech.length > 0 && (
          <Card title="Analisi tecnica" meta={<Meta d={q.asOf} src={q.source} />}>
            <p className={`text-xs mb-2 ${th.mute}`}>Indicatori calcolati su chiusure settimanali: SMA 50 ≈ 10 sett., SMA 200 ≈ 40 sett.; RSI(14) e MACD(12,26,9) su base settimanale.</p>
            <SafeChart height={230}>
              <ResponsiveContainer><ComposedChart data={tech}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="d" {...ax} minTickGap={40} /><YAxis {...ax} domain={["auto", "auto"]} width={42} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFmt} />
                <Line dataKey="c" name="Prezzo" stroke={C.blue} dot={false} strokeWidth={2} /><Line dataKey="s50" name="SMA 50" stroke={C.amber} dot={false} /><Line dataKey="s200" name="SMA 200" stroke={C.red} dot={false} />
                {(q.support || []).filter(num).slice(0, 2).map((x, i) => <ReferenceLine key={"s" + i} y={x} stroke={C.green} strokeDasharray="4 4" />)}
                {(q.resistance || []).filter(num).slice(0, 2).map((x, i) => <ReferenceLine key={"r" + i} y={x} stroke={C.red} strokeDasharray="4 4" />)}
              </ComposedChart></ResponsiveContainer>
            </SafeChart>
            <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] ${th.mute}`}>
              <span className="flex items-center gap-1.5"><span style={{ width: 18, borderTop: `2px dashed ${C.red}` }} />Resistenze: massimo 1 mese / 3 mesi</span>
              <span className="flex items-center gap-1.5"><span style={{ width: 18, borderTop: `2px dashed ${C.green}` }} />Supporti: minimo 1 mese / 3 mesi</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mt-2">
              <SafeChart height={120}><ResponsiveContainer><BarChart data={tech}><XAxis dataKey="d" hide /><YAxis {...ax} width={32} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Bar dataKey="v" name="Volumi (mln)" fill={C.gray} /></BarChart></ResponsiveContainer></SafeChart>
              <SafeChart height={120}><ResponsiveContainer><LineChart data={tech}><XAxis dataKey="d" hide /><YAxis {...ax} domain={[0, 100]} width={28} /><Tooltip {...tip} formatter={(x) => nf(x, 1)} /><ReferenceLine y={70} stroke={C.red} strokeDasharray="3 3" /><ReferenceLine y={30} stroke={C.green} strokeDasharray="3 3" /><Line dataKey="rsi" name="RSI(14)" stroke={C.purple} dot={false} /></LineChart></ResponsiveContainer></SafeChart>
              <SafeChart height={120}><ResponsiveContainer><ComposedChart data={tech}><XAxis dataKey="d" hide /><YAxis {...ax} width={32} /><Tooltip {...tip} formatter={(x) => nf(x, 3)} /><Bar dataKey="hist" name="Istogramma">{tech.map((r, i) => <Cell key={i} fill={r.hist >= 0 ? C.green : C.red} />)}</Bar><Line dataKey="macd" name="MACD" stroke={C.blue} dot={false} /><Line dataKey="sig" name="Signal" stroke={C.amber} dot={false} /></ComposedChart></ResponsiveContainer></SafeChart>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-sm">
              <Stat k="Trend" v={trend[0]} c={trend[1]} />
              <Stat k="Supporti" v={(q.support || []).filter(num).map((x) => nf(x)).join(" · ") || "n.d."} />
              <Stat k="Resistenze" v={(q.resistance || []).filter(num).map((x) => nf(x)).join(" · ") || "n.d."} />
              <Stat k="SMA 50 / 200" v={`${nf(s50)} / ${nf(s200)}`} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-sm">{signals.map(([t, c], i) => <span key={i} className={`px-2 py-1 rounded-full border ${th.card} ${c}`}>{t}</span>)}</div>
          </Card>
        )}

        {f && (
          <>
            <Card title="Analisi fondamentale" meta={<Meta d={f.asOf} src={f.source} extra={f.isLatest === false} />}>
              <p className={`text-xs mb-2 ${th.mute}`}>Ultimo bilancio pubblicato: {f.lastReportDate || "n.d."} · importi in milioni ({q?.currency || ""})</p>
              <div className="grid md:grid-cols-2 gap-4">
                <SafeChart height={chartH}><ResponsiveContainer><BarChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={42} tickFormatter={cf} /><Tooltip {...tip} formatter={(x) => cf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFmt} /><Bar dataKey="rev" name="Ricavi" fill={C.blue} /><Bar dataKey="ebitda" name="EBITDA" fill={C.purple} /><Bar dataKey="ni" name="Utile netto" fill={C.green} /></BarChart></ResponsiveContainer></SafeChart>
                <SafeChart height={chartH}><ResponsiveContainer><LineChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={36} unit="%" /><Tooltip {...tip} formatter={(x) => nf(x, 1) + "%"} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFmt} /><Line dataKey="gm" name="Margine lordo" stroke={C.blue} /><Line dataKey="om" name="Operativo" stroke={C.amber} /><Line dataKey="nm" name="Netto" stroke={C.green} /></LineChart></ResponsiveContainer></SafeChart>
                <SafeChart height={chartH}><ResponsiveContainer><BarChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={42} tickFormatter={cf} /><Tooltip {...tip} formatter={(x) => cf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFmt} /><Bar dataKey="fcf" name="Free cash flow" fill={C.teal} /><Bar dataKey="eps" name="EPS" fill={C.amber} /></BarChart></ResponsiveContainer></SafeChart>
                <SafeChart height={chartH}><ResponsiveContainer><BarChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={36} unit="%" /><Tooltip {...tip} formatter={(x) => pf(x)} /><Bar dataKey="g" name="Crescita ricavi a/a">{annual.map((r, i) => <Cell key={i} fill={r.g >= 0 ? C.green : C.red} />)}</Bar></BarChart></ResponsiveContainer></SafeChart>
              </div>
              {(f.quarters || []).length > 0 && (
                <div className="overflow-x-auto mt-3"><table className="w-full text-xs"><thead><tr className={th.mute}><th className="text-left p-1">Trimestre</th><th className="text-right p-1">Ricavi</th><th className="text-right p-1">Utile netto</th><th className="text-right p-1">EPS</th></tr></thead><tbody>{f.quarters.map((r, i) => <tr key={i} className={`border-t ${th.card}`}><td className="p-1">{r.p}</td><td className="text-right p-1">{cf(r.rev)}</td><td className={`text-right p-1 ${cfColor(r.ni)}`}>{cf(r.ni)}</td><td className={`text-right p-1 ${cfColor(r.eps)}`}>{nf(r.eps)}</td></tr>)}</tbody></table></div>
              )}
            </Card>
            <Card title="Solidità patrimoniale" meta={<Meta d={f.asOf} src={f.source} extra={f.isLatest === false} />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <Stat k="Debito netto / EBITDA" v={S?.derived.nde != null ? nf(S.derived.nde) + "x" : "n.d."} c={lvl(S?.derived.nde, 2, 4, true)} />
                <Stat k="Debt / Equity" v={bal.equity ? nf(bal.totalDebt / bal.equity) : "n.d."} c={bal.equity ? lvl(bal.totalDebt / bal.equity, 0.8, 2, true) : ""} />
                <Stat k="Current ratio" v={nf(bal.currentRatio)} c={lvl(bal.currentRatio, 1, 1.5)} />
                <Stat k="Copertura interessi" v={bal.interestCover != null ? nf(bal.interestCover) + "x" : "n.d."} c={lvl(bal.interestCover, 2, 5)} />
                <Stat k="ROE" v={bal.roe != null ? nf(bal.roe) + "%" : "n.d."} c={lvl(bal.roe, 8, 15)} />
                <Stat k="ROIC" v={bal.roic != null ? nf(bal.roic) + "%" : "n.d."} c={lvl(bal.roic, 6, 12)} />
              </div>
            </Card>
          </>
        )}


        {data.events && (
          <Card title="Earnings & Dividend Intelligence" meta={<Meta d={data.events.asOf} src={data.events.source} />}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="font-semibold text-sm mb-2">Calendario risultati</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat k="Prossima trimestrale" v={data.events.earnings?.nextDate || "n.d."} />
                  <Stat k="Periodo stima" v={data.events.earnings?.estimatePeriod || "n.d."} />
                  <Stat k="EPS atteso" v={nf(data.events.earnings?.epsEstimate)} />
                  <Stat k="Ricavi attesi" v={cf(data.events.earnings?.revenueEstimate)} />
                </div>
                {(data.events.earnings?.history || []).length > 0 && (
                  <div className="overflow-x-auto mt-2"><table className="w-full text-xs"><thead><tr className={th.mute}><th className="text-left p-1">Periodo</th><th className="text-right p-1">EPS effettivo</th><th className="text-right p-1">Stima</th><th className="text-right p-1">Sorpr. %</th></tr></thead><tbody>
                    {data.events.earnings.history.slice().reverse().map((x,i) => <tr key={i} className={`border-t ${th.card}`}><td className="p-1">{x.quarter || "n.d."}</td><td className="text-right p-1">{nf(x.epsActual)}</td><td className="text-right p-1">{nf(x.epsEstimate)}</td><td className="text-right p-1">{pf(x.surprisePct)}</td></tr>)}
                  </tbody></table></div>
                )}
              </div>
              <div>
                <div className="font-semibold text-sm mb-2">Dividendi</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat k="Dividendo annuo / azione" v={data.events.dividends?.annualRate != null ? nf(data.events.dividends.annualRate) + " " + (q?.currency || "") : "n.d."} />
                  <Stat k="Dividend yield" v={data.events.dividends?.yield != null ? nf(data.events.dividends.yield, 2) + "%" : "n.d."} />
                  <Stat k="Payout ratio" v={data.events.dividends?.payoutRatio != null ? nf(data.events.dividends.payoutRatio, 1) + "%" : "n.d."} />
                  <Stat k="Ex-dividend date" v={data.events.dividends?.exDividendDate || "n.d."} />
                  <Stat k="Yield medio 5 anni" v={data.events.dividends?.fiveYearAvgYield != null ? nf(data.events.dividends.fiveYearAvgYield, 2) + "%" : "n.d."} />
                </div>
                {(data.events.dividends?.history || []).length > 0 && (
                  <div className="overflow-x-auto mt-2"><table className="w-full text-xs"><thead><tr className={th.mute}><th className="text-left p-1">Data stacco</th><th className="text-right p-1">Importo / azione</th></tr></thead><tbody>
                    {data.events.dividends.history.slice(-8).reverse().map((x,i) => <tr key={i} className={`border-t ${th.card}`}><td className="p-1">{x.date}</td><td className="text-right p-1">{nf(x.amount)} {q?.currency || ""}</td></tr>)}
                  </tbody></table></div>
                )}
              </div>
            </div>
            <p className={`text-xs mt-3 ${th.mute}`}>Date, stime e dividendi dipendono dalla copertura Yahoo Finance e possono essere assenti o soggetti a revisione. Il dividend yield è indicativo, non garantito; la data di pagamento non è esposta da questa fonte in modo uniforme. I dati non modificano il punteggio.</p>
          </Card>
        )}

        {v && (
          <Card title="Valutazione" meta={<Meta d={v.asOf} src={v.source} />}>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className={`text-xs ${th.mute}`}><th className="text-left p-1">Multiplo</th><th className="text-right p-1">Attuale</th><th className="text-right p-1">Settore</th><th className="text-right p-1">Storico 5a</th><th className="text-right p-1">Scostam.</th></tr></thead>
              <tbody>{valMetrics.map((m) => {
                const useSector = num(m.sector) > 0;
                const refV = useSector ? m.sector : num(m.hist5y) > 0 ? m.hist5y : null;
                const diffSector = num(m.v) != null && refV != null ? (m.v / refV - 1) * 100 : null;

                return (
                  <tr key={m.k} className={`border-t ${th.card}`}>
                    <td className="p-1 font-medium">{m.k}</td>
                    <td className="text-right p-1">{nf(m.v)}</td>
                    <td className="text-right p-1">{nf(m.sector)}</td>
                    <td className="text-right p-1">{nf(m.hist5y)}</td>
                    <td className="text-right p-1">{pf(diffSector)}{diffSector != null && <div className={`text-[10px] ${th.mute}`}>{useSector ? "sett." : "stor."}</div>}</td>
                  </tr>
                );
              })}</tbody></table></div>
            <SafeChart height={210}>
              <div className="mt-3"><ResponsiveContainer><BarChart data={valMetrics.filter((m) => !m.k.includes("%"))}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={32} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFmt} /><Bar dataKey="v" name="Titolo" fill={C.blue} /><Bar dataKey="sector" name="Settore" fill={C.gray} /><Bar dataKey="hist5y" name="Storico 5a" fill={C.amber} /></BarChart></ResponsiveContainer></div>
            </SafeChart>
            <div className={`text-xs mt-2 ${th.mute}`}>Settore = mediana di titoli simili{(v.peers || []).length ? ` (${v.peers.length})` : " (non disponibile)"}. Storico = mediana dei valori trimestrali{v.histYears ? ` degli ultimi ${nf(v.histYears, 1)} anni` : " (non disponibile)"}. Scostamento: contro il settore, in mancanza contro lo storico.</div>
            {(v.peers || []).length > 0 && <div className={`text-xs mt-2 ${th.mute}`}>Concorrenti: {v.peers.map((c) => `${c.name} (P/E ${nf(c.pe, 1)}, EV/EBITDA ${nf(c.evEbitda, 1)})`).join(" · ")}</div>}
          </Card>
        )}

        {(a || n || mkt) && (() => {
          const hasTarget = num(a?.targetMean) != null;
          const hasRatings = !!pctRatings && pctRatings.buy + pctRatings.hold + pctRatings.sell > 0;
          const srcLabel = [a && a.source && a.source !== "n.d." ? a.source : null, mkt ? "Yahoo Finance" + (mkt.bench ? " (indice " + mkt.bench.name + ")" : "") : null].filter(Boolean).join(" · ") || n?.source;
          const mk = mkt?.stock;
          const rsData = mk ? [["3 mesi", "r13"], ["6 mesi", "r26"], ["12 mesi", "r52"]].map(([k, key]) => ({ k, Titolo: num(mk[key]), ...(mkt.index ? { [mkt.bench.name]: num(mkt.index[key]) } : {}) })).filter((r) => r.Titolo != null) : [];
          return (
          <Card title="Sentiment di mercato" meta={<Meta d={a?.asOf || n?.asOf} src={srcLabel} />}>
            {(hasTarget || hasRatings) ? (
              <div className="grid md:grid-cols-2 gap-4">
                {hasTarget && (
                  <div>
                    <div className="grid grid-cols-4 gap-2 text-sm mb-2"><Stat k="Prezzo" v={nf(p)} /><Stat k="Target medio" v={nf(a.targetMean)} c={S?.derived.up != null ? (S.derived.up >= 0 ? "text-emerald-500" : "text-red-500") : ""} />{num(a.targetMin) != null && <Stat k="Min" v={nf(a.targetMin)} />}{num(a.targetMax) != null && <Stat k="Max" v={nf(a.targetMax)} />}</div>
                    <SafeChart height={150}>
                      <ResponsiveContainer><BarChart data={[{ k: "Prezzo", v: p }, ...(num(a.targetMin) != null ? [{ k: "Min", v: num(a.targetMin) }] : []), { k: "Medio", v: num(a.targetMean) }, ...(num(a.targetMax) != null ? [{ k: "Max", v: num(a.targetMax) }] : [])]}><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={38} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Bar dataKey="v">{[C.blue, C.red, C.amber, C.green].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer>
                    </SafeChart>
                    <div className={`text-xs ${th.mute}`}>Upside verso target medio: <span className={cfColor(S?.derived.up)}>{pf(S?.derived.up)}</span>{a.nAnalysts ? ` · analisti: ${a.nAnalysts}` : ""}</div>
                  </div>
                )}
                {hasRatings && (
                  <div>
                    <div className="text-sm font-medium mb-1">Distribuzione rating</div>
                    <SafeChart height={150}>
                      <ResponsiveContainer><BarChart data={[{ k: "Buy", v: pctRatings.buy }, { k: "Hold", v: pctRatings.hold }, { k: "Sell", v: pctRatings.sell }]}><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={26} allowDecimals={false} /><Tooltip {...tip} /><Bar dataKey="v" name="Analisti">{[C.green, C.amber, C.red].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer>
                    </SafeChart>
                    <div className={`text-xs ${th.mute}`}>Analisti: {a.nAnalysts}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className={`text-xs mb-1 ${th.mute}`}>Consenso degli analisti (target price e rating) non disponibile per questo titolo: la copertura gratuita è limitata e dipende dai dati restituiti da Yahoo Finance o, per alcuni titoli USA, da Alpha Vantage. Il punteggio si basa sulla forza relativa.</div>
            )}
            {rsData.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium mb-1">Forza relativa e momentum{mkt.bench ? ` (titolo contro ${mkt.bench.name})` : ""}</div>
                <SafeChart height={160}>
                  <ResponsiveContainer><BarChart data={rsData}><CartesianGrid strokeDasharray="3 3" stroke={th.grid} /><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={38} unit="%" /><Tooltip {...tip} formatter={(x) => pf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} formatter={legendFmt} /><Bar dataKey="Titolo" fill={C.blue} />{mkt.index && <Bar dataKey={mkt.bench.name} fill={C.gray} />}</BarChart></ResponsiveContainer>
                </SafeChart>
                <div className={`text-xs ${th.mute}`}>
                  {S?.derived.rsEx != null && <span>Rispetto all'indice su 12 mesi: <span className={cfColor(S.derived.rsEx)}>{(S.derived.rsEx >= 0 ? "+" : "") + nf(S.derived.rsEx, 1)} punti</span> · </span>}
                  {mkt.pos52 != null && <span>Posizione nel range a 52 settimane: {mkt.pos52}% (0% = minimo, 100% = massimo)</span>}
                </div>
              </div>
            )}
            {n && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium">Notizie recenti</div>
                {n.officialSentiment && (
                  <div className={`p-2 rounded-lg border text-xs mb-2 ${th.card}`}>
                    <span className="font-semibold text-emerald-500">Tono complessivo delle notizie:</span> {n.officialSentiment}
                  </div>
                )}
                {(n.items || []).map((it, i) => (
                  <div key={i} className={`rounded-lg border p-2 text-sm ${th.card}`}>
                    <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${it.sentiment === "pos" ? "bg-emerald-500" : it.sentiment === "neg" ? "bg-red-500" : "bg-amber-500"}`} /><span className="font-medium flex-1">{it.title}</span></div>
                    <div className={`text-xs mt-0.5 ${th.mute}`}>{[it.date, it.source].filter(Boolean).join(" · ")}{it.summary ? " — " + it.summary : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          );
        })()}

        {S && step === STEPS.length && (
          <>
            <Card title="Punteggi">
              <div className="grid md:grid-cols-2 gap-4 items-center">
                <SafeChart height={250}>
                  <ResponsiveContainer><RadarChart data={radar}><PolarGrid stroke={th.grid} /><PolarAngleAxis dataKey="k" tick={{ fill: th.txt, fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: th.txt }} /><Radar dataKey="v" stroke={C.green} fill={C.green} fillOpacity={0.35} /><Tooltip {...tip} formatter={(x) => nf(x, 0)} /></RadarChart></ResponsiveContainer>
                </SafeChart>
                <div className="text-sm space-y-1">
                  {Object.entries(WEIGHTS).map(([k, w]) => (<div key={k} className="flex justify-between border-b py-1" style={{ borderColor: th.grid }}><span>{k} <span className={th.mute}>(peso {Math.round(w * 100)}%)</span></span><b>{S.scores[k] != null ? nf(S.scores[k], 0) : "n.d."}</b></div>))}
                  <div className="flex justify-between pt-1 text-base"><span>Punteggio complessivo</span><b>{S.overall != null ? nf(S.overall, 0) + "/100" : "n.d."}</b></div>
                  <div className={`text-xs ${th.mute}`}>Media ponderata sui soli punteggi disponibili. Affidabilità analisi: {S.rel}%</div>
                  {!S.readiness.ready && <div role="alert" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs"><b>Segnale sospeso — dati insufficienti.</b><ul className="list-disc pl-4 mt-1">{S.readiness.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>}
                </div>
              </div>
            </Card>

            <Card title="Giudizio finale">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`px-4 py-2 rounded-lg text-white font-bold text-lg ${LABEL_COLOR[label]}`}>{label}</span>
                <div className="text-sm"><div>Confidenza: <b>{S.rel >= 75 ? "Alta" : S.rel >= 50 ? "Media" : "Bassa"}</b> ({S.rel}%)</div><div className={th.mute}>Orizzonte: {fi?.horizon || "n.d."}</div></div>
              </div>
              {S.readiness.ready && fi && !fi.failed ? (
                <>
                  <p className="text-sm leading-relaxed">{fi.motivation}</p>
                  <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
                    <div className={`rounded-lg border p-3 ${th.card}`}><div className="font-medium text-emerald-500 mb-1 flex items-center gap-1"><CheckCircle2 size={14} />Punti di forza</div><ul className="list-disc pl-4 space-y-1">{(fi.strengths || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                    <div className={`rounded-lg border p-3 ${th.card}`}><div className="font-medium text-red-500 mb-1 flex items-center gap-1"><AlertTriangle size={14} />Rischi</div><ul className="list-disc pl-4 space-y-1">{(fi.risks || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm"><Stat k="Ingresso" v={fi.entry || "n.d."} c="text-blue-500" /><Stat k="Stop" v={fi.stop || "n.d."} c="text-red-500" /><Stat k="Target" v={fi.target || "n.d."} c="text-emerald-500" /></div>
                </>
              ) : (
                <div className="text-sm flex items-center gap-3"><span className={th.mute}>Motivazione non disponibile (errore API).</span><button onClick={() => run(cur, true)} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white">Riprova</button></div>
              )}
              {n?.risks?.length > 0 && <div className={`text-xs mt-3 ${th.mute}`}>Rischi segnalati dalle fonti: {n.risks.join(" · ")}</div>}
            </Card>
          </>
        )}

        <div className={`rounded-xl border p-3 text-xs flex gap-2 ${th.card} ${th.mute}`}>
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>Analisi informativa e automatizzata, non è consulenza finanziaria. I dati possono contenere errori: verificarli su fonti ufficiali prima di qualsiasi decisione.</span>
        </div>
      </div>
    </div>
  );
}