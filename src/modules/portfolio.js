import { MIN_INVESTMENT_NOTIONAL } from "./trading-costs.js";
const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
const validDate=(v)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+"T00:00:00Z").getTime())&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
export function validateMinimumInvestment({side,quantity,price,currency,minNotional=MIN_INVESTMENT_NOTIONAL}){if(side==="BUY"&&["EUR","USD"].includes(String(currency).toUpperCase())&&quantity*price<minNotional)throw new Error("Investimento minimo per acquisto: "+minNotional.toLocaleString("it-IT")+" "+String(currency).toUpperCase());return true;}
export function normalizeTrade(t) {
  if(!t||!t.id||!t.symbol||!["BUY","SELL"].includes(t.side)||!finite(t.quantity)||t.quantity<=0||!finite(t.price)||t.price<=0||!t.currency||!validDate(t.date)) throw new Error("Movimento non valido: verificare ID, titolo, lato, quantità, prezzo, valuta e data");
  const fees=finite(t.fees)?t.fees:0;
  const taxes=finite(t.taxes)?t.taxes:0;
  if(fees<0||taxes<0) throw new Error("Commissioni e imposte non possono essere negative");
  return {...t,symbol:String(t.symbol).toUpperCase(),currency:String(t.currency).toUpperCase(),fees,taxes};
}
export function buildPositions(trades=[]) {
  const positions=new Map();
  for(const raw of [...trades].map(normalizeTrade).sort((a,b)=>a.date.localeCompare(b.date))){
    const p=positions.get(raw.symbol)??{symbol:raw.symbol,currency:raw.currency,quantity:0,costBasis:0,realizedPnl:0,feesPaid:0,taxesPaid:0};
    if(p.currency!==raw.currency) throw new Error("Valuta incoerente per "+raw.symbol);
    p.feesPaid+=raw.fees;p.taxesPaid+=raw.taxes;
    if(raw.side==="BUY"){p.quantity+=raw.quantity;p.costBasis+=raw.quantity*raw.price+raw.fees+raw.taxes;}
    else{
      if(raw.quantity>p.quantity+1e-9) throw new Error("Vendita superiore alla quantità disponibile: "+raw.symbol);
      const average=p.quantity>0?p.costBasis/p.quantity:0;
      p.realizedPnl+=raw.quantity*raw.price-raw.fees-raw.taxes-raw.quantity*average;
      p.costBasis-=raw.quantity*average;p.quantity-=raw.quantity;
      if(Math.abs(p.quantity)<1e-9){p.quantity=0;p.costBasis=0;}
    }
    positions.set(raw.symbol,p);
  }
  return [...positions.values()].map(p=>({...p,averageCost:p.quantity?p.costBasis/p.quantity:null})).filter(p=>p.quantity>0||p.realizedPnl!==0);
}
export function markPortfolio(positions, quotes) {
  return positions.map(p=>{const q=quotes[p.symbol];if(!q||!finite(q.price)||q.currency!==p.currency)return {...p,marketValue:null,unrealizedPnl:null,valuationStatus:"missing_or_currency_mismatch"};const marketValue=p.quantity*q.price;return {...p,marketValue,unrealizedPnl:marketValue-p.costBasis,valuationStatus:"valued",quoteAsOf:q.asOf??null,quoteSource:q.source??null};});
}
