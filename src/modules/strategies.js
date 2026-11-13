const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
export function buildSmaCrossSignals(bars,fastPeriod=20,slowPeriod=50){
 if(!Array.isArray(bars)||!Number.isInteger(fastPeriod)||!Number.isInteger(slowPeriod)||fastPeriod<2||slowPeriod<=fastPeriod)throw new Error("Periodi SMA non validi");
 if(bars.length<slowPeriod)throw new Error("Storico insufficiente per la SMA lenta");
 const closes=bars.map(b=>b.close);
 if(closes.some(x=>!finite(x)||x<=0)||bars.some(b=>typeof b.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)))throw new Error("Barre OHLC/date non valide");
 const rolling=(i,n)=>closes.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n;
 return bars.slice(slowPeriod-1).map((bar,offset)=>{
  const i=slowPeriod-1+offset;
  return {date:bar.date,position:rolling(i,fastPeriod)>rolling(i,slowPeriod)?1:0};
 });
}
