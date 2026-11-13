const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
const MAX_AGE={VIXCLS:7,T10Y2Y:7,BAMLH0A0HYM2:14,FEDFUNDS:70,DGS10:7,DGS2:7,CPIAUCSL:70,PCEPI:70,"EXR.D.USD.EUR.SP00.A":7,DCOILWTICO:7,GOLDAMGBD228NLBM:7};
export function classifyMacroRegime(rows=[],now=new Date()){
 const byId=new Map(rows.map(x=>[x.id,x]));
 const core=["VIXCLS","T10Y2Y","BAMLH0A0HYM2","FEDFUNDS","DGS10"];
 const usable={};
 const stale=[];
 for(const id of core){
  const row=byId.get(id),age=row?.date?(now.getTime()-Date.parse(row.date+"T23:59:59Z"))/86400000:Infinity;
  if(row?.status==="ok"&&finite(row.value)&&Number.isFinite(age)&&age>=-1&&age<=(MAX_AGE[id]??7))usable[id]=row.value;
  else stale.push(id);
 }
 const available=Object.keys(usable).length;
 if(available<3)return {status:"insufficient_data",regime:"unknown",available,required:3,stale,drivers:["Servono almeno 3 indicatori macro core aggiornati"]};
 const vix=usable.VIXCLS,hy=usable.BAMLH0A0HYM2,curve=usable.T10Y2Y;
 const stress=(finite(vix)&&vix>=30)||(finite(hy)&&hy>=6)||(finite(curve)&&curve<=-0.5);
 const caution=(finite(vix)&&vix>=22)||(finite(hy)&&hy>=4)||(finite(curve)&&curve<0);
 const regime=stress?"risk_off":caution?"cautious":"risk_on";
 const drivers=[];
 if(finite(vix))drivers.push("VIX "+vix.toFixed(1)+(vix>=30?": volatilità elevata":vix>=22?": volatilità in aumento":": volatilità contenuta"));
 if(finite(hy))drivers.push("High-yield spread "+hy.toFixed(2)+"%");
 if(finite(curve))drivers.push("Spread Treasury 10Y–2Y "+curve.toFixed(2)+"%");
 if(finite(usable.FEDFUNDS))drivers.push("Fed Funds "+usable.FEDFUNDS.toFixed(2)+"%");
 if(finite(usable.DGS10))drivers.push("Treasury 10Y "+usable.DGS10.toFixed(2)+"%");
 return {status:"ok",regime,available,required:3,stale,drivers,methodology:"Regole descrittive non calibrate; non produce probabilità o segnali d'acquisto"};
}
