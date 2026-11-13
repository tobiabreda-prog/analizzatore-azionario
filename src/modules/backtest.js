import { maxDrawdown, annualizedVolatility } from "./technical-indicators.js";
const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
const validDate=(v)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+"T00:00:00Z").getTime())&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
export function runLongOnlyBacktest({bars,signals,initialCapital=10000,feeBps=0,fixedFee=0,buyTaxBps=0,slippageBps=5}) {
  if(!Array.isArray(bars)||bars.length<3||!Array.isArray(signals)||!finite(initialCapital)||initialCapital<=0||!finite(feeBps)||feeBps<0||!finite(fixedFee)||fixedFee<0||!finite(buyTaxBps)||buyTaxBps<0||!finite(slippageBps)||slippageBps<0) throw new Error("Input backtest non validi");
  const sorted=[...bars].sort((a,b)=>a.date.localeCompare(b.date));
  if(sorted.some((b,i)=>!validDate(b.date)||!finite(b.close)||b.close<=0||(i&&b.date===sorted[i-1].date))) throw new Error("Serie prezzi non valida o date duplicate");
  if(signals.some(s=>!s||!validDate(s.date)||![0,1].includes(s.position))||new Set(signals.map(s=>s.date)).size!==signals.length) throw new Error("Segnali non validi o date duplicate: position deve essere 0 oppure 1");
  const first=sorted[0].date,last=sorted.at(-1).date;
  if(signals.some(s=>s.date<first||s.date>last)) throw new Error("Il segnale contiene date fuori dall'intervallo del backtest");
  const signalByDate=new Map(signals.map(s=>[s.date,s.position]));
  let cash=initialCapital, shares=0, prevPosition=0;
  const curve=[], trades=[];
  for(let i=0;i<sorted.length;i++){
    const bar=sorted[i], nextPosition=i===0?0:(signalByDate.get(sorted[i-1].date)??prevPosition);
    if(nextPosition!==prevPosition){
      const px=bar.close*(nextPosition?1+slippageBps/10000:1-slippageBps/10000);
      if(nextPosition){
        if(cash<=fixedFee)throw new Error("Capitale insufficiente per la commissione fissa di acquisto");
        const spend=(cash-fixedFee)/(1+(feeBps+buyTaxBps)/10000);if(spend<5000)throw new Error("Controvalore dell'acquisto inferiore al minimo di 5.000 nella valuta del titolo: aumenta il capitale iniziale o riduci i costi.");shares=spend/px;cash=0;
        trades.push({date:bar.date,side:"BUY",price:px,grossNotional:spend,commission:fixedFee+spend*feeBps/10000,transactionTax:spend*buyTaxBps/10000});
      } else {
        const gross=shares*px,net=gross*(1-feeBps/10000)-fixedFee;
        if(net<0)throw new Error("Commissioni superiori al controvalore della vendita");
        cash=net;shares=0;
        trades.push({date:bar.date,side:"SELL",price:px,grossNotional:gross,commission:fixedFee+gross*feeBps/10000,transactionTax:0});
      }
      prevPosition=nextPosition;
    }
    curve.push(cash+shares*bar.close);
  }
  const returns=curve.slice(1).map((v,i)=>v/curve[i]-1);
  const years=(Date.parse(sorted.at(-1).date)-Date.parse(sorted[0].date))/(365.25*86400000);
  const totalReturn=curve.at(-1)/initialCapital-1;
  return {initialCapital,finalValue:curve.at(-1),totalReturn,cagr:years>0?Math.pow(curve.at(-1)/initialCapital,1/years)-1:null,maxDrawdown:maxDrawdown(curve),annualizedVolatility:annualizedVolatility(returns),tradeCount:trades.length,curve:sorted.map((b,i)=>({date:b.date,equity:curve[i]})),trades,limitations:["Strategia long-only semplificata","Imposta transazioni buy-side simulata in modo semplificato: non applica il netting giornaliero per singolo titolo né verifica automaticamente requisiti/esenzioni","Segnali applicati alla chiusura successiva: non usare segnali generati con dati futuri","Non include imposte, dividendi, corporate actions, FX o costi specifici del mercato","Non corregge survivorship bias né garantisce dati point-in-time"]};
}
