import { useState, useMemo } from "react";
import { ComposedChart, LineChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell } from "recharts";
import { Search, RefreshCw, Sun, Moon, AlertTriangle, TrendingUp, TrendingDown, Clock, Loader2, Info, CheckCircle2, Key } from "lucide-react";

const COMMON = (t) => `Sei un analista finanziario. Data odierna: ${new Date().toISOString()}.
REGOLE RIGIDE SULLE FONTI DI DATI PER ${t}:
1. PER I DATI CORRENTI E AGGIORNATI AD OGGI: Usa ESCLUSIVAMENTE INVESTING.COM (it.investing.com o www.investing.com) tramite la ricerca Google.
2. PER I DATI STORICI (bilanci passati, multipli storici, serie storiche dei prezzi): Cerca e verifica sui siti ufficiali di: Yahoo Finance, SEC EDGAR, FRED (Federal Reserve Economic Data), dati accademici (Fama-French, Robert Shiller, Aswath Damodaran), Borsa Italiana, Alpha Vantage, MacroTrends e StockAnalysis.
3. CRITERIO DI CONSENSO: Se riscontri discrepanze nei dati storici tra diverse fonti, seleziona sempre i valori maggiormente condivisi dalla maggioranza delle fonti citate.
4. Non inventare MAI numeri: se un dato non è reperibile usa null.
5. In ogni blocco indica "source" (es. "Investing.com" o "Consenso: Yahoo Finance / SEC EDGAR / MacroTrends") e "asOf" (data YYYY-MM-DD). Numeri come number (non stringhe); percentuali in punti percentuali (es. 12.5). Se "${t}" non corrisponde a nessun titolo quotato rispondi {"error":"not_found"}. Schema JSON richiesto:\n`;

const SCHEMAS = {
  quote: `{"name":"","ticker":"","exchange":"","currency":"","price":0,"prevClose":0,"changePct":0,"marketCap":0,"asOf":"","source":"Investing.com","sma50":null,"sma200":null,"rsi14":null,"support":[0,0],"resistance":[0,0],"history":[["YYYY-MM-DD",chiusuraSettimanale,volumeSettimanale]]}  -- quotazione corrente da Investing.com; history: ultime ~104 chiusure SETTIMANALI storiche (2 anni) verificate su Yahoo Finance / Borsa Italiana / StockAnalysis, ordine cronologico, volume in milioni.`,
  fin: `{"annual":[{"y":2025,"rev":0,"ni":0,"ebitda":0,"gp":0,"op":0,"eps":0,"fcf":0}],"quarters":[{"p":"Q1 2026","rev":0,"ni":0,"eps":0}],"balance":{"netDebt":0,"totalDebt":0,"equity":0,"currentRatio":0,"interestCover":0,"roe":0,"roic":0},"lastReportDate":"","isLatest":true,"asOf":"","source":"SEC EDGAR / Yahoo Finance / MacroTrends"}  -- bilanci storici (ultimi 4-5 anni) e trimestrali recuperati da SEC EDGAR, Yahoo Finance, MacroTrends, StockAnalysis (importi in milioni).`,
  val: `{"metrics":[{"k":"P/E","v":0,"sector":0,"hist5y":0}],"peers":[{"name":"","pe":0,"evEbitda":0}],"asOf":"","source":"Investing.com / Damodaran / StockAnalysis"}  -- multipli attuali da Investing.com; medie storiche 5a e parametri di settore da Damodaran / StockAnalysis / MacroTrends.`,
  an: `{"targetMean":0,"targetMin":0,"targetMax":0,"ratings":{"buy":0,"hold":0,"sell":0},"nAnalysts":0,"asOf":"","source":"Investing.com"}  -- target price e rating correnti da Investing.com.`,
  news: `{"items":[{"date":"","title":"","sentiment":"pos|neu|neg","summary":"","source":""}],"officialSentiment":"","risks":["",""],"asOf":"","source":"Alpha Vantage / Yahoo Finance / Finviz / SEC EDGAR"}  -- TRADUCI SEMPRE E OBBLIGATORIAMENTE TUTTI I TITOLI ("title"), I RIASSUNTI ("summary"), IL TONO UFFICIALE ("officialSentiment") E I RISCHI ("risks") IN LINGUA ITALIANA. Sentiment integrato in 3 livelli: 1) Score di base Alpha Vantage; 2) Notizie Yahoo Finance / Finviz analizzate con approccio NLP/FinBERT; 3) Tono dei filing SEC EDGAR (8-K, 10-K) valutato tramite dizionario Loughran-McDonald.`,
  final: `{"horizon":"","motivation":"5-8 righe che citano numeri concreti dai dati estratti","strengths":["","",""],"risks":["",""],"entry":"","stop":"","target":""}  -- livelli indicativi in valuta del titolo.`,
};

const TASKS = {
  quote: (t) => `Cerca su Investing.com la quotazione corrente, i dati tecnici aggiornati (SMA50, SMA200, RSI 14, supporti, resistenze) per: ${t}. Per lo storico prezzi degli ultimi 1-2 anni fai riferimento a Yahoo Finance, Borsa Italiana o StockAnalysis.`,
  fin: (t) => `Cerca i bilanci annuali storici (ultimi 4-5 anni), i dati trimestrali e lo stato patrimoniale di ${t} incrociando i dati di SEC EDGAR, Yahoo Finance, MacroTrends e StockAnalysis (usa la maggioranza in caso di discrepanze).`,
  val: (t) => `Cerca i multipli di valutazione attuali su Investing.com per ${t}. Per le medie storiche a 5 anni e le metriche di settore/concorrenti, consulta Damodaran, MacroTrends e StockAnalysis.`,
  an: (t) => `Cerca nella sezione Target degli Analisti / Consenso di Investing.com il target price e la distribuzione dei rating per: ${t}.`,
  news: (t) => `Esegui un'analisi del sentiment a tre livelli per ${t}:
1. Base rapida: recupera lo score di sentiment automatico e backtestabile di Alpha Vantage.
2. Approfondimento notizie: raccogli gli ultimi titoli/notizie da Yahoo Finance e Finviz ed effettua una classificazione NLP fine (stile FinBERT: pos, neu, neg).
3. Tono ufficiale: esamina gli ultimi filing SEC EDGAR (es. 8-K, 10-K, relazioni trimestrali) applicando i criteri del dizionario finanziario Loughran-McDonald (misurando tono positivo/negativo/incertezza nella comunicazione diretta dell'azienda).
IMPORTANTE: Traduci SEMPRE tutti i testi (titoli delle notizie, sintesi, analisi del tono ufficiale e descrizione dei rischi) rigorosamente in ITALIANO. Riassumi i risultati principali, le notizie più rilevanti e i rischi emersi.`,
};

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

async function callGeminiAPI(systemInstruction, userPrompt, useSearch = true) {
  let apiKey = "";
  try { apiKey = localStorage.getItem("gemini_api_key") || ""; } catch (e) {}
  if (!apiKey) throw new Error("Chiave API Gemini mancante: inseriscila con l'icona della chiave in alto.");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { responseMimeType: "application/json" }
  };

  if (useSearch) {
    payload.tools = [{ "google_search": {} }];
  }

  let delay = 1000;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        throw new Error("API 429: Rate limit raggiunto.");
      }
      if (!response.ok) {
        throw new Error(`Errore HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      const candidate = result.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error("Risposta vuota o non valida ricevuta dal modello.");
      }

      const parsed = parseJSON(text);
      if (!parsed) {
        throw new Error("Impossibile interpretare il JSON restituito.");
      }
      return parsed;
    } catch (err) {
      if (attempt === 3 || /mancante|HTTP 40[0-3]/.test(err.message)) throw err;
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
}

const nf = (n, d = 2) => (n == null || isNaN(n) ? "n.d." : Number(n).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));
const cf = (n) => (n == null || isNaN(n) ? "n.d." : Number(n).toLocaleString("it-IT", { notation: "compact", maximumFractionDigits: 2 }));
const pf = (n) => (n == null || isNaN(n) ? "n.d." : (n > 0 ? "+" : "") + nf(n) + "%");
const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
const clamp = (x) => Math.max(0, Math.min(100, x));
const sc = (x, lo, hi) => (num(x) == null ? null : clamp(((x - lo) / (hi - lo)) * 100));
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const daysOld = (d) => { const t = Date.parse(d); return isNaN(t) ? null : (Date.now() - t) / 864e5; };

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

const STEPS = ["Recupero quotazioni…", "Analisi bilanci…", "Multipli e confronto settore…", "Target e rating analisti…", "Notizie e rischi…", "Giudizio finale…"];
const WEIGHTS = { "Trend tecnico": 0.2, Crescita: 0.2, Redditività: 0.15, "Solidità finanziaria": 0.15, Valutazione: 0.15, Sentiment: 0.15 };

function buildTech(q) {
  const h = (q?.history || []).filter((r) => Array.isArray(r) && num(r[1]) != null);
  const closes = h.map((r) => r[1]);
  const s10 = sma(closes, 10), s40 = sma(closes, 40), r = rsi(closes), e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macd = e12.map((x, i) => x - e26[i]), sig = ema(macd, 9);
  const rows = h.map((x, i) => ({ d: x[0], c: x[1], v: num(x[2]), s50: s10[i], s200: s40[i], rsi: r[i], macd: macd[i], sig: sig[i], hist: macd[i] - sig[i] }));
  return rows.slice(-52);
}

function computeScores(D, tech) {
  const q = D.quote, f = D.fin, v = D.val, a = D.an;
  const last = tech[tech.length - 1];
  const s50 = num(q?.sma50) ?? last?.s50, s200 = num(q?.sma200) ?? last?.s200, p = num(q?.price);
  const rs = num(q?.rsi14) ?? last?.rsi;
  const tS = q ? avg([p != null && s200 != null ? (p > s200 ? 100 : 0) : null, p != null && s50 != null ? (p > s50 ? 100 : 0) : null, rs != null ? clamp(100 - Math.abs(rs - 55) * 3) : null, last ? (last.hist > 0 ? 100 : 25) : null]) : null;
  const an = (f?.annual || []).slice().sort((x, y) => x.y - y.y), la = an[an.length - 1], fa = an[0], pa = an[an.length - 2];
  const cagr = la && fa && an.length > 1 && fa.rev > 0 && la.rev > 0 ? (Math.pow(la.rev / fa.rev, 1 / (an.length - 1)) - 1) * 100 : null;
  const epsG = la && pa && pa.eps > 0 ? (la.eps / pa.eps - 1) * 100 : null;
  const gS = avg([sc(cagr, -5, 15), sc(epsG, -10, 20)]);
  const b = f?.balance || {};
  const nm = la && la.rev ? (la.ni / la.rev) * 100 : null, om = la && la.rev ? (la.op / la.rev) * 100 : null;
  const rS = avg([sc(nm, 0, 25), sc(om, 0, 30), sc(b.roe, 0, 25)]);
  const nde = la && la.ebitda > 0 && num(b.netDebt) != null ? b.netDebt / la.ebitda : null;
  const sS = avg([nde != null ? sc(4 - nde, 0, 4) : null, sc(b.currentRatio, 0.8, 2), sc(b.interestCover, 1, 10)]);
  const vS = avg((v?.metrics || []).filter((m) => ["P/E", "P/E forward", "PEG", "P/B", "EV/EBITDA", "P/FCF"].includes(m.k) && num(m.v) != null && num(m.sector) > 0).map((m) => sc(1.5 - m.v / m.sector, 0, 1)));
  const up = a && p && num(a.targetMean) ? (a.targetMean / p - 1) * 100 : null;
  const tot = a?.ratings ? a.ratings.buy + a.ratings.hold + a.ratings.sell : 0;
  const seS = avg([sc(up, -10, 25), tot ? sc(a.ratings.buy / tot, 0.2, 0.8) : null]);
  const scores = { "Trend tecnico": tS, Crescita: gS, Redditività: rS, "Solidità finanziaria": sS, Valutazione: vS, Sentiment: seS };
  let wsum = 0, tot2 = 0;
  Object.entries(scores).forEach(([k, s]) => { if (s != null) { wsum += WEIGHTS[k]; tot2 += s * WEIGHTS[k]; } });
  const overall = wsum ? tot2 / wsum : null;
  let rel = (Object.values(scores).filter((x) => x != null).length / 6) * 100;
  const stale = daysOld(q?.asOf) > 2 || f?.isLatest === false;
  if (stale) rel -= 15;
  return { scores, overall, rel: Math.max(0, Math.round(rel)), derived: { cagr, epsG, nm, om, nde, up } };
}
const labelOf = (s) => (s == null ? "n.d." : s >= 75 ? "COMPRARE" : s >= 62 ? "ACCUMULARE" : s >= 45 ? "MANTENERE" : s >= 32 ? "EVITARE" : "VENDERE");
const LABEL_COLOR = { COMPRARE: "bg-emerald-600", ACCUMULARE: "bg-green-500", MANTENERE: "bg-amber-500", EVITARE: "bg-orange-600", VENDERE: "bg-red-600", "n.d.": "bg-slate-500" };

function SafeChart({ height = 190, children }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>Grafico non disponibile</div>;
  return (
    <div style={{ height }} onError={() => setHasError(true)}>
      {children}
    </div>
  );
}

export default function AnalizzatoreAzionario() {
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cur, setCur] = useState("");
  const [data, setData] = useState({});
  const [step, setStep] = useState(-1);
  const [err, setErr] = useState(null);
  const [hist, setHist] = useState([]);
  const [showKey, setShowKey] = useState(false);
  const [keyVal, setKeyVal] = useState(() => { try { return localStorage.getItem("gemini_api_key") || ""; } catch (e) { return ""; } });
  const busy = step >= 0 && step < STEPS.length;
  const th = dark ? { bg: "bg-slate-950 text-slate-100", card: "bg-slate-900 border-slate-800", mute: "text-slate-400", inp: "bg-slate-900 border-slate-700 text-slate-100", grid: "#334155", txt: "#94a3b8", dropdown: "bg-slate-900 border-slate-700 hover:bg-slate-800" } : { bg: "bg-slate-50 text-slate-900", card: "bg-white border-slate-200", mute: "text-slate-500", inp: "bg-white border-slate-300 text-slate-900", grid: "#e2e8f0", txt: "#64748b", dropdown: "bg-white border-slate-200 hover:bg-slate-100" };
  const ax = { stroke: th.txt, fontSize: 10, tickLine: false };

  const filteredSuggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.toLowerCase();
    return POPULAR_TICKERS.filter(item => item.ticker.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)).slice(0, 5);
  }, [input]);

  async function run(t, resume) {
    const target = (t ?? input).trim(); if (!target || busy) return;
    setShowSuggestions(false);
    setCur(target); setErr(null); setStep(0);
    if (!resume) setData({});
    setHist((h) => [target, ...h.filter((x) => x.toLowerCase() !== target.toLowerCase())].slice(0, 8));
    const acc = resume ? { ...data } : {};
    try {
      for (let i = 0; i < 5; i++) {
        const k = ["quote", "fin", "val", "an", "news"][i];
        if (acc[k]) continue;
        setStep(i);
        const d = await callGeminiAPI(COMMON(target) + SCHEMAS[k], TASKS[k](target), true);
        if (d.error === "not_found") throw new Error("NOT_FOUND");
        acc[k] = d; setData({ ...acc });
      }
      setStep(5);
      const tech = buildTech(acc.quote);
      const S = computeScores(acc, tech);
      const label = labelOf(S.overall);
      const ctx = JSON.stringify({ ...acc, quote: { ...acc.quote, history: undefined }, punteggi: S.scores, punteggioComplessivo: S.overall, etichettaObbligata: label, indicatori: S.derived });
      if (acc.final && !acc.final.failed) { setStep(STEPS.length); return; }
      try {
        const fin = await callGeminiAPI(`Sei un analista finanziario. L'etichetta ${label} è già stabilita: motiva coerentemente usando SOLO i dati estratti da Investing.com.`, `Dati estratti da Investing.com:\n${ctx}\n${SCHEMAS.final}`, false);
        acc.final = fin; setData({ ...acc });
      } catch (e) { acc.final = { failed: true }; setData({ ...acc }); }
      setStep(STEPS.length);
    } catch (e) {
      setErr(e.message === "NOT_FOUND" ? "Titolo non trovato su Investing.com. Controlla sigla o nome (es. AAPL, ENI.MI)." : "Errore nel recupero dei dati da Investing.com: " + e.message);
      setStep(-1);
    }
  }

  const tech = useMemo(() => buildTech(data.quote), [data.quote]);
  const S = useMemo(() => (data.quote ? computeScores(data, tech) : null), [data, tech]);
  const q = data.quote, f = data.fin, v = data.val, a = data.an, n = data.news, fi = data.final;
  const up = (x) => x != null && x >= 0;

  const Card = ({ title, children, meta }) => (
    <section className={`rounded-xl border p-4 ${th.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-base">{title}</h2>
        {meta}
      </div>
      {children}
    </section>
  );
  const Meta = ({ d, src, extra }) => {
    const old = daysOld(d); const stale = extra ?? (old != null && old > 2);
    return (
      <div className={`flex flex-wrap items-center gap-1.5 text-xs ${th.mute}`}>
        <Clock size={12} /> {d || "n.d."} · {src || "fonte n.d."}
        {stale && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 font-medium flex items-center gap-1"><AlertTriangle size={11} />Dato non aggiornato</span>}
      </div>
    );
  };
  const Stat = ({ k, v, c }) => (<div className={`rounded-lg border p-2 ${th.card}`}><div className={`text-xs ${th.mute}`}>{k}</div><div className={`font-semibold ${c || ""}`}>{v}</div></div>);
  const chartH = 190;
  const tip = { contentStyle: { background: dark ? "#0f172a" : "#fff", border: "1px solid " + th.grid, fontSize: 12 } };

  const annual = (f?.annual || []).slice().sort((x, y) => x.y - y.y).map((r, i, arr) => ({ ...r, gm: r.rev ? (r.gp / r.rev) * 100 : null, om: r.rev ? (r.op / r.rev) * 100 : null, nm: r.rev ? (r.ni / r.rev) * 100 : null, g: i && arr[i - 1].rev ? (r.rev / arr[i - 1].rev - 1) * 100 : null }));
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
  const radar = S ? Object.keys(WEIGHTS).map((k) => ({ k, v: S.scores[k] ?? 0 })) : [];
  const label = S ? labelOf(S.overall) : null;
  const pctRatings = a?.ratings || null;
  const valMetrics = (v?.metrics || []).filter((m) => num(m.v) != null || num(m.sector) != null);

  const cfColor = (n) => (n == null || isNaN(n) ? "" : n > 0 ? "text-emerald-500" : n < 0 ? "text-red-500" : "");

  return (
    <div className={`min-h-screen ${th.bg}`}>
      <div className="max-w-5xl mx-auto p-3 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><TrendingUp className="text-emerald-500" />Analizzatore Azionario Gemini</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowKey(!showKey)} className={`p-2 rounded-lg border ${th.card}`} aria-label="Chiave API"><Key size={16} /></button>
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-lg border ${th.card}`} aria-label="Tema">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </div>
        {showKey && (
          <div className={`rounded-xl border p-3 text-sm space-y-2 ${th.card}`}>
            <div className="font-medium">Chiave API Gemini</div>
            <div className={`text-xs ${th.mute}`}>Salvata solo su questo dispositivo. Creala gratis su aistudio.google.com/apikey</div>
            <div className="flex gap-2">
              <input type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="AIza…" className={`flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm ${th.inp}`} />
              <button onClick={() => { try { localStorage.setItem("gemini_api_key", keyVal.trim()); } catch (e) {} setShowKey(false); setErr(null); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium">Salva</button>
            </div>
          </div>
        )}

        <div className="relative">
          <div className="flex gap-2">
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
              className={`flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm ${th.inp}`} 
            />
            <button onClick={() => { setShowSuggestions(false); run(); }} disabled={busy || !input.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"><Search size={16} />Analizza</button>
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
        {err && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 flex flex-wrap items-center gap-3 text-sm">
            <AlertTriangle className="text-red-500" size={18} /><span className="flex-1 min-w-0 break-words">{err}</span>
            <button onClick={() => run(cur, true)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white">Riprova</button>
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
                <button onClick={() => run(cur)} disabled={busy} className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5 disabled:opacity-50 ${th.card}`}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />Aggiorna dati</button>
              </div>
            </div>
          </Card>
        )}

        {q && tech.length > 0 && (
          <Card title="Analisi tecnica" meta={<Meta d={q.asOf} src={q.source} />}>
            <p className={`text-xs mb-2 ${th.mute}`}>Indicatori calcolati su chiusure settimanali: SMA 50 ≈ 10 sett., SMA 200 ≈ 40 sett.; RSI(14) e MACD(12,26,9) su base settimanale.</p>
            <SafeChart height={230}>
              <ResponsiveContainer><ComposedChart data={tech}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="d" {...ax} minTickGap={40} /><YAxis {...ax} domain={["auto", "auto"]} width={42} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="c" name="Prezzo" stroke="#3b82f6" dot={false} strokeWidth={2} /><Line dataKey="s50" name="SMA 50" stroke="#f59e0b" dot={false} /><Line dataKey="s200" name="SMA 200" stroke="#ef4444" dot={false} />
                {(q.support || []).filter(num).slice(0, 2).map((x, i) => <ReferenceLine key={"s" + i} y={x} stroke="#10b981" strokeDasharray="4 4" />)}
                {(q.resistance || []).filter(num).slice(0, 2).map((x, i) => <ReferenceLine key={"r" + i} y={x} stroke="#ef4444" strokeDasharray="4 4" />)}
              </ComposedChart></ResponsiveContainer>
            </SafeChart>
            <div className="grid sm:grid-cols-3 gap-3 mt-2">
              <SafeChart height={120}><ResponsiveContainer><BarChart data={tech}><XAxis dataKey="d" hide /><YAxis {...ax} width={32} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Bar dataKey="v" name="Volumi (mln)" fill="#64748b" /></BarChart></ResponsiveContainer></SafeChart>
              <SafeChart height={120}><ResponsiveContainer><LineChart data={tech}><XAxis dataKey="d" hide /><YAxis {...ax} domain={[0, 100]} width={28} /><Tooltip {...tip} formatter={(x) => nf(x, 1)} /><ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" /><ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" /><Line dataKey="rsi" name="RSI(14)" stroke="#8b5cf6" dot={false} /></LineChart></ResponsiveContainer></SafeChart>
              <SafeChart height={120}><ResponsiveContainer><ComposedChart data={tech}><XAxis dataKey="d" hide /><YAxis {...ax} width={32} /><Tooltip {...tip} formatter={(x) => nf(x, 3)} /><Bar dataKey="hist" name="Istogramma">{tech.map((r, i) => <Cell key={i} fill={r.hist >= 0 ? "#10b981" : "#ef4444"} />)}</Bar><Line dataKey="macd" name="MACD" stroke="#3b82f6" dot={false} /><Line dataKey="sig" name="Signal" stroke="#f59e0b" dot={false} /></ComposedChart></ResponsiveContainer></SafeChart>
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
                <SafeChart height={chartH}><ResponsiveContainer><BarChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={42} tickFormatter={cf} /><Tooltip {...tip} formatter={(x) => cf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="rev" name="Ricavi" fill="#3b82f6" /><Bar dataKey="ebitda" name="EBITDA" fill="#8b5cf6" /><Bar dataKey="ni" name="Utile netto" fill="#10b981" /></BarChart></ResponsiveContainer></SafeChart>
                <SafeChart height={chartH}><ResponsiveContainer><LineChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={36} unit="%" /><Tooltip {...tip} formatter={(x) => nf(x, 1) + "%"} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line dataKey="gm" name="Margine lordo" stroke="#3b82f6" /><Line dataKey="om" name="Operativo" stroke="#f59e0b" /><Line dataKey="nm" name="Netto" stroke="#10b981" /></LineChart></ResponsiveContainer></SafeChart>
                <SafeChart height={chartH}><ResponsiveContainer><BarChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={42} tickFormatter={cf} /><Tooltip {...tip} formatter={(x) => cf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="fcf" name="Free cash flow" fill="#14b8a6" /><Bar dataKey="eps" name="EPS" fill="#f59e0b" /></BarChart></ResponsiveContainer></SafeChart>
                <SafeChart height={chartH}><ResponsiveContainer><BarChart data={annual}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="y" {...ax} /><YAxis {...ax} width={36} unit="%" /><Tooltip {...tip} formatter={(x) => pf(x)} /><Bar dataKey="g" name="Crescita ricavi a/a">{annual.map((r, i) => <Cell key={i} fill={r.g >= 0 ? "#10b981" : "#ef4444"} />)}</Bar></BarChart></ResponsiveContainer></SafeChart>
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

        {v && (
          <Card title="Valutazione" meta={<Meta d={v.asOf} src={v.source} />}>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className={`text-xs ${th.mute}`}><th className="text-left p-1">Multiplo</th><th className="text-right p-1">Attuale</th><th className="text-right p-1">Settore</th><th className="text-right p-1">Storico 5a</th><th className="text-right p-1">vs settore</th></tr></thead>
              <tbody>{valMetrics.map((m) => {
                const diffSector = num(m.v) != null && num(m.sector) > 0 ? (m.v / m.sector - 1) * 100 : null;

                return (
                  <tr key={m.k} className={`border-t ${th.card}`}>
                    <td className="p-1 font-medium text-slate-900 dark:text-slate-100">{m.k}</td>
                    <td className="text-right p-1 text-slate-900 dark:text-slate-100">{nf(m.v)}</td>
                    <td className="text-right p-1 text-slate-900 dark:text-slate-100">{nf(m.sector)}</td>
                    <td className="text-right p-1 text-slate-900 dark:text-slate-100">{nf(m.hist5y)}</td>
                    <td className="text-right p-1 text-slate-900 dark:text-slate-100">{pf(diffSector)}</td>
                  </tr>
                );
              })}</tbody></table></div>
            <SafeChart height={210}>
              <div className="mt-3"><ResponsiveContainer><BarChart data={valMetrics.filter((m) => !m.k.includes("%"))}><CartesianGrid stroke={th.grid} strokeDasharray="3 3" /><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={32} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="v" name="Titolo" fill="#3b82f6" /><Bar dataKey="sector" name="Settore" fill="#94a3b8" /><Bar dataKey="hist5y" name="Storico 5a" fill="#f59e0b" /></BarChart></ResponsiveContainer></div>
            </SafeChart>
            {(v.peers || []).length > 0 && <div className={`text-xs mt-2 ${th.mute}`}>Concorrenti: {v.peers.map((c) => `${c.name} (P/E ${nf(c.pe, 1)}, EV/EBITDA ${nf(c.evEbitda, 1)})`).join(" · ")}</div>}
          </Card>
        )}

        {(a || n) && (
          <Card title="Sentiment" meta={<Meta d={a?.asOf || n?.asOf} src={a?.source || n?.source} />}>
            {a && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="grid grid-cols-4 gap-2 text-sm mb-2"><Stat k="Prezzo" v={nf(p)} /><Stat k="Target medio" v={nf(a.targetMean)} c={S?.derived.up != null ? (S.derived.up >= 0 ? "text-emerald-500" : "text-red-500") : ""} /><Stat k="Min" v={nf(a.targetMin)} /><Stat k="Max" v={nf(a.targetMax)} /></div>
                  <SafeChart height={150}>
                    <ResponsiveContainer><BarChart data={[{ k: "Prezzo", v: p }, { k: "Min", v: num(a.targetMin) }, { k: "Medio", v: num(a.targetMean) }, { k: "Max", v: num(a.targetMax) }]}><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={38} /><Tooltip {...tip} formatter={(x) => nf(x)} /><Bar dataKey="v">{["#3b82f6", "#ef4444", "#f59e0b", "#10b981"].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer>
                  </SafeChart>
                  <div className={`text-xs ${th.mute}`}>Upside verso target medio: <span className={cfColor(S?.derived.up)}>{pf(S?.derived.up)}</span> · analisti: {a.nAnalysts ?? "n.d."}</div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Distribuzione rating</div>
                  {pctRatings ? (
                    <SafeChart height={150}>
                      <ResponsiveContainer><BarChart data={[{ k: "Buy", v: pctRatings.buy }, { k: "Hold", v: pctRatings.hold }, { k: "Sell", v: pctRatings.sell }]}><XAxis dataKey="k" {...ax} /><YAxis {...ax} width={26} allowDecimals={false} /><Tooltip {...tip} /><Bar dataKey="v" name="Analisti">{["#10b981", "#f59e0b", "#ef4444"].map((c, i) => <Cell key={i} fill={c} />)}</Bar></BarChart></ResponsiveContainer>
                    </SafeChart>
                  ) : <div className={th.mute}>n.d.</div>}
                </div>
              </div>
            )}
            {n && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium">Sentiment Tripartito (Alpha Vantage, NLP/FinBERT su notizie, SEC EDGAR Loughran-McDonald)</div>
                {n.officialSentiment && (
                  <div className={`p-2 rounded-lg border text-xs mb-2 ${th.card}`}>
                    <span className="font-semibold text-emerald-500">Tono Comunicazione Ufficiale (SEC EDGAR / Loughran-McDonald):</span> {n.officialSentiment}
                  </div>
                )}
                {(n.items || []).map((it, i) => (
                  <div key={i} className={`rounded-lg border p-2 text-sm ${th.card}`}>
                    <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${it.sentiment === "pos" ? "bg-emerald-500" : it.sentiment === "neg" ? "bg-red-500" : "bg-amber-500"}`} /><span className="font-medium flex-1">{it.title}</span></div>
                    <div className={`text-xs mt-0.5 ${th.mute}`}>{it.date} · {it.source} — {it.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {S && step === STEPS.length && (
          <>
            <Card title="Punteggi">
              <div className="grid md:grid-cols-2 gap-4 items-center">
                <SafeChart height={250}>
                  <ResponsiveContainer><RadarChart data={radar}><PolarGrid stroke={th.grid} /><PolarAngleAxis dataKey="k" tick={{ fill: th.txt, fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: th.txt }} /><Radar dataKey="v" stroke="#10b981" fill="#10b981" fillOpacity={0.35} /><Tooltip {...tip} formatter={(x) => nf(x, 0)} /></RadarChart></ResponsiveContainer>
                </SafeChart>
                <div className="text-sm space-y-1">
                  {Object.entries(WEIGHTS).map(([k, w]) => (<div key={k} className="flex justify-between border-b py-1" style={{ borderColor: th.grid }}><span>{k} <span className={th.mute}>(peso {Math.round(w * 100)}%)</span></span><b>{S.scores[k] != null ? nf(S.scores[k], 0) : "n.d."}</b></div>))}
                  <div className="flex justify-between pt-1 text-base"><span>Punteggio complessivo</span><b>{S.overall != null ? nf(S.overall, 0) + "/100" : "n.d."}</b></div>
                  <div className={`text-xs ${th.mute}`}>Media ponderata sui soli punteggi disponibili (pesi rinormalizzati). Affidabilità analisi: {S.rel}%</div>
                </div>
              </div>
            </Card>

            <Card title="Giudizio finale">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`px-4 py-2 rounded-lg text-white font-bold text-lg ${LABEL_COLOR[label]}`}>{label}</span>
                <div className="text-sm"><div>Confidenza: <b>{S.rel >= 75 ? "Alta" : S.rel >= 50 ? "Media" : "Bassa"}</b> ({S.rel}%)</div><div className={th.mute}>Orizzonte: {fi?.horizon || "n.d."}</div></div>
              </div>
              {fi && !fi.failed ? (
                <>
                  <p className="text-sm leading-relaxed">{fi.motivation}</p>
                  <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
                    <div className={`rounded-lg border p-3 ${th.card}`}><div className="font-medium text-emerald-500 mb-1 flex items-center gap-1"><CheckCircle2 size={14} />Punti di forza</div><ul className="list-disc pl-4 space-y-1">{(fi.strengths || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                    <div className={`rounded-lg border p-3 ${th.card}`}><div className="font-medium text-red-500 mb-1 flex items-center gap-1"><AlertTriangle size={14} />Rischi</div><ul className="list-disc pl-4 space-y-1">{(fi.risks || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm"><Stat k="Ingresso" v={fi.entry || "n.d."} c="text-blue-500" /><Stat k="Stop" v={fi.stop || "n.d."} c="text-red-500" /><Stat k="Target" v={fi.target || "n.d."} c="text-emerald-500" /></div>
                </>
              ) : (
                <div className="text-sm flex items-center gap-3"><span className={th.mute}>Motivazione non disponibile (errore API).</span><button onClick={() => run(cur)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white">Riprova</button></div>
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