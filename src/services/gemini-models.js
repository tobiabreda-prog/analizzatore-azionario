// Model discovery shared by report commentary and WACC research.
// A successful models.list response is reused in memory, never persisted with the API key.
const TTL=60*60*1000;
let activeKey=null,cachedAt=0,cachedModels=null,inflight=null;
const favorites=["gemini-3.5-flash-lite","gemini-3.5-flash","gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.0-flash-lite","gemini-2.0-flash"];
const rank=name=>{const n=String(name).split("/").pop(),i=favorites.indexOf(n);return i<0?favorites.length:i;};
export async function listGeminiModels(key) {
 if(!key)throw new Error("Chiave Gemini non disponibile.");
 if(activeKey===key&&cachedModels&&Date.now()-cachedAt<TTL)return cachedModels;
 if(activeKey===key&&inflight)return inflight;
 activeKey=key;cachedAt=0;cachedModels=null;
 const request=(async()=>{
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",{
   headers:{"x-goog-api-key":key}
  });
  if(!response.ok){
   const detail=await response.json().catch(()=>({}));
   throw new Error("Catalogo Gemini HTTP "+response.status+": "+String(detail.error?.message||"verifica chiave e quota").slice(0,200));
  }
  const body=await response.json();
  const models=(body.models||[]).filter(m=>m?.name?.startsWith("models/gemini-")&&(m.supportedGenerationMethods||[]).includes("generateContent")&&!/preview|exp/i.test(m.name));
  models.sort((a,b)=>rank(a.name)-rank(b.name));
  if(!models.length)throw new Error("Nessun modello Gemini disponibile per generateContent.");
  if(activeKey===key){cachedModels=models;cachedAt=Date.now();}
  return models;
 })();
 inflight=request;
 try {return await request;}
 finally{if(inflight===request)inflight=null;}
}
