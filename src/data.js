// Fonti gratuite: Yahoo Finance non ufficiale per la copertura multi-mercato; Alpha Vantage opzionale per dati analisti USA.
// Gemini interpreta il report; la ricerca WACC opzionale usa grounding web, con verifica separata delle fonti.
import { CapacitorHttp } from "@capacitor/core";
import { earningsSurprise, fiveYearYieldInfo } from "./modules/earnings-dividends.js";

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

async function defaultGet(url, headers = {}, opts = {}) {
  const res = await CapacitorHttp.get({
    url,
    disableRedirects: !!opts.noRedirect,
    headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*", ...headers },
    connectTimeout: 15000,
    readTimeout: 25000,
  });
  let data = res.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { /* resta stringa */ } }
  return { status: res.status, data, headers: res.headers || {} };
}

let httpGet = defaultGet;
export function setHttp(fn) { httpGet = fn; } // per i test

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
};
const today = () => new Date().toISOString().slice(0, 10);

const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
const positiveCap = (x) => num(x) != null && x > 0;
const round = (x, d = 2) => (num(x) == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Yahoo ----------
async function yget(path, params, headers = {}) {
  const qs = new URLSearchParams(params).toString();
  let last = null, lastErr = null;
  for (const host of ["query1", "query2"]) {
    try {
      const r = await httpGet(`https://${host}.finance.yahoo.com${path}?${qs}`, headers);
      if (r.status === 200 || r.status === 404) return r;
      last = r;
      if (r.status === 429) await sleep(800);
    } catch (e) { lastErr = e; }
  }
  if (last) return last;
  throw new Error("Rete non raggiungibile" + (lastErr ? ": " + lastErr.message : ""));
}

const isoDate = (ts, off = 0) => new Date((ts + off) * 1000).toISOString().slice(0, 10);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const smaLast = (c, n) => (c.length >= n ? mean(c.slice(-n)) : null);

function rsiLast(c, n = 14) {
  if (c.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d >= 0 ? (g += d) : (l -= d); }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

function weekly(rows) {
  const out = [];
  let curKey = null, cur = null;
  for (const r of rows) {
    const dt = new Date(r.date + "T00:00:00Z");
    const mon = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
    if (mon !== curKey) { if (cur) out.push(cur); curKey = mon; cur = { date: r.date, close: r.close, vol: null }; }
    cur.date = r.date; cur.close = r.close;
    if (num(r.volume) != null) cur.vol = (cur.vol ?? 0) + r.volume;
  }
  if (cur) out.push(cur);
  return out.slice(-104).map((w) => [w.date, round(w.close, 4), w.vol == null ? null : round(w.vol / 1e6, 2)]);
}

async function chartFor(symbol) {
  const r = await yget(`/v8/finance/chart/${encodeURIComponent(symbol)}`, { range: "2y", interval: "1d", includePrePost: "false" });
  const res = r.data?.chart?.result?.[0];
  if (r.status === 404 || !res) {
    if (r.status === 404 || r.data?.chart?.error) throw new Error("NOT_FOUND");
    throw new Error(`Yahoo chart HTTP ${r.status}`);
  }
  const q = res.indicators?.quote?.[0] || {};
  const off = res.meta?.gmtoffset || 0;
  const rows = [];
  (res.timestamp || []).forEach((t, i) => {
    const c = num(q.close?.[i]);
    if (c == null) return;
    rows.push({ date: isoDate(t, off), close: c, high: num(q.high?.[i]), low: num(q.low?.[i]), volume: num(q.volume?.[i]) });
  });
  if (rows.length < 2) throw new Error("NOT_FOUND");
  return { meta: res.meta || {}, rows };
}

async function searchSymbol(text) {
  const r = await yget("/v1/finance/search", { q: text, quotesCount: 6, newsCount: 0, lang: "en-US" });
  const quotes = (r.data?.quotes || []).filter((x) => x.symbol && ["EQUITY", "ETF"].includes(x.quoteType));
  return quotes[0]?.symbol || null;
}

export async function loadQuote(input) {
  const raw = input.trim();
  const looksLikeTicker = /^[A-Za-z0-9.\-=^]{1,14}$/.test(raw);
  let symbol = looksLikeTicker ? raw.toUpperCase() : null;
  let got = null;
  if (symbol) {
    try { got = await chartFor(symbol); } catch (e) { if (e.message !== "NOT_FOUND") throw e; }
  }
  if (!got) {
    symbol = await searchSymbol(raw);
    if (!symbol) throw new Error("NOT_FOUND");
    got = await chartFor(symbol);
  }
  const { meta, rows } = got;
  const closes = rows.map((r) => r.close);
  const n = rows.length;
  const price = closes[n - 1];
  // Allinea il prezzo esposto alla data dell'ultima barra daily: regularMarketPrice può essere intraday e avere un timestamp diverso.
  const prev = closes[n - 2];
  const l20 = rows.slice(-20), l60 = rows.slice(-60);
  const lo = (a) => { const values = a.map((r) => r.low).filter(num); return values.length ? Math.min(...values) : null; };
  const hi = (a) => { const values = a.map((r) => r.high).filter(num); return values.length ? Math.max(...values) : null; };
  return {
    name: meta.longName || meta.shortName || symbol,
    ticker: symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    currency: meta.currency || "",
    price: round(price, 4),
    prevClose: round(prev, 4),
    changePct: prev ? round((price / prev - 1) * 100, 2) : null,
    // The Yahoo chart sometimes exposes marketCap directly; do not fabricate it.
    marketCap: positiveCap(meta.marketCap) && meta.instrumentType !== "ETF" ? meta.marketCap : null,
    marketCapAsOf: positiveCap(meta.marketCap) && meta.instrumentType !== "ETF"
      ? (num(meta.regularMarketTime) != null ? isoDate(meta.regularMarketTime) : rows[n - 1].date) : null,
    marketCapSource: positiveCap(meta.marketCap) && meta.instrumentType !== "ETF" ? "Yahoo Finance · chart" : null,
    marketCapCurrency: positiveCap(meta.marketCap) && meta.instrumentType !== "ETF" ? (meta.currency || null) : null,
    instrumentType: meta.instrumentType || null,
    asOf: rows[n - 1].date,
    priceType: "daily_close",
    source: "Yahoo Finance",
    sma50: round(smaLast(closes, 50), 3),
    sma200: round(smaLast(closes, 200), 3),
    rsi14: round(rsiLast(closes, 14), 1),
    support: [round(lo(l20), 3), round(lo(l60), 3)],
    resistance: [round(hi(l20), 3), round(hi(l60), 3)],
    history: weekly(rows),
  };
}

// Serie storiche di bilancio/multipli (endpoint "timeseries" di Yahoo)
async function yseries(symbol, types, years) {
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - Math.round(years * 366 * 86400);
  const r = await yget(`/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`, {
    symbol, type: types.join(","), period1: p1, period2: p2, merge: "false", lang: "en-US", region: "US",
  });
  if (r.status !== 200) throw new Error(`Yahoo timeseries HTTP ${r.status}`);
  const out = {};
  for (const item of r.data?.timeseries?.result || []) {
    const type = item?.meta?.type?.[0];
    if (!type || !Array.isArray(item[type])) continue;
    out[type] = item[type]
      .map((e) => ({ d: e?.asOfDate, v: num(e?.reportedValue?.raw) }))
      .filter((e) => e.d && e.v != null)
      .sort((a, b) => (a.d < b.d ? -1 : 1));
  }
  return out;
}
const lastVal = (s, k) => { const a = s?.[k]; return a?.length ? a[a.length - 1].v : null; };
const M = (x) => (num(x) == null ? null : round(x / 1e6, 1));

const ANNUAL_TYPES = ["annualTotalRevenue", "annualNetIncome", "annualEBITDA", "annualGrossProfit", "annualOperatingIncome", "annualDilutedEPS", "annualFreeCashFlow", "annualTotalDebt", "annualNetDebt", "annualStockholdersEquity", "annualCurrentAssets", "annualCurrentLiabilities", "annualInterestExpense", "annualEBIT", "annualTaxRateForCalcs", "annualInvestedCapital"];
const Q_TYPES = ["quarterlyTotalRevenue", "quarterlyNetIncome", "quarterlyDilutedEPS"];

// A ratio is available only if every input belongs to the same fiscal year end.
function samePeriod(s, periodEnd, ...types) {
  if (!periodEnd) return null;
  const items=types.map(type=>(s[type]||[]).find(e=>e.d===periodEnd));
  return items.every(x=>x&&num(x.v)!=null) ? items.map(x=>x.v) : null;
}
export function buildFin(s) {
  const byYear = {};
  const put = (type, key, conv) => (s[type] || []).forEach((e) => { const y = Number(e.d.slice(0, 4)); (byYear[y] = byYear[y] || { y })[key] = conv(e.v); });
  put("annualTotalRevenue", "rev", M); put("annualNetIncome", "ni", M); put("annualEBITDA", "ebitda", M);
  put("annualGrossProfit", "gp", M); put("annualOperatingIncome", "op", M); put("annualDilutedEPS", "eps", (v) => round(v, 2));
  put("annualFreeCashFlow", "fcf", M);
  const annual = Object.values(byYear).filter((r) => r.rev != null).sort((a, b) => a.y - b.y).slice(-5)
    .map((r) => ({ y: r.y, rev: r.rev, ni: r.ni ?? null, ebitda: r.ebitda ?? null, gp: r.gp ?? null, op: r.op ?? null, eps: r.eps ?? null, fcf: r.fcf ?? null }));

  const qMap = {};
  const putQ = (type, key, conv) => (s[type] || []).forEach((e) => { (qMap[e.d] = qMap[e.d] || { d: e.d })[key] = conv(e.v); });
  putQ("quarterlyTotalRevenue", "rev", M); putQ("quarterlyNetIncome", "ni", M); putQ("quarterlyDilutedEPS", "eps", (v) => round(v, 2));
  const quarters = Object.values(qMap).filter((r) => r.rev != null).sort((a, b) => (a.d < b.d ? -1 : 1)).slice(-5)
    .map((r) => ({ p: `Q${Math.ceil(Number(r.d.slice(5, 7)) / 3)} ${r.d.slice(0, 4)}`, rev: r.rev, ni: r.ni ?? null, eps: r.eps ?? null }));

  const lastDate = (s.annualTotalRevenue || []).slice(-1)[0]?.d || "";
  const eq = lastVal(s, "annualStockholdersEquity");
  const [ca,cl] = samePeriod(s,lastDate,"annualCurrentAssets","annualCurrentLiabilities") || [null,null];
  const roeInputs=samePeriod(s,lastDate,"annualNetIncome","annualStockholdersEquity");
  const interestInputs=samePeriod(s,lastDate,"annualEBIT","annualInterestExpense")
    || samePeriod(s,lastDate,"annualOperatingIncome","annualInterestExpense");
  const roicEbit=(samePeriod(s,lastDate,"annualEBIT") || samePeriod(s,lastDate,"annualOperatingIncome"))?.[0] ?? null;
  const taxRate=samePeriod(s,lastDate,"annualTaxRateForCalcs")?.[0] ?? null;
  const tax=taxRate!=null&&taxRate>=0&&taxRate<=0.5?taxRate:null;
  const investedCapital=samePeriod(s,lastDate,"annualInvestedCapital")?.[0]
    ?? (samePeriod(s,lastDate,"annualStockholdersEquity","annualTotalDebt")?.reduce((a,b)=>a+b,0) ?? null);
  const currentRatio=ca!=null&&cl>0?round(ca/cl,2):null;
  const interestCover=interestInputs&&Math.abs(interestInputs[1])>0?round(interestInputs[0]/Math.abs(interestInputs[1]),1):null;
  const roe=roeInputs&&roeInputs[1]>0?round(100*roeInputs[0]/roeInputs[1],1):null;
  const roic=roicEbit!=null&&investedCapital>0&&tax!=null?round(100*roicEbit*(1-tax)/investedCapital,1):null;
  return {
    annual, quarters,
    balance: {
      netDebt: M(lastVal(s, "annualNetDebt")), totalDebt: M(lastVal(s, "annualTotalDebt")), equity: M(eq),
      currentRatio, interestCover, roe, roic,
    },
    lastReportDate: lastDate,
    isLatest: lastDate ? (Date.now() - Date.parse(lastDate)) / 864e5 < 560 : false,
    asOf: new Date().toISOString().slice(0, 10),
    source: "Yahoo Finance",
  };
}

const VAL_TYPES = { "P/E": "trailingPeRatio", "P/E forward": "trailingForwardPeRatio", PEG: "trailingPegRatio", "P/B": "trailingPbRatio", "P/S": "trailingPsRatio", "EV/EBITDA": "trailingEnterprisesValueEBITDARatio" };
const median = (a) => { const v = a.filter((x) => x != null && x > 0).sort((x, y) => x - y); if (v.length < 2) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// ---------- Peer e comparabili da fonte non ufficiale ----------
const isUS = (sym) => !/[.:]/.test(sym);

// Storico: mediana dei valori trimestrali degli ultimi 5 anni, ricavata dalle serie gia' scaricate (nessuna chiamata in piu').
export function histMedian(series, now=Date.now()) {
  const lim=now-5*365.25*864e5;
  const byDate=new Map();
  for(const e of Array.isArray(series)?series:[]){
    const ts=Date.parse(e?.d);
    if(Number.isFinite(ts)&&ts>=lim&&ts<=now+864e5&&num(e.v)!=null&&e.v>0)byDate.set(e.d,e.v);
  }
  const pts=[...byDate].sort((a,b)=>a[0].localeCompare(b[0]));
  if(pts.length<8)return null;
  const first=Date.parse(pts[0][0]),last=Date.parse(pts.at(-1)[0]);
  const span=(last-first)/(365.25*864e5);
  if(span<4.4||(now-last)>210*864e5)return null;
  return {v:median(pts.map(p=>p[1])),span,observations:pts.length,asOf:pts.at(-1)[0]};
}

// Titoli simili per il confronto di settore: Yahoo Finance (fonte non ufficiale).
async function peerSymbols(symbol) {
  try {
    const r = await yget(`/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`, {});
    const list = (r.data?.finance?.result?.[0]?.recommendedSymbols || []).map((x) => x?.symbol).filter((p) => p && p !== symbol).slice(0, 6);
    if (r.status === 200 && list.length >= 2) return { list, via: "Yahoo" };
  } catch (e) { /* peer non disponibili */ }
  return { list: [], via: "" };
}
// Peer requests are optional and deliberately decoupled from basic statements.
export async function loadPeerValuation(symbol) {
  let peers=[],sector={},via="";
  const found=await peerSymbols(symbol);
  via=found.via;
  if(found.list.length) {
    const res=[];
    for(let i=0;i<found.list.length;i+=2){
      res.push(...await Promise.allSettled(found.list.slice(i,i+2).map(p=>yseries(p,Object.values(VAL_TYPES),1.2))));
    }
    const vals=res.map((r,i)=>r.status==="fulfilled"?{name:found.list[i],s:r.value}:null).filter(Boolean);
    peers=vals.map(p=>({name:p.name,pe:round(lastVal(p.s,VAL_TYPES["P/E"]),1),evEbitda:round(lastVal(p.s,VAL_TYPES["EV/EBITDA"]),1)})).filter(p=>p.pe!=null||p.evEbitda!=null);
    Object.entries(VAL_TYPES).forEach(([k,t])=>{sector[k]=round(median(vals.map(p=>lastVal(p.s,t))),2);});
  }
  return {peers,sector,via};
}
async function buildVal(s, symbol, {includePeers=true}={}) {
  const own = {}, hist = {}, dates = {};
  let spans = [];
  Object.entries(VAL_TYPES).forEach(([k, t]) => {
    own[k] = round(lastVal(s, t), 2);
    dates[k] = s[t]?.at(-1)?.d || null;
    const h = histMedian(s[t]);
    if (h) { hist[k] = round(h.v, 2); spans.push(h.span); }
  });
  let {peers,sector,via}=includePeers?await loadPeerValuation(symbol):{peers:[],sector:{},via:""};
  const metrics = Object.keys(VAL_TYPES).filter((k) => own[k] != null).map((k) => ({ k, v: own[k], sector: sector[k] ?? null, hist5y: hist[k] ?? null, date: dates[k] }));
  return {
    metrics, peers, marketCap: positiveCap(lastVal(s, "trailingMarketCap")) ? lastVal(s, "trailingMarketCap") : null,
    marketCapAsOf: s.trailingMarketCap?.at(-1)?.d || null,
    histYears: spans.length ? round(Math.min(...spans), 1) : null,
    asOf: new Date().toISOString().slice(0, 10),
    source: "Yahoo Finance" + (peers.length ? ` + peer (${via})` : ""),
  };
}

// Una sola chiamata a Yahoo per bilanci e multipli (prima erano due)
export async function loadFundamentals(symbol,options={}) {
  const s = await yseries(symbol, [...ANNUAL_TYPES, ...Q_TYPES, ...Object.values(VAL_TYPES), "trailingMarketCap"], 6);
  const fin = buildFin(s);
  const val = await buildVal(s, symbol, options);
  return { fin, val };
}

/**
 * Reuse the already-fetched Yahoo valuation timeseries for the header and PDF.
 * An old market cap is NOT a current market cap: reject snapshots older than
 * 45 days relative to the dated daily quote. Do not infer shares or FX.
 */
export function mergeQuoteMarketCap(quote, val) {
  if (!quote || positiveCap(quote.marketCap) || quote.instrumentType === "ETF") return quote;
  const value = val?.marketCap, date = val?.marketCapAsOf;
  if (!positiveCap(value) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return quote;
  const quoteDate = Date.parse(quote.asOf), capDate = Date.parse(date);
  const days = (quoteDate - capDate) / 864e5;
  if (!Number.isFinite(days) || days < -7 || days > 45) return quote;
  return { ...quote, marketCap: value, marketCapAsOf: date,
    marketCapCurrency: quote.currency || null, marketCapSource: "Yahoo Finance · serie valutazioni" };
}

/**
 * Optional Yahoo quote-endpoint fallback when both chart and timeseries omit cap.
 * This is an undocumented provider interface and may require Yahoo session crumb.
 * Failure is nonfatal and must never turn into a made-up figure.
 */
export async function loadMarketCapFallback(symbol, expectedCurrency = "", priceDate = "") {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.^:_=-]{1,30}$/.test(sym)) return null;
  const query = { symbols: sym, formatted: "false", lang: "en-US", region: "US" };
  let r = await yget("/v7/finance/quote", query);
  if (r.status === 401 || r.status === 403) {
    const session = await yahooCrumb();
    r = await yget("/v7/finance/quote", { ...query, crumb: session.crumb },
      session.cookie ? { Cookie: session.cookie } : {});
  }
  if (r.status !== 200) return null;
  const q = (r.data?.quoteResponse?.result || []).find(x => String(x?.symbol || "").toUpperCase() === sym);
  if (!q || q.quoteType === "ETF" || !positiveCap(q.marketCap)) return null;
  if (expectedCurrency && q.currency && q.currency !== expectedCurrency) return null;
  const date = num(q.regularMarketTime) != null ? isoDate(q.regularMarketTime) : null;
  if (!date) return null; // no timestamp: cannot confirm the market cap's as-of date
  const difference = (Date.parse(priceDate) - Date.parse(date)) / 864e5;
  if (priceDate && (!Number.isFinite(difference) || Math.abs(difference) > 7)) return null;
  return { marketCap: q.marketCap, marketCapAsOf: date,
    marketCapCurrency: q.currency || expectedCurrency || null,
    marketCapSource: "Yahoo Finance · quote" };
}

// ---------- Analisti: Yahoo Finance, Alpha Vantage come fallback USA ----------
let crumbCache = null;
export function resetYahooSession() { crumbCache = null; } // per i test
const hdr = (h, name) => { const k = Object.keys(h || {}).find((x) => x.toLowerCase() === name); const v = k ? h[k] : ""; return Array.isArray(v) ? v.join(", ") : String(v || ""); };

// Cookie Yahoo: si prova piu' di un indirizzo, SENZA seguire i redirect (altrimenti il Set-Cookie
// della prima risposta si perde, tipico dei redirect di consenso GDPR per gli utenti europei).
async function yahooCookie(url) {
  const r = await httpGet(url, {}, { noRedirect: true });
  const cookie = (hdr(r.headers, "set-cookie").match(/\b(?:A1S|A1|A3)=[^;,\s]+/g) || []).join("; ");
  const loc = hdr(r.headers, "location");
  let crumb = "";
  if (typeof r.data === "string") { const m = r.data.match(/"crumb"\s*:\s*"([^"]{5,20})"/); if (m) crumb = m[1].replace(/\\u002F/g, "/"); }
  return { cookie, crumb, note: `${new URL(url).host} HTTP ${r.status}${loc ? " -> " + loc.slice(0, 40) : ""}${cookie ? "" : ", nessun cookie"}` };
}

async function yahooCrumb(force = false) {
  if (!force && crumbCache && Date.now() - crumbCache.ts < 20 * 60 * 1000) return crumbCache;
  const notes = [];
  const cookies = [];
  let pageCrumb = "";
  for (const u of ["https://fc.yahoo.com", "https://finance.yahoo.com/quote/AAPL", "https://finance.yahoo.com"]) {
    try {
      const c = await yahooCookie(u);
      notes.push(c.note);
      if (c.cookie) cookies.push(c.cookie);
      if (c.crumb && c.cookie) pageCrumb = c.crumb;
      if (c.cookie) break;
    } catch (e) { notes.push(`${u.slice(8, 24)}: ${String(e.message).slice(0, 30)}`); }
  }
  const cookie = cookies[0] || "";
  if (cookie && pageCrumb) { crumbCache = { crumb: pageCrumb, cookie, ts: Date.now() }; return crumbCache; }
  // Se il cookie non e' leggibile dagli header, si prova comunque: il client HTTP nativo potrebbe averlo gia' nel suo archivio.
  for (const host of ["query1", "query2"]) {
    try {
      const r2 = await httpGet(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, cookie ? { Cookie: cookie } : {});
      const crumb = typeof r2.data === "string" ? r2.data.trim() : "";
      if (r2.status === 200 && crumb && !/[<\s]/.test(crumb)) { crumbCache = { crumb, cookie, ts: Date.now() }; return crumbCache; }
      notes.push(`getcrumb ${host} HTTP ${r2.status}`);
    } catch (e) { notes.push(`getcrumb ${host}: ${String(e.message).slice(0, 30)}`); }
  }
  throw new Error("sessione Yahoo non ottenuta (" + notes.join("; ") + ")");
}

const raw = (x) => (x && typeof x === "object" ? num(x.raw) : num(x));

async function yahooAnalysts(symbol) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await yahooCrumb(attempt > 0);
    const path=`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`;
    const query=modules=>({modules,crumb:c.crumb,formatted:"false",lang:"en-US",region:"US"});
    const headers=c.cookie?{Cookie:c.cookie}:{};
    let r=await yget(path,query("financialData,recommendationTrend,assetProfile"),headers);
    // Certain Yahoo geographies may reject assetProfile: preserve the old analyst response.
    if(r.status===400)r=await yget(path,query("financialData,recommendationTrend"),headers);
    if (r.status === 401 || r.status === 403) { crumbCache = null; continue; }
    if (r.status !== 200) throw new Error(`Yahoo quoteSummary HTTP ${r.status}`);
    const res = r.data?.quoteSummary?.result?.[0] || {};
    const fd = res.financialData || {}, profile=res.assetProfile || {}, t = (res.recommendationTrend?.trend || [])[0] || {};
    const buy = (raw(t.strongBuy) || 0) + (raw(t.buy) || 0), hold = raw(t.hold) || 0, sell = (raw(t.sell) || 0) + (raw(t.strongSell) || 0);
    return { targetMean: raw(fd.targetMeanPrice), targetMin: raw(fd.targetLowPrice), targetMax: raw(fd.targetHighPrice), nOpinions: raw(fd.numberOfAnalystOpinions), ratings: { buy, hold, sell },
      sector:typeof profile.sector==="string"?profile.sector:null,
      industry:typeof profile.industry==="string"?profile.industry:null };
  }
  throw new Error("accesso a Yahoo negato (crumb non valido)");
}

async function alphaOverview(symbol, key) {
  const ck = "av_ov_" + symbol;
  try { const c = JSON.parse(store.get(ck) || "null"); if (c && c.d === today()) return c.o; } catch (e) { /* cache non valida */ }
  if (store.get("av_block") === today()) throw new Error("Alpha Vantage: limite giornaliero gia' raggiunto oggi (piano gratuito: 25 chiamate/giorno)");
  const quotaKey = "av_count_" + today();
  const used = Number(store.get(quotaKey) || 0);
  if (Number.isFinite(used) && used >= 25) { store.set("av_block", today()); throw new Error("Alpha Vantage: quota gratuita locale di 25 richieste/giorno esaurita"); }
  store.set(quotaKey, String((Number.isFinite(used) ? used : 0) + 1));
  const r = await httpGet(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`);
  if (r.status !== 200 || !r.data || typeof r.data !== "object") throw new Error(`Alpha Vantage HTTP ${r.status}`);
  if (r.data.Information || r.data.Note) { store.set("av_block", today()); throw new Error("Alpha Vantage: limite giornaliero raggiunto (25 chiamate/giorno nel piano gratuito)"); }
  if (!r.data.Symbol) throw new Error("Alpha Vantage: titolo non coperto");
  store.set(ck, JSON.stringify({ d: today(), o: r.data }));
  return r.data;
}
const avNum = (x) => { const n = Number(x); return x != null && x !== "None" && x !== "" && isFinite(n) ? n : null; };

// Yahoo Finance è la fonte primaria; Alpha Vantage è un fallback limitato ai titoli USA.
export async function loadAnalysts(symbol, _unusedKey, avKey) {
  const out = { targetMean: null, targetMin: null, targetMax: null, ratings: { buy: 0, hold: 0, sell: 0 }, nAnalysts: 0,
    sector:null,industry:null,sectorSource:null,asOf: new Date().toISOString().slice(0, 10), source: "n.d." };
  const sources = [], reasons = [];
  const ratingsTotal = () => out.ratings.buy + out.ratings.hold + out.ratings.sell;

  try {
    const y = await yahooAnalysts(symbol);
    if(y.sector||y.industry){out.sector=y.sector;out.industry=y.industry;out.sectorSource="Yahoo Finance · assetProfile";}
    let used = false;
    if (y.targetMean != null) { out.targetMean = y.targetMean; out.targetMin = y.targetMin; out.targetMax = y.targetMax; used = true; }
    const total = y.ratings.buy + y.ratings.hold + y.ratings.sell;
    if (total > 0) { out.ratings = y.ratings; used = true; }
    out.nAnalysts = total > 0 ? total : y.nOpinions || 0;
    if (used) sources.push("Yahoo Finance"); else reasons.push("Yahoo: nessun dato per questo titolo");
  } catch (e) { reasons.push("Yahoo: " + e.message.slice(0, 160)); }

  if (avKey && isUS(symbol) && (out.targetMean == null || ratingsTotal() === 0)) {
    try {
      const overview = await alphaOverview(symbol, avKey);
      if(!out.sector&&typeof overview.Sector==="string"&&overview.Sector!=="None"){
        out.sector=overview.Sector;out.industry=overview.Industry||null;out.sectorSource="Alpha Vantage · OVERVIEW";
      }
      let used = false;
      if (out.targetMean == null && avNum(overview.AnalystTargetPrice) != null) { out.targetMean = avNum(overview.AnalystTargetPrice); used = true; }
      if (ratingsTotal() === 0) {
        const counts = ["AnalystRatingStrongBuy", "AnalystRatingBuy", "AnalystRatingHold", "AnalystRatingSell", "AnalystRatingStrongSell"].map((key) => avNum(overview[key]) || 0);
        const total = counts.reduce((sum, value) => sum + value, 0);
        if (total > 0) { out.ratings = { buy: counts[0] + counts[1], hold: counts[2], sell: counts[3] + counts[4] }; out.nAnalysts = total; used = true; }
      }
      if (used) sources.push("Alpha Vantage");
    } catch (e) { reasons.push("Alpha Vantage: " + e.message.slice(0, 80)); }
  }

  out.source = sources.length ? sources.join(" + ") : "n.d." + (reasons.length ? ` (${reasons.join("; ")})` : "");
  return out;
}

function yahooRawDate(x) {
  const n = raw(x);
  return n != null ? new Date(n * 1000).toISOString().slice(0, 10) : null;
}

// Calendario utili e dividendi: dati solo se restituiti da Yahoo Finance.
// Non entra nel punteggio automatico: la copertura e la precisione variano per mercato.
export async function loadCorporateEvents(symbol) {
  const c = await yahooCrumb();
  const modules = "calendarEvents,earningsTrend,earningsHistory,summaryDetail,defaultKeyStatistics";
  const r = await yget(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
    modules, crumb: c.crumb, formatted: "false", lang: "en-US", region: "US",
  }, c.cookie ? { Cookie: c.cookie } : {});
  if (r.status !== 200) throw new Error(`Yahoo calendario HTTP ${r.status}`);
  const root = r.data?.quoteSummary?.result?.[0];
  if (!root) throw new Error("Calendario societario non disponibile");
  const ce = root.calendarEvents || {};
  const earnings = ce.earnings || {};
  const trend = root.earningsTrend?.trend || [];
  const current = trend.find((x) => x.period === "0q") || trend.find((x) => x.period === "+1q") || null;
  const history = (root.earningsHistory?.history || []).slice(-8).map((x) => {
    const actual = raw(x.epsActual), estimate = raw(x.epsEstimate);
    return {
      quarter: x.quarter ? yahooRawDate(x.quarter) : null,
      epsActual: actual, epsEstimate: estimate,
      // Yahoo surprisePercent can be expressed as a fraction; recompute from
      // the same EPS values we display instead of assuming its unit.
      surprisePct: earningsSurprise(actual,estimate)?.percent ?? null,
    };
  });
  const sd = root.summaryDetail || {};
  const ks = root.defaultKeyStatistics || {};
  let dividendHistory = [], priceHistoryStart = null;
  try {
    const ch = await yget(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      range: "5y", interval: "1d", events: "div",
    });
    const chart = ch.data?.chart?.result?.[0];
    const firstTimestamp = chart?.timestamp?.[0];
    priceHistoryStart = num(firstTimestamp) != null ? yahooRawDate(firstTimestamp) : null;
    const ev = chart?.events?.dividends || {};
    dividendHistory = Object.values(ev).map((x) => ({
      date: num(x.date) != null ? yahooRawDate(x.date) : null,
      amount: num(x.amount),
    })).filter((x) => x.date && x.amount != null && x.amount >= 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) { /* storico dividendi facoltativo */ }
  const earningsDates = (earnings.earningsDate || []).map(yahooRawDate).filter(Boolean).sort();
  let nextEarnings = earningsDates.find((x) => x >= today()) || null;
  let nextDateStatus = nextEarnings ? (earnings.isEarningsDateEstimate === true ? "stima_yahoo" : "calendario_yahoo") : "non_disponibile";
  // A missing calendarEvents date does not imply that the company has stopped
  // reporting. Yahoo's quote endpoint may provide an INDICATIVE future window.
  if (!nextEarnings) {
    try {
      const quoteResponse = await yget("/v7/finance/quote", {
        symbols: symbol, crumb: c.crumb, formatted: "false", lang: "en-US", region: "US",
      }, c.cookie ? { Cookie: c.cookie } : {});
      const quoted = (quoteResponse.status === 200 ? quoteResponse.data?.quoteResponse?.result || [] : [])
        .find(x => String(x.symbol || "").toUpperCase() === String(symbol).toUpperCase());
      const timestamps = [quoted?.earningsTimestampStart, quoted?.earningsTimestamp, quoted?.earningsTimestampEnd]
        .map(yahooRawDate).filter(x => x && x >= today()).sort();
      const candidate = timestamps[0] || null;
      // Reject suspicious calendar data too far into the future.
      if (candidate && Date.parse(candidate) - Date.now() < 550*864e5) {
        nextEarnings = candidate;
        nextDateStatus = "stima_yahoo";
      }
    } catch (e) { /* fallback non ufficiale: la scheda resta utilizzabile */ }
  }
  const epsEstimate = raw(current?.earningsEstimate?.avg);
  const revenueEstimate = raw(current?.revenueEstimate?.avg);
  const dividendRate = raw(sd.dividendRate) ?? raw(sd.trailingAnnualDividendRate);
  const dividendYield = raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield);
  const exDividendDate = yahooRawDate(sd.exDividendDate);
  const payoutRatio = raw(sd.payoutRatio);
  const fiveYearInfo = fiveYearYieldInfo({
    // Unlike dividendYield, Yahoo's fiveYearAvgDividendYield is in percentage points.
    providedPercent: raw(sd.fiveYearAvgDividendYield),
    dividends: dividendHistory, historyStart: priceHistoryStart, asOf: today(),
  });
  return {
    earnings: {
      nextDate: nextEarnings, nextDateStatus, dateWindow: earningsDates,
      epsEstimate, revenueEstimate,
      estimatePeriod: current?.period || null,
      estimatePeriodEnd: typeof current?.endDate === "string" ? current.endDate.slice(0,10) : null,
      history,
    },
    dividends: {
      annualRate: dividendRate, yield: dividendYield != null ? round(dividendYield * 100, 2) : null,
      payoutRatio: payoutRatio != null ? round(payoutRatio * 100, 1) : null,
      exDividendDate, fiveYearAvgYield: fiveYearInfo.value,
      fiveYearAvgYieldReason: fiveYearInfo.reason,
      trailingEps: raw(ks.trailingEps), history: dividendHistory,
    },
    asOf: today(), source: "Yahoo Finance",
  };
}

// ---------- Forza relativa: titolo contro indice di riferimento ----------
const BENCH = {
  "": ["^GSPC", "S&P 500"], ".MI": ["FTSEMIB.MI", "FTSE MIB"], ".DE": ["^GDAXI", "DAX"], ".F": ["^GDAXI", "DAX"], ".PA": ["^FCHI", "CAC 40"],
  ".L": ["^FTSE", "FTSE 100"], ".MC": ["^IBEX", "IBEX 35"], ".AS": ["^AEX", "AEX"], ".SW": ["^SSMI", "SMI"], ".BR": ["^BFX", "BEL 20"],
  ".T": ["^N225", "Nikkei 225"], ".HK": ["^HSI", "Hang Seng"], ".TO": ["^GSPTSE", "S&P/TSX"],
};
const benchFor = (symbol) => { const i = symbol.lastIndexOf("."); return BENCH[i >= 0 ? symbol.slice(i).toUpperCase() : ""] || null; };
// Build relative returns exclusively from the SAME calendar weeks. The
// Yahoo weekly chart may timestamp a week on Monday while stock bars close Friday.
const mondayKey=(date)=>{
  const t=Date.parse(String(date)+"T00:00:00Z");
  if(!Number.isFinite(t))return null;
  const d=new Date(t);
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
};
export function pairedWeeklyReturns(stockHistory,indexHistory) {
  const toMap=(rows)=>{
    const out=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
      const date=Array.isArray(row)?row[0]:row?.date;
      const value=Array.isArray(row)?row[1]:row?.close;
      const key=mondayKey(date);
      if(key&&num(value)!=null&&value>0)out.set(key,value);
    }
    return out;
  };
  const stockMap=toMap(stockHistory),indexMap=toMap(indexHistory);
  const shared=[...stockMap.keys()].filter(k=>indexMap.has(k)).sort();
  const latest=shared.at(-1);
  if(!latest||latest!==[...stockMap.keys()].sort().at(-1)||latest!==[...indexMap.keys()].sort().at(-1))return null;
  const output={stock:{r13:null,r26:null,r52:null},index:{r13:null,r26:null,r52:null}};
  let available=0;
  for(const weeks of [13,26,52]){
    const past=new Date(Date.parse(latest+"T00:00:00Z")-weeks*7*864e5).toISOString().slice(0,10);
    if(!stockMap.has(past)||!indexMap.has(past))continue;
    const key="r"+weeks;
    output.stock[key]=round((stockMap.get(latest)/stockMap.get(past)-1)*100,1);
    output.index[key]=round((indexMap.get(latest)/indexMap.get(past)-1)*100,1);
    available++;
  }
  return available?output:null;
}
// rendimenti percentuali a 13/26/52 settimane da una serie di chiusure settimanali
export function weeklyReturns(c) {
  const n = c.length, r = (k) => (n > k && c[n - 1 - k] > 0 ? round((c[n - 1] / c[n - 1 - k] - 1) * 100, 1) : null);
  return { r13: r(13), r26: r(26), r52: r(52) };
}

export async function loadMarket(symbol, history) {
  const closes = (history || []).map((h) => h[1]).filter(num);
  let stock = weeklyReturns(closes);
  const last52 = closes.slice(-52);
  const lo = last52.length ? Math.min(...last52) : null, hi = last52.length ? Math.max(...last52) : null;
  const price = closes[closes.length - 1];
  const pos52 = lo != null && hi > lo ? round(((price - lo) / (hi - lo)) * 100, 0) : null;
  const b = benchFor(symbol);
  let index = null;
  if (b) {
    try {
      const r = await yget(`/v8/finance/chart/${encodeURIComponent(b[0])}`, { range: "2y", interval: "1wk", includePrePost: "false" });
      const result=r.data?.chart?.result?.[0];
      const timestamps=result?.timestamp||[];
      const prices=result?.indicators?.quote?.[0]?.close||[];
      const benchmark=timestamps.map((ts,i)=>[isoDate(ts,result?.meta?.gmtoffset||0),num(prices[i])])
        .filter(row=>row[1]!=null&&row[1]>0);
      const paired=pairedWeeklyReturns(history,benchmark);
      if(r.status===200&&paired){
        index=paired.index;
        stock=paired.stock;
      }
    } catch (e) { /* indice non disponibile */ }
  }
  return { bench: b && index ? { symbol: b[0], name: b[1] } : null, stock, index, pos52 };
}

export async function loadNewsRaw(symbol) {
  const items = [];
  try {
    const r = await yget("/v1/finance/search", { q: symbol, quotesCount: 0, newsCount: 8, lang: "en-US" });
    (r.data?.news || []).forEach((n) => n?.title && items.push({ date: n.providerPublishTime ? isoDate(n.providerPublishTime) : "", title: n.title, source: n.publisher || "Yahoo Finance" }));
  } catch (e) { /* ignora */ }
  const seen = new Set();
  return items.filter((i) => { const k = i.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

// ---------- Diagnostica ----------
export async function diagnostics(_unusedKey, avKey) {
  const out = [];
  const t = async (name, fn) => {
    try { const d = await fn(); out.push({ name, ok: true, detail: d || "OK" }); }
    catch (e) {
      const m = e.message;
      const warn = /limite giornaliero|HTTP 403|HTTP 401/.test(m) && /Alpha/.test(name + m);
      out.push({ name, ok: false, warn, detail: warn ? (/403|401/.test(m) ? "endpoint non disponibile nel piano gratuito o accesso negato" : m.slice(0, 160) + " - riprova domani") : m.slice(0, 220) });
    }
  };
  await t("Yahoo: prezzi AAPL", async () => { const c = await chartFor("AAPL"); return `${c.rows.length} giorni, ultimo ${c.rows[c.rows.length - 1].date}`; });
  await t("Yahoo: prezzi ENI.MI", async () => { const c = await chartFor("ENI.MI"); return `${c.rows.length} giorni`; });
  await t("Yahoo: bilanci e multipli AAPL", async () => { const { fin, val } = await loadFundamentals("AAPL", null); return `${fin.annual.length} anni, ${fin.quarters.length} trimestri, ${val.metrics.length} multipli`; });
  await t("Yahoo: notizie AAPL", async () => { const n = await loadNewsRaw("AAPL"); return `${n.length} notizie`; });
  await t("Yahoo: analisti AAPL (target e rating)", async () => { const y = await yahooAnalysts("AAPL"); return y.targetMean != null ? `target medio ${round(y.targetMean)}, ${y.ratings.buy + y.ratings.hold + y.ratings.sell} rating` : "accesso ok ma target vuoti"; });
  await t("Yahoo: analisti ENI.MI", async () => { const y = await yahooAnalysts("ENI.MI"); return y.targetMean != null ? `target medio ${round(y.targetMean)}` : "accesso ok ma target vuoti"; });
  await t("Yahoo: indice S&P 500", async () => { const m = await loadMarket("AAPL", (await chartFor("AAPL")).rows.map((r) => [r.date, r.close])); return m.index ? `12 mesi: ${m.index.r52}%` : "indice non letto"; });
  if (avKey) {
    await t("Alpha Vantage: target AAPL", async () => { const o = await alphaOverview("AAPL", avKey); return avNum(o.AnalystTargetPrice) != null ? `target medio ${o.AnalystTargetPrice}` : "titolo letto, ma senza target"; });
  } else {
    out.push({ name: "Alpha Vantage", ok: false, detail: "chiave non inserita (opzionale)" });
  }
  return out;
}
