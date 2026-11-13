import { maxDrawdown, annualizedVolatility } from "./technical-indicators.js";
const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
export function runLongOnlyBacktest({bars,signals,initialCapital=10000,feeBps=10,slippageBps=5}) {
  if(!Array.isArray(bars)||bars.length<3||!Array.isArray(signals)||!finite(initialCapital)||initialCapital<=0||!finite(feeBps)||!finite(slippageBps)) throw new Error("Input backtest non validi");
  const sorted=[...bars].sort((a,b)=>a.date.localeCompare(b.date));
  if(sorted.some((b,i)=>!b.date||!finite(b.close)||b.close<=0||(i&&b.date===sorted[i-1].date))) throw new Error("Serie prezzi non valida o date duplicate");
  const signalByDate=new Map(signals.map(s=>[s.date,s.position===1?1:0]));
  let cash=initialCapital, shares=0, prevPosition=0;
  const curve=[], trades=[];
  for(let i=0;i<sorted.length;i++){
    const bar=sorted[i], nextPosition=i===0?0:(signalByDate.get(sorted[i-1].date)??prevPosition);
    if(nextPosition!==prevPosition){
      const px=bar.close*(nextPosition?1+slippageBps/10000:1-slippageBps/10000);
      if(nextPosition){const spend=cash/(1+feeBps/10000);shares=spend/px;cash=0;}
      else{cash=shares*px*(1-feeBps/10000);shares=0;}
      trades.push({date:bar.date,side:nextPosition?"BUY":"SELL",price:px});
      prevPosition=nextPosition;
    }
    curve.push(cash+shares*bar.close);
  }
  const returns=curve.slice(1).map((v,i)=>v/curve[i]-1);
  const years=(Date.parse(sorted.at(-1).date)-Date.parse(sorted[0].date))/(365.25*86400000);
  const totalReturn=curve.at(-1)/initialCapital-1;
  return {initialCapital,finalValue:curve.at(-1),totalReturn,cagr:years>0?Math.pow(curve.at(-1)/initialCapital,1/years)-1:null,maxDrawdown:maxDrawdown(curve),annualizedVolatility:annualizedVolatility(returns),tradeCount:trades.length,curve:sorted.map((b,i)=>({date:b.date,equity:curve[i]})),trades,limitations:["Strategia long-only semplificata","Segnali applicati alla chiusura successiva: non usare segnali generati con dati futuri","Non include imposte, dividendi, corporate actions, FX o costi specifici del mercato","Non corregge survivorship bias né garantisce dati point-in-time"]};
}
