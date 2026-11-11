// Fonti dati gratuite per l'analizzatore (nessuna ricerca web di Gemini).
// - Yahoo Finance (non ufficiale, senza chiave): prezzi, storico, bilanci, multipli, notizie. Copre anche i titoli europei (es. ENI.MI).
// - Finnhub (ufficiale, chiave gratuita OPZIONALE): rating e target price degli analisti, peer e notizie per i titoli USA.
import { CapacitorHttp } from "@capacitor/core";

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
    if (mon !== curKey) { if (cur) out.push(cur); curKey = mon; cur = { date: r.date, close: r.close, vol: 0 }; }
    cur.date = r.date; cur.close = r.close; cur.vol += r.volume || 0;
  }
  if (cur) out.push(cur);
  return out.slice(-104).map((w) => [w.date, round(w.close, 4), round(w.vol / 1e6, 2)]);
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
    rows.push({ date: isoDate(t, off), close: c, high: num(q.high?.[i]) ?? c, low: num(q.low?.[i]) ?? c, volume: num(q.volume?.[i]) || 0 });
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
  const price = num(meta.regularMarketPrice) ?? closes[n - 1];
  const prev = closes[n - 2];
  const l20 = rows.slice(-20), l60 = rows.slice(-60);
  const lo = (a) => Math.min(...a.map((r) => r.low)), hi = (a) => Math.max(...a.map((r) => r.high));
  return {
    name: meta.longName || meta.shortName || symbol,
    ticker: symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    currency: meta.currency || "",
    price: round(price, 4),
    prevClose: round(prev, 4),
    changePct: prev ? round((price / prev - 1) * 100, 2) : null,
    marketCap: null,
    asOf: rows[n - 1].date,
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

function buildFin(s) {
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

  const eq = lastVal(s, "annualStockholdersEquity"), ni = lastVal(s, "annualNetIncome");
  const ca = lastVal(s, "annualCurrentAssets"), cl = lastVal(s, "annualCurrentLiabilities");
  const ebit = lastVal(s, "annualEBIT") ?? lastVal(s, "annualOperatingIncome"), ie = lastVal(s, "annualInterestExpense");
  // ROIC = EBIT x (1 - aliquota) / capitale investito (Yahoo; in alternativa patrimonio netto + debito totale)
  const trate = lastVal(s, "annualTaxRateForCalcs"), tdebt = lastVal(s, "annualTotalDebt");
  const tax = trate != null && trate >= 0 && trate <= 0.5 ? trate : 0.21;
  const ic = lastVal(s, "annualInvestedCapital") ?? (eq != null && tdebt != null ? eq + tdebt : null);
  const lastDate = (s.annualTotalRevenue || []).slice(-1)[0]?.d || "";
  return {
    annual, quarters,
    balance: {
      netDebt: M(lastVal(s, "annualNetDebt")), totalDebt: M(lastVal(s, "annualTotalDebt")), equity: M(eq),
      currentRatio: ca != null && cl ? round(ca / cl, 2) : null,
      interestCover: ebit != null && ie ? round(ebit / Math.abs(ie), 1) : null,
      roe: ni != null && eq > 0 ? round((ni / eq) * 100, 1) : null,
      roic: ebit != null && ic > 0 ? round((ebit * (1 - tax)) / ic * 100, 1) : null,
    },
    lastReportDate: lastDate,
    isLatest: lastDate ? (Date.now() - Date.parse(lastDate)) / 864e5 < 560 : false,
    asOf: new Date().toISOString().slice(0, 10),
    source: "Yahoo Finance",
  };
}

const VAL_TYPES = { "P/E": "trailingPeRatio", "P/E forward": "trailingForwardPeRatio", PEG: "trailingPegRatio", "P/B": "trailingPbRatio", "P/S": "trailingPsRatio", "EV/EBITDA": "trailingEnterprisesValueEBITDARatio" };
const median = (a) => { const v = a.filter((x) => x != null && x > 0).sort((x, y) => x - y); if (v.length < 2) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// ---------- Finnhub (opzionale) ----------
async function fh(path, params, key) {
  const qs = new URLSearchParams({ ...params, token: key }).toString();
  const r = await httpGet(`https://finnhub.io/api/v1${path}?${qs}`);
  if (r.status !== 200) throw new Error(`Finnhub ${path} HTTP ${r.status}`);
  return r.data;
}
const isUS = (sym) => !/[.:]/.test(sym);

// Storico: mediana dei valori trimestrali degli ultimi 5 anni, ricavata dalle serie gia' scaricate (nessuna chiamata in piu').
function histMedian(series) {
  const lim = Date.now() - 5 * 366 * 864e5;
  const pts = (series || []).filter((e) => Date.parse(e.d) >= lim && e.v > 0);
  if (pts.length < 4) return null;
  return { v: median(pts.map((e) => e.v)), span: (Date.parse(pts[pts.length - 1].d) - Date.parse(pts[0].d)) / (365 * 864e5) };
}

// Titoli simili per il confronto di settore: Finnhub (USA, con chiave) oppure Yahoo "simili" (qualsiasi mercato, senza chiave).
async function peerSymbols(symbol, fhKey) {
  if (fhKey && isUS(symbol)) {
    try {
      const list = (await fh("/stock/peers", { symbol }, fhKey)).filter((p) => p !== symbol && isUS(p)).slice(0, 5);
      if (list.length >= 2) return { list, via: "Finnhub" };
    } catch (e) { /* passa a Yahoo */ }
  }
  try {
    const r = await yget(`/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`, {});
    const list = (r.data?.finance?.result?.[0]?.recommendedSymbols || []).map((x) => x?.symbol).filter((p) => p && p !== symbol).slice(0, 6);
    if (r.status === 200 && list.length >= 2) return { list, via: "Yahoo" };
  } catch (e) { /* nessun peer */ }
  return { list: [], via: "" };
}

async function buildVal(s, symbol, fhKey) {
  const own = {}, hist = {};
  let spans = [];
  Object.entries(VAL_TYPES).forEach(([k, t]) => {
    own[k] = round(lastVal(s, t), 2);
    const h = histMedian(s[t]);
    if (h) { hist[k] = round(h.v, 2); spans.push(h.span); }
  });
  let peers = [], sector = {}, via = "";
  try {
    const found = await peerSymbols(symbol, fhKey);
    via = found.via;
    if (found.list.length) {
      const res = await Promise.allSettled(found.list.map((p) => yseries(p, Object.values(VAL_TYPES), 1.2)));
      const vals = res.map((r, i) => (r.status === "fulfilled" ? { name: found.list[i], s: r.value } : null)).filter(Boolean);
      peers = vals.map((p) => ({ name: p.name, pe: round(lastVal(p.s, VAL_TYPES["P/E"]), 1), evEbitda: round(lastVal(p.s, VAL_TYPES["EV/EBITDA"]), 1) })).filter((p) => p.pe != null || p.evEbitda != null);
      Object.entries(VAL_TYPES).forEach(([k, t]) => { sector[k] = round(median(vals.map((p) => lastVal(p.s, t))), 2); });
    }
  } catch (e) { /* peer non disponibili */ }
  const metrics = Object.keys(VAL_TYPES).filter((k) => own[k] != null).map((k) => ({ k, v: own[k], sector: sector[k] ?? null, hist5y: hist[k] ?? null }));
  return {
    metrics, peers, marketCap: lastVal(s, "trailingMarketCap"),
    histYears: spans.length ? round(Math.min(...spans), 1) : null,
    asOf: new Date().toISOString().slice(0, 10),
    source: "Yahoo Finance" + (peers.length ? ` + peer (${via})` : ""),
  };
}

// Una sola chiamata a Yahoo per bilanci e multipli (prima erano due)
export async function loadFundamentals(symbol, fhKey) {
  const s = await yseries(symbol, [...ANNUAL_TYPES, ...Q_TYPES, ...Object.values(VAL_TYPES), "trailingMarketCap"], 6);
  const fin = buildFin(s);
  const val = await buildVal(s, symbol, fhKey);
  return { fin, val };
}

// ---------- Analisti: Yahoo Finance (cookie + crumb), poi Finnhub come complemento ----------
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
    const r = await yget(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, { modules: "financialData,recommendationTrend", crumb: c.crumb, formatted: "false", lang: "en-US", region: "US" }, c.cookie ? { Cookie: c.cookie } : {});
    if (r.status === 401 || r.status === 403) { crumbCache = null; continue; }
    if (r.status !== 200) throw new Error(`Yahoo quoteSummary HTTP ${r.status}`);
    const res = r.data?.quoteSummary?.result?.[0] || {};
    const fd = res.financialData || {}, t = (res.recommendationTrend?.trend || [])[0] || {};
    const buy = (raw(t.strongBuy) || 0) + (raw(t.buy) || 0), hold = raw(t.hold) || 0, sell = (raw(t.sell) || 0) + (raw(t.strongSell) || 0);
    return { targetMean: raw(fd.targetMeanPrice), targetMin: raw(fd.targetLowPrice), targetMax: raw(fd.targetHighPrice), nOpinions: raw(fd.numberOfAnalystOpinions), ratings: { buy, hold, sell } };
  }
  throw new Error("accesso a Yahoo negato (crumb non valido)");
}

async function alphaOverview(symbol, key) {
  const ck = "av_ov_" + symbol;
  try { const c = JSON.parse(store.get(ck) || "null"); if (c && c.d === today()) return c.o; } catch (e) { /* cache non valida */ }
  if (store.get("av_block") === today()) throw new Error("Alpha Vantage: limite giornaliero gia' raggiunto oggi (piano gratuito: 25 chiamate/giorno)");
  const r = await httpGet(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`);
  if (r.status !== 200 || !r.data || typeof r.data !== "object") throw new Error(`Alpha Vantage HTTP ${r.status}`);
  if (r.data.Information || r.data.Note) { store.set("av_block", today()); throw new Error("Alpha Vantage: limite giornaliero raggiunto (25 chiamate/giorno nel piano gratuito)"); }
  if (!r.data.Symbol) throw new Error("Alpha Vantage: titolo non coperto");
  store.set(ck, JSON.stringify({ d: today(), o: r.data }));
  return r.data;
}
const avNum = (x) => { const n = Number(x); return x != null && x !== "None" && x !== "" && isFinite(n) ? n : null; };

// Ordine delle fonti: 1) Yahoo (cookie + crumb: target medio/min/max e rating, anche titoli europei),
// 2) Finnhub e 3) Alpha Vantage solo per titoli USA e solo per ciò che manca.
export async function loadAnalysts(symbol, fhKey, avKey) {
  const out = { targetMean: null, targetMin: null, targetMax: null, ratings: { buy: 0, hold: 0, sell: 0 }, nAnalysts: 0, asOf: new Date().toISOString().slice(0, 10), source: "n.d." };
  const srcs = [], why = [];
  const ratingsTot = () => out.ratings.buy + out.ratings.hold + out.ratings.sell;

  try {
    const y = await yahooAnalysts(symbol);
    let used = false;
    if (y.targetMean != null) { out.targetMean = y.targetMean; out.targetMin = y.targetMin; out.targetMax = y.targetMax; used = true; }
    const tot = y.ratings.buy + y.ratings.hold + y.ratings.sell;
    if (tot > 0) { out.ratings = y.ratings; used = true; }
    out.nAnalysts = tot > 0 ? tot : y.nOpinions || 0;
    if (used) srcs.push("Yahoo Finance"); else why.push("Yahoo: nessun dato per questo titolo");
  } catch (e) { why.push("Yahoo: " + e.message.slice(0, 220)); }

  if (fhKey && isUS(symbol) && (out.targetMean == null || ratingsTot() === 0)) {
    let used = false;
    if (ratingsTot() === 0) {
      try {
        const r = (await fh("/stock/recommendation", { symbol }, fhKey))?.[0];
        if (r) {
          out.ratings = { buy: (r.strongBuy || 0) + (r.buy || 0), hold: r.hold || 0, sell: (r.sell || 0) + (r.strongSell || 0) };
          out.nAnalysts = ratingsTot(); if (r.period) out.asOf = r.period; used = true;
        }
      } catch (e) { why.push("Finnhub rating: " + e.message.slice(0, 40)); }
    }
    if (out.targetMean == null && store.get("fh_pt_denied") !== "1") {
      try {
        const pt = await fh("/stock/price-target", { symbol }, fhKey);
        const m = num(pt?.targetMean) ?? num(pt?.targetMedian);
        if (m != null) { out.targetMean = m; out.targetMin = num(pt?.targetLow); out.targetMax = num(pt?.targetHigh); used = true; }
      } catch (e) {
        if (/HTTP 40[13]/.test(e.message)) store.set("fh_pt_denied", "1"); // il target non e' nel piano gratuito: non insistere
        why.push("Finnhub target: " + e.message.slice(0, 40));
      }
    }
    if (used) srcs.push("Finnhub");
  }

  if (avKey && isUS(symbol) && (out.targetMean == null || ratingsTot() === 0)) {
    try {
      const o = await alphaOverview(symbol, avKey);
      let used = false;
      if (out.targetMean == null && avNum(o.AnalystTargetPrice) != null) { out.targetMean = avNum(o.AnalystTargetPrice); used = true; }
      if (ratingsTot() === 0) {
        const c = ["AnalystRatingStrongBuy", "AnalystRatingBuy", "AnalystRatingHold", "AnalystRatingSell", "AnalystRatingStrongSell"].map((k) => avNum(o[k]) || 0);
        const tot = c.reduce((x, y) => x + y, 0);
        if (tot > 0) { out.ratings = { buy: c[0] + c[1], hold: c[2], sell: c[3] + c[4] }; out.nAnalysts = tot; used = true; }
      }
      if (used) srcs.push("Alpha Vantage");
    } catch (e) { why.push("Alpha Vantage: " + e.message.slice(0, 50)); }
  }

  out.source = srcs.length ? srcs.join(" + ") : "n.d." + (why.length ? ` (${why.join("; ")})` : "");
  return out;
}

// ---------- Forza relativa: titolo contro indice di riferimento ----------
const BENCH = {
  "": ["^GSPC", "S&P 500"], ".MI": ["FTSEMIB.MI", "FTSE MIB"], ".DE": ["^GDAXI", "DAX"], ".F": ["^GDAXI", "DAX"], ".PA": ["^FCHI", "CAC 40"],
  ".L": ["^FTSE", "FTSE 100"], ".MC": ["^IBEX", "IBEX 35"], ".AS": ["^AEX", "AEX"], ".SW": ["^SSMI", "SMI"], ".BR": ["^BFX", "BEL 20"],
  ".T": ["^N225", "Nikkei 225"], ".HK": ["^HSI", "Hang Seng"], ".TO": ["^GSPTSE", "S&P/TSX"],
};
const benchFor = (symbol) => { const i = symbol.lastIndexOf("."); return BENCH[i >= 0 ? symbol.slice(i).toUpperCase() : ""] || null; };
// rendimenti percentuali a 13/26/52 settimane da una serie di chiusure settimanali
export function weeklyReturns(c) {
  const n = c.length, r = (k) => (n > k && c[n - 1 - k] > 0 ? round((c[n - 1] / c[n - 1 - k] - 1) * 100, 1) : null);
  return { r13: r(13), r26: r(26), r52: r(52) };
}

export async function loadMarket(symbol, history) {
  const closes = (history || []).map((h) => h[1]).filter(num);
  const stock = weeklyReturns(closes);
  const last52 = closes.slice(-52);
  const lo = last52.length ? Math.min(...last52) : null, hi = last52.length ? Math.max(...last52) : null;
  const price = closes[closes.length - 1];
  const pos52 = lo != null && hi > lo ? round(((price - lo) / (hi - lo)) * 100, 0) : null;
  const b = benchFor(symbol);
  let index = null;
  if (b) {
    try {
      const r = await yget(`/v8/finance/chart/${encodeURIComponent(b[0])}`, { range: "2y", interval: "1wk", includePrePost: "false" });
      const q = r.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const c = q.filter(num);
      if (r.status === 200 && c.length > 14) index = weeklyReturns(c);
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
export async function diagnostics(fhKey, avKey) {
  const out = [];
  const t = async (name, fn) => {
    try { const d = await fn(); out.push({ name, ok: true, detail: d || "OK" }); }
    catch (e) {
      const m = e.message;
      const warn = /limite giornaliero|HTTP 403|HTTP 401/.test(m) && /Finnhub|Alpha/.test(name + m);
      out.push({ name, ok: false, warn, detail: warn ? (/403|401/.test(m) ? "non incluso nel piano gratuito Finnhub (normale, il rating funziona)" : m.slice(0, 160) + " - riprova domani") : m.slice(0, 220) });
    }
  };
  await t("Yahoo: prezzi AAPL", async () => { const c = await chartFor("AAPL"); return `${c.rows.length} giorni, ultimo ${c.rows[c.rows.length - 1].date}`; });
  await t("Yahoo: prezzi ENI.MI", async () => { const c = await chartFor("ENI.MI"); return `${c.rows.length} giorni`; });
  await t("Yahoo: bilanci e multipli AAPL", async () => { const { fin, val } = await loadFundamentals("AAPL", null); return `${fin.annual.length} anni, ${fin.quarters.length} trimestri, ${val.metrics.length} multipli`; });
  await t("Yahoo: notizie AAPL", async () => { const n = await loadNewsRaw("AAPL"); return `${n.length} notizie`; });
  await t("Yahoo: analisti AAPL (target e rating)", async () => { const y = await yahooAnalysts("AAPL"); return y.targetMean != null ? `target medio ${round(y.targetMean)}, ${y.ratings.buy + y.ratings.hold + y.ratings.sell} rating` : "accesso ok ma target vuoti"; });
  await t("Yahoo: analisti ENI.MI", async () => { const y = await yahooAnalysts("ENI.MI"); return y.targetMean != null ? `target medio ${round(y.targetMean)}` : "accesso ok ma target vuoti"; });
  await t("Yahoo: indice S&P 500", async () => { const m = await loadMarket("AAPL", (await chartFor("AAPL")).rows.map((r) => [r.date, r.close])); return m.index ? `12 mesi: ${m.index.r52}%` : "indice non letto"; });
  if (fhKey) {
    await t("Finnhub: rating AAPL", async () => { const r = await fh("/stock/recommendation", { symbol: "AAPL" }, fhKey); return `${r?.length || 0} periodi`; });
    await t("Finnhub: target AAPL", async () => { if (store.get("fh_pt_denied") === "1") return "non incluso nel piano gratuito (normale, gia' verificato)"; const r = await fh("/stock/price-target", { symbol: "AAPL" }, fhKey); return r?.targetMean ? `media ${r.targetMean}` : "vuoto"; });
  } else {
    out.push({ name: "Finnhub", ok: false, detail: "chiave non inserita (opzionale)" });
  }
  if (avKey) {
    await t("Alpha Vantage: target AAPL", async () => { const o = await alphaOverview("AAPL", avKey); return avNum(o.AnalystTargetPrice) != null ? `target medio ${o.AnalystTargetPrice}` : "titolo letto, ma senza target"; });
  } else {
    out.push({ name: "Alpha Vantage", ok: false, detail: "chiave non inserita (opzionale)" });
  }
  return out;
}
