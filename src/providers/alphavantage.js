const BASE="https://www.alphavantage.co/query";
const DAY=new Date().toISOString().slice(0,10);
const KEY="aa2_av_usage_"+DAY;
export function getAlphaVantageUsage(storage=globalThis.localStorage){
  try{return Number(storage?.getItem(KEY)??0);}catch{return 0;}
}
export async function loadAlphaVantageDaily({symbol,apiKey,fetchImpl=fetch,storage=globalThis.localStorage,maxRequestsPerDay=25}){
  if(!apiKey)throw new Error("Chiave API Alpha Vantage obbligatoria");
  if(!/^[A-Za-z0-9.^_-]{1,24}$/.test(symbol??""))throw new Error("Simbolo non valido");
  let used=getAlphaVantageUsage(storage);
  if(used>=maxRequestsPerDay)throw new Error("Quota giornaliera gratuita Alpha Vantage esaurita");
  const url=new URL(BASE);url.search=new URLSearchParams({function:"TIME_SERIES_DAILY",symbol,outputsize:"compact",apikey:apiKey});
  try{storage?.setItem(KEY,String(used+1));}catch{/* storage opzionale: il rate limit resta best effort */}
  const response=await fetchImpl(url);
  if(!response.ok)throw new Error("Alpha Vantage HTTP "+response.status);
  const json=await response.json();
  if(json.Note||json.Information||json["Error Message"])throw new Error(json.Note||json.Information||json["Error Message"]);
  const series=json["Time Series (Daily)"];
  if(!series)throw new Error("Serie giornaliera non disponibile nel piano/mercato richiesto");
  const rows=Object.entries(series).map(([date,v])=>({date,open:Number(v["1. open"]),high:Number(v["2. high"]),low:Number(v["3. low"]),close:Number(v["4. close"]),volume:Number(v["5. volume"]),source:"Alpha Vantage",currency:null})).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)).sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length)throw new Error("Alpha Vantage non ha restituito osservazioni valide");
  return {symbol,rows,source:"Alpha Vantage",retrievedAt:new Date().toISOString(),priceType:"daily_ohlc",delay:"end_of_day_or_provider_defined",licenseStatus:"verify_current_plan_and_exchange_entitlements"};
}
