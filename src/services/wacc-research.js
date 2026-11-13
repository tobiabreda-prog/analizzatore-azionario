import { getApiKey } from "./api-settings.js";

// Gemini is used for research only. All arithmetic and validation remain deterministic.
const trusted = host => host === "investing.com" || host.endsWith(".investing.com") ||
 host === "sec.gov" || host.endsWith(".sec.gov") ||
 host === "ecb.europa.eu" || host.endsWith(".ecb.europa.eu") ||
 host === "federalreserve.gov" || host.endsWith(".federalreserve.gov") ||
 host === "stern.nyu.edu" || host.endsWith(".stern.nyu.edu") ||
 host === "pages.stern.nyu.edu" ||
 host === "treasury.gov" || host.endsWith(".treasury.gov") ||
 host === "fred.stlouisfed.org" ||
 host === "www.annualreports.com" || host === "annualreports.com";
const validUrl = value => {
 try { const u=new URL(value); return u.protocol==="https:" && trusted(u.hostname.toLowerCase()); }
 catch { return false; }
};
const finiteRange=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
const extractJson=text=>{
 const cleaned=String(text||"").replace(/```(?:json)?/gi,"").trim();
 const first=cleaned.indexOf("{"),last=cleaned.lastIndexOf("}");
 if(first<0||last<first)throw new Error("Gemini non ha restituito parametri WACC strutturati.");
 return JSON.parse(cleaned.slice(first,last+1));
};
export function calculateWaccFromResearch(payload, groundedUrls) {
 if(!payload||typeof payload!=="object")throw new Error("Ricerca WACC non valida.");
 const fields=["riskFree","beta","equityRiskPremium","costOfDebt","taxRate","equityWeight"];
 const bounds={riskFree:[0,20],beta:[0,4],equityRiskPremium:[1,15],costOfDebt:[0,30],taxRate:[0,60],equityWeight:[0,1]};
 const evidence={};
 for(const field of fields){
  const item=payload[field];
  if(!item||!finiteRange(item.value,...bounds[field]))throw new Error("Parametro mancante o non plausibile: "+field);
  if(!validUrl(item.url)||!groundedUrls.has(item.url))throw new Error("Fonte non verificata per "+field+": ricerca da ripetere.");
  if(!item.date||!/^(20\d{2})(-\d{2})?(-\d{2})?$/.test(item.date))throw new Error("Data della fonte mancante: "+field);
  evidence[field]=item;
 }
 const v=Object.fromEntries(fields.map(k=>[k,evidence[k].value]));
 const ke=v.riskFree+v.beta*v.equityRiskPremium;
 const wacc=v.equityWeight*ke+(1-v.equityWeight)*v.costOfDebt*(1-v.taxRate/100);
 if(!finiteRange(wacc,2,35))throw new Error("WACC fuori dai limiti di plausibilità.");
 return {wacc:Number(wacc.toFixed(3)),costOfEquity:Number(ke.toFixed(3)),inputs:evidence};
}
export async function researchWacc({symbol,currency,signal}={}){
 const key=getApiKey("gemini");
 if(!key)throw new Error("Inserisci la chiave Gemini nelle impostazioni API.");
 if(!/^[A-Z0-9.^:_-]{1,30}$/.test(symbol||""))throw new Error("Ticker non valido.");
 if(!/^[A-Z]{3}$/.test(currency||""))throw new Error("Valuta non disponibile: impossibile stimare il risk-free coerente.");
 const prompt=`Ricerca WACC per ${symbol} (valuta DCF ${currency}). Cerca prima su investing.com, poi confronta con bilanci ufficiali, SEC, BCE/Fed e dataset NYU Stern Damodaran. Identifica società, mercato e settore. Non inventare numeri o fonti. Usa risk-free coerente con la valuta dei flussi; equity risk premium coerente con esposizione geografica; beta bottom-up se possibile; costo debito e tax rate coerenti con i bilanci; equityWeight = equity/(equity+debt) basato su valori di mercato. Per banche e assicurazioni rispondi con {"unsupported":true,"reason":"..."}: il DCF FCFF/WACC non è adeguato. Se non hai TUTTI e sei i parametri supportati da URL HTTPS consultati e date, rispondi {"unsupported":true,"reason":"dati insufficienti"}. Altrimenti restituisci SOLO JSON con riskFree, beta, equityRiskPremium, costOfDebt, taxRate, equityWeight; ogni parametro è {"value":numero,"url":"URL fonte consultata","date":"YYYY-MM-DD"}. Percentuali espresse come punti percentuali, beta e equityWeight come numeri puri (0..1 per equityWeight). Nessuna spiegazione extra.`;
 const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
  method:"POST",signal,headers:{"Content-Type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({contents:[{parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{temperature:0,maxOutputTokens:1600}})
 });
 if(!response.ok)throw new Error("Ricerca Gemini non disponibile (HTTP "+response.status+"). Verifica chiave, modello e quota.");
 const json=await response.json();
 const candidate=json.candidates?.[0];
 const groundedUrls=new Set((candidate?.groundingMetadata?.groundingChunks||[])
  .map(x=>x.web?.uri).filter(validUrl));
 if(!groundedUrls.size)throw new Error("Gemini non ha restituito fonti verificabili: WACC automatico non applicato.");
 const payload=extractJson((candidate?.content?.parts||[]).map(x=>x.text||"").join(""));
 if(payload.unsupported)throw new Error("WACC automatico non disponibile: "+String(payload.reason||"dati insufficienti").slice(0,160));
 return calculateWaccFromResearch(payload,groundedUrls);
}
