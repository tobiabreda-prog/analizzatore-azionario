const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
const validDate=(value)=>{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(value+"T00:00:00Z");
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};

/**
 * Builds end-of-day SMA crossover signals.
 * Bars must be strictly chronological; silently sorting here could detach a
 * signal from the price series used by the backtest.
 */
export function buildSmaCrossSignals(bars,fastPeriod=20,slowPeriod=50){
 if(!Array.isArray(bars)||!Number.isInteger(fastPeriod)||!Number.isInteger(slowPeriod)||fastPeriod<2||slowPeriod<=fastPeriod)throw new Error("Periodi SMA non validi");
 if(bars.length<slowPeriod)throw new Error("Storico insufficiente per la SMA lenta");
 if(bars.some((bar,i)=>!bar||!validDate(bar.date)||!finite(bar.close)||bar.close<=0||(i>0&&bar.date<=bars[i-1].date)))throw new Error("Barre prezzi non valide: date duplicate/non cronologiche o chiusure non positive");
 const closes=bars.map(bar=>bar.close);
 const rolling=(i,n)=>closes.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n;
 return bars.slice(slowPeriod-1).map((bar,offset)=>{
  const i=slowPeriod-1+offset;
  return {date:bar.date,position:rolling(i,fastPeriod)>rolling(i,slowPeriod)?1:0};
 });
}
