// Independent, timestamped caches: a Gemini failure must never invalidate verified market data.
// No API keys are written here. Cached quotations are historical snapshots, not live prices.
const KEY = "aa_analysis_segments_v1";
const MAX_SYMBOLS = 20;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const ANALYSIS_TTL = Object.freeze({
  quote: 15 * 60 * 1000,
  fin: 24 * 60 * 60 * 1000,
  val: 24 * 60 * 60 * 1000,
  peers: 24 * 60 * 60 * 1000,
  events: 4 * 60 * 60 * 1000,
  an: 6 * 60 * 60 * 1000,
  mkt: 6 * 60 * 60 * 1000,
  newsRaw: 60 * 60 * 1000,
  ai: 6 * 60 * 60 * 1000,
});
export const CACHE_SECTIONS = ["quote","fin","val","events","an","mkt","newsRaw"];
export const normalizeSymbol = symbol => String(symbol || "").trim().toUpperCase();

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
function load() {
  try {
    const data=JSON.parse(store()?.getItem(KEY)||"{}");
    return data && typeof data==="object" && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
function validSection(name) { return Object.hasOwn(ANALYSIS_TTL,name); }
export function readAnalysisSection(symbol, section, {allowStale=false, now=Date.now()}={}) {
  if(!validSection(section))return null;
  const entry=load()[normalizeSymbol(symbol)]?.[section];
  if(!entry || !Number.isFinite(entry.ts) || entry.ts>now || now-entry.ts>MAX_AGE || entry.value===undefined || entry.value===null)return null;
  const stale=now-entry.ts>ANALYSIS_TTL[section];
  return (stale&&!allowStale) ? null : {value:entry.value,ts:entry.ts,stale};
}
export function writeAnalysisSection(symbol,section,value,{now=Date.now()}={}) {
  const id=normalizeSymbol(symbol);
  if(!id || !validSection(section) || value===undefined || value===null)return false;
  const storage=store();if(!storage)return false;
  try {
    const all=load();
    const existing=all[id]&&typeof all[id]==="object"?all[id]:{};
    all[id]={...existing,[section]:{ts:now,value}};
    // Prune by most recent section timestamp, retaining a bounded number of tickers.
    const recent=Object.entries(all).map(([key,sections])=>({
      key,sections,ts:Math.max(0,...Object.values(sections||{}).map(e=>Number(e?.ts)||0))
    })).filter(e=>now-e.ts<=MAX_AGE).sort((a,b)=>b.ts-a.ts).slice(0,MAX_SYMBOLS);
    storage.setItem(KEY,JSON.stringify(Object.fromEntries(recent.map(e=>[e.key,e.sections]))));
    return true;
  } catch { return false; }
}
export function readAnalysisSnapshot(symbol,{now=Date.now()}={}) {
  const data={},fresh=[],stale=[],timestamps={};
  for(const section of CACHE_SECTIONS){
    const entry=readAnalysisSection(symbol,section,{allowStale:true,now});
    if(!entry)continue;
    data[section]=entry.value;
    timestamps[section]=entry.ts;
    (entry.stale?stale:fresh).push(section);
  }
  return {data,fresh,stale,timestamps};
}
export function analysisFingerprint(data) {
  // Strict equality of the actual numeric and source inputs (not just a ticker or date).
  // JSON string is intentionally used rather than a collision-prone short hash.
  return JSON.stringify({
    quote:data.quote,fin:data.fin,val:data.val,events:data.events,
    an:data.an,mkt:data.mkt,newsRaw:data.newsRaw
  });
}
