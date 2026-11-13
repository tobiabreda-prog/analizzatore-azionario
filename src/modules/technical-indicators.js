const valid = (a) => Array.isArray(a) && a.every((x) => typeof x === "number" && Number.isFinite(x));
export function sma(values, period) {
  if (!valid(values) || !Number.isInteger(period) || period < 1 || values.length < period) return null;
  const tail = values.slice(-period);
  return tail.reduce((a,b)=>a+b,0)/period;
}
export function ema(values, period) {
  if (!valid(values) || !Number.isInteger(period) || period < 1 || values.length < period) return null;
  const k=2/(period+1); let result=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for (const value of values.slice(period)) result=value*k+result*(1-k);
  return result;
}
export function rsi(values, period=14) {
  if (!valid(values) || values.length <= period || period < 2) return null;
  let gains=0, losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1]; gains+=Math.max(d,0); losses+=Math.max(-d,0);}
  let avgGain=gains/period, avgLoss=losses/period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1]; avgGain=(avgGain*(period-1)+Math.max(d,0))/period; avgLoss=(avgLoss*(period-1)+Math.max(-d,0))/period;}
  if(avgLoss===0) return avgGain===0?50:100;
  return 100-100/(1+avgGain/avgLoss);
}
export function annualizedVolatility(returns, periodsPerYear=252) {
  if(!valid(returns)||returns.length<2) return null;
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1);
  return Math.sqrt(variance*periodsPerYear);
}
export function maxDrawdown(equityCurve) {
  if(!valid(equityCurve)||!equityCurve.length||equityCurve.some(x=>x<=0)) return null;
  let peak=equityCurve[0], worst=0;
  for(const value of equityCurve){peak=Math.max(peak,value); worst=Math.min(worst,value/peak-1);}
  return worst;
}
