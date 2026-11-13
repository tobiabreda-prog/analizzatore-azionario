import { normalizeTrade } from "./portfolio.js";
const norm=(v)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function splitLine(line,delimiter){
 const out=[];let field="",quoted=false;
 for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){out.push(field);field="";}else field+=ch;}
 if(quoted)throw new Error("CSV non valido: virgolette non chiuse");out.push(field);return out;
}
function parseNumber(value,label){
 const raw=String(value??"").trim();if(!raw)throw new Error(label+" mancante");
 const normalized=raw.includes(",")?(raw.includes(".")?raw.replace(/\./g,"").replace(",","."):raw.replace(",",".")):raw;
 const n=Number(normalized);if(!Number.isFinite(n))throw new Error(label+" non numerico: "+raw);return n;
}
function isoDate(value){
 const v=String(value??"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
 const m=v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
 return v;
}
export function parseTradeCsv(text){
 if(typeof text!=="string"||!text.trim())throw new Error("File CSV vuoto");
 const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
 if(lines.length<2)throw new Error("CSV senza righe di movimento");
 const delimiter=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?";":",";
 const headers=splitLine(lines[0],delimiter).map(norm);
 const find=(...names)=>headers.findIndex(h=>names.includes(h));
 const ix={date:find("date","data"),symbol:find("symbol","ticker","strumento"),side:find("side","operazione","operation"),quantity:find("quantity","quantita","qty"),price:find("price","prezzo"),currency:find("currency","valuta"),fees:find("fees","fee","commissioni")};
 for(const k of ["date","symbol","side","quantity","price","currency"])if(ix[k]<0)throw new Error("Colonna obbligatoria mancante: "+k);
 const trades=lines.slice(1).map((line,i)=>{
  const row=splitLine(line,delimiter);const get=k=>ix[k]>=0?row[ix[k]]:null;
  const sideRaw=norm(get("side"));const side= ["buy","acquisto","compra"].includes(sideRaw)?"BUY":["sell","vendita","vendi"].includes(sideRaw)?"SELL":null;
  if(!side)throw new Error("Operazione non riconosciuta alla riga "+(i+2));
  const trade={id:"csv-"+(globalThis.crypto?.randomUUID?.()??(Date.now()+"-"+i)),date:isoDate(get("date")),symbol:get("symbol"),side,quantity:parseNumber(get("quantity"),"Quantità"),price:parseNumber(get("price"),"Prezzo"),currency:String(get("currency")).trim().toUpperCase(),fees:ix.fees>=0&&String(get("fees")??"").trim()?parseNumber(get("fees"),"Commissioni"):0};
  return normalizeTrade(trade);
 });
 return trades;
}
function quote(v){const s=String(v??"");return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
export function serializeTradesCsv(trades){
 const rows=[["date","symbol","side","quantity","price","currency","fees"],...trades.map(t=>[t.date,t.symbol,t.side,t.quantity,t.price,t.currency,t.fees??0])];
 return rows.map(row=>row.map(quote).join(";")).join("\r\n");
}
