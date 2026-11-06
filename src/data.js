// Fonti dati gratuite per l'analizzatore (nessuna ricerca web di Gemini).
// - Yahoo Finance (non ufficiale, senza chiave): prezzi, storico, bilanci, multipli, notizie. Copre anche i titoli europei (es. ENI.MI).
// - Finnhub (ufficiale, chiave gratuita OPZIONALE): rating e target price degli analisti, peer e notizie per i titoli USA.
import { CapacitorHttp } from "@capacitor/core";

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

async function defaultGet(url, headers = {}) {
  const res = await CapacitorHttp.get({
    url,
    headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*", ...headers },
    connectTimeout: 15000,
    readTimeout: 25000,
  });
  let data = res.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { /* resta stringa */ } }
  return { status: res.status, data };
}

let httpGet = defaultGet;
export function setHttp(fn) { httpGet = fn; } // per i test

const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
const round = (x, d = 2) => (num(x) == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Yahoo ----------
async function yget(path, params) {
  const qs = new URLSearchParams(params).toString();
  let last = null, lastErr = null;
  for (const host of ["query1", "query2"]) {
    try {
      const r = await httpGet(`https://${host}.finance.yahoo.com${path}?${qs}`);
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

export async function loadFin(symbol) {
  const annualTypes = ["annualTotalRevenue", "annualNetIncome", "annualEBITDA", "annualGrossProfit", "annualOperatingIncome", "annualDilutedEPS", "annualFreeCashFlow", "annualTotalDebt", "annualNetDebt", "annualStockholdersEquity", "annualCurrentAssets", "annualCurrentLiabilities", "annualInterestExpense", "annualEBIT"];
  const qTypes = ["quarterlyTotalRevenue", "quarterlyNetIncome", "quarterlyDilutedEPS"];
  const s = await yseries(symbol, [...annualTypes, ...qTypes], 6);
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
  const lastDate = (s.annualTotalRevenue || []).slice(-1)[0]?.d || "";
  return {
    annual, quarters,
    balance: {
      netDebt: M(lastVal(s, "annualNetDebt")), totalDebt: M(lastVal(s, "annualTotalDebt")), equity: M(eq),
      currentRatio: ca != null && cl ? round(ca / cl, 2) : null,
      interestCover: ebit != null && ie ? round(ebit / Math.abs(ie), 1) : null,
      roe: ni != null && eq > 0 ? round((ni / eq) * 100, 1) : null,
      roic: null,
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

export async function loadVal(symbol, fhKey) {
  const types = [...Object.values(VAL_TYPES), "trailingMarketCap"];
  const s = await yseries(symbol, types, 1.2);
  const own = {};
  Object.entries(VAL_TYPES).forEach(([k, t]) => { own[k] = round(lastVal(s, t), 2); });
  let peers = [], sector = {};
  if (fhKey && isUS(symbol)) {
    try {
      const list = (await fh("/stock/peers", { symbol }, fhKey)).filter((p) => p !== symbol && isUS(p)).slice(0, 5);
      const res = await Promise.allSettled(list.map((p) => yseries(p, [VAL_TYPES["P/E"], VAL_TYPES["P/E forward"], VAL_TYPES["P/B"], VAL_TYPES["P/S"], VAL_TYPES["EV/EBITDA"]], 1.2)));
      const vals = res.map((r, i) => (r.status === "fulfilled" ? { name: list[i], s: r.value } : null)).filter(Boolean);
      peers = vals.map((p) => ({ name: p.name, pe: round(lastVal(p.s, VAL_TYPES["P/E"]), 1), evEbitda: round(lastVal(p.s, VAL_TYPES["EV/EBITDA"]), 1) }));
      Object.entries(VAL_TYPES).forEach(([k, t]) => { sector[k] = round(median(vals.map((p) => lastVal(p.s, t))), 2); });
    } catch (e) { /* peer non disponibili */ }
  }
  const metrics = Object.keys(VAL_TYPES).filter((k) => own[k] != null).map((k) => ({ k, v: own[k], sector: sector[k] ?? null, hist5y: null }));
  return { metrics, peers, marketCap: lastVal(s, "trailingMarketCap"), asOf: new Date().toISOString().slice(0, 10), source: "Yahoo Finance" + (peers.length ? " + Finnhub (peer)" : "") };
}

export async function loadAnalysts(symbol, fhKey) {
  const empty = { targetMean: null, targetMin: null, targetMax: null, ratings: { buy: 0, hold: 0, sell: 0 }, nAnalysts: 0, asOf: new Date().toISOString().slice(0, 10), source: "n.d. (serve chiave Finnhub e titolo USA)" };
  if (!fhKey || !isUS(symbol)) return empty;
  const out = { ...empty, ratings: { ...empty.ratings }, source: "Finnhub" };
  try {
    const rec = await fh("/stock/recommendation", { symbol }, fhKey);
    const r = rec?.[0];
    if (r) {
      out.ratings = { buy: (r.strongBuy || 0) + (r.buy || 0), hold: r.hold || 0, sell: (r.sell || 0) + (r.strongSell || 0) };
      out.nAnalysts = out.ratings.buy + out.ratings.hold + out.ratings.sell;
      if (r.period) out.asOf = r.period;
    }
  } catch (e) { /* rating non disponibili */ }
  try {
    const pt = await fh("/stock/price-target", { symbol }, fhKey);
    out.targetMean = num(pt?.targetMean) ?? num(pt?.targetMedian);
    out.targetMin = num(pt?.targetLow);
    out.targetMax = num(pt?.targetHigh);
  } catch (e) { /* target non disponibili (può essere a pagamento) */ }
  return out;
}

export async function loadNewsRaw(symbol, fhKey) {
  const items = [];
  try {
    const r = await yget("/v1/finance/search", { q: symbol, quotesCount: 0, newsCount: 10, lang: "en-US" });
    (r.data?.news || []).forEach((n) => n?.title && items.push({ date: n.providerPublishTime ? isoDate(n.providerPublishTime) : "", title: n.title, source: n.publisher || "Yahoo Finance" }));
  } catch (e) { /* ignora */ }
  if (fhKey && isUS(symbol)) {
    try {
      const to = new Date(), from = new Date(Date.now() - 14 * 864e5);
      const d = (x) => x.toISOString().slice(0, 10);
      const list = await fh("/company-news", { symbol, from: d(from), to: d(to) }, fhKey);
      (list || []).slice(0, 8).forEach((n) => n?.headline && items.push({ date: n.datetime ? isoDate(n.datetime) : "", title: n.headline, source: n.source || "Finnhub", summary: (n.summary || "").slice(0, 280) }));
    } catch (e) { /* ignora */ }
  }
  const seen = new Set();
  return items.filter((i) => { const k = i.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
}

// ---------- Diagnostica ----------
export async function diagnostics(fhKey) {
  const out = [];
  const t = async (name, fn) => {
    try { const d = await fn(); out.push({ name, ok: true, detail: d || "OK" }); }
    catch (e) { out.push({ name, ok: false, detail: e.message.slice(0, 160) }); }
  };
  await t("Yahoo: prezzi AAPL", async () => { const c = await chartFor("AAPL"); return `${c.rows.length} giorni, ultimo ${c.rows[c.rows.length - 1].date}`; });
  await t("Yahoo: prezzi ENI.MI", async () => { const c = await chartFor("ENI.MI"); return `${c.rows.length} giorni`; });
  await t("Yahoo: bilanci AAPL", async () => { const f = await loadFin("AAPL"); return `${f.annual.length} anni, ${f.quarters.length} trimestri`; });
  await t("Yahoo: multipli AAPL", async () => { const v = await loadVal("AAPL", null); return `${v.metrics.length} multipli`; });
  await t("Yahoo: notizie AAPL", async () => { const n = await loadNewsRaw("AAPL", null); return `${n.length} notizie`; });
  if (fhKey) {
    await t("Finnhub: rating AAPL", async () => { const r = await fh("/stock/recommendation", { symbol: "AAPL" }, fhKey); return `${r?.length || 0} periodi`; });
    await t("Finnhub: target AAPL", async () => { const r = await fh("/stock/price-target", { symbol: "AAPL" }, fhKey); return r?.targetMean ? `media ${r.targetMean}` : "vuoto"; });
  } else {
    out.push({ name: "Finnhub", ok: false, detail: "chiave non inserita (opzionale)" });
  }
  return out;
}
